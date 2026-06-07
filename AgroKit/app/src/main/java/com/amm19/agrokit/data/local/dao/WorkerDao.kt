package com.amm19.agrokit.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.amm19.agrokit.data.local.entity.WorkerEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkerDao {
    @Query("SELECT * FROM workers WHERE dni = :dni LIMIT 1")
    fun observeWorkerByDni(dni: String): Flow<WorkerEntity?>

    @Query("SELECT * FROM workers WHERE dni = :dni LIMIT 1")
    suspend fun getWorkerByDni(dni: String): WorkerEntity?

    @Query("SELECT * FROM workers ORDER BY fullName ASC")
    fun observeWorkers(): Flow<List<WorkerEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertWorkers(workers: List<WorkerEntity>)

    @Query("DELETE FROM workers WHERE dni = :dni")
    suspend fun deleteWorkerByDni(dni: String)

    @Query("SELECT dni FROM workers WHERE synced = 1")
    suspend fun getSyncedWorkerDnis(): List<String>

    @Query("DELETE FROM workers WHERE dni = :dni AND synced = 1")
    suspend fun deleteSyncedWorkerByDni(dni: String)

    @Query("SELECT * FROM workers WHERE synced = 0")
    suspend fun getPendingSyncWorkers(): List<WorkerEntity>

    @Query("SELECT COUNT(*) FROM workers WHERE synced = 0")
    fun observePendingSyncCount(): Flow<Int>

    @Query("UPDATE workers SET synced = 1 WHERE dni = :dni")
    suspend fun markAsSynced(dni: String)

    @Query("SELECT COUNT(*) FROM workers")
    suspend fun countWorkers(): Int
}
