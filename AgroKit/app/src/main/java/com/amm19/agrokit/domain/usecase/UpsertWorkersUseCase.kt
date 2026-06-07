package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.model.Worker
import com.amm19.agrokit.domain.repository.AgroKitRepository
import javax.inject.Inject

class UpsertWorkersUseCase @Inject constructor(
    private val repository: AgroKitRepository
) {
    suspend operator fun invoke(workers: List<Worker>) {
        repository.upsertWorkers(workers)
    }
}
