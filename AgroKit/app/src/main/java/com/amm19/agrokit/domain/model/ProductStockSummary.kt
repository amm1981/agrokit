package com.amm19.agrokit.domain.model

data class ProductStockSummary(
    val eventId: String,
    val productCode: String,
    val productName: String,
    val perBeneficiaryQuantity: Double,
    val beneficiariesCount: Int,
    val requiredQuantity: Double,
    val stockQuantity: Double,
    val sectorStockQuantity: Double,
    val sectorStocks: List<ProductSectorStockSummary>,
    val deliveredQuantity: Double,
    val availableQuantity: Double,
    val sufficientForBeneficiaries: Boolean
)

data class ProductSectorStockSummary(
    val sectorId: String,
    val sectorName: String,
    val stockQuantity: Double
)
