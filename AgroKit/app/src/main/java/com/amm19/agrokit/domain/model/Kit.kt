package com.amm19.agrokit.domain.model

data class Kit(
    val id: String,
    val name: String,
    val eventId: String = "",
    val products: List<KitProduct> = emptyList(),
    val synced: Boolean = false
)
