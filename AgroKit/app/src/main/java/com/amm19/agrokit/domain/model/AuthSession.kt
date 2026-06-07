package com.amm19.agrokit.domain.model

data class AuthSession(
    val email: String,
    val fullName: String = "",
    val role: String = "pda",
    val assignedPdaId: String = "",
    val activeEvent: EventContext? = null,
    val activeEvents: List<EventContext> = emptyList(),
    val sectorIds: List<String> = emptyList(),
    val accessToken: String = "",
    val tokenType: String = "Bearer",
    val tokenExpiresAt: Long = 0L
)
