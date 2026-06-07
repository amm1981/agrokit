package com.amm19.agrokit.domain.model

data class DeliveryWindow(
    val enabled: Boolean,
    val startAt: Long?,
    val endAt: Long?,
    val updatedAt: Long,
    val updatedBy: String
) {
    fun allows(timestamp: Long): Boolean {
        if (!enabled) return true
        val start = startAt ?: return true
        val end = endAt ?: return true
        return timestamp in start..end
    }
}
