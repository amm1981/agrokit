package com.amm19.agrokit.di

import android.content.Context
import androidx.room.Room
import com.amm19.agrokit.data.local.AgroKitDatabase
import com.amm19.agrokit.data.local.dao.DeliveryDao
import com.amm19.agrokit.data.local.dao.KitDao
import com.amm19.agrokit.data.local.dao.WorkerDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AgroKitDatabase {
        return Room.databaseBuilder(
            context,
            AgroKitDatabase::class.java,
            "agrokit.db"
        ).fallbackToDestructiveMigration(true).build()
    }

    @Provides
    fun provideWorkerDao(database: AgroKitDatabase): WorkerDao = database.workerDao()

    @Provides
    fun provideKitDao(database: AgroKitDatabase): KitDao = database.kitDao()

    @Provides
    fun provideDeliveryDao(database: AgroKitDatabase): DeliveryDao = database.deliveryDao()
}
