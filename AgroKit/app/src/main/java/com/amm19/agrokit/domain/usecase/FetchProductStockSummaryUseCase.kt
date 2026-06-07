package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.model.ProductStockSummary
import com.amm19.agrokit.domain.repository.AgroKitRepository
import javax.inject.Inject

class FetchProductStockSummaryUseCase @Inject constructor(
    private val repository: AgroKitRepository
) {
    suspend operator fun invoke(): Result<List<ProductStockSummary>> {
        return repository.fetchProductStockSummary()
    }
}
