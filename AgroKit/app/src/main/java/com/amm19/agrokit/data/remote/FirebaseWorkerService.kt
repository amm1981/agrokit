package com.amm19.agrokit.data.remote

import com.amm19.agrokit.domain.model.Worker
import com.amm19.agrokit.domain.model.WorkerLookupDeliveryInfo
import com.amm19.agrokit.domain.model.WorkerLookupResult
import com.amm19.agrokit.domain.model.WorkerLookupStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FirebaseWorkerService @Inject constructor(
    private val backendApiClient: BackendApiClient
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    suspend fun uploadWorker(
        worker: Worker,
        userEmail: String,
        eventId: String?
    ): Result<Unit> {
        val payload = JSONObject().apply {
            put("dni", worker.dni)
            put("nombreCompleto", worker.fullName)
            put("area", worker.area)
            put("gerencia", worker.costCenter)
            put("centroDeCosto", worker.costCenter)
            if (worker.sectorId.isNotBlank()) put("sectorId", worker.sectorId)
            put("userEmail", userEmail)
            if (!eventId.isNullOrBlank()) put("eventId", eventId)
        }

        return backendApiClient
            .putObject("/api/workers/${worker.dni}", payload)
            .map { Unit }
    }

    suspend fun fetchWorkers(
        userEmail: String,
        eventId: String?
    ): Result<List<Worker>> {
        return backendApiClient.getArray(buildWorkersPath(userEmail, eventId)).map { array ->
            buildList {
                for (index in 0 until array.length()) {
                    val obj = array.optJSONObject(index) ?: continue
                    obj.toWorker()?.let(::add)
                }
            }
        }
    }

    suspend fun lookupWorkerByDni(
        dni: String,
        userEmail: String,
        eventId: String?
    ): Result<WorkerLookupResult> {
        val normalizedDni = dni.trim()
        if (normalizedDni.isBlank()) {
            return Result.success(WorkerLookupResult(status = WorkerLookupStatus.NOT_FOUND))
        }

        return backendApiClient.getObject(buildWorkerLookupPath(normalizedDni, userEmail, eventId)).map { response ->
            val status = when (response.optString("status").trim().uppercase()) {
                "AVAILABLE" -> WorkerLookupStatus.AVAILABLE
                "OTHER_SECTOR" -> WorkerLookupStatus.OTHER_SECTOR
                else -> WorkerLookupStatus.NOT_FOUND
            }
            val worker = response.optJSONObject("worker")?.toWorker()
            val latestDelivery = response.optJSONObject("latestDelivery")?.let { delivery ->
                WorkerLookupDeliveryInfo(
                    timestamp = delivery.optLong("timestamp", 0L),
                    sectorId = delivery.optString("sectorId").trim(),
                    sectorName = delivery.optString("sectorNombre").trim().ifBlank {
                        delivery.optString("sectorId").trim()
                    },
                    userEmail = delivery.optString("userEmail").trim(),
                    pdaId = delivery.optString("pdaId").trim(),
                    eventId = delivery.optString("eventId").trim(),
                    eventName = delivery.optString("eventName").trim().ifBlank {
                        delivery.optString("eventId").trim()
                    }
                )
            }
            WorkerLookupResult(
                status = status,
                worker = worker,
                latestDelivery = latestDelivery
            )
        }
    }

    fun observeWorkers(
        userEmail: String,
        eventId: String?,
        allowedSectorIds: Set<String>,
        onUpsert: (Worker) -> Unit,
        onDelete: (String) -> Unit,
        onError: (Throwable) -> Unit
    ): RealtimeSubscription {
        return backendApiClient.openWebSocket(
            onTextMessage = { text ->
                runCatching {
                    val event = JSONObject(text)
                    if (event.optString("entity") != "workers") return@runCatching

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
                            payload.toWorker()?.let(onUpsert)
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
                                fetchWorkers(userEmail, eventId).getOrNull()?.forEach(onUpsert)
                            }
                        }
                    }
                }.onFailure(onError)
            },
            onError = onError
        )
    }

    private fun JSONObject.toWorker(): Worker? {
        val dniValue = optString("dni").trim()
        val name = optString("nombreCompleto").trim()
        val areaValue = optString("area").trim()
        val costCenterValue = optString("gerencia").trim().ifBlank { optString("centroDeCosto").trim() }
        val sectorIdValue = optString("sectorId").trim()
        val sectorNameValue = optString("sectorNombre").trim()
        val eventIdValue = optString("eventId").trim()

        if (dniValue.isBlank() || name.isBlank()) return null

        return Worker(
            dni = dniValue,
            fullName = name,
            area = areaValue,
            costCenter = costCenterValue,
            sectorId = sectorIdValue,
            sectorName = sectorNameValue,
            eventId = eventIdValue,
            synced = true
        )
    }

    private fun buildWorkersPath(userEmail: String, eventId: String?): String {
        val queryParts = mutableListOf<String>()
        if (userEmail.isNotBlank()) {
            queryParts += "userEmail=${encode(userEmail)}"
        }
        if (!eventId.isNullOrBlank()) {
            queryParts += "eventId=${encode(eventId)}"
        }
        return if (queryParts.isEmpty()) {
            "/api/workers"
        } else {
            "/api/workers?${queryParts.joinToString("&")}"
        }
    }

    private fun buildWorkerLookupPath(dni: String, userEmail: String, eventId: String?): String {
        val queryParts = mutableListOf<String>()
        if (userEmail.isNotBlank()) {
            queryParts += "userEmail=${encode(userEmail)}"
        }
        if (!eventId.isNullOrBlank()) {
            queryParts += "eventId=${encode(eventId)}"
        }

        val encodedDni = encode(dni)
        return if (queryParts.isEmpty()) {
            "/api/workers/lookup/$encodedDni"
        } else {
            "/api/workers/lookup/$encodedDni?${queryParts.joinToString("&")}"
        }
    }

    private fun encode(value: String): String {
        return URLEncoder.encode(value, StandardCharsets.UTF_8.toString())
    }
}
