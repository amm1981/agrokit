package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.repository.AgroKitRepository
import javax.inject.Inject

class DeleteKitUseCase @Inject constructor(
    private val repository: AgroKitRepository
) {
    suspend operator fun invoke(kitId: String) = repository.deleteKitById(kitId)
}
