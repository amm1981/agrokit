package com.amm19.agrokit.data.remote

import com.amm19.agrokit.domain.model.AuthSession
import com.amm19.agrokit.domain.model.EventContext
import com.amm19.agrokit.domain.model.EventSectorContext
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BackendAuthService @Inject constructor(
    private val backendApiClient: BackendApiClient
) {

    suspend fun signIn(email: String, password: String): Result<AuthSession> {
        val normalizedEmail = email.trim().lowercase()
        val payload = JSONObject().apply {
            put("email", normalizedEmail)
            put("password", password)
        }

        return backendApiClient
            .postObject("/api/auth/login", payload)
            .mapCatching { response ->
                val resolvedEmail = response.optString("email").trim().ifBlank { normalizedEmail }
                val activeEvents = buildList {
                    val eventsArray = response.optJSONArray("activeEvents")
                    if (eventsArray != null) {
                        for (index in 0 until eventsArray.length()) {
                            val item = eventsArray.optJSONObject(index) ?: continue
                            parseEvent(item)?.let(::add)
                        }
                    }
                }
                val activeEvent = response.optJSONObject("activeEvent")?.let(::parseEvent)
                    ?: activeEvents.firstOrNull()

                val sectorIds = buildList {
                    val sectorArray = response.optJSONArray("sectorIds")
                    if (sectorArray != null) {
                        for (index in 0 until sectorArray.length()) {
                            val value = sectorArray.optString(index).trim()
                            if (value.isNotBlank()) add(value)
                        }
                    }
                }
                val accessToken = response.optString("accessToken").trim()
                    .ifBlank { response.optString("token").trim() }
                val tokenType = response.optString("tokenType").trim().ifBlank { "Bearer" }
                val tokenExpiresAt = response.optLong("expiresAt", 0L)
                if (accessToken.isBlank() || tokenExpiresAt <= System.currentTimeMillis()) {
                    error("Token de sesion no emitido por el servidor")
                }

                AuthSession(
                    email = resolvedEmail,
                    fullName = response.optString("fullName").trim(),
                    role = response.optString("role").trim().ifBlank { "pda" },
                    assignedPdaId = response.optString("assignedPdaId").trim(),
                    activeEvent = activeEvent,
                    activeEvents = if (activeEvents.isNotEmpty()) activeEvents else listOfNotNull(activeEvent),
                    sectorIds = if (activeEvent?.sectorIds?.isNotEmpty() == true) activeEvent.sectorIds else sectorIds,
                    accessToken = accessToken,
                    tokenType = tokenType,
                    tokenExpiresAt = tokenExpiresAt
                )
            }
    }

    private fun parseEvent(event: JSONObject): EventContext? {
        val id = event.optString("id").trim()
        val name = event.optString("name").trim()
        val startAt = event.optLong("startAt", 0L)
        val endAt = event.optLong("endAt", 0L)
        val sectors = buildList {
            val sectorArray = event.optJSONArray("sectors")
            if (sectorArray != null) {
                for (index in 0 until sectorArray.length()) {
                    val item = sectorArray.optJSONObject(index) ?: continue
                    val sectorId = item.optString("id").trim()
                    if (sectorId.isBlank()) continue
                    add(
                        EventSectorContext(
                            id = sectorId,
                            name = item.optString("name").trim().ifBlank { sectorId }
                        )
                    )
                }
            }
        }
        val sectorIds = buildList {
            val idsArray = event.optJSONArray("sectorIds")
            if (idsArray != null) {
                for (index in 0 until idsArray.length()) {
                    val value = idsArray.optString(index).trim()
                    if (value.isNotBlank()) add(value)
                }
            }
            if (isEmpty()) {
                sectors.mapTo(this) { it.id }
            }
        }
        if (id.isBlank() || startAt <= 0L || endAt <= 0L) return null
        return EventContext(
            id = id,
            name = name,
            startAt = startAt,
            endAt = endAt,
            sectorIds = sectorIds,
            sectors = sectors
        )
    }
}
