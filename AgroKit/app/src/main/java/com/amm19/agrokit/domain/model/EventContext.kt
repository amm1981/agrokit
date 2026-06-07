package com.amm19.agrokit.domain.model

data class EventContext(
    val id: String,
    val name: String,
    val startAt: Long,
    val endAt: Long,
    val sectorIds: List<String> = emptyList(),
    val sectors: List<EventSectorContext> = emptyList()
) {
    fun allows(timestamp: Long): Boolean = timestamp in startAt..endAt
}

data class EventSectorContext(
    val id: String,
    val name: String
)
