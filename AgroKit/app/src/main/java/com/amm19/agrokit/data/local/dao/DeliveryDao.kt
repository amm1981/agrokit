package com.amm19.agrokit.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.amm19.agrokit.data.local.entity.DeliveryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface DeliveryDao {
    @Query("SELECT * FROM deliveries WHERE workerDni = :workerDni ORDER BY timestamp DESC")
    fun observeByWorker(workerDni: String): Flow<List<DeliveryEntity>>

    @Query("SELECT * FROM deliveries ORDER BY timestamp DESC")
    fun observeAll(): Flow<List<DeliveryEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertDelivery(delivery: DeliveryEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertDeliveries(deliveries: List<DeliveryEntity>)

    @Query("DELETE FROM deliveries WHERE id = :deliveryId")
    suspend fun deleteDeliveryById(deliveryId: String)

    @Query("SELECT id FROM deliveries WHERE synced = 1")
    suspend fun getSyncedDeliveryIds(): List<String>

    @Query("DELETE FROM deliveries WHERE id = :deliveryId AND synced = 1")
    suspend fun deleteSyncedDeliveryById(deliveryId: String)

    @Query("SELECT * FROM deliveries WHERE synced = 0 ORDER BY timestamp ASC")
    suspend fun getPendingSyncDeliveries(): List<DeliveryEntity>

    @Query("SELECT COUNT(*) FROM deliveries WHERE synced = 0")
    fun observePendingSyncCount(): Flow<Int>

    @Query("UPDATE deliveries SET synced = 1 WHERE id = :deliveryId")
    suspend fun markAsSynced(deliveryId: String)
}
