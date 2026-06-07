package com.amm19.agrokit.data.local

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NetworkStatusTracker @Inject constructor(
    @ApplicationContext private val context: Context
) {
    fun isConnectedNow(): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        return isConnected(connectivityManager)
    }

    fun observe(): Flow<Boolean> = callbackFlow {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(isConnected(connectivityManager))
            }

            override fun onLost(network: Network) {
                trySend(isConnected(connectivityManager))
            }

            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                trySend(isConnected(connectivityManager))
            }
        }

        trySend(isConnected(connectivityManager))
        connectivityManager.registerDefaultNetworkCallback(callback)

        awaitClose {
            runCatching { connectivityManager.unregisterNetworkCallback(callback) }
        }
    }

    private fun isConnected(connectivityManager: ConnectivityManager): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
