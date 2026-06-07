package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.model.Worker
import com.amm19.agrokit.domain.repository.AgroKitRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class ObserveWorkerByDniUseCase @Inject constructor(
    private val repository: AgroKitRepository
) {
    operator fun invoke(dni: String): Flow<Worker?> = repository.observeWorkerByDni(dni)
}
