package com.amm19.agrokit.domain.model

data class KitDeliveryStatus(
    val kit: Kit,
    val delivered: Boolean,
    val deliveredProducts: Int,
    val totalProducts: Int,
    val products: List<KitProductDeliveryStatus>
)

data class KitProductDeliveryStatus(
    val product: KitProduct,
    val deliveredQuantity: Double,
    val requiredQuantity: Double,
    val latestDeliveryTimestamp: Long? = null,
    val latestDeliverySectorId: String = "",
    val latestDeliveredBy: String = ""
) {
    val pendingQuantity: Double
        get() = (requiredQuantity - deliveredQuantity).coerceAtLeast(0.0)

    val isDelivered: Boolean
        get() = pendingQuantity <= 0.000001
}
