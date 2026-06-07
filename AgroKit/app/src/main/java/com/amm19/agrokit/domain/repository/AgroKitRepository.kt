package com.amm19.agrokit.domain.repository

import com.amm19.agrokit.domain.model.Delivery
import com.amm19.agrokit.domain.model.DeliveryWindow
import com.amm19.agrokit.domain.model.Kit
import com.amm19.agrokit.domain.model.PendingSyncState
import com.amm19.agrokit.domain.model.ProductStockSummary
import com.amm19.agrokit.domain.model.Worker
import com.amm19.agrokit.domain.model.WorkerLookupResult
import kotlinx.coroutines.flow.Flow

interface AgroKitRepository {
    fun observeWorkerByDni(dni: String): Flow<Worker?>
    fun observeWorkers(): Flow<List<Worker>>
    suspend fun lookupWorkerByDni(dni: String): WorkerLookupResult
    fun observeKits(): Flow<List<Kit>>
    fun observeDeliveries(): Flow<List<Delivery>>
    fun observeDeliveriesByWorker(dni: String): Flow<List<Delivery>>
    fun observeDeliveryWindow(): Flow<DeliveryWindow?>
    fun observePendingSyncState(): Flow<PendingSyncState>
    suspend fun fetchProductStockSummary(): Result<List<ProductStockSummary>>

    suspend fun saveDelivery(delivery: Delivery)
    suspend fun upsertWorkers(workers: List<Worker>)
    suspend fun upsertKit(kit: Kit)
    suspend fun deleteKitById(kitId: String)
    suspend fun syncPendingDeliveries(): Int
    suspend fun syncPendingWorkers(): Int
    suspend fun syncPendingKits(): Int
    suspend fun pullWorkersFromRemote(): Int
    suspend fun pullKitsFromRemote(): Int
    suspend fun pullDeliveriesFromRemote(): Int
    fun startRealtimeSync()
    fun stopRealtimeSync()
    suspend fun seedInitialDataIfNeeded()
}
