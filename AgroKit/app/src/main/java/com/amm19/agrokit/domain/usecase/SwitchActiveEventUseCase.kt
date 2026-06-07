package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.model.AuthSession
import com.amm19.agrokit.domain.repository.AuthRepository
import javax.inject.Inject

class SwitchActiveEventUseCase @Inject constructor(
    private val repository: AuthRepository
) {
    operator fun invoke(eventId: String): AuthSession? = repository.switchActiveEvent(eventId)
}
