package com.amm19.agrokit.domain.model

data class PendingSyncState(
    val workers: Int,
    val kits: Int,
    val deliveries: Int
) {
    val total: Int
        get() = workers + kits + deliveries
}

