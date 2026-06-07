package com.amm19.agrokit.data.remote

import com.amm19.agrokit.domain.model.DeliveryWindow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FirebaseSettingsService @Inject constructor(
    private val backendApiClient: BackendApiClient
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun observeDeliveryWindow(
        eventId: String?,
        onChanged: (DeliveryWindow?) -> Unit,
        onError: (Throwable) -> Unit
    ): RealtimeSubscription {

        scope.launch {
            val path = if (eventId.isNullOrBlank()) {
                "/api/settings/delivery-window"
            } else {
                "/api/settings/delivery-window?eventId=${java.net.URLEncoder.encode(eventId, java.nio.charset.StandardCharsets.UTF_8.toString())}"
            }
            backendApiClient.getObject(path)
                .getOrNull()
                ?.toDeliveryWindow()
                ?.let(onChanged)
        }

        return backendApiClient.openWebSocket(
            onTextMessage = { text ->
                runCatching {
                    val event = JSONObject(text)
                    if (event.optString("entity") != "settings.deliveryWindow") return@runCatching

                    if (event.optString("action") == "upsert") {
                        val payload = event.optJSONObject("payload") ?: return@runCatching
                        val payloadEventId = payload.optString("eventId").trim()
                        if (!eventId.isNullOrBlank() && payloadEventId.isNotBlank() && payloadEventId != eventId) {
                            return@runCatching
                        }
                        onChanged(payload.toDeliveryWindow())
                    }
                }.onFailure(onError)
            },
            onError = onError
        )
    }

    private fun JSONObject.toDeliveryWindow(): DeliveryWindow {
        return DeliveryWindow(
            enabled = optBoolean("enabled", false),
            startAt = optLong("startAt").takeIf { it > 0L },
            endAt = optLong("endAt").takeIf { it > 0L },
            updatedAt = optLong("updatedAt", 0L),
            updatedBy = optString("updatedBy").trim()
        )
    }
}
