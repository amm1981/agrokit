package com.amm19.agrokit.data.repository

import com.amm19.agrokit.data.local.NetworkStatusTracker
import com.amm19.agrokit.data.local.dao.DeliveryDao
import com.amm19.agrokit.data.local.dao.KitDao
import com.amm19.agrokit.data.local.dao.WorkerDao
import com.amm19.agrokit.data.local.mapper.toDomain
import com.amm19.agrokit.data.local.mapper.toEntity
import com.amm19.agrokit.data.remote.FirebaseDeliveryService
import com.amm19.agrokit.data.remote.FirebaseKitService
import com.amm19.agrokit.data.remote.FirebaseProductStockService
import com.amm19.agrokit.data.remote.FirebaseSettingsService
import com.amm19.agrokit.data.remote.RealtimeSubscription
import com.amm19.agrokit.data.remote.FirebaseWorkerService
import com.amm19.agrokit.domain.model.Delivery
import com.amm19.agrokit.domain.model.DeliveryWindow
import com.amm19.agrokit.domain.model.Kit
import com.amm19.agrokit.domain.model.PendingSyncState
import com.amm19.agrokit.domain.model.ProductSectorStockSummary
import com.amm19.agrokit.domain.model.ProductStockSummary
import com.amm19.agrokit.domain.model.Worker
import com.amm19.agrokit.domain.model.WorkerLookupResult
import com.amm19.agrokit.domain.model.WorkerLookupStatus
import com.amm19.agrokit.domain.repository.AgroKitRepository
import com.amm19.agrokit.domain.repository.AuthRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AgroKitRepositoryImpl @Inject constructor(
    private val networkStatusTracker: NetworkStatusTracker,
    private val workerDao: WorkerDao,
    private val kitDao: KitDao,
    private val deliveryDao: DeliveryDao,
    private val firebaseDeliveryService: FirebaseDeliveryService,
    private val firebaseWorkerService: FirebaseWorkerService,
    private val firebaseKitService: FirebaseKitService,
    private val firebaseProductStockService: FirebaseProductStockService,
    private val firebaseSettingsService: FirebaseSettingsService,
    private val authRepository: AuthRepository
) : AgroKitRepository {
    private val realtimeScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var workerRealtimeSubscription: RealtimeSubscription? = null
    private var kitRealtimeSubscription: RealtimeSubscription? = null
    private var deliveryRealtimeSubscription: RealtimeSubscription? = null
    private var windowRealtimeSubscription: RealtimeSubscription? = null
    private val deliveryWindowState = MutableStateFlow<DeliveryWindow?>(null)

    override fun observeWorkerByDni(dni: String): Flow<Worker?> {
        return workerDao.observeWorkerByDni(dni).map { entity ->
            entity?.toDomain()
        }
    }

    override fun observeWorkers(): Flow<List<Worker>> {
        return workerDao.observeWorkers().map { entities ->
            entities.map { it.toDomain() }
        }
    }

    override suspend fun lookupWorkerByDni(dni: String): WorkerLookupResult {
        val session = authRepository.getCurrentSession()
            ?: return WorkerLookupResult(status = WorkerLookupStatus.NOT_FOUND)
        return firebaseWorkerService.lookupWorkerByDni(
            dni = dni,
            userEmail = session.email,
            eventId = session.activeEvent?.id
        ).getOrElse {
            WorkerLookupResult(status = WorkerLookupStatus.NOT_FOUND)
        }
    }

    override fun observeKits(): Flow<List<Kit>> {
        return kitDao.observeKits().map { entities ->
            entities.map { it.toDomain() }
        }
    }

    override fun observeDeliveries(): Flow<List<Delivery>> {
        return deliveryDao.observeAll().map { entities ->
            entities.map { it.toDomain() }
        }
    }

    override fun observeDeliveriesByWorker(dni: String): Flow<List<Delivery>> {
        return deliveryDao.observeByWorker(dni).map { entities ->
            entities.map { it.toDomain() }
        }
    }

    override fun observeDeliveryWindow(): Flow<DeliveryWindow?> = deliveryWindowState

    override fun observePendingSyncState(): Flow<PendingSyncState> {
        return combine(
            workerDao.observePendingSyncCount(),
            kitDao.observePendingSyncCount(),
            deliveryDao.observePendingSyncCount()
        ) { workers, kits, deliveries ->
            PendingSyncState(
                workers = workers,
                kits = kits,
                deliveries = deliveries
            )
        }
    }

    override suspend fun fetchProductStockSummary(): Result<List<ProductStockSummary>> {
        val session = authRepository.getCurrentSession() ?: return Result.success(emptyList())
        return firebaseProductStockService.fetchStockSummary(session.activeEvent?.id).map { summaries ->
            summaries.map { summary ->
                ProductStockSummary(
                    eventId = summary.eventId,
                    productCode = summary.productCode,
                    productName = summary.productName,
                    perBeneficiaryQuantity = summary.perBeneficiaryQuantity,
                    beneficiariesCount = summary.beneficiariesCount,
                    requiredQuantity = summary.requiredQuantity,
                    stockQuantity = summary.stockQuantity,
                    sectorStockQuantity = summary.sectorStockQuantity,
                    sectorStocks = summary.sectorStocks.map { sector ->
                        ProductSectorStockSummary(
                            sectorId = sector.sectorId,
                            sectorName = sector.sectorName,
                            stockQuantity = sector.stockQuantity
                        )
                    },
                    deliveredQuantity = summary.deliveredQuantity,
                    availableQuantity = summary.availableQuantity,
                    sufficientForBeneficiaries = summary.sufficientForBeneficiaries
                )
            }
        }
    }

    override suspend fun saveDelivery(delivery: Delivery) {
        val eventId = resolveCurrentEventId()
        val worker = workerDao.getWorkerByDni(delivery.workerDni)
        val resolvedSectorId = if (delivery.sectorId.isBlank()) {
            worker?.sectorId.orEmpty()
        } else {
            delivery.sectorId
        }
        val normalized = if (delivery.eventId.isBlank()) {
            delivery.copy(
                eventId = eventId,
                sectorId = resolvedSectorId
            )
        } else {
            delivery.copy(sectorId = resolvedSectorId)
        }
        deliveryDao.upsertDelivery(normalized.toEntity())
    }

    override suspend fun upsertWorkers(workers: List<Worker>) {
        val eventId = resolveCurrentEventId()
        val normalized = workers.map { worker ->
            worker.copy(
                eventId = worker.eventId.ifBlank { eventId },
                synced = false
            )
        }
        workerDao.upsertWorkers(normalized.map { it.toEntity() })
    }

    override suspend fun upsertKit(kit: Kit) {
        val eventId = resolveCurrentEventId()
        kitDao.upsertKit(
            kit.copy(
                eventId = kit.eventId.ifBlank { eventId },
                synced = false
            ).toEntity()
        )
    }

    override suspend fun deleteKitById(kitId: String) {
        kitDao.deleteKitById(kitId)
    }

    override suspend fun syncPendingDeliveries(): Int {
        requireOnlineForSync()
        val session = requireSession()
        val pending = deliveryDao.getPendingSyncDeliveries()
        var syncedCount = 0
        val errors = mutableListOf<String>()
        val batchSize = 8

        for (chunk in pending.chunked(batchSize)) {
            val results = coroutineScope {
                chunk.map { entity ->
                    async {
                        entity to firebaseDeliveryService.uploadDelivery(
                            delivery = entity.toDomain(),
                            eventId = session.activeEvent?.id
                        )
                    }
                }.awaitAll()
            }

            results.forEach { (entity, upload) ->
                if (upload.isSuccess) {
                    deliveryDao.markAsSynced(entity.id)
                    syncedCount += 1
                } else {
                    errors += upload.exceptionOrNull()?.message.orEmpty().ifBlank { "Error desconocido" }
                }
            }
        }

        if (errors.isNotEmpty()) {
            error("Sync entregas parcial: $syncedCount de ${pending.size} subida(s). Primer error: ${errors.first()}")
        }

        return syncedCount
    }

    override suspend fun syncPendingWorkers(): Int {
        requireOnlineForSync()
        val session = requireSession()
        val pending = workerDao.getPendingSyncWorkers()
        var syncedCount = 0
        val errors = mutableListOf<String>()
        val batchSize = 20

        for (chunk in pending.chunked(batchSize)) {
            val results = coroutineScope {
                chunk.map { entity ->
                    async {
                        entity to firebaseWorkerService.uploadWorker(
                            worker = entity.toDomain(),
                            userEmail = session.email,
                            eventId = session.activeEvent?.id
                        )
                    }
                }.awaitAll()
            }

            results.forEach { (entity, upload) ->
                if (upload.isSuccess) {
                    workerDao.markAsSynced(entity.dni)
                    syncedCount += 1
                } else {
                    errors += upload.exceptionOrNull()?.message.orEmpty().ifBlank { "Error desconocido" }
                }
            }
        }

        if (errors.isNotEmpty()) {
            error("Sync trabajadores parcial: $syncedCount de ${pending.size} subida(s). Primer error: ${errors.first()}")
        }

        return syncedCount
    }

    override suspend fun syncPendingKits(): Int {
        requireOnlineForSync()
        val session = requireSession()
        val pending = kitDao.getPendingSyncKits()
        var syncedCount = 0
        val errors = mutableListOf<String>()
        val batchSize = 12

        for (chunk in pending.chunked(batchSize)) {
            val results = coroutineScope {
                chunk.map { entity ->
                    async {
                        entity to firebaseKitService.uploadKit(
                            kit = entity.toDomain(),
                            eventId = session.activeEvent?.id
                        )
                    }
                }.awaitAll()
            }

            results.forEach { (entity, upload) ->
                if (upload.isSuccess) {
                    kitDao.markAsSynced(entity.id)
                    syncedCount += 1
                } else {
                    errors += upload.exceptionOrNull()?.message.orEmpty().ifBlank { "Error desconocido" }
                }
            }
        }

        if (errors.isNotEmpty()) {
            error("Sync kits parcial: $syncedCount de ${pending.size} subida(s). Primer error: ${errors.first()}")
        }

        return syncedCount
    }

    override suspend fun pullWorkersFromRemote(): Int {
        requireOnlineForSync()
        val session = requireSession()
        val remoteWorkers = firebaseWorkerService.fetchWorkers(
            userEmail = session.email,
            eventId = session.activeEvent?.id
        ).getOrElse { error ->
            error("Error de descarga de trabajadores: ${error.message.orEmpty()}")
        }

        val remoteDnis = remoteWorkers.map { it.dni }.toSet()
        workerDao.getSyncedWorkerDnis()
            .asSequence()
            .filterNot { remoteDnis.contains(it) }
            .forEach { workerDao.deleteSyncedWorkerByDni(it) }

        if (remoteWorkers.isNotEmpty()) {
            workerDao.upsertWorkers(remoteWorkers.map { it.copy(synced = true).toEntity() })
        }
        return remoteWorkers.size
    }

    override suspend fun pullKitsFromRemote(): Int {
        requireOnlineForSync()
        val session = requireSession()
        val remoteKits = firebaseKitService.fetchKits(session.activeEvent?.id).getOrElse { error ->
            error("Error de descarga de kits: ${error.message.orEmpty()}")
        }

        val remoteKitIds = remoteKits.map { it.id }.toSet()
        kitDao.getSyncedKitIds()
            .asSequence()
            .filterNot { remoteKitIds.contains(it) }
            .forEach { kitDao.deleteSyncedKitById(it) }

        if (remoteKits.isNotEmpty()) {
            kitDao.upsertKits(remoteKits.map { it.copy(synced = true).toEntity() })
        }
        return remoteKits.size
    }

    override suspend fun pullDeliveriesFromRemote(): Int {
        requireOnlineForSync()
        val session = requireSession()
        val remoteDeliveries = firebaseDeliveryService.fetchDeliveries(
            userEmail = session.email,
            eventId = session.activeEvent?.id
        ).getOrElse { error ->
            error("Error de descarga de entregas: ${error.message.orEmpty()}")
        }

        val remoteDeliveryIds = remoteDeliveries.map { it.id }.toSet()
        deliveryDao.getSyncedDeliveryIds()
            .asSequence()
            .filterNot { remoteDeliveryIds.contains(it) }
            .forEach { deliveryDao.deleteSyncedDeliveryById(it) }

        if (remoteDeliveries.isNotEmpty()) {
            deliveryDao.upsertDeliveries(remoteDeliveries.map { it.copy(synced = true).toEntity() })
        }
        return remoteDeliveries.size
    }

    override fun startRealtimeSync() {
        val session = authRepository.getCurrentSession() ?: return
        if (workerRealtimeSubscription != null &&
            kitRealtimeSubscription != null &&
            deliveryRealtimeSubscription != null
        ) {
            return
        }

        workerRealtimeSubscription = firebaseWorkerService.observeWorkers(
            userEmail = session.email,
            eventId = session.activeEvent?.id,
            allowedSectorIds = session.sectorIds.toSet(),
            onUpsert = { worker ->
                realtimeScope.launch {
                    workerDao.upsertWorkers(listOf(worker.copy(synced = true).toEntity()))
                }
            },
            onDelete = { dni ->
                realtimeScope.launch {
                    workerDao.deleteWorkerByDni(dni)
                }
            },
            onError = { error ->
                android.util.Log.w("AgroKitRepository", "Worker realtime error: ${error.message.orEmpty()}")
            }
        )

        kitRealtimeSubscription = firebaseKitService.observeKits(
            eventId = session.activeEvent?.id,
            onUpsert = { kit ->
                realtimeScope.launch {
                    kitDao.upsertKit(kit.copy(synced = true).toEntity())
                }
            },
            onDelete = { kitId ->
                realtimeScope.launch {
                    kitDao.deleteKitById(kitId)
                }
            },
            onError = { error ->
                android.util.Log.w("AgroKitRepository", "Kit realtime error: ${error.message.orEmpty()}")
            }
        )

        deliveryRealtimeSubscription = firebaseDeliveryService.observeDeliveries(
            userEmail = session.email,
            eventId = session.activeEvent?.id,
            allowedSectorIds = session.sectorIds.toSet(),
            onUpsert = { delivery ->
                realtimeScope.launch {
                    deliveryDao.upsertDelivery(delivery.copy(synced = true).toEntity())
                }
            },
            onDelete = { deliveryId ->
                realtimeScope.launch {
                    deliveryDao.deleteDeliveryById(deliveryId)
                }
            },
            onError = { error ->
                android.util.Log.w("AgroKitRepository", "Delivery realtime error: ${error.message.orEmpty()}")
            }
        )

        windowRealtimeSubscription = firebaseSettingsService.observeDeliveryWindow(
            eventId = session.activeEvent?.id,
            onChanged = { window ->
                deliveryWindowState.value = window
            },
            onError = { error ->
                android.util.Log.w("AgroKitRepository", "Window realtime error: ${error.message.orEmpty()}")
            }
        )

        // Reconcile remote snapshot against local Room in case the device missed delete events while offline.
        realtimeScope.launch {
            runCatching { pullWorkersFromRemote() }
                .onFailure { error ->
                    android.util.Log.w("AgroKitRepository", "Worker reconcile error: ${error.message.orEmpty()}")
                }
            runCatching { pullKitsFromRemote() }
                .onFailure { error ->
                    android.util.Log.w("AgroKitRepository", "Kit reconcile error: ${error.message.orEmpty()}")
                }
            runCatching { pullDeliveriesFromRemote() }
                .onFailure { error ->
                    android.util.Log.w("AgroKitRepository", "Delivery reconcile error: ${error.message.orEmpty()}")
                }
        }
    }

    override fun stopRealtimeSync() {
        workerRealtimeSubscription?.cancel()
        workerRealtimeSubscription = null

        kitRealtimeSubscription?.cancel()
        kitRealtimeSubscription = null

        deliveryRealtimeSubscription?.cancel()
        deliveryRealtimeSubscription = null

        windowRealtimeSubscription?.cancel()
        windowRealtimeSubscription = null
        deliveryWindowState.value = null
    }

    override suspend fun seedInitialDataIfNeeded() {
        // Sin seed local por defecto: los datos se cargan por sincronizacion o alta manual.
    }

    private fun requireOnlineForSync() {
        if (!networkStatusTracker.isConnectedNow()) {
            error("Sin conexion a internet")
        }
    }

    private fun requireSession(): com.amm19.agrokit.domain.model.AuthSession {
        return authRepository.getCurrentSession() ?: error("Sesion no disponible")
    }

    private fun resolveCurrentEventId(): String {
        return authRepository.getCurrentSession()?.activeEvent?.id.orEmpty()
    }
}
