package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.data.local.NetworkStatusTracker
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class ObserveNetworkStatusUseCase @Inject constructor(
    private val networkStatusTracker: NetworkStatusTracker
) {
    operator fun invoke(): Flow<Boolean> = networkStatusTracker.observe()
}

