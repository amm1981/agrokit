package com.amm19.agrokit.presentation.scanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter

class PdaScannerBroadcastReceiver(
    private val onScanReceived: (String) -> Unit
) : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        val payload = intent.extractScanValue()
        if (payload.isNullOrBlank()) return

        val normalized = payload.trim()
        if (normalized.isNotEmpty()) {
            onScanReceived(normalized)
        }
    }

    companion object {
        fun intentFilter(): IntentFilter {
            return IntentFilter().apply {
                addAction("com.rscja.scanner.action.scanner.RCV")
                addAction("com.scanner.broadcast")
                addAction("com.symbol.datawedge.data")
                addAction("android.intent.action.SCANRESULT")
            }
        }

        private val scanKeys = listOf(
            "barocode",
            "scannerdata",
            "scan_result",
            "data",
            "decode_data",
            "com.symbol.datawedge.data_string"
        )

        private fun Intent?.extractScanValue(): String? {
            if (this == null) return null
            scanKeys.forEach { key ->
                val value = getStringExtra(key)
                if (!value.isNullOrBlank()) return value
            }
            return null
        }
    }
}
