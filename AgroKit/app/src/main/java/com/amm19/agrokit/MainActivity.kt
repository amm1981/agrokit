package com.amm19.agrokit

import android.Manifest
import android.content.Context
import android.graphics.Color
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import androidx.activity.SystemBarStyle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.amm19.agrokit.presentation.scanner.PdaScannerBroadcastReceiver
import com.amm19.agrokit.presentation.ui.AgroKitHomeScreen
import com.amm19.agrokit.presentation.viewmodel.DeliveryCaptureItemUi
import com.amm19.agrokit.presentation.viewmodel.AgroKitViewModel
import com.amm19.agrokit.ui.theme.AgroKitTheme
import dagger.hilt.android.AndroidEntryPoint
import java.io.File

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val viewModel: AgroKitViewModel by viewModels()
    private var scannerRegistered = false
    private val scannerKeyBuffer = StringBuilder()
    private var lastScannerKeyTs = 0L
    private val scannerCommitHandler = Handler(Looper.getMainLooper())
    private val scannerCommitRunnable = Runnable { commitKeyboardScannerBuffer() }
    private var pendingPhotoCapture: PendingPhotoCapture? = null
    private var pendingPermissionCapture: PendingPermissionCapture? = null

    private val scannerReceiver = PdaScannerBroadcastReceiver { rawCode ->
        viewModel.onScannerCodeReceived(rawCode)
    }

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val pending = pendingPermissionCapture
        pendingPermissionCapture = null

        if (granted && pending != null) {
            startCaptureForProducts(workerDni = pending.workerDni, products = pending.products)
        } else {
            viewModel.onPhotoCaptureFailed("Permiso de camara denegado")
        }
    }

    private val photoCaptureLauncher = registerForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        val pending = pendingPhotoCapture
        pendingPhotoCapture = null

        if (!success || pending == null) {
            pending?.file?.takeIf { it.exists() }?.delete()
            viewModel.onPhotoCaptureFailed("Captura cancelada")
            return@registerForActivityResult
        }

        viewModel.onDeliveryWithPhotoCaptured(
            products = pending.products,
            photoPath = pending.file.absolutePath
        )
    }

    override fun onStart() {
        super.onStart()
        registerScannerReceiver()
    }

    override fun onStop() {
        unregisterScannerReceiver()
        scannerCommitHandler.removeCallbacks(scannerCommitRunnable)
        super.onStop()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        )

        setContent {
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()

            AgroKitTheme {
                AgroKitHomeScreen(
                    state = uiState,
                    onEmailChanged = viewModel::onEmailChanged,
                    onPasswordChanged = viewModel::onPasswordChanged,
                    onDismissMessage = viewModel::onDismissMessage,
                    onDismissNetworkAlert = viewModel::onDismissNetworkAlert,
                    onDismissPendingSyncAlert = viewModel::onDismissPendingSyncAlert,
                    onOpenPendingSyncAlert = viewModel::onOpenPendingSyncAlert,
                    onLoginClick = viewModel::onLoginClick,
                    onLogoutClick = viewModel::onLogoutClick,
                    onDniChange = viewModel::onDniChanged,
                    onClearDniSearch = viewModel::onClearDniSearch,
                    onSearchClick = viewModel::onSearchClick,
                    onSelectActiveEvent = viewModel::onActiveEventSelected,
                    onOpenWorkersModal = viewModel::onOpenWorkersModal,
                    onCloseWorkersModal = viewModel::onCloseWorkersModal,
                    onWorkerPickerQueryChanged = viewModel::onWorkerPickerQueryChanged,
                    onWorkerSelectedFromModal = viewModel::onWorkerSelectedFromModal,
                    onOpenKitsModal = viewModel::onOpenKitsModal,
                    onCloseKitsModal = viewModel::onCloseKitsModal,
                    onOpenStockSummaryModal = viewModel::onOpenStockSummaryModal,
                    onCloseStockSummaryModal = viewModel::onCloseStockSummaryModal,
                    onSelectedSectorChanged = viewModel::onSelectedSectorChanged,
                    onCaptureAndDeliverClick = { products ->
                        val workerDni = uiState.searchedDni
                        if (workerDni.isNullOrBlank()) {
                            viewModel.onPhotoCaptureFailed("Busca un trabajador antes de entregar")
                        } else if (products.isEmpty()) {
                            viewModel.onPhotoCaptureFailed("Selecciona al menos un producto")
                        } else {
                            ensureCameraAndCapture(workerDni = workerDni, products = products)
                        }
                    },
                    onToggleDeliveryProductSelection = viewModel::onToggleDeliveryProductSelection,
                    onSelectAllPendingProducts = viewModel::onSelectAllPendingProducts,
                    onClearProductSelection = viewModel::onClearProductSelection,
                    onManualSyncClick = viewModel::onManualSyncClick,
                    onQrCodeScanned = viewModel::onScannerCodeReceived
                )
            }
        }
    }

    private fun ensureCameraAndCapture(workerDni: String, products: List<DeliveryCaptureItemUi>) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCaptureForProducts(workerDni = workerDni, products = products)
            return
        }

        pendingPermissionCapture = PendingPermissionCapture(workerDni = workerDni, products = products)
        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
    }

    private fun registerScannerReceiver() {
        if (scannerRegistered) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(
                scannerReceiver,
                PdaScannerBroadcastReceiver.intentFilter(),
                Context.RECEIVER_EXPORTED
            )
        } else {
            registerReceiver(scannerReceiver, PdaScannerBroadcastReceiver.intentFilter())
        }
        scannerRegistered = true
    }

    private fun unregisterScannerReceiver() {
        if (!scannerRegistered) return
        unregisterReceiver(scannerReceiver)
        scannerRegistered = false
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            processKeyboardWedgeEvent(event)
        }
        return super.dispatchKeyEvent(event)
    }

    private fun processKeyboardWedgeEvent(event: KeyEvent) {
        if (event.keyCode == KeyEvent.KEYCODE_ENTER || event.keyCode == KeyEvent.KEYCODE_TAB) {
            commitKeyboardScannerBuffer()
            return
        }

        val unicode = event.unicodeChar
        if (unicode <= 0) return

        val char = unicode.toChar()
        if (char.isISOControl()) return

        val now = SystemClock.elapsedRealtime()
        if (now - lastScannerKeyTs > 800) {
            scannerKeyBuffer.clear()
        }
        lastScannerKeyTs = now

        scannerKeyBuffer.append(char)
        scannerCommitHandler.removeCallbacks(scannerCommitRunnable)
        scannerCommitHandler.postDelayed(scannerCommitRunnable, 280)
    }

    private fun commitKeyboardScannerBuffer() {
        scannerCommitHandler.removeCallbacks(scannerCommitRunnable)
        val payload = scannerKeyBuffer.toString().trim()
        scannerKeyBuffer.clear()
        if (payload.length < 6) return
        viewModel.onScannerCodeReceived(payload)
    }

    private fun startCaptureForProducts(workerDni: String, products: List<DeliveryCaptureItemUi>) {
        runCatching {
            val file = createPhotoFile(workerDni = workerDni, products = products)
            val uri = FileProvider.getUriForFile(
                this,
                "${packageName}.fileprovider",
                file
            )
            pendingPhotoCapture = PendingPhotoCapture(
                products = products,
                file = file
            )
            photoCaptureLauncher.launch(uri)
        }.onFailure { error ->
            pendingPhotoCapture = null
            viewModel.onPhotoCaptureFailed("No se pudo abrir camara: ${error.message.orEmpty()}")
        }
    }

    private fun createPhotoFile(workerDni: String, products: List<DeliveryCaptureItemUi>): File {
        val baseDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES)
            ?: filesDir
        val workerDir = File(baseDir, "AgroKit/photos/$workerDni")
        if (!workerDir.exists()) {
            workerDir.mkdirs()
        }
        val productToken = products.map { "${it.kitId}_${it.productId}" }.sorted()
            .joinToString("-")
            .replace("[^A-Za-z0-9_-]".toRegex(), "_")
            .take(60)
        val fileName = "${workerDni}_${productToken}_${System.currentTimeMillis()}_evidencia.jpg"
        return File(workerDir, fileName)
    }

    private data class PendingPhotoCapture(
        val products: List<DeliveryCaptureItemUi>,
        val file: File
    )

    private data class PendingPermissionCapture(
        val workerDni: String,
        val products: List<DeliveryCaptureItemUi>
    )
}
