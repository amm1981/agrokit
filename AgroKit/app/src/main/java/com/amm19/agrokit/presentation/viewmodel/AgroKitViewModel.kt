package com.amm19.agrokit.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.amm19.agrokit.domain.model.Delivery
import com.amm19.agrokit.domain.model.DeliveryProduct
import com.amm19.agrokit.domain.model.KitDeliveryStatus
import com.amm19.agrokit.domain.model.ProductStockSummary
import com.amm19.agrokit.domain.model.Worker
import com.amm19.agrokit.domain.model.WorkerLookupStatus
import com.amm19.agrokit.domain.usecase.FetchProductStockSummaryUseCase
import com.amm19.agrokit.domain.usecase.GetCurrentSessionUseCase
import com.amm19.agrokit.domain.usecase.LookupWorkerByDniUseCase
import com.amm19.agrokit.domain.usecase.LoginUseCase
import com.amm19.agrokit.domain.usecase.LogoutUseCase
import com.amm19.agrokit.domain.usecase.ObserveDeliveriesByWorkerUseCase
import com.amm19.agrokit.domain.usecase.ObserveDeliveriesUseCase
import com.amm19.agrokit.domain.usecase.ObserveDeliveryWindowUseCase
import com.amm19.agrokit.domain.usecase.ObserveKitStatusesUseCase
import com.amm19.agrokit.domain.usecase.ObserveNetworkStatusUseCase
import com.amm19.agrokit.domain.usecase.ObservePendingSyncStateUseCase
import com.amm19.agrokit.domain.usecase.ObserveWorkerByDniUseCase
import com.amm19.agrokit.domain.usecase.ObserveWorkersUseCase
import com.amm19.agrokit.domain.usecase.RegisterDeliveryUseCase
import com.amm19.agrokit.domain.usecase.SeedInitialDataUseCase
import com.amm19.agrokit.domain.usecase.StartRealtimeSyncUseCase
import com.amm19.agrokit.domain.usecase.StopRealtimeSyncUseCase
import com.amm19.agrokit.domain.usecase.SwitchActiveEventUseCase
import com.amm19.agrokit.domain.usecase.SyncProgressStep
import com.amm19.agrokit.domain.usecase.SyncPendingDataUseCase
import com.amm19.agrokit.domain.usecase.SyncPendingDeliveriesUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class AgroKitViewModel @Inject constructor(
    private val observeWorkerByDniUseCase: ObserveWorkerByDniUseCase,
    private val observeWorkersUseCase: ObserveWorkersUseCase,
    private val observeDeliveriesUseCase: ObserveDeliveriesUseCase,
    private val observeDeliveriesByWorkerUseCase: ObserveDeliveriesByWorkerUseCase,
    private val observeDeliveryWindowUseCase: ObserveDeliveryWindowUseCase,
    private val observeNetworkStatusUseCase: ObserveNetworkStatusUseCase,
    private val observePendingSyncStateUseCase: ObservePendingSyncStateUseCase,
    private val observeKitStatusesUseCase: ObserveKitStatusesUseCase,
    private val registerDeliveryUseCase: RegisterDeliveryUseCase,
    private val seedInitialDataUseCase: SeedInitialDataUseCase,
    private val startRealtimeSyncUseCase: StartRealtimeSyncUseCase,
    private val stopRealtimeSyncUseCase: StopRealtimeSyncUseCase,
    private val syncPendingDataUseCase: SyncPendingDataUseCase,
    private val syncPendingDeliveriesUseCase: SyncPendingDeliveriesUseCase,
    private val loginUseCase: LoginUseCase,
    private val logoutUseCase: LogoutUseCase,
    private val switchActiveEventUseCase: SwitchActiveEventUseCase,
    private val getCurrentSessionUseCase: GetCurrentSessionUseCase,
    private val lookupWorkerByDniUseCase: LookupWorkerByDniUseCase,
    private val fetchProductStockSummaryUseCase: FetchProductStockSummaryUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(AgroKitUiState())
    val uiState: StateFlow<AgroKitUiState> = _uiState.asStateFlow()

    private var kitObservationJob: Job? = null
    private var sessionExpiryJob: Job? = null
    private var lastPendingTotal: Int = 0
    private var lastNetworkOnline: Boolean? = null
    private var lastScanValue: String = ""
    private var lastScanTs: Long = 0L
    private var allWorkers: List<WorkerUi> = emptyList()
    private var allDeliveries: List<Delivery> = emptyList()
    private var productStockSummaries: List<ProductStockSummary> = emptyList()

    init {
        viewModelScope.launch {
            observeWorkersUseCase().collect { workers ->
                allWorkers = workers.map { it.toUi() }
                applyWorkersAndSectors()
            }
        }

        viewModelScope.launch {
            observeDeliveriesUseCase().collect { deliveries ->
                allDeliveries = deliveries
                refreshStockSummaryUi()
            }
        }

        viewModelScope.launch {
            observeDeliveryWindowUseCase().collect { window ->
                _uiState.update { current ->
                    current.copy(
                        deliveryWindowEnabled = window?.enabled ?: false,
                        deliveryWindowStartAt = window?.startAt,
                        deliveryWindowEndAt = window?.endAt
                    )
                }
            }
        }

        viewModelScope.launch {
            observePendingSyncStateUseCase().collect { pending ->
                _uiState.update { current ->
                    current.copy(
                        pendingSyncWorkers = pending.workers,
                        pendingSyncKits = pending.kits,
                        pendingSyncDeliveries = pending.deliveries,
                        showPendingSyncAlert = current.showPendingSyncAlert || (pending.total > 0 && lastPendingTotal == 0)
                    )
                }
                lastPendingTotal = pending.total
            }
        }

        viewModelScope.launch {
            observeNetworkStatusUseCase()
                .distinctUntilChanged()
                .collect { online ->
                    val previous = lastNetworkOnline
                    lastNetworkOnline = online

                    _uiState.update { current ->
                        current.copy(
                            isOnline = online,
                            networkAlertMessage = if (online) {
                                "Conexion restablecida"
                            } else {
                                "Sin conexion a internet"
                            },
                            showNetworkAlert = (previous == null && !online) || (previous != null && previous != online)
                        )
                    }

                    if (online && _uiState.value.pendingSyncTotal > 0) {
                        val result = runCatching { syncAllDataWithProgress() }
                        if (result.isSuccess) {
                            refreshProductStockSummary(showLoading = false)
                            _uiState.update { current ->
                                current.copy(message = "Pendientes sincronizados al recuperar internet")
                            }
                        } else {
                            val error = result.exceptionOrNull()
                            if (error != null && isSessionExpiredError(error.message)) {
                                forceSessionExpiryLogout()
                            }
                        }
                    }
                }
        }

        viewModelScope.launch {
            seedInitialDataUseCase()
            val session = getCurrentSessionUseCase()
            if (session != null) {
                startRealtimeSyncUseCase()
                scheduleSessionExpiry(session.tokenExpiresAt)
                val assignedSectorIds = normalizeSectorIds(session.sectorIds)
                val selectedSectorId = assignedSectorIds.firstOrNull().orEmpty()
                _uiState.update { current ->
                    current.copy(
                        isAuthenticated = true,
                        userEmail = session.email,
                        activeEventId = session.activeEvent?.id.orEmpty(),
                        activeEventName = session.activeEvent?.name.orEmpty(),
                        activeEvents = session.activeEvents.map { EventOptionUi(id = it.id, name = it.name) },
                        assignedSectorIds = assignedSectorIds,
                        selectedSectorId = selectedSectorId,
                        message = "Sesion restaurada"
                    )
                }
                applyWorkersAndSectors()
                refreshProductStockSummary(showLoading = false)
            }
        }
    }

    fun onEmailChanged(value: String) {
        _uiState.update { it.copy(emailInput = value) }
    }

    fun onPasswordChanged(value: String) {
        _uiState.update { it.copy(passwordInput = value) }
    }

    fun onDismissMessage() {
        _uiState.update { it.copy(message = null) }
    }

    fun onDismissNetworkAlert() {
        _uiState.update { it.copy(showNetworkAlert = false) }
    }

    fun onDismissPendingSyncAlert() {
        _uiState.update { it.copy(showPendingSyncAlert = false) }
    }

    fun onOpenPendingSyncAlert() {
        if (_uiState.value.pendingSyncTotal > 0) {
            _uiState.update { it.copy(showPendingSyncAlert = true) }
        }
    }

    fun onLoginClick() {
        val email = _uiState.value.emailInput.trim()
        val password = _uiState.value.passwordInput

        if (!_uiState.value.isOnline) {
            _uiState.update { current ->
                current.copy(message = "Sin conexion a internet. Verifica tu red para iniciar sesion.")
            }
            return
        }

        if (email.isBlank() || password.isBlank()) {
            _uiState.update { current ->
                current.copy(message = "Ingresa correo y contrasena")
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, message = null) }

            val result = withTimeoutOrNull(20_000) {
                loginUseCase(email = email, password = password)
            }
            if (result == null) {
                _uiState.update { current ->
                    current.copy(
                        isLoading = false,
                        message = "Tiempo de espera agotado al iniciar sesion. Verifica internet o el servidor."
                    )
                }
                return@launch
            }
            result.fold(
                onSuccess = { session ->
                    startRealtimeSyncUseCase()
                    scheduleSessionExpiry(session.tokenExpiresAt)
                    val assignedSectorIds = normalizeSectorIds(session.sectorIds)
                    val selectedSectorId = assignedSectorIds.firstOrNull().orEmpty()
                    _uiState.update { current ->
                        current.copy(
                            isLoading = false,
                            isAuthenticated = true,
                            userEmail = session.email,
                            activeEventId = session.activeEvent?.id.orEmpty(),
                            activeEventName = session.activeEvent?.name.orEmpty(),
                            activeEvents = session.activeEvents.map { EventOptionUi(id = it.id, name = it.name) },
                            assignedSectorIds = assignedSectorIds,
                            selectedSectorId = selectedSectorId,
                            passwordInput = "",
                            message = "Sesion iniciada"
                        )
                    }
                    runCatching {
                        syncAllDataWithProgress()
                    }
                    applyWorkersAndSectors()
                    refreshProductStockSummary(showLoading = true)
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            isLoading = false,
                            message = mapLoginError(error.message)
                        )
                    }
                }
            )
        }
    }

    fun onLogoutClick() {
        sessionExpiryJob?.cancel()
        sessionExpiryJob = null
        stopRealtimeSyncUseCase()
        logoutUseCase()
        kitObservationJob?.cancel()
        allWorkers = emptyList()
        allDeliveries = emptyList()
        productStockSummaries = emptyList()
        _uiState.update { current ->
            current.copy(
                isAuthenticated = false,
                userEmail = null,
                activeEventId = "",
                activeEventName = "",
                activeEvents = emptyList(),
                assignedSectorIds = emptyList(),
                selectedSectorId = "",
                sectorOptions = emptyList(),
                passwordInput = "",
                searchedDni = null,
                workerFound = null,
                lastDeliverySummary = null,
                showKitsModal = false,
                showStockSummaryModal = false,
                kits = emptyList(),
                selectedProducts = emptyList(),
                stockSummaryLoading = false,
                stockSummaryUpdatedAt = null,
                stockSummaryError = null,
                stockSummaryItems = emptyList(),
                message = "Sesion cerrada"
            )
        }
    }

    fun onActiveEventSelected(eventId: String) {
        val selectedId = eventId.trim()
        if (selectedId.isBlank()) return
        val currentState = _uiState.value
        if (!currentState.isAuthenticated) return
        if (currentState.activeEventId == selectedId) return
        if (currentState.pendingSyncTotal > 0) {
            _uiState.update { current ->
                current.copy(message = "Sincroniza pendientes antes de cambiar de evento")
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, message = null) }
            val switchedSession = switchActiveEventUseCase(selectedId)
            if (switchedSession?.activeEvent == null) {
                _uiState.update { current ->
                    current.copy(isLoading = false, message = "No se pudo cambiar al evento seleccionado")
                }
                return@launch
            }

            stopRealtimeSyncUseCase()
            startRealtimeSyncUseCase()
            val syncResult = runCatching { syncPendingDataUseCase() }
            val syncError = syncResult.exceptionOrNull()
            if (syncError != null && isSessionExpiredError(syncError.message)) {
                forceSessionExpiryLogout()
                return@launch
            }

            _uiState.update { current ->
                val assignedSectorIds = normalizeSectorIds(switchedSession.sectorIds)
                val selectedSectorId = assignedSectorIds.firstOrNull().orEmpty()
                current.copy(
                    isLoading = false,
                    activeEventId = switchedSession.activeEvent.id,
                    activeEventName = switchedSession.activeEvent.name,
                    activeEvents = switchedSession.activeEvents.map { EventOptionUi(id = it.id, name = it.name) },
                    assignedSectorIds = assignedSectorIds,
                    selectedSectorId = selectedSectorId,
                    searchedDni = null,
                    workerFound = null,
                    lastDeliverySummary = null,
                    kits = emptyList(),
                    selectedProducts = emptyList(),
                    message = if (syncResult.isSuccess) {
                        "Evento activo: ${switchedSession.activeEvent.name}"
                    } else {
                        "Evento cambiado. Error al recargar datos: ${syncResult.exceptionOrNull()?.message.orEmpty()}"
                    }
                )
            }
            applyWorkersAndSectors()
            refreshProductStockSummary(showLoading = true)
        }
    }

    fun onDniChanged(value: String) {
        val digitsOnly = value.filter { it.isDigit() }
        val sanitized = if (digitsOnly.length <= 8) {
            digitsOnly
        } else {
            digitsOnly.takeLast(8)
        }

        _uiState.update { it.copy(dniInput = sanitized) }

        val appendLikeInput = digitsOnly.length > 8
        val closedScannerBlock = digitsOnly.length % 8 == 0
        val shouldAutoSearch = sanitized.length == 8 &&
            sanitized != _uiState.value.searchedDni &&
            (!appendLikeInput || closedScannerBlock)

        if (shouldAutoSearch && _uiState.value.isAuthenticated) {
            searchWorkerByDni(dni = sanitized, triggeredByScanner = true)
        }
    }

    fun onOpenWorkersModal() {
        _uiState.update { it.copy(showWorkersModal = true, workerPickerQuery = "") }
    }

    fun onCloseWorkersModal() {
        _uiState.update { it.copy(showWorkersModal = false) }
    }

    fun onOpenKitsModal() {
        if (_uiState.value.workerFound == null || _uiState.value.kits.isEmpty()) return
        _uiState.update { it.copy(showKitsModal = true) }
    }

    fun onOpenStockSummaryModal() {
        val showLoading = _uiState.value.stockSummaryItems.isEmpty()
        _uiState.update { it.copy(showStockSummaryModal = true) }
        refreshProductStockSummary(showLoading = showLoading)
    }

    fun onCloseStockSummaryModal() {
        _uiState.update { it.copy(showStockSummaryModal = false) }
    }

    fun onSelectedSectorChanged(sectorId: String) {
        val normalizedSectorId = sectorId.trim()
        if (normalizedSectorId.isBlank()) return
        if (_uiState.value.selectedSectorId == normalizedSectorId) return

        _uiState.update { current ->
            val selectedWorkerStillValid = current.workerFound?.let { worker ->
                workerMatchesSelectedSector(worker, normalizedSectorId)
            } ?: true
            current.copy(
                selectedSectorId = normalizedSectorId,
                workerFound = if (selectedWorkerStillValid) current.workerFound else null,
                searchedDni = if (selectedWorkerStillValid) current.searchedDni else null,
                lastDeliverySummary = if (selectedWorkerStillValid) current.lastDeliverySummary else null,
                showKitsModal = if (selectedWorkerStillValid) current.showKitsModal else false,
                selectedProducts = emptyList(),
                kits = if (selectedWorkerStillValid) current.kits else emptyList(),
                message = if (selectedWorkerStillValid) current.message else "Trabajador fuera del sector seleccionado"
            )
        }
        applyWorkersAndSectors()
    }

    fun onCloseKitsModal() {
        _uiState.update { it.copy(showKitsModal = false) }
    }

    fun onWorkerSelectedFromModal(dni: String) {
        _uiState.update {
            it.copy(
                showWorkersModal = false,
                workerPickerQuery = ""
            )
        }
        searchWorkerByDni(dni = dni, triggeredByScanner = false)
    }

    fun onWorkerPickerQueryChanged(value: String) {
        _uiState.update { it.copy(workerPickerQuery = value) }
    }

    fun onScannerCodeReceived(rawCode: String) {
        val normalized = extractDniFromScan(rawCode)
        if (normalized.isBlank()) return

        val now = System.currentTimeMillis()
        if (normalized == lastScanValue && (now - lastScanTs) < 900) return
        lastScanValue = normalized
        lastScanTs = now

        _uiState.update { current ->
            current.copy(
                dniInput = normalized,
                lastScannedCode = rawCode.trim(),
                showKitsModal = false,
                selectedProducts = emptyList(),
                message = null
            )
        }

        searchWorkerByDni(dni = normalized, triggeredByScanner = true)
    }

    fun onSearchClick() {
        if (!_uiState.value.isAuthenticated) return
        val dni = _uiState.value.dniInput.trim()
        if (dni.isEmpty()) {
            _uiState.update { current ->
                current.copy(message = "Ingresa un DNI")
            }
            return
        }
        searchWorkerByDni(dni = dni, triggeredByScanner = false)
    }

    fun onClearDniSearch() {
        kitObservationJob?.cancel()
        _uiState.update { current ->
            current.copy(
                dniInput = "",
                searchedDni = null,
                workerFound = null,
                lastDeliverySummary = null,
                showKitsModal = false,
                selectedProducts = emptyList(),
                kits = emptyList()
            )
        }
    }

    fun onToggleDeliveryProductSelection(kitId: String, productId: String, selected: Boolean) {
        val product = _uiState.value.kits
            .firstOrNull { it.id == kitId }
            ?.products
            ?.firstOrNull { it.id == productId }
            ?: return
        val maxQuantity = product.pendingQuantity.coerceAtLeast(0.0)
        if (maxQuantity <= 0.000001) return
        val normalizedQty = if (selected) maxQuantity else 0.0

        _uiState.update { current ->
            val updated = current.selectedProducts
                .filterNot { it.kitId == kitId && it.productId == productId }
                .toMutableList()

            if (normalizedQty > 0.000001) {
                val kitName = current.kits.firstOrNull { it.id == kitId }?.name.orEmpty()
                updated += SelectedDeliveryProductUi(
                    kitId = kitId,
                    kitName = kitName,
                    productId = productId,
                    productName = product.name,
                    quantity = normalizedQty,
                    maxQuantity = maxQuantity
                )
            }

            current.copy(selectedProducts = updated.sortedBy { it.key })
        }
    }

    fun onSelectAllPendingProducts() {
        _uiState.update { current ->
            val selected = current.kits.flatMap { kit ->
                kit.products
                    .mapNotNull { product ->
                        val pending = product.pendingQuantity.coerceAtLeast(0.0)
                        if (pending <= 0.000001) return@mapNotNull null
                        SelectedDeliveryProductUi(
                            kitId = kit.id,
                            kitName = kit.name,
                            productId = product.id,
                            productName = product.name,
                            quantity = pending,
                            maxQuantity = pending
                        )
                    }
            }
            current.copy(selectedProducts = selected)
        }
    }

    fun onClearProductSelection() {
        _uiState.update { current -> current.copy(selectedProducts = emptyList()) }
    }

    fun onDeliveryWithPhotoCaptured(products: List<DeliveryCaptureItemUi>, photoPath: String) {
        registerDelivery(products = products, photoPath = photoPath)
    }

    fun onDeliveryWithoutPhoto(products: List<DeliveryCaptureItemUi>) {
        registerDelivery(products = products, photoPath = "")
    }

    private fun registerDelivery(products: List<DeliveryCaptureItemUi>, photoPath: String) {
        val dni = _uiState.value.searchedDni ?: return
        if (!_uiState.value.isAuthenticated) return
        if (products.isEmpty()) return

        val now = System.currentTimeMillis()
        if (!isDeliveryAllowedAt(now)) {
            _uiState.update { current ->
                current.copy(
                    message = "Registro bloqueado: fuera del rango permitido (${deliveryWindowRangeLabel()})"
                )
            }
            return
        }

        val pendingByProduct = buildPendingQuantityByProductMap(_uiState.value.kits)
        val targetProducts = products.mapNotNull { selected ->
            val pendingQuantity = pendingByProduct[selected.productKey] ?: return@mapNotNull null
            val deliverQuantity = selected.quantity.coerceIn(0.0, pendingQuantity)
            if (deliverQuantity <= 0.000001) return@mapNotNull null
            DeliveryProduct(
                kitId = selected.kitId,
                productId = selected.productId,
                productName = selected.productName,
                quantity = deliverQuantity
            )
        }

        if (targetProducts.isEmpty()) {
            _uiState.update { current ->
                current.copy(message = "No hay productos pendientes seleccionados para entregar")
            }
            return
        }

        viewModelScope.launch {
            registerDeliveryUseCase(
                workerDni = dni,
                products = targetProducts,
                photoPath = photoPath
            )
            val syncResult = runCatching { syncDeliveriesWithProgress() }
            val deliveredUnits = targetProducts.sumOf { it.quantity }

            _uiState.update { current ->
                val syncError = syncResult.exceptionOrNull()?.message.orEmpty()
                current.copy(
                    selectedProducts = emptyList(),
                    message = if (syncResult.isSuccess) {
                        "Entrega registrada: ${targetProducts.size} producto(s), ${formatQty(deliveredUnits)} unidad(es). Sincronizada."
                    } else {
                        "Entrega local: ${targetProducts.size} producto(s), ${formatQty(deliveredUnits)} unidad(es). Pendiente de sincronizacion. Error: ${syncError.ifBlank { "desconocido" }}"
                    },
                    showKitsModal = true
                )
            }
        }
    }

    fun onPhotoCaptureFailed(message: String) {
        _uiState.update { current -> current.copy(message = message) }
    }

    fun onManualSyncClick() {
        if (!_uiState.value.isAuthenticated) return
        if (_uiState.value.isSyncing) {
            _uiState.update { current -> current.copy(message = "Sincronizacion en curso. Espera a que termine.") }
            return
        }

        viewModelScope.launch {
            val result = runCatching { syncAllDataWithProgress() }
            if (result.isSuccess) {
                refreshProductStockSummary(showLoading = false)
            } else {
                val error = result.exceptionOrNull()
                if (error != null && isSessionExpiredError(error.message)) {
                    forceSessionExpiryLogout()
                    return@launch
                }
            }
            _uiState.update { current ->
                if (result.isSuccess) {
                    val summary = result.getOrThrow()
                    current.copy(
                        message = "Sync completado. Subidos -> trabajadores: ${summary.pushedWorkers}, kits: ${summary.pushedKits}, entregas: ${summary.pushedDeliveries}. Descargados -> trabajadores: ${summary.pulledWorkers}, kits: ${summary.pulledKits}, entregas: ${summary.pulledDeliveries}"
                    )
                } else {
                    current.copy(
                        message = "Error al sincronizar: ${result.exceptionOrNull()?.message.orEmpty()}"
                    )
                }
            }
        }
    }

    private fun searchWorkerByDni(dni: String, triggeredByScanner: Boolean) {
        if (!_uiState.value.isAuthenticated) return

        viewModelScope.launch {
            if (triggeredByScanner) {
                _uiState.update { current ->
                    current.copy(
                        showKitsModal = false,
                        selectedProducts = emptyList()
                    )
                }
            }

            val localWorker = observeWorkerByDniUseCase(dni).first()
            var resolvedWorker = localWorker

            if (resolvedWorker == null) {
                val lookupResult = runCatching { lookupWorkerByDniUseCase(dni) }
                    .getOrElse { error ->
                        if (isSessionExpiredError(error.message)) {
                            forceSessionExpiryLogout()
                            return@launch
                        }
                        null
                    }
                when (lookupResult?.status) {
                    WorkerLookupStatus.OTHER_SECTOR -> {
                        val workerFromLookup = lookupResult.worker
                        val sectorLabel = workerFromLookup?.sectorName?.ifBlank { workerFromLookup.sectorId }
                            ?.ifBlank { "sector no asignado al usuario" }
                            ?: "sector no asignado al usuario"
                        val latestDeliveryLabel = lookupResult.latestDelivery?.let { delivery ->
                            val deliveredAt = if (delivery.timestamp > 0L) formatTimestamp(delivery.timestamp) else "-"
                            val deliveredSector = delivery.sectorName.ifBlank {
                                resolveSectorLabel(delivery.sectorId)
                            }.ifBlank { "-" }
                            val deliveredBy = delivery.userEmail.ifBlank { delivery.pdaId }.ifBlank { "-" }
                            val deliveredEvent = delivery.eventName.ifBlank { delivery.eventId }.ifBlank { "-" }
                            " | Ultima entrega: $deliveredAt | Evento: $deliveredEvent | Sector: $deliveredSector | Entrego: $deliveredBy"
                        }.orEmpty()
                        kitObservationJob?.cancel()
                        _uiState.update { current ->
                            current.copy(
                                dniInput = dni,
                                searchedDni = dni,
                                workerFound = null,
                                lastDeliverySummary = null,
                                showKitsModal = false,
                                selectedProducts = emptyList(),
                                kits = emptyList(),
                                message = "El trabajador pertenece a otro sector ($sectorLabel)$latestDeliveryLabel"
                            )
                        }
                        return@launch
                    }
                    WorkerLookupStatus.AVAILABLE -> {
                        resolvedWorker = lookupResult.worker
                    }
                    WorkerLookupStatus.NOT_FOUND, null -> {
                        // Se maneja abajo como no encontrado.
                    }
                }
            }

            if (resolvedWorker == null) {
                kitObservationJob?.cancel()
                _uiState.update { current ->
                    current.copy(
                        dniInput = dni,
                        searchedDni = dni,
                        workerFound = null,
                        lastDeliverySummary = null,
                        showKitsModal = false,
                        selectedProducts = emptyList(),
                        kits = emptyList(),
                        message = if (triggeredByScanner) {
                            "Escaneo sin coincidencia en el maestro de beneficiarios"
                        } else {
                            "Trabajador no encontrado en el maestro de beneficiarios"
                        }
                    )
                }
                return@launch
            }

            val selectedSectorId = _uiState.value.selectedSectorId.trim()
            if (selectedSectorId.isNotBlank() && !workerMatchesSelectedSector(resolvedWorker.toUi(), selectedSectorId)) {
                val sectorLabel = resolvedWorker.sectorName.ifBlank { resolvedWorker.sectorId }.ifBlank { "-" }
                val latestDeliverySummary = loadLatestDeliverySummary(
                    dni = dni,
                    worker = resolvedWorker
                )
                val latestDeliveryLabel = latestDeliverySummary?.let { summary ->
                    " | Ultima entrega: ${formatTimestamp(summary.timestamp)} | Sector: ${summary.sectorLabel.ifBlank { "-" }} | Entrego: ${summary.deliveredByLabel.ifBlank { "-" }}"
                }.orEmpty()
                kitObservationJob?.cancel()
                _uiState.update { current ->
                    current.copy(
                        dniInput = dni,
                        searchedDni = dni,
                        workerFound = null,
                        lastDeliverySummary = null,
                        showKitsModal = false,
                        selectedProducts = emptyList(),
                        kits = emptyList(),
                        message = "El trabajador pertenece a otro sector ($sectorLabel)$latestDeliveryLabel"
                    )
                }
                return@launch
            }

            val lastDeliverySummary = loadLatestDeliverySummary(
                dni = dni,
                worker = resolvedWorker
            )

            _uiState.update { current ->
                current.copy(
                    dniInput = dni,
                    searchedDni = dni,
                    workerFound = resolvedWorker.toUi(),
                    lastDeliverySummary = lastDeliverySummary,
                    showKitsModal = true,
                    selectedProducts = emptyList(),
                    message = null
                )
            }

            observeKitsForWorker(dni)
        }
    }

    private suspend fun syncDeliveriesWithProgress(): Int {
        return try {
            _uiState.update { current ->
                current.copy(isSyncing = true, syncProgressMessage = "Sincronizando entregas pendientes...")
            }
            syncPendingDeliveriesUseCase()
        } finally {
            _uiState.update { current -> current.copy(isSyncing = false, syncProgressMessage = null) }
        }
    }

    private suspend fun syncAllDataWithProgress(): com.amm19.agrokit.domain.usecase.SyncSummary {
        return try {
            _uiState.update { current ->
                current.copy(isSyncing = true, syncProgressMessage = "Preparando sincronizacion masiva...")
            }
            syncPendingDataUseCase { step ->
                val progressMessage = when (step) {
                    SyncProgressStep.PUSH_WORKERS -> "Subiendo trabajadores pendientes..."
                    SyncProgressStep.PUSH_KITS -> "Subiendo kits pendientes..."
                    SyncProgressStep.PUSH_DELIVERIES -> "Subiendo entregas pendientes..."
                    SyncProgressStep.PULL_WORKERS -> "Descargando trabajadores actualizados..."
                    SyncProgressStep.PULL_KITS -> "Descargando kits actualizados..."
                    SyncProgressStep.PULL_DELIVERIES -> "Descargando entregas actualizadas..."
                }
                _uiState.update { current -> current.copy(syncProgressMessage = progressMessage) }
            }
        } finally {
            _uiState.update { current -> current.copy(isSyncing = false, syncProgressMessage = null) }
        }
    }

    private fun mapLoginError(rawMessage: String?): String {
        val normalized = rawMessage.orEmpty().trim()
        if (normalized.isBlank()) return "No se pudo iniciar sesion"
        val lower = normalized.lowercase(Locale.getDefault())

        if (lower.contains("no hay evento activo")) {
            return "No hay evento activo vigente para este usuario."
        }
        if (lower.contains("usuario inactivo")) {
            return "Tu usuario esta inactivo. Contacta al administrador."
        }
        if (lower.contains("credenciales invalidas") || lower.contains("http 401")) {
            return "Correo o contrasena incorrectos."
        }
        if (lower.contains("http 403")) {
            return "Tu usuario no tiene permisos para ingresar en este aplicativo."
        }
        if (lower.contains("sin sectores")) {
            return "Tu usuario no tiene sectores asignados para el evento vigente."
        }
        if (
            lower.contains("unable to resolve host") ||
            lower.contains("failed to connect") ||
            lower.contains("timeout") ||
            lower.contains("connection refused") ||
            lower.contains("network is unreachable")
        ) {
            return "No hay conexion con el servidor. Verifica internet o la URL del backend."
        }
        return normalized
    }

    private fun isSessionExpiredError(rawMessage: String?): Boolean {
        val normalized = rawMessage.orEmpty().trim()
        if (normalized.isBlank()) return false
        val lower = normalized.lowercase(Locale.getDefault())
        if (lower.contains("sesion expirada")) return true
        if (lower.contains("http 401")) return true
        if (lower.contains("token") && (
            lower.contains("expir") ||
                lower.contains("inval") ||
                lower.contains("requerido")
            )
        ) {
            return true
        }
        return false
    }

    private fun scheduleSessionExpiry(expiresAt: Long) {
        sessionExpiryJob?.cancel()
        if (expiresAt <= 0L) return
        val msUntilExpiry = expiresAt - System.currentTimeMillis()
        if (msUntilExpiry <= 0L) {
            forceSessionExpiryLogout()
            return
        }

        sessionExpiryJob = viewModelScope.launch {
            delay(msUntilExpiry + 250L)
            if (_uiState.value.isAuthenticated) {
                forceSessionExpiryLogout()
            }
        }
    }

    private fun forceSessionExpiryLogout() {
        sessionExpiryJob?.cancel()
        sessionExpiryJob = null
        stopRealtimeSyncUseCase()
        logoutUseCase()
        kitObservationJob?.cancel()
        allWorkers = emptyList()
        allDeliveries = emptyList()
        productStockSummaries = emptyList()
        _uiState.update { current ->
            current.copy(
                isAuthenticated = false,
                userEmail = null,
                activeEventId = "",
                activeEventName = "",
                activeEvents = emptyList(),
                assignedSectorIds = emptyList(),
                selectedSectorId = "",
                sectorOptions = emptyList(),
                passwordInput = "",
                searchedDni = null,
                workerFound = null,
                lastDeliverySummary = null,
                showKitsModal = false,
                showStockSummaryModal = false,
                kits = emptyList(),
                selectedProducts = emptyList(),
                stockSummaryLoading = false,
                stockSummaryUpdatedAt = null,
                stockSummaryError = null,
                stockSummaryItems = emptyList(),
                message = "Sesion expirada. Inicia sesion nuevamente."
            )
        }
    }

    private fun observeKitsForWorker(dni: String) {
        kitObservationJob?.cancel()
        kitObservationJob = viewModelScope.launch {
            observeKitStatusesUseCase(dni).collect { statuses ->
                val kitsUi = statuses.map { it.toUi() }
                _uiState.update { current ->
                    current.copy(
                        kits = kitsUi,
                        selectedProducts = reconcileSelectedProducts(current.selectedProducts, kitsUi)
                    )
                }
            }
        }
    }

    private suspend fun loadLatestDeliverySummary(
        dni: String,
        worker: Worker
    ): WorkerLastDeliveryUi? {
        val latest = observeDeliveriesByWorkerUseCase(dni).first().maxByOrNull { it.timestamp }
            ?: return null
        val sectorLabel = if (latest.sectorId.isBlank()) {
            worker.sectorName.ifBlank { worker.sectorId }
        } else if (latest.sectorId == worker.sectorId && worker.sectorName.isNotBlank()) {
            worker.sectorName
        } else {
            resolveSectorLabel(latest.sectorId)
        }
        return WorkerLastDeliveryUi(
            timestamp = latest.timestamp,
            sectorLabel = sectorLabel.ifBlank { "-" },
            deliveredByLabel = latest.userEmail.ifBlank { latest.pdaId }.ifBlank { "-" }
        )
    }

    private fun reconcileSelectedProducts(
        currentSelection: List<SelectedDeliveryProductUi>,
        kits: List<KitDeliveryUi>
    ): List<SelectedDeliveryProductUi> {
        val pendingByProduct = buildPendingQuantityByProductMap(kits)
        return currentSelection.mapNotNull { item ->
            val pendingQuantity = pendingByProduct[item.productKey] ?: return@mapNotNull null
            if (pendingQuantity <= 0.000001) return@mapNotNull null
            val normalizedQuantity = item.quantity.coerceIn(0.0, pendingQuantity)
            if (normalizedQuantity <= 0.000001) return@mapNotNull null
            item.copy(quantity = normalizedQuantity, maxQuantity = pendingQuantity)
        }
    }

    private fun buildPendingQuantityByProductMap(kits: List<KitDeliveryUi>): Map<String, Double> {
        return kits
            .flatMap { kit ->
                kit.products.map { product ->
                    deliveryProductKey(kit.id, product.id) to product.pendingQuantity.coerceAtLeast(0.0)
                }
            }
            .toMap()
    }

    private fun Worker.toUi(): WorkerUi {
        return WorkerUi(
            dni = dni,
            fullName = fullName,
            area = area,
            costCenter = costCenter,
            sectorId = sectorId,
            sectorName = sectorName,
            synced = synced
        )
    }

    private fun KitDeliveryStatus.toUi(): KitDeliveryUi {
        return KitDeliveryUi(
            id = kit.id,
            name = kit.name,
            delivered = delivered,
            deliveredProducts = deliveredProducts,
            totalProducts = totalProducts,
            products = products.map { productStatus ->
                KitProductDeliveryUi(
                    id = productStatus.product.id,
                    name = productStatus.product.name,
                    requiredQuantity = productStatus.requiredQuantity,
                    deliveredQuantity = productStatus.deliveredQuantity,
                    pendingQuantity = productStatus.pendingQuantity,
                    latestDeliveryTimestamp = productStatus.latestDeliveryTimestamp,
                    latestDeliverySectorLabel = resolveSectorLabel(productStatus.latestDeliverySectorId),
                    latestDeliveredByLabel = productStatus.latestDeliveredBy
                )
            }
        )
    }

    private fun extractDniFromScan(rawCode: String): String {
        val firstExactDni = Regex("""\b\d{8}\b""").find(rawCode)?.value
        if (!firstExactDni.isNullOrBlank()) return firstExactDni

        val digits = rawCode.filter { it.isDigit() }
        if (digits.length >= 8) return digits.take(8)

        return rawCode.trim().filter { it.isLetterOrDigit() }
    }

    private fun isDeliveryAllowedAt(timestamp: Long): Boolean {
        val state = _uiState.value
        if (!state.deliveryWindowEnabled) return true
        val start = state.deliveryWindowStartAt ?: return true
        val end = state.deliveryWindowEndAt ?: return true
        return timestamp in start..end
    }

    private fun deliveryWindowRangeLabel(): String {
        val state = _uiState.value
        val start = state.deliveryWindowStartAt
        val end = state.deliveryWindowEndAt
        if (start == null || end == null) return "sin rango configurado"
        return "${formatTimestamp(start)} - ${formatTimestamp(end)}"
    }

    private fun formatTimestamp(value: Long): String {
        val formatter = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())
        return formatter.format(Date(value))
    }

    private fun formatQty(value: Double): String {
        return if (kotlin.math.abs(value - value.toInt().toDouble()) < 0.000001) {
            value.toInt().toString()
        } else {
            String.format(Locale.US, "%.2f", value)
        }
    }

    private fun resolveSectorLabel(sectorId: String): String {
        val normalized = sectorId.trim()
        if (normalized.isBlank()) return ""

        val fromSession = getCurrentSessionUseCase()
            ?.activeEvent
            ?.sectors
            ?.firstOrNull { it.id.trim().equals(normalized, ignoreCase = true) && it.name.isNotBlank() }
            ?.name
        if (!fromSession.isNullOrBlank()) return fromSession

        val fromWorkers = allWorkers.firstOrNull {
            it.sectorId.trim().equals(normalized, ignoreCase = true) && it.sectorName.isNotBlank()
        }?.sectorName
        if (!fromWorkers.isNullOrBlank()) return fromWorkers

        val fromProducts = productStockSummaries
            .flatMap { it.sectorStocks }
            .firstOrNull { it.sectorId.trim().equals(normalized, ignoreCase = true) && it.sectorName.isNotBlank() }
            ?.sectorName
        if (!fromProducts.isNullOrBlank()) return fromProducts

        val fromOptions = _uiState.value.sectorOptions
            .firstOrNull { it.id.trim().equals(normalized, ignoreCase = true) && it.label.isNotBlank() }
            ?.label
        if (!fromOptions.isNullOrBlank()) return fromOptions

        return normalized
    }

    private fun deliveryProductKey(kitId: String, productId: String): String {
        return "${kitId.trim()}::${productId.trim()}"
    }

    private fun normalizeSectorIds(sectorIds: List<String>): List<String> {
        return sectorIds
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .distinct()
    }

    private fun workerMatchesSelectedSector(worker: WorkerUi, selectedSectorId: String): Boolean {
        val normalizedSectorId = selectedSectorId.trim()
        if (normalizedSectorId.isBlank()) return true
        return worker.sectorId.trim().equals(normalizedSectorId, ignoreCase = true)
    }

    private fun applyWorkersAndSectors() {
        _uiState.update { current ->
            val assigned = normalizeSectorIds(current.assignedSectorIds)
            val selectedSectorId = when {
                assigned.isEmpty() -> ""
                current.selectedSectorId.isBlank() -> assigned.first()
                assigned.contains(current.selectedSectorId) -> current.selectedSectorId
                else -> assigned.first()
            }

            val workersByScope = if (assigned.isEmpty()) {
                allWorkers
            } else {
                allWorkers.filter { worker ->
                    assigned.contains(worker.sectorId.trim())
                }
            }

            val filteredWorkers = if (selectedSectorId.isBlank()) {
                workersByScope
            } else {
                workersByScope.filter { worker ->
                    workerMatchesSelectedSector(worker, selectedSectorId)
                }
            }

            val selectedWorkerValid = current.workerFound?.let { worker ->
                if (selectedSectorId.isBlank()) true else workerMatchesSelectedSector(worker, selectedSectorId)
            } ?: true

            val sectorOptions = assigned.map { sectorId ->
                val sectorName = getCurrentSessionUseCase()
                    ?.activeEvent
                    ?.sectors
                    ?.firstOrNull { sector -> sector.id.trim().equals(sectorId, ignoreCase = true) }
                    ?.name
                    ?.ifBlank { null }
                    ?: allWorkers.firstOrNull { worker ->
                    worker.sectorId.trim().equals(sectorId, ignoreCase = true) && worker.sectorName.isNotBlank()
                }?.sectorName
                    ?: productStockSummaries
                        .flatMap { it.sectorStocks }
                        .firstOrNull { stock -> stock.sectorId.trim().equals(sectorId, ignoreCase = true) }
                        ?.sectorName
                    ?: sectorId
                SectorOptionUi(id = sectorId, label = sectorName.ifBlank { sectorId })
            }

            current.copy(
                selectedSectorId = selectedSectorId,
                sectorOptions = sectorOptions,
                workers = filteredWorkers,
                workerFound = if (selectedWorkerValid) current.workerFound else null,
                searchedDni = if (selectedWorkerValid) current.searchedDni else null,
                lastDeliverySummary = if (selectedWorkerValid) current.lastDeliverySummary else null,
                showKitsModal = if (selectedWorkerValid) current.showKitsModal else false,
                selectedProducts = if (selectedWorkerValid) current.selectedProducts else emptyList(),
                kits = if (selectedWorkerValid) current.kits else emptyList()
            )
        }
        refreshStockSummaryUi()
    }

    private fun refreshProductStockSummary(showLoading: Boolean) {
        if (!_uiState.value.isAuthenticated) return
        viewModelScope.launch {
            if (showLoading) {
                _uiState.update { current -> current.copy(stockSummaryLoading = true, stockSummaryError = null) }
            }

            val result = fetchProductStockSummaryUseCase()
            result.fold(
                onSuccess = { summary ->
                    productStockSummaries = summary
                    _uiState.update { current ->
                        current.copy(
                            stockSummaryLoading = false,
                            stockSummaryUpdatedAt = System.currentTimeMillis(),
                            stockSummaryError = null
                        )
                    }
                    applyWorkersAndSectors()
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            stockSummaryLoading = false,
                            stockSummaryError = error.message ?: "No se pudo cargar resumen de stock"
                        )
                    }
                    refreshStockSummaryUi()
                }
            )
        }
    }

    private fun refreshStockSummaryUi() {
        _uiState.update { current ->
            val selectedSectorId = current.selectedSectorId.trim()
            if (selectedSectorId.isBlank()) {
                return@update current.copy(
                    stockSummaryItems = emptyList(),
                    stockAssignedTotal = 0.0,
                    stockConsumedTotal = 0.0,
                    stockBalanceTotal = 0.0
                )
            }

            val consumedByProduct = mutableMapOf<String, Double>()
            val productNamesByCode = mutableMapOf<String, String>()

            allDeliveries
                .asSequence()
                .filter { delivery -> delivery.sectorId.trim().equals(selectedSectorId, ignoreCase = true) }
                .forEach { delivery ->
                    delivery.products.forEach { product ->
                        val key = product.productId.trim()
                        if (key.isBlank()) return@forEach
                        consumedByProduct[key] = (consumedByProduct[key] ?: 0.0) + product.quantity
                        if (product.productName.isNotBlank()) {
                            productNamesByCode[key] = product.productName
                        }
                    }
                }

            val stockItems = productStockSummaries.map { stock ->
                val sectorStock = stock.sectorStocks.firstOrNull { sector ->
                    sector.sectorId.trim().equals(selectedSectorId, ignoreCase = true)
                }?.stockQuantity ?: 0.0
                val consumed = consumedByProduct.remove(stock.productCode.trim()) ?: 0.0
                StockSummaryItemUi(
                    productCode = stock.productCode,
                    productName = stock.productName.ifBlank { stock.productCode },
                    assignedStock = sectorStock,
                    consumedStock = consumed,
                    balanceStock = sectorStock - consumed
                )
            }.toMutableList()

            consumedByProduct.forEach { (productCode, consumed) ->
                stockItems += StockSummaryItemUi(
                    productCode = productCode,
                    productName = productNamesByCode[productCode].orEmpty().ifBlank { productCode },
                    assignedStock = 0.0,
                    consumedStock = consumed,
                    balanceStock = -consumed
                )
            }

            val sorted = stockItems.sortedBy { it.productName.lowercase(Locale.getDefault()) }
            current.copy(
                stockSummaryItems = sorted,
                stockAssignedTotal = sorted.sumOf { it.assignedStock },
                stockConsumedTotal = sorted.sumOf { it.consumedStock },
                stockBalanceTotal = sorted.sumOf { it.balanceStock }
            )
        }
    }

    override fun onCleared() {
        sessionExpiryJob?.cancel()
        sessionExpiryJob = null
        stopRealtimeSyncUseCase()
        super.onCleared()
    }
}

data class AgroKitUiState(
    val isLoading: Boolean = false,
    val isAuthenticated: Boolean = false,
    val userEmail: String? = null,
    val activeEventId: String = "",
    val activeEventName: String = "",
    val activeEvents: List<EventOptionUi> = emptyList(),
    val emailInput: String = "",
    val passwordInput: String = "",
    val dniInput: String = "",
    val searchedDni: String? = null,
    val lastScannedCode: String? = null,
    val workerFound: WorkerUi? = null,
    val lastDeliverySummary: WorkerLastDeliveryUi? = null,
    val showWorkersModal: Boolean = false,
    val showKitsModal: Boolean = false,
    val showStockSummaryModal: Boolean = false,
    val workerPickerQuery: String = "",
    val assignedSectorIds: List<String> = emptyList(),
    val selectedSectorId: String = "",
    val sectorOptions: List<SectorOptionUi> = emptyList(),
    val workers: List<WorkerUi> = emptyList(),
    val kits: List<KitDeliveryUi> = emptyList(),
    val selectedProducts: List<SelectedDeliveryProductUi> = emptyList(),
    val stockSummaryLoading: Boolean = false,
    val stockSummaryUpdatedAt: Long? = null,
    val stockSummaryError: String? = null,
    val stockSummaryItems: List<StockSummaryItemUi> = emptyList(),
    val stockAssignedTotal: Double = 0.0,
    val stockConsumedTotal: Double = 0.0,
    val stockBalanceTotal: Double = 0.0,
    val pendingSyncWorkers: Int = 0,
    val pendingSyncKits: Int = 0,
    val pendingSyncDeliveries: Int = 0,
    val deliveryWindowEnabled: Boolean = false,
    val deliveryWindowStartAt: Long? = null,
    val deliveryWindowEndAt: Long? = null,
    val showPendingSyncAlert: Boolean = false,
    val isOnline: Boolean = true,
    val showNetworkAlert: Boolean = false,
    val networkAlertMessage: String? = null,
    val message: String? = null,
    val isSyncing: Boolean = false,
    val syncProgressMessage: String? = null
) {
    val pendingSyncTotal: Int
        get() = pendingSyncWorkers + pendingSyncKits + pendingSyncDeliveries
}

data class EventOptionUi(
    val id: String,
    val name: String
)

data class SectorOptionUi(
    val id: String,
    val label: String
)

data class WorkerUi(
    val dni: String,
    val fullName: String,
    val area: String,
    val costCenter: String,
    val sectorId: String,
    val sectorName: String,
    val synced: Boolean
)

data class WorkerLastDeliveryUi(
    val timestamp: Long,
    val sectorLabel: String,
    val deliveredByLabel: String
)

data class KitDeliveryUi(
    val id: String,
    val name: String,
    val delivered: Boolean,
    val deliveredProducts: Int,
    val totalProducts: Int,
    val products: List<KitProductDeliveryUi>
)

data class KitProductDeliveryUi(
    val id: String,
    val name: String,
    val requiredQuantity: Double,
    val deliveredQuantity: Double,
    val pendingQuantity: Double,
    val latestDeliveryTimestamp: Long? = null,
    val latestDeliverySectorLabel: String = "",
    val latestDeliveredByLabel: String = ""
)

data class SelectedDeliveryProductUi(
    val kitId: String,
    val kitName: String,
    val productId: String,
    val productName: String,
    val quantity: Double = 0.0,
    val maxQuantity: Double = 0.0
) {
    val key: String
        get() = "${kitId.trim()}::${productId.trim()}"

    val productKey: String
        get() = "${kitId.trim()}::${productId.trim()}"

    fun toCaptureItem(): DeliveryCaptureItemUi {
        return DeliveryCaptureItemUi(
            kitId = kitId,
            productId = productId,
            productName = productName,
            quantity = quantity
        )
    }
}

data class DeliveryCaptureItemUi(
    val kitId: String,
    val productId: String,
    val productName: String,
    val quantity: Double
) {
    val key: String
        get() = "${kitId.trim()}::${productId.trim()}"

    val productKey: String
        get() = "${kitId.trim()}::${productId.trim()}"
}

data class StockSummaryItemUi(
    val productCode: String,
    val productName: String,
    val assignedStock: Double,
    val consumedStock: Double,
    val balanceStock: Double
)
