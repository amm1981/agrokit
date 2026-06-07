package com.amm19.agrokit.data.remote

import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

class SimpleWebSocketListener(
    private val onTextMessage: (String) -> Unit,
    private val onError: (Throwable) -> Unit
) : WebSocketListener() {
    override fun onMessage(webSocket: WebSocket, text: String) {
        onTextMessage(text)
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        onError(t)
    }
}
