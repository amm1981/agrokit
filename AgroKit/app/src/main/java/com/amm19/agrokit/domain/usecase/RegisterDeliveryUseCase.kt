package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.model.Delivery
import com.amm19.agrokit.domain.model.DeliveryProduct
import com.amm19.agrokit.domain.repository.AgroKitRepository
import java.util.UUID
import javax.inject.Inject

class RegisterDeliveryUseCase @Inject constructor(
    private val repository: AgroKitRepository,
    private val pdaIdProvider: PdaIdProvider,
    private val getCurrentSessionUseCase: GetCurrentSessionUseCase
) {
    suspend operator fun invoke(
        workerDni: String,
        products: List<DeliveryProduct>,
        photoPath: String
    ) {
        val normalizedProducts = products
            .map { product ->
                product.copy(
                    kitId = product.kitId.trim(),
                    productId = product.productId.trim(),
                    productName = product.productName.trim().ifBlank { product.productId.trim() },
                    quantity = product.quantity.coerceAtLeast(0.0)
                )
            }
            .filter { product ->
                product.productId.isNotBlank() && product.quantity > 0.000001
            }
        if (normalizedProducts.isEmpty()) return

        val delivery = Delivery(
            id = UUID.randomUUID().toString(),
            workerDni = workerDni,
            products = normalizedProducts,
            timestamp = System.currentTimeMillis(),
            photoPath = photoPath,
            pdaId = pdaIdProvider.getPdaId(),
            userEmail = getCurrentSessionUseCase()?.email.orEmpty().ifBlank { "sin_usuario" },
            eventId = getCurrentSessionUseCase()?.activeEvent?.id.orEmpty(),
            synced = false
        )
        repository.saveDelivery(delivery)
    }
}
