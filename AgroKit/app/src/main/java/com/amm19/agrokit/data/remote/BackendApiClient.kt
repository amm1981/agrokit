package com.amm19.agrokit.data.remote

import android.content.Context
import com.amm19.agrokit.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

@Singleton
class BackendApiClient @Inject constructor(
    @ApplicationContext context: Context
) {

    private val prefs = context.getSharedPreferences(AUTH_PREFS_NAME, Context.MODE_PRIVATE)

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .callTimeout(45, TimeUnit.SECONDS)
        .build()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun getArray(path: String): Result<JSONArray> = withContext(Dispatchers.IO) {
        runCatching {
            val responseText = executeRequest(
                buildRequest(path) { get() }
            )
            JSONArray(responseText)
        }
    }

    suspend fun getObject(path: String): Result<JSONObject> = withContext(Dispatchers.IO) {
        runCatching {
            val responseText = executeRequest(
                buildRequest(path) { get() }
            )
            JSONObject(responseText)
        }
    }

    suspend fun postObject(path: String, body: JSONObject): Result<JSONObject> = withContext(Dispatchers.IO) {
        runCatching {
            val responseText = executeRequest(
                buildRequest(path) { post(body.toString().toRequestBody(jsonMediaType)) }
            )
            JSONObject(responseText)
        }
    }

    suspend fun putObject(path: String, body: JSONObject): Result<JSONObject> = withContext(Dispatchers.IO) {
        runCatching {
            val responseText = executeRequest(
                buildRequest(path) { put(body.toString().toRequestBody(jsonMediaType)) }
            )
            JSONObject(responseText)
        }
    }

    suspend fun postMultipartFile(
        path: String,
        fileFieldName: String,
        file: File,
        formFields: Map<String, String> = emptyMap()
    ): Result<JSONObject> = withContext(Dispatchers.IO) {
        runCatching {
            val builder = MultipartBody.Builder()
                .setType(MultipartBody.FORM)

            formFields.forEach { (key, value) ->
                builder.addFormDataPart(key, value)
            }

            val mediaType = guessImageMediaType(file).toMediaType()
            builder.addFormDataPart(
                fileFieldName,
                file.name,
                file.asRequestBody(mediaType)
            )

            val responseText = executeRequest(
                buildRequest(path) { post(builder.build()) }
            )
            JSONObject(responseText)
        }
    }

    suspend fun delete(path: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            executeRequest(buildRequest(path) { delete() })
            Unit
        }
    }

    fun openWebSocket(
        onTextMessage: (String) -> Unit,
        onError: (Throwable) -> Unit
    ): RealtimeSubscription {
        val token = resolveActiveToken()
        val wsUrl = if (token.isBlank()) {
            BuildConfig.BACKEND_WS_URL
        } else {
            val separator = if (BuildConfig.BACKEND_WS_URL.contains("?")) "&" else "?"
            "${BuildConfig.BACKEND_WS_URL}$separator" +
                "token=${URLEncoder.encode(token, StandardCharsets.UTF_8.toString())}"
        }

        val request = Request.Builder()
            .url(wsUrl)
            .build()

        val socket = httpClient.newWebSocket(request, SimpleWebSocketListener(onTextMessage, onError))
        return RealtimeSubscription {
            runCatching { socket.close(1000, "client_close") }
        }
    }

    private fun buildRequest(path: String, block: Request.Builder.() -> Unit): Request {
        val builder = Request.Builder().url(buildUrl(path))
        val token = resolveActiveToken()
        if (token.isNotBlank()) {
            builder.header("Authorization", "Bearer $token")
        }
        builder.block()
        return builder.build()
    }

    private fun buildUrl(path: String): String {
        val normalizedBase = BuildConfig.BACKEND_BASE_URL.trimEnd('/')
        val normalizedPath = if (path.startsWith('/')) path else "/$path"
        return normalizedBase + normalizedPath
    }

    private fun executeRequest(request: Request): String {
        httpClient.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = runCatching {
                    JSONObject(body).optString("message").ifBlank { body }
                }.getOrDefault(body)

                if (response.code == 401 && request.url.encodedPath != "/api/auth/login") {
                    clearStoredSession()
                    error("HTTP 401: Sesion expirada o invalida. Inicia sesion nuevamente.")
                }
                error("HTTP ${response.code}: $message")
            }
            return body
        }
    }

    private fun resolveActiveToken(): String {
        val token = prefs.getString(KEY_ACCESS_TOKEN, "").orEmpty().trim()
        if (token.isBlank()) return ""
        val expiresAt = prefs.getLong(KEY_TOKEN_EXPIRES_AT, 0L)
        if (expiresAt <= System.currentTimeMillis()) {
            clearStoredSession()
            return ""
        }
        return token
    }

    private fun clearStoredSession() {
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

    private fun guessImageMediaType(file: File): String {
        return when (file.extension.lowercase()) {
            "png" -> "image/png"
            "webp" -> "image/webp"
            "jpg", "jpeg" -> "image/jpeg"
            else -> "image/jpeg"
        }
    }

    private companion object {
        const val AUTH_PREFS_NAME = "agrokit_auth"
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
