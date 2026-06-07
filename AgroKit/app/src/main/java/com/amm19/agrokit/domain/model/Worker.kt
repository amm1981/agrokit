package com.amm19.agrokit.domain.model

data class Worker(
    val dni: String,
    val fullName: String,
    val area: String,
    val costCenter: String,
    val sectorId: String = "",
    val sectorName: String = "",
    val eventId: String = "",
    val synced: Boolean = false
)
