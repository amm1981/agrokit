package com.amm19.agrokit.domain.repository

import com.amm19.agrokit.domain.model.AuthSession

interface AuthRepository {
    fun getCurrentSession(): AuthSession?
    fun switchActiveEvent(eventId: String): AuthSession?
    suspend fun signIn(email: String, password: String): Result<AuthSession>
    fun signOut()
}
