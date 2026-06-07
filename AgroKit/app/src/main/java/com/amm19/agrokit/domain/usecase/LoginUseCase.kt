package com.amm19.agrokit.domain.usecase

import com.amm19.agrokit.domain.model.AuthSession
import com.amm19.agrokit.domain.repository.AuthRepository
import javax.inject.Inject

class LoginUseCase @Inject constructor(
    private val repository: AuthRepository
) {
    suspend operator fun invoke(email: String, password: String): Result<AuthSession> {
        return repository.signIn(email = email, password = password)
    }
}
