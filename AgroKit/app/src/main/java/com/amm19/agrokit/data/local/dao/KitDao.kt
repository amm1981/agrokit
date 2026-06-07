package com.amm19.agrokit.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.amm19.agrokit.data.local.entity.KitEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface KitDao {
    @Query("SELECT * FROM kits ORDER BY name ASC")
    fun observeKits(): Flow<List<KitEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertKits(kits: List<KitEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertKit(kit: KitEntity)

    @Query("DELETE FROM kits WHERE id = :kitId")
    suspend fun deleteKitById(kitId: String)

    @Query("SELECT id FROM kits WHERE synced = 1")
    suspend fun getSyncedKitIds(): List<String>

    @Query("DELETE FROM kits WHERE id = :kitId AND synced = 1")
    suspend fun deleteSyncedKitById(kitId: String)

    @Query("SELECT * FROM kits WHERE synced = 0")
    suspend fun getPendingSyncKits(): List<KitEntity>

    @Query("SELECT COUNT(*) FROM kits WHERE synced = 0")
    fun observePendingSyncCount(): Flow<Int>

    @Query("UPDATE kits SET synced = 1 WHERE id = :kitId")
    suspend fun markAsSynced(kitId: String)

    @Query("SELECT COUNT(*) FROM kits")
    suspend fun countKits(): Int
}
