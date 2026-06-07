package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.model.Delivery
import com.amm19.agrokit.domain.model.KitDeliveryStatus
import com.amm19.agrokit.domain.model.KitProductDeliveryStatus
import com.amm19.agrokit.domain.repository.AgroKitRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import javax.inject.Inject

class ObserveKitStatusesUseCase @Inject constructor(
    private val repository: AgroKitRepository
) {
    operator fun invoke(dni: String): Flow<List<KitDeliveryStatus>> {
        return combine(
            repository.observeKits(),
            repository.observeDeliveriesByWorker(dni)
        ) { kits, deliveries ->
            mapToStatuses(kits = kits, deliveries = deliveries)
        }
    }

    private fun mapToStatuses(
        kits: List<com.amm19.agrokit.domain.model.Kit>,
        deliveries: List<Delivery>
    ): List<KitDeliveryStatus> {
        val deliveredByKitProduct = mutableMapOf<Pair<String, String>, Double>()
        val latestDeliveryByKitProduct = mutableMapOf<Pair<String, String>, Delivery>()
        deliveries.forEach { delivery ->
            delivery.products.forEach { product ->
                val key = product.kitId.trim() to product.productId.trim()
                deliveredByKitProduct[key] = (deliveredByKitProduct[key] ?: 0.0) + product.quantity
                val currentLatest = latestDeliveryByKitProduct[key]
                if (currentLatest == null || delivery.timestamp > currentLatest.timestamp) {
                    latestDeliveryByKitProduct[key] = delivery
                }
            }
        }

        return kits.map { kit ->
            val products = if (kit.products.isNotEmpty()) {
                kit.products.map { product ->
                    val key = kit.id to product.id
                    val deliveredQuantity = deliveredByKitProduct[key] ?: 0.0
                    val latestDelivery = latestDeliveryByKitProduct[key]
                    KitProductDeliveryStatus(
                        product = product,
                        deliveredQuantity = deliveredQuantity,
                        requiredQuantity = product.quantity.coerceAtLeast(0.0),
                        latestDeliveryTimestamp = latestDelivery?.timestamp,
                        latestDeliverySectorId = latestDelivery?.sectorId.orEmpty(),
                        latestDeliveredBy = latestDelivery?.userEmail.orEmpty()
                    )
                }
            } else {
                val deliveredLegacy = deliveries.any { delivery -> delivery.kitIds.contains(kit.id) }
                val latestDeliveryLegacy = deliveries
                    .filter { delivery -> delivery.kitIds.contains(kit.id) }
                    .maxByOrNull { it.timestamp }
                listOf(
                    KitProductDeliveryStatus(
                        product = com.amm19.agrokit.domain.model.KitProduct(
                            id = kit.id,
                            name = kit.name,
                            quantity = 1.0
                        ),
                        deliveredQuantity = if (deliveredLegacy) 1.0 else 0.0,
                        requiredQuantity = 1.0,
                        latestDeliveryTimestamp = latestDeliveryLegacy?.timestamp,
                        latestDeliverySectorId = latestDeliveryLegacy?.sectorId.orEmpty(),
                        latestDeliveredBy = latestDeliveryLegacy?.userEmail.orEmpty()
                    )
                )
            }

            val deliveredProducts = products.count { it.isDelivered }
            KitDeliveryStatus(
                kit = kit,
                delivered = deliveredProducts == products.size && products.isNotEmpty(),
                deliveredProducts = deliveredProducts,
                totalProducts = products.size,
                products = products
            )
        }
    }
}
