package com.amm19.agrokit.data.remote

import com.amm19.agrokit.domain.model.Delivery
import com.amm19.agrokit.domain.model.DeliveryProduct
import java.io.File
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
class FirebaseDeliveryService @Inject constructor(
    private val backendApiClient: BackendApiClient
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    suspend fun uploadDelivery(
        delivery: Delivery,
        eventId: String?
    ): Result<Unit> {
        return runCatching {
            val localEvidencePendingUpload = shouldUploadEvidence(delivery.photoPath)
            val payload = JSONObject().apply {
                put("id", delivery.id)
                put("workerDni", delivery.workerDni)
                put("kitIds", JSONArray(delivery.kitIds))
                put(
                    "products",
                    JSONArray(
                        delivery.products.map { product ->
                            JSONObject().apply {
                                put("kitCode", product.kitId)
                                put("productCode", product.productId)
                                put("productName", product.productName)
                                put("quantity", product.quantity)
                            }
                        }
                    )
                )
                put("timestamp", delivery.timestamp)
                // Evita persistir rutas locales del dispositivo en backend.
                // La URL final publica se actualiza al subir evidencia en /evidences.
                put("photoPath", if (localEvidencePendingUpload) "" else delivery.photoPath.trim())
                put("pdaId", delivery.pdaId)
                put("userEmail", delivery.userEmail)
                if (!eventId.isNullOrBlank()) put("eventId", eventId)
            }

            backendApiClient
                .putObject("/api/deliveries/${delivery.id}", payload)
                .getOrElse { throw it }

            if (localEvidencePendingUpload) {
                val localEvidence = File(delivery.photoPath)
                if (!localEvidence.exists()) {
                    error("No existe evidencia local para la entrega ${delivery.id}")
                }

                backendApiClient.postMultipartFile(
                    path = "/api/deliveries/${delivery.id}/evidences",
                    fileFieldName = "file",
                    file = localEvidence,
                    formFields = mapOf("userEmail" to delivery.userEmail)
                ).getOrElse { throw it }
            }
        }
    }

    suspend fun fetchDeliveries(
        userEmail: String,
        eventId: String?
    ): Result<List<Delivery>> {
        return backendApiClient.getArray(buildDeliveriesPath(userEmail, eventId)).map { array ->
            buildList {
                for (index in 0 until array.length()) {
                    val obj = array.optJSONObject(index) ?: continue
                    obj.toDelivery()?.let(::add)
                }
            }
        }
    }

    fun observeDeliveries(
        userEmail: String,
        eventId: String?,
        allowedSectorIds: Set<String>,
        onUpsert: (Delivery) -> Unit,
        onDelete: (String) -> Unit,
        onError: (Throwable) -> Unit
    ): RealtimeSubscription {
        return backendApiClient.openWebSocket(
            onTextMessage = { text ->
                runCatching {
                    val event = JSONObject(text)
                    if (event.optString("entity") != "deliveries") return@runCatching

                    when (event.optString("action")) {
                        "upsert" -> {
                            val payload = event.optJSONObject("payload") ?: return@runCatching
                            val payloadEventId = payload.optString("eventId").trim()
                            if (!eventId.isNullOrBlank() && payloadEventId.isNotBlank() && payloadEventId != eventId) {
                                return@runCatching
                            }

                            val sectorId = payload.optString("sectorId").trim()
                            if (allowedSectorIds.isNotEmpty() && sectorId.isNotBlank() && !allowedSectorIds.contains(sectorId)) {
                                return@runCatching
                            }

                            payload.toDelivery()?.let(onUpsert)
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
                                fetchDeliveries(userEmail, eventId).getOrNull()?.forEach(onUpsert)
                            }
                        }
                    }
                }.onFailure(onError)
            },
            onError = onError
        )
    }

    private fun JSONObject.toDelivery(): Delivery? {
        val deliveryId = optString("id").trim()
        if (deliveryId.isBlank()) return null

        val workerDni = optString("workerDni").trim()
        val photoPath = optString("photoPath").trim()
        val pdaId = optString("pdaId").trim()
        val userEmail = optString("userEmail").trim()
        val eventId = optString("eventId").trim()
        val sectorId = optString("sectorId").trim()
        val timestamp = optLong("timestamp", 0L)
        val products = parseProducts(this)

        if (workerDni.isBlank() || products.isEmpty()) return null

        return Delivery(
            id = deliveryId,
            workerDni = workerDni,
            products = products,
            timestamp = timestamp,
            photoPath = photoPath,
            pdaId = pdaId,
            userEmail = userEmail,
            eventId = eventId,
            sectorId = sectorId,
            synced = true
        )
    }

    private fun parseKitIds(json: JSONObject): List<String> {
        val array = json.optJSONArray("kitIds") ?: return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                val value = array.optString(index).trim()
                if (value.isNotBlank()) add(value)
            }
        }
    }

    private fun parseProducts(json: JSONObject): List<DeliveryProduct> {
        val productArray = json.optJSONArray("products")
        if (productArray != null) {
            val parsed = buildList {
                for (index in 0 until productArray.length()) {
                    val obj = productArray.optJSONObject(index) ?: continue
                    val productCode = obj.optString("productCode", obj.optString("id")).trim()
                    val productName = obj.optString("productName", obj.optString("name")).trim()
                    val kitCode = obj.optString("kitCode", obj.optString("kitId")).trim()
                    val quantity = obj.optDouble("quantity", 0.0)
                    if (productCode.isBlank() || quantity <= 0.000001) continue
                    add(
                        DeliveryProduct(
                            kitId = kitCode,
                            productId = productCode,
                            productName = productName.ifBlank { productCode },
                            quantity = quantity
                        )
                    )
                }
            }
            if (parsed.isNotEmpty()) return parsed
        }

        return parseKitIds(json).map { kitId ->
            DeliveryProduct(
                kitId = kitId,
                productId = kitId,
                productName = kitId,
                quantity = 1.0
            )
        }
    }

    private fun shouldUploadEvidence(photoPath: String): Boolean {
        val normalized = photoPath.trim()
        if (normalized.isBlank()) return false
        if (normalized.startsWith("http://", ignoreCase = true)) return false
        if (normalized.startsWith("https://", ignoreCase = true)) return false
        if (normalized.startsWith("/evidencias/", ignoreCase = true)) return false
        return true
    }

    private fun buildDeliveriesPath(userEmail: String, eventId: String?): String {
        val queryParts = mutableListOf<String>()
        if (userEmail.isNotBlank()) {
            queryParts += "userEmail=${encode(userEmail)}"
        }
        if (!eventId.isNullOrBlank()) {
            queryParts += "eventId=${encode(eventId)}"
        }
        return if (queryParts.isEmpty()) {
            "/api/deliveries"
        } else {
            "/api/deliveries?${queryParts.joinToString("&")}"
        }
    }

    private fun encode(value: String): String {
        return URLEncoder.encode(value, StandardCharsets.UTF_8.toString())
    }
}
