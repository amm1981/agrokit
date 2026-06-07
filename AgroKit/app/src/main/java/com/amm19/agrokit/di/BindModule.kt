package com.amm19.agrokit.di

import com.amm19.agrokit.data.local.AndroidPdaIdProvider
import com.amm19.agrokit.data.repository.AgroKitRepositoryImpl
import com.amm19.agrokit.data.repository.AuthRepositoryImpl
import com.amm19.agrokit.domain.repository.AgroKitRepository
import com.amm19.agrokit.domain.repository.AuthRepository
import com.amm19.agrokit.domain.usecase.PdaIdProvider
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class BindModule {

    @Binds
    @Singleton
    abstract fun bindAgroKitRepository(repositoryImpl: AgroKitRepositoryImpl): AgroKitRepository

    @Binds
    @Singleton
    abstract fun bindAuthRepository(repositoryImpl: AuthRepositoryImpl): AuthRepository

    @Binds
    @Singleton
    abstract fun bindPdaIdProvider(provider: AndroidPdaIdProvider): PdaIdProvider
}
