package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.model.WorkerLookupResult
import com.amm19.agrokit.domain.repository.AgroKitRepository
import javax.inject.Inject

class LookupWorkerByDniUseCase @Inject constructor(
    private val repository: AgroKitRepository
) {
    suspend operator fun invoke(dni: String): WorkerLookupResult = repository.lookupWorkerByDni(dni)
}
