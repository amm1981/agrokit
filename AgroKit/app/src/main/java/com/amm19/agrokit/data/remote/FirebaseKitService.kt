package com.amm19.agrokit.data.remote

import com.amm19.agrokit.domain.model.Kit
import com.amm19.agrokit.domain.model.KitProduct
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FirebaseKitService @Inject constructor(
    private val backendApiClient: BackendApiClient
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    suspend fun uploadKit(
        kit: Kit,
        eventId: String?
    ): Result<Unit> {
        val payload = JSONObject().apply {
            put("id", kit.id)
            put("name", kit.name)
            if (!eventId.isNullOrBlank()) put("eventId", eventId)
            if (kit.products.isNotEmpty()) {
                put(
                    "products",
                    JSONArray(
                        kit.products.map { product ->
                            JSONObject().apply {
                                put("id", product.id)
                                put("name", product.name)
                                put("quantity", product.quantity)
                            }
                        }
                    )
                )
            }
        }

        return backendApiClient
            .putObject("/api/kits/${kit.id}", payload)
            .map { Unit }
    }

    suspend fun fetchKits(eventId: String?): Result<List<Kit>> {
        return backendApiClient.getArray(buildKitsPath(eventId)).map { array ->
            buildList {
                for (index in 0 until array.length()) {
                    val obj = array.optJSONObject(index) ?: continue
                    obj.toKit()?.let(::add)
                }
            }
        }
    }

    fun observeKits(
        eventId: String?,
        onUpsert: (Kit) -> Unit,
        onDelete: (String) -> Unit,
        onError: (Throwable) -> Unit
    ): RealtimeSubscription {
        return backendApiClient.openWebSocket(
            onTextMessage = { text ->
                runCatching {
                    val event = JSONObject(text)
                    if (event.optString("entity") != "kits") return@runCatching

                    when (event.optString("action")) {
                        "upsert" -> {
                            val payload = event.optJSONObject("payload") ?: return@runCatching
                            val payloadEventId = payload.optString("eventId").trim()
                            if (!eventId.isNullOrBlank() && payloadEventId.isNotBlank() && payloadEventId != eventId) {
                                return@runCatching
                            }
                            payload.toKit()?.let(onUpsert)
                        }
                        "delete" -> {
                            val payloadEventId = event.optString("eventId").trim()
                            if (!eventId.isNullOrBlank() && payloadEventId.isNotBlank() && payloadEventId != eventId) {
                                return@runCatching
                            }
                            val id = event.optString("id").trim()
                            if (id.isNotBlank()) onDelete(id)
                        }
                        "refresh" -> {
                            scope.launch {
                                fetchKits(eventId).getOrNull()?.forEach(onUpsert)
                            }
                        }
                    }
                }.onFailure(onError)
            },
            onError = onError
        )
    }

    private fun JSONObject.toKit(): Kit? {
        val kitId = optString("id").trim()
        val kitName = optString("name").trim()
        val eventId = optString("eventId").trim()
        val products = parseProducts(this)

        if (kitId.isBlank() || kitName.isBlank()) return null

        return Kit(
            id = kitId,
            name = kitName,
            eventId = eventId,
            products = products,
            synced = true
        )
    }

    private fun parseProducts(json: JSONObject): List<KitProduct> {
        val array = json.optJSONArray("products") ?: return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                val obj = array.optJSONObject(index) ?: continue
                val id = obj.optString("id").trim()
                val name = obj.optString("name").trim()
                if (id.isBlank() || name.isBlank()) continue
                val quantity = obj.optDouble("quantity", 1.0)
                add(
                    KitProduct(
                        id = id,
                        name = name,
                        quantity = if (quantity > 0) quantity else 1.0
                    )
                )
            }
        }
    }

    private fun buildKitsPath(eventId: String?): String {
        if (eventId.isNullOrBlank()) return "/api/kits"
        return "/api/kits?eventId=${encode(eventId)}"
    }

    private fun encode(value: String): String {
        return URLEncoder.encode(value, StandardCharsets.UTF_8.toString())
    }
}
