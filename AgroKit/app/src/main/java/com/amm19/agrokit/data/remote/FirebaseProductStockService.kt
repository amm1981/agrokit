package com.amm19.agrokit.data.remote

import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FirebaseProductStockService @Inject constructor(
    private val backendApiClient: BackendApiClient
) {

    suspend fun fetchStockSummary(eventId: String?): Result<List<ProductStockSummary>> {
        return backendApiClient.getArray(buildProductsPath(eventId)).map { array ->
            buildList {
                for (index in 0 until array.length()) {
                    val obj = array.optJSONObject(index) ?: continue
                    obj.toSummary()?.let(::add)
                }
            }
        }
    }

    suspend fun updateStock(
        productCode: String,
        stockQuantity: Double,
        userEmail: String,
        eventId: String?
    ): Result<ProductStockSummary?> {
        if (productCode.isBlank()) return Result.failure(IllegalArgumentException("productCode requerido"))
        if (stockQuantity < 0.0) return Result.failure(IllegalArgumentException("stockQuantity invalido"))

        val payload = JSONObject().apply {
            put("stockQuantity", stockQuantity)
            put("userEmail", userEmail)
            if (!eventId.isNullOrBlank()) put("eventId", eventId)
        }

        return backendApiClient
            .putObject("/api/products/${encode(productCode)}/stock", payload)
            .map { response ->
                response.toSummary()
            }
    }

    private fun JSONObject.toSummary(): ProductStockSummary? {
        val productCode = optString("productCode").trim()
        if (productCode.isBlank()) return null

        return ProductStockSummary(
            eventId = optString("eventId").trim(),
            productCode = productCode,
            productName = optString("productName").trim().ifBlank { productCode },
            perBeneficiaryQuantity = optDouble("perBeneficiaryQuantity", 0.0),
            beneficiariesCount = optInt("beneficiariesCount", 0),
            requiredQuantity = optDouble("requiredQuantity", 0.0),
            stockQuantity = optDouble("stockQuantity", 0.0),
            sectorStockQuantity = optDouble("sectorStockQuantity", 0.0),
            sectorStocks = parseSectorStocks(this),
            deliveredQuantity = optDouble("deliveredQuantity", 0.0),
            availableQuantity = optDouble("availableQuantity", 0.0),
            sufficientForBeneficiaries = optBoolean("sufficientForBeneficiaries", false)
        )
    }

    private fun parseSectorStocks(json: JSONObject): List<ProductSectorStockSummary> {
        val sectorArray = json.optJSONArray("sectorStocks") ?: return emptyList()
        return buildList {
            for (index in 0 until sectorArray.length()) {
                val obj = sectorArray.optJSONObject(index) ?: continue
                val sectorId = obj.optString("sectorId").trim()
                if (sectorId.isBlank()) continue
                add(
                    ProductSectorStockSummary(
                        sectorId = sectorId,
                        sectorName = obj.optString("sectorName").trim().ifBlank { sectorId },
                        stockQuantity = obj.optDouble("stockQuantity", 0.0)
                    )
                )
            }
        }
    }

    private fun buildProductsPath(eventId: String?): String {
        if (eventId.isNullOrBlank()) return "/api/products"
        return "/api/products?eventId=${encode(eventId)}"
    }

    private fun encode(value: String): String {
        return URLEncoder.encode(value, StandardCharsets.UTF_8.toString())
    }
}

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
