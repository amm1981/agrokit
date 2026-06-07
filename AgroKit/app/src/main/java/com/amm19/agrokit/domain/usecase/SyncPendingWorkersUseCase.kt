package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.repository.AgroKitRepository
import javax.inject.Inject

class SyncPendingWorkersUseCase @Inject constructor(
    private val repository: AgroKitRepository
) {
    suspend operator fun invoke(): Int = repository.syncPendingWorkers()
}
