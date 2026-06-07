package com.amm19.agrokit.domain.model

data class Delivery(
    val id: String,
    val workerDni: String,
    val products: List<DeliveryProduct> = emptyList(),
    val timestamp: Long,
    val photoPath: String,
    val pdaId: String,
    val userEmail: String,
    val eventId: String = "",
    val sectorId: String = "",
    val synced: Boolean = false
) {
    val kitIds: List<String>
        get() = products
            .map { it.kitId.trim() }
            .filter { it.isNotBlank() }
            .distinct()
}

data class DeliveryProduct(
    val kitId: String,
    val productId: String,
    val productName: String,
    val quantity: Double
)
