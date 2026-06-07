package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.repository.AgroKitRepository
import javax.inject.Inject

class SeedInitialDataUseCase @Inject constructor(
    private val repository: AgroKitRepository
) {
    suspend operator fun invoke() = repository.seedInitialDataIfNeeded()
}
