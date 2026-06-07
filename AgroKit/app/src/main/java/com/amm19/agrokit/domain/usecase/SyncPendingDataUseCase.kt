package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.repository.AgroKitRepository
import javax.inject.Inject

class SyncPendingDataUseCase @Inject constructor(
    private val repository: AgroKitRepository
) {
    suspend operator fun invoke(
        onProgress: ((SyncProgressStep) -> Unit)? = null
    ): SyncSummary {
        onProgress?.invoke(SyncProgressStep.PUSH_WORKERS)
        val pushedWorkers = repository.syncPendingWorkers()
        onProgress?.invoke(SyncProgressStep.PUSH_KITS)
        val pushedKits = repository.syncPendingKits()
        onProgress?.invoke(SyncProgressStep.PUSH_DELIVERIES)
        val pushedDeliveries = repository.syncPendingDeliveries()
        onProgress?.invoke(SyncProgressStep.PULL_WORKERS)
        val pulledWorkers = repository.pullWorkersFromRemote()
        onProgress?.invoke(SyncProgressStep.PULL_KITS)
        val pulledKits = repository.pullKitsFromRemote()
        onProgress?.invoke(SyncProgressStep.PULL_DELIVERIES)
        val pulledDeliveries = repository.pullDeliveriesFromRemote()
        return SyncSummary(
            pushedWorkers = pushedWorkers,
            pushedKits = pushedKits,
            pushedDeliveries = pushedDeliveries,
            pulledWorkers = pulledWorkers,
            pulledKits = pulledKits,
            pulledDeliveries = pulledDeliveries
        )
    }
}

enum class SyncProgressStep {
    PUSH_WORKERS,
    PUSH_KITS,
    PUSH_DELIVERIES,
    PULL_WORKERS,
    PULL_KITS,
    PULL_DELIVERIES
}

data class SyncSummary(
    val pushedWorkers: Int,
    val pushedKits: Int,
    val pushedDeliveries: Int,
    val pulledWorkers: Int,
    val pulledKits: Int,
    val pulledDeliveries: Int
)
