package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.repository.AgroKitRepository
import javax.inject.Inject

class StopRealtimeSyncUseCase @Inject constructor(
    private val repository: AgroKitRepository
) {
    operator fun invoke() = repository.stopRealtimeSync()
}

