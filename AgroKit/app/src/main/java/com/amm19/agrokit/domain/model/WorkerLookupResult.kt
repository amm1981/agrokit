package com.amm19.agrokit.domain.model

data class WorkerLookupResult(
    val status: WorkerLookupStatus,
    val worker: Worker? = null,
    val latestDelivery: WorkerLookupDeliveryInfo? = null
)

enum class WorkerLookupStatus {
    AVAILABLE,
    OTHER_SECTOR,
    NOT_FOUND
}

data class WorkerLookupDeliveryInfo(
    val timestamp: Long,
    val sectorId: String,
    val sectorName: String,
    val userEmail: String,
    val pdaId: String,
    val eventId: String,
    val eventName: String
)
