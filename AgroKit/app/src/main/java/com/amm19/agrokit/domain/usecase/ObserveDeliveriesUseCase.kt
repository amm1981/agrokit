package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.model.Delivery
import com.amm19.agrokit.domain.repository.AgroKitRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class ObserveDeliveriesUseCase @Inject constructor(
    private val repository: AgroKitRepository
) {
    operator fun invoke(): Flow<List<Delivery>> = repository.observeDeliveries()
}

