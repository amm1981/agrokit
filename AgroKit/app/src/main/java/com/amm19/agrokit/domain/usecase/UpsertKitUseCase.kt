package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.model.Kit
import com.amm19.agrokit.domain.repository.AgroKitRepository
import javax.inject.Inject

class UpsertKitUseCase @Inject constructor(
    private val repository: AgroKitRepository
) {
    suspend operator fun invoke(kit: Kit) = repository.upsertKit(kit)
}
