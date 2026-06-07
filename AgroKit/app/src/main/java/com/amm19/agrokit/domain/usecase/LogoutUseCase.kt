package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.repository.AuthRepository
import javax.inject.Inject

class LogoutUseCase @Inject constructor(
    private val repository: AuthRepository
) {
    operator fun invoke() = repository.signOut()
}
