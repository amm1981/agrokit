package com.amm19.agrokit.data.repository

import android.content.Context
import com.amm19.agrokit.data.remote.BackendAuthService
import com.amm19.agrokit.domain.model.AuthSession
import com.amm19.agrokit.domain.model.EventContext
import com.amm19.agrokit.domain.model.EventSectorContext
import com.amm19.agrokit.domain.repository.AuthRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import org.json.JSONArray
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepositoryImpl @Inject constructor(
    @ApplicationContext context: Context,
    private val backendAuthService: BackendAuthService
) : AuthRepository {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun getCurrentSession(): AuthSession? {
        val email = prefs.getString(KEY_EMAIL, null).orEmpty().trim()
        if (email.isBlank()) return null
        val accessToken = prefs.getString(KEY_ACCESS_TOKEN, "").orEmpty().trim()
        val tokenType = prefs.getString(KEY_TOKEN_TYPE, "Bearer").orEmpty().ifBlank { "Bearer" }
        val tokenExpiresAt = prefs.getLong(KEY_TOKEN_EXPIRES_AT, 0L)
        if (accessToken.isBlank() || tokenExpiresAt <= System.currentTimeMillis()) {
            signOut()
            return null
        }

        val events = parseStoredEvents(prefs.getString(KEY_ACTIVE_EVENTS_JSON, "").orEmpty())
        val eventId = prefs.getString(KEY_EVENT_ID, "").orEmpty().trim()

        val fallbackEvent = parseLegacyActiveEvent()
        val activeEvents = when {
            events.isNotEmpty() -> events
            fallbackEvent != null -> listOf(fallbackEvent)
            else -> emptyList()
        }
        val activeEvent = activeEvents.firstOrNull { it.id == eventId }
            ?: fallbackEvent
            ?: activeEvents.firstOrNull()

        val sectorIds = prefs.getString(KEY_SECTOR_IDS, "")
            .orEmpty()
            .split(',')
            .map { it.trim() }
            .filter { it.isNotBlank() }
        val effectiveSectorIds = if (sectorIds.isNotEmpty()) {
            sectorIds
        } else {
            activeEvent?.sectorIds.orEmpty()
        }

        return AuthSession(
            email = email,
            fullName = prefs.getString(KEY_FULL_NAME, "").orEmpty(),
            role = prefs.getString(KEY_ROLE, "pda").orEmpty().ifBlank { "pda" },
            assignedPdaId = prefs.getString(KEY_ASSIGNED_PDA, "").orEmpty(),
            activeEvent = activeEvent,
            activeEvents = activeEvents,
            sectorIds = effectiveSectorIds,
            accessToken = accessToken,
            tokenType = tokenType,
            tokenExpiresAt = tokenExpiresAt
        )
    }

    override fun switchActiveEvent(eventId: String): AuthSession? {
        val session = getCurrentSession() ?: return null
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) return session
        val nextEvent = session.activeEvents.firstOrNull { it.id == normalizedEventId } ?: return session
        val updated = session.copy(
            activeEvent = nextEvent,
            sectorIds = if (nextEvent.sectorIds.isNotEmpty()) nextEvent.sectorIds else session.sectorIds
        )
        persistSession(updated)
        return updated
    }

    override suspend fun signIn(email: String, password: String): Result<AuthSession> {
        return backendAuthService.signIn(email, password).onSuccess { session ->
            persistSession(session)
        }
    }

    override fun signOut() {
        prefs.edit()
            .remove(KEY_EMAIL)
            .remove(KEY_FULL_NAME)
            .remove(KEY_ROLE)
            .remove(KEY_ASSIGNED_PDA)
            .remove(KEY_SECTOR_IDS)
            .remove(KEY_EVENT_ID)
            .remove(KEY_EVENT_NAME)
            .remove(KEY_EVENT_START_AT)
            .remove(KEY_EVENT_END_AT)
            .remove(KEY_ACTIVE_EVENTS_JSON)
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_TOKEN_TYPE)
            .remove(KEY_TOKEN_EXPIRES_AT)
            .apply()
    }

    private fun persistSession(session: AuthSession) {
        prefs.edit()
            .putString(KEY_EMAIL, session.email)
            .putString(KEY_FULL_NAME, session.fullName)
            .putString(KEY_ROLE, session.role)
            .putString(KEY_ASSIGNED_PDA, session.assignedPdaId)
            .putString(KEY_SECTOR_IDS, session.sectorIds.joinToString(","))
            .putString(KEY_EVENT_ID, session.activeEvent?.id.orEmpty())
            .putString(KEY_EVENT_NAME, session.activeEvent?.name.orEmpty())
            .putLong(KEY_EVENT_START_AT, session.activeEvent?.startAt ?: 0L)
            .putLong(KEY_EVENT_END_AT, session.activeEvent?.endAt ?: 0L)
            .putString(KEY_ACTIVE_EVENTS_JSON, buildEventsJson(session.activeEvents))
            .putString(KEY_ACCESS_TOKEN, session.accessToken)
            .putString(KEY_TOKEN_TYPE, session.tokenType)
            .putLong(KEY_TOKEN_EXPIRES_AT, session.tokenExpiresAt)
            .apply()
    }

    private fun parseLegacyActiveEvent(): EventContext? {
        val eventId = prefs.getString(KEY_EVENT_ID, "").orEmpty().trim()
        if (eventId.isBlank()) return null
        val eventName = prefs.getString(KEY_EVENT_NAME, "").orEmpty()
        val startAt = prefs.getLong(KEY_EVENT_START_AT, 0L)
        val endAt = prefs.getLong(KEY_EVENT_END_AT, 0L)
        val sectorIds = prefs.getString(KEY_SECTOR_IDS, "")
            .orEmpty()
            .split(',')
            .map { it.trim() }
            .filter { it.isNotBlank() }
        if (startAt <= 0L || endAt <= 0L) return null
        return EventContext(
            id = eventId,
            name = eventName,
            startAt = startAt,
            endAt = endAt,
            sectorIds = sectorIds,
            sectors = emptyList()
        )
    }

    private fun parseStoredEvents(raw: String): List<EventContext> {
        if (raw.isBlank()) return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val id = item.optString("id").trim()
                    val name = item.optString("name").trim()
                    val startAt = item.optLong("startAt", 0L)
                    val endAt = item.optLong("endAt", 0L)
                    if (id.isBlank() || startAt <= 0L || endAt <= 0L) continue
                    val sectors = buildList {
                        val sectorsArray = item.optJSONArray("sectors")
                        if (sectorsArray != null) {
                            for (sectorIndex in 0 until sectorsArray.length()) {
                                val sectorObj = sectorsArray.optJSONObject(sectorIndex) ?: continue
                                val sectorId = sectorObj.optString("id").trim()
                                if (sectorId.isBlank()) continue
                                add(
                                    EventSectorContext(
                                        id = sectorId,
                                        name = sectorObj.optString("name").trim().ifBlank { sectorId }
                                    )
                                )
                            }
                        }
                    }
                    add(
                        EventContext(
                            id = id,
                            name = name,
                            startAt = startAt,
                            endAt = endAt,
                            sectorIds = buildList {
                                val sectorIdsArray = item.optJSONArray("sectorIds")
                                if (sectorIdsArray != null) {
                                    for (sectorIndex in 0 until sectorIdsArray.length()) {
                                        val value = sectorIdsArray.optString(sectorIndex).trim()
                                        if (value.isNotBlank()) add(value)
                                    }
                                }
                                if (isEmpty()) {
                                    sectors.mapTo(this) { it.id }
                                }
                            }
                            ,
                            sectors = sectors
                        )
                    )
                }
            }
        }.getOrElse { emptyList() }
    }

    private fun buildEventsJson(events: List<EventContext>): String {
        val array = JSONArray()
        events.forEach { event ->
            array.put(
                JSONObject().apply {
                    put("id", event.id)
                    put("name", event.name)
                    put("startAt", event.startAt)
                    put("endAt", event.endAt)
                    put("sectorIds", JSONArray(event.sectorIds))
                    put(
                        "sectors",
                        JSONArray(
                            event.sectors.map { sector ->
                                JSONObject().apply {
                                    put("id", sector.id)
                                    put("name", sector.name)
                                }
                            }
                        )
                    )
                }
            )
        }
        return array.toString()
    }

    private companion object {
        const val PREFS_NAME = "agrokit_auth"
        const val KEY_EMAIL = "session_email"
        const val KEY_FULL_NAME = "session_full_name"
        const val KEY_ROLE = "session_role"
        const val KEY_ASSIGNED_PDA = "session_assigned_pda"
        const val KEY_SECTOR_IDS = "session_sector_ids"
        const val KEY_EVENT_ID = "session_event_id"
        const val KEY_EVENT_NAME = "session_event_name"
        const val KEY_EVENT_START_AT = "session_event_start_at"
        const val KEY_EVENT_END_AT = "session_event_end_at"
        const val KEY_ACTIVE_EVENTS_JSON = "session_active_events_json"
        const val KEY_ACCESS_TOKEN = "session_access_token"
        const val KEY_TOKEN_TYPE = "session_token_type"
        const val KEY_TOKEN_EXPIRES_AT = "session_token_expires_at"
    }
}
