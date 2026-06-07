package com.amm19.agrokit.presentation.ui

import android.Manifest
import android.content.pm.PackageManager
import android.util.Size
import androidx.compose.foundation.Image
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.Category
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Clear
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.FlashOff
import androidx.compose.material.icons.outlined.FlashOn
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FabPosition
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.amm19.agrokit.R
import com.amm19.agrokit.presentation.viewmodel.AgroKitUiState
import com.amm19.agrokit.presentation.viewmodel.DeliveryCaptureItemUi
import com.amm19.agrokit.presentation.viewmodel.EventOptionUi
import com.amm19.agrokit.presentation.viewmodel.SectorOptionUi
import com.amm19.agrokit.presentation.viewmodel.SelectedDeliveryProductUi
import com.amm19.agrokit.presentation.viewmodel.StockSummaryItemUi
import com.amm19.agrokit.presentation.viewmodel.WorkerUi
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.NotFoundException
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.ReaderException
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.BarcodeFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.EnumMap
import java.util.Locale
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private val AppCardShape = RoundedCornerShape(16.dp)
private val DisabledButtonContainer = Color(0xFFD2DAD6)
private val DisabledButtonContent = Color(0xFF46554F)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgroKitHomeScreen(
    state: AgroKitUiState,
    onEmailChanged: (String) -> Unit,
    onPasswordChanged: (String) -> Unit,
    onDismissMessage: () -> Unit,
    onDismissNetworkAlert: () -> Unit,
    onDismissPendingSyncAlert: () -> Unit,
    onOpenPendingSyncAlert: () -> Unit,
    onLoginClick: () -> Unit,
    onLogoutClick: () -> Unit,
    onDniChange: (String) -> Unit,
    onClearDniSearch: () -> Unit,
    onSearchClick: () -> Unit,
    onSelectActiveEvent: (String) -> Unit,
    onOpenWorkersModal: () -> Unit,
    onCloseWorkersModal: () -> Unit,
    onWorkerPickerQueryChanged: (String) -> Unit,
    onWorkerSelectedFromModal: (String) -> Unit,
    onOpenKitsModal: () -> Unit,
    onCloseKitsModal: () -> Unit,
    onOpenStockSummaryModal: () -> Unit,
    onCloseStockSummaryModal: () -> Unit,
    onSelectedSectorChanged: (String) -> Unit,
    onCaptureAndDeliverClick: (List<DeliveryCaptureItemUi>) -> Unit,
    onToggleDeliveryProductSelection: (String, String, Boolean) -> Unit,
    onSelectAllPendingProducts: () -> Unit,
    onClearProductSelection: () -> Unit,
    onManualSyncClick: () -> Unit,
    onQrCodeScanned: (String) -> Unit
) {
    var showQrScanner by remember { mutableStateOf(false) }

    state.message?.let { message ->
        AppMessageDialog(message = message, onDismiss = onDismissMessage)
    }

    if (state.showNetworkAlert) {
        AlertDialog(
            onDismissRequest = onDismissNetworkAlert,
            confirmButton = {
                TextButton(onClick = onDismissNetworkAlert) {
                    Text("Aceptar")
                }
            },
            title = { Text("Estado de red") },
            text = {
                Text(state.networkAlertMessage ?: if (state.isOnline) "Online" else "Offline")
            }
        )
    }

    if (state.isSyncing) {
        AlertDialog(
            onDismissRequest = {},
            confirmButton = {},
            title = { Text("Sincronizando") },
            text = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                    Text(state.syncProgressMessage ?: "Sincronizando datos, por favor espera...")
                }
            }
        )
    }

    if (!state.isAuthenticated) {
        LoginSection(
            state = state,
            onEmailChanged = onEmailChanged,
            onPasswordChanged = onPasswordChanged,
            onLoginClick = onLoginClick
        )
        return
    }

    if (state.showPendingSyncAlert && state.pendingSyncTotal > 0) {
        AlertDialog(
            onDismissRequest = onDismissPendingSyncAlert,
            confirmButton = {
                TextButton(onClick = {
                    onDismissPendingSyncAlert()
                    onManualSyncClick()
                }) {
                    Text("Sincronizar ahora")
                }
            },
            dismissButton = {
                TextButton(onClick = onDismissPendingSyncAlert) {
                    Text("Cerrar")
                }
            },
            title = { Text("Pendientes de sincronizacion") },
            text = {
                Text(
                    "Estado de red: ${if (state.isOnline) "Online" else "Offline"}\n\n" +
                        "Hay ${state.pendingSyncTotal} registro(s) pendientes.\n" +
                        "Entregas: ${state.pendingSyncDeliveries}"
                )
            }
        )
    }

    if (state.showWorkersModal) {
        WorkerPickerSheet(
            workers = state.workers,
            query = state.workerPickerQuery,
            onQueryChange = onWorkerPickerQueryChanged,
            onClose = onCloseWorkersModal,
            onSelect = onWorkerSelectedFromModal
        )
    }

    if (state.showKitsModal) {
        DeliveryProductsSheet(
            state = state,
            onClose = onCloseKitsModal,
            onCaptureAndDeliverClick = onCaptureAndDeliverClick,
            onToggleDeliveryProductSelection = onToggleDeliveryProductSelection,
            onSelectAllPendingProducts = onSelectAllPendingProducts,
            onClearProductSelection = onClearProductSelection
        )
    }

    if (showQrScanner) {
        QrScannerModal(
            onDismiss = { showQrScanner = false },
            onCodeScanned = { code ->
                showQrScanner = false
                onQrCodeScanned(code)
            }
        )
    }

    Scaffold(
        floatingActionButton = {
            if (!state.showStockSummaryModal) {
                FloatingActionButton(
                    onClick = onOpenStockSummaryModal,
                    modifier = Modifier.size(62.dp),
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                    shape = RoundedCornerShape(18.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Outlined.Inventory2,
                            contentDescription = "Resumen de stock",
                            modifier = Modifier.size(25.dp)
                        )
                        Text(
                            text = "Resumen",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp)
                        )
                    }
                }
            }
        },
        floatingActionButtonPosition = FabPosition.Center,
        topBar = {
            TopAppBar(
                title = {
                    Image(
                        painter = painterResource(id = R.drawable.logo_agrokit),
                        contentDescription = "Logo AgroKit",
                        modifier = Modifier
                            .width(118.dp)
                            .height(46.dp)
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White,
                    titleContentColor = Color(0xFF064728)
                ),
                actions = {
                    IconButton(
                        onClick = {
                            if (state.pendingSyncTotal > 0) {
                                onOpenPendingSyncAlert()
                            }
                        },
                        modifier = Modifier.size(42.dp)
                    ) {
                        Icon(
                            imageVector = if (state.isOnline) Icons.Outlined.Wifi else Icons.Outlined.WifiOff,
                            contentDescription = if (state.isOnline) "Conectado" else "Sin internet",
                            tint = if (state.isOnline) Color(0xFF1B7F46) else Color(0xFFB3261E),
                            modifier = Modifier.size(23.dp)
                        )
                    }
                    IconButton(
                        onClick = onManualSyncClick,
                        enabled = !state.isSyncing,
                        modifier = Modifier.size(42.dp)
                    ) {
                        Icon(
                            Icons.Outlined.CloudSync,
                            contentDescription = "Sincronizar",
                            tint = if (state.pendingSyncTotal > 0) Color(0xFFB15A00) else Color(0xFF102219),
                            modifier = Modifier.size(23.dp)
                        )
                    }
                    IconButton(onClick = onLogoutClick, modifier = Modifier.size(42.dp)) {
                        Icon(
                            Icons.AutoMirrored.Outlined.Logout,
                            contentDescription = "Salir",
                            tint = Color(0xFF087A3A),
                            modifier = Modifier.size(23.dp)
                        )
                    }
                }
            )
        }
    ) { innerPadding ->
        if (state.showStockSummaryModal) {
            BackHandler(enabled = true) {
                onCloseStockSummaryModal()
            }
            StockSummaryScreen(
                selectedSectorId = state.selectedSectorId,
                sectors = state.sectorOptions,
                stockSummaryItems = state.stockSummaryItems,
                stockAssignedTotal = state.stockAssignedTotal,
                stockConsumedTotal = state.stockConsumedTotal,
                stockBalanceTotal = state.stockBalanceTotal,
                isLoading = state.stockSummaryLoading,
                updatedAt = state.stockSummaryUpdatedAt,
                errorMessage = state.stockSummaryError,
                onSelectSector = onSelectedSectorChanged,
                onBack = onCloseStockSummaryModal,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            )
        } else {
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .background(
                        Brush.radialGradient(
                            colors = listOf(Color(0xFFEAF5EE), Color.White),
                            radius = 960f
                        )
                    )
            ) {
                val compact = maxWidth < 430.dp || maxHeight < 760.dp
                val horizontalPadding = if (compact) 10.dp else 24.dp
                val verticalGap = if (compact) 8.dp else 14.dp

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(verticalGap),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        start = horizontalPadding,
                        end = horizontalPadding,
                        top = if (compact) 4.dp else 12.dp,
                        bottom = if (compact) 78.dp else 92.dp
                    )
                ) {
                    item {
                        EventSelectorCard(
                            activeEventId = state.activeEventId,
                            activeEventName = state.activeEventName,
                            options = state.activeEvents,
                            compact = compact,
                            onSelect = onSelectActiveEvent
                        )
                    }
                    item {
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            NetworkStatusChip(
                                isOnline = state.isOnline,
                                pendingSyncTotal = state.pendingSyncTotal,
                                onOpenPendingSyncAlert = onOpenPendingSyncAlert
                            )
                        }
                    }
                    item {
                        SectorSelectionCard(
                            sectors = state.sectorOptions,
                            selectedSectorId = state.selectedSectorId,
                            compact = compact,
                            onSelectSector = onSelectedSectorChanged
                        )
                    }
                    item {
                        DeliverySection(
                            state = state,
                            compact = compact,
                            onDniChange = onDniChange,
                            onClearDniSearch = onClearDniSearch,
                            onSearchClick = onSearchClick,
                            onOpenQrScanner = { showQrScanner = true },
                            onOpenWorkersModal = onOpenWorkersModal,
                            onOpenKitsModal = onOpenKitsModal
                        )
                    }
                    if (state.isLoading) {
                        item {
                            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator()
                            }
                        }
                    }
                }
            }
    }
}

}

@Composable
private fun AppMessageDialog(
    message: String,
    onDismiss: () -> Unit
) {
    val syncSummary = remember(message) { parseSyncSummaryMessage(message) }
    val isError = remember(message) {
        val lower = message.lowercase(Locale.getDefault())
        lower.startsWith("error") ||
            lower.contains("fallo") ||
            lower.contains("fallida") ||
            lower.contains("no se pudo") ||
            lower.contains("bloqueado")
    }
    val title = when {
        syncSummary != null -> "Sincronizacion completada"
        isError -> "Revisar accion"
        else -> "AgroKit"
    }
    val accentColor = when {
        syncSummary != null -> Color(0xFF0B6B3A)
        isError -> Color(0xFFB3261E)
        else -> Color(0xFF0B6B3A)
    }
    val icon = when {
        syncSummary != null -> Icons.Outlined.CheckCircle
        isError -> Icons.Outlined.ErrorOutline
        else -> Icons.Outlined.Info
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(30.dp)
            )
        },
        title = {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp),
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            if (syncSummary != null) {
                SyncSummaryContent(summary = syncSummary)
            } else {
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp, lineHeight = 22.sp),
                    color = Color(0xFF23322B)
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(
                    containerColor = accentColor,
                    contentColor = Color.White
                )
            ) {
                Text("Entendido")
            }
        },
        shape = RoundedCornerShape(28.dp),
        containerColor = Color(0xFFFBFDF8)
    )
}

@Composable
private fun SyncSummaryContent(summary: SyncSummaryUi) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            text = "La sincronizacion finalizo correctamente. Este es el resumen de movimientos:",
            style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp, lineHeight = 21.sp),
            color = Color(0xFF3C4A43)
        )
        SyncMetricSection(title = "Subidos", bucket = summary.uploaded, accentColor = Color(0xFF0B6B3A))
        SyncMetricSection(title = "Descargados", bucket = summary.downloaded, accentColor = Color(0xFF256D85))
    }
}

@Composable
private fun SyncMetricSection(
    title: String,
    bucket: SyncBucketUi,
    accentColor: Color
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F6F2))
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelLarge.copy(fontSize = 14.sp),
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF23322B)
                )
                Text(
                    text = "${bucket.total} total",
                    style = MaterialTheme.typography.labelMedium.copy(fontSize = 13.sp),
                    color = accentColor,
                    fontWeight = FontWeight.Bold
                )
            }
            HorizontalDivider(color = Color(0xFFDCE7E0))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SyncMetric(label = "Trab.", value = bucket.workers, modifier = Modifier.weight(1f))
                SyncMetric(label = "Kits", value = bucket.kits, modifier = Modifier.weight(1f))
                SyncMetric(label = "Entregas", value = bucket.deliveries, modifier = Modifier.weight(1f))
            }
    }
}

}

@Composable
private fun SyncMetric(
    label: String,
    value: Int,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(
            text = value.toString(),
            style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp),
            fontWeight = FontWeight.Bold,
            color = Color(0xFF102219)
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
            color = Color(0xFF607068)
        )
    }
}

private data class SyncSummaryUi(
    val uploaded: SyncBucketUi,
    val downloaded: SyncBucketUi
)

private data class SyncBucketUi(
    val workers: Int,
    val kits: Int,
    val deliveries: Int
) {
    val total: Int
        get() = workers + kits + deliveries
}

private fun parseSyncSummaryMessage(message: String): SyncSummaryUi? {
    if (!message.startsWith("Sync completado", ignoreCase = true)) return null
    val matches = Regex("""trabajadores:\s*(\d+),\s*kits:\s*(\d+),\s*entregas:\s*(\d+)""")
        .findAll(message)
        .toList()
    if (matches.size < 2) return null

    fun MatchResult.toBucket(): SyncBucketUi {
        return SyncBucketUi(
            workers = groupValues[1].toIntOrNull() ?: 0,
            kits = groupValues[2].toIntOrNull() ?: 0,
            deliveries = groupValues[3].toIntOrNull() ?: 0
        )
    }

    return SyncSummaryUi(
        uploaded = matches[0].toBucket(),
        downloaded = matches[1].toBucket()
    )
}

@Composable
private fun LoginSection(
    state: AgroKitUiState,
    onEmailChanged: (String) -> Unit,
    onPasswordChanged: (String) -> Unit,
    onLoginClick: () -> Unit
) {
    var passwordVisible by remember { mutableStateOf(false) }
    val brandGreen = Color(0xFF064728)
    val softGreen = Color(0xFFEAF4EC)
    val fieldShape = RoundedCornerShape(22.dp)

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(
                    Brush.radialGradient(
                        colors = listOf(Color(0xFFEAF5EE), Color.White),
                        radius = 980f
                    )
                )
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 28.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Image(
                    painter = painterResource(id = R.drawable.logo_agrokit),
                    contentDescription = "Logo AgroKit",
                    modifier = Modifier
                        .size(164.dp)
                        .padding(bottom = 18.dp)
                )

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(30.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xF8FFFFFF)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 10.dp),
                    border = BorderStroke(1.dp, Color(0xFFE0E7E2))
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 24.dp, vertical = 28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(18.dp)
                    ) {
                        Text(
                            text = "Login",
                            style = MaterialTheme.typography.headlineSmall.copy(fontSize = 30.sp),
                            fontWeight = FontWeight.Bold,
                            color = brandGreen
                        )

                        OutlinedTextField(
                            modifier = Modifier.fillMaxWidth(),
                            value = state.emailInput,
                            onValueChange = onEmailChanged,
                            placeholder = { Text("Correo", color = Color(0xFF8A9390)) },
                            singleLine = true,
                            shape = fieldShape,
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Outlined.Email,
                                    contentDescription = null,
                                    tint = brandGreen
                                )
                            },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = brandGreen,
                                unfocusedBorderColor = Color(0xFFD7DDD9),
                                focusedContainerColor = Color.White,
                                unfocusedContainerColor = Color.White,
                                cursorColor = brandGreen,
                                focusedTextColor = Color(0xFF102219),
                                unfocusedTextColor = Color(0xFF102219)
                            )
                        )

                        OutlinedTextField(
                            modifier = Modifier.fillMaxWidth(),
                            value = state.passwordInput,
                            onValueChange = onPasswordChanged,
                            placeholder = { Text("Contrasena", color = Color(0xFF8A9390)) },
                            singleLine = true,
                            shape = fieldShape,
                            visualTransformation = if (passwordVisible) {
                                VisualTransformation.None
                            } else {
                                PasswordVisualTransformation()
                            },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Outlined.Lock,
                                    contentDescription = null,
                                    tint = brandGreen
                                )
                            },
                            trailingIcon = {
                                IconButton(
                                    onClick = { passwordVisible = !passwordVisible },
                                    modifier = Modifier.size(44.dp)
                                ) {
                                    Icon(
                                        imageVector = if (passwordVisible) {
                                            Icons.Outlined.VisibilityOff
                                        } else {
                                            Icons.Outlined.Visibility
                                        },
                                        contentDescription = if (passwordVisible) {
                                            "Ocultar contrasena"
                                        } else {
                                            "Mostrar contrasena"
                                        },
                                        tint = brandGreen
                                    )
                                }
                            },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = brandGreen,
                                unfocusedBorderColor = Color(0xFFD7DDD9),
                                focusedContainerColor = Color.White,
                                unfocusedContainerColor = Color.White,
                                cursorColor = brandGreen,
                                focusedTextColor = Color(0xFF102219),
                                unfocusedTextColor = Color(0xFF102219)
                            )
                        )

                        Button(
                            onClick = onLoginClick,
                            enabled = !state.isLoading,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 56.dp),
                            shape = RoundedCornerShape(28.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = brandGreen,
                                contentColor = Color.White,
                                disabledContainerColor = softGreen,
                                disabledContentColor = Color(0xFF6A756F)
                            ),
                            elevation = ButtonDefaults.buttonElevation(defaultElevation = 8.dp)
                        ) {
                            if (state.isLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.dp,
                                    color = Color.White
                                )
                            } else {
                                Text(
                                    "Iniciar sesion",
                                    style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp),
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }

                        Text(
                            text = "Acceso usuario PDA",
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp),
                            color = Color(0xFF68766F)
                        )
                    }
                }

                if (state.isLoading) {
                    Text(
                        text = "Validando credenciales...",
                        modifier = Modifier.padding(top = 14.dp),
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp),
                        color = Color(0xFF68766F)
                    )
                }
            }
    }
}
}

@Composable
private fun DeliverySection(
    state: AgroKitUiState,
    compact: Boolean = false,
    onDniChange: (String) -> Unit,
    onClearDniSearch: () -> Unit,
    onSearchClick: () -> Unit,
    onOpenQrScanner: () -> Unit,
    onOpenWorkersModal: () -> Unit,
    onOpenKitsModal: () -> Unit
) {
    val now = System.currentTimeMillis()
    val windowInRange = !state.deliveryWindowEnabled ||
        state.deliveryWindowStartAt == null ||
        state.deliveryWindowEndAt == null ||
        now in state.deliveryWindowStartAt..state.deliveryWindowEndAt

    val pendingProductCount = state.kits.sumOf { kit ->
        kit.products.count { it.pendingQuantity > 0.000001 }
    }

    val deliverDisabledReason = when {
        state.workerFound == null -> "Selecciona trabajador primero"
        state.kits.isEmpty() -> "Este trabajador no tiene productos para entregar"
        pendingProductCount == 0 -> "No hay productos pendientes para entregar"
        else -> null
    }

    val dniError = state.dniInput.isNotEmpty() && state.dniInput.length < 8
    val activeGreen = Color(0xFF087A3A)
    val cardPadding = if (compact) 12.dp else 18.dp
    val titleSize = if (compact) 19.sp else 23.sp
    val fieldHeight = if (compact) 52.dp else 60.dp

    Card(
        modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(if (compact) 20.dp else 24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFBFFFFFF)),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        border = BorderStroke(1.dp, Color(0xFFE2E9E4))
    ) {
        Column(
            modifier = Modifier.padding(cardPadding),
            verticalArrangement = Arrangement.spacedBy(if (compact) 9.dp else 14.dp)
        ) {
        Text(
            text = "Validacion y entrega por producto",
            style = MaterialTheme.typography.headlineSmall.copy(
                fontSize = titleSize,
                fontWeight = FontWeight.Bold
            ),
            color = Color(0xFF102219)
        )

        if (state.deliveryWindowEnabled) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (windowInRange) Color(0xFFEAF5EE) else Color(0xFFFDECEC)
                )
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = if (compact) 8.dp else 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = if (windowInRange) Icons.Outlined.CheckCircle else Icons.Outlined.ErrorOutline,
                        contentDescription = null,
                        tint = if (windowInRange) activeGreen else Color(0xFF9F1D1D),
                        modifier = Modifier.size(if (compact) 20.dp else 24.dp)
                    )
                    Text(
                        text = if (windowInRange) {
                            "Rango de registro vigente"
                        } else {
                            "Rango fuera de fecha. Entregas bloqueadas."
                        },
                        color = if (windowInRange) activeGreen else Color(0xFF9F1D1D),
                        style = MaterialTheme.typography.bodyMedium.copy(fontSize = if (compact) 13.sp else 16.sp),
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }

        OutlinedTextField(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = fieldHeight),
            value = state.dniInput,
            onValueChange = onDniChange,
            placeholder = { Text("DNI", color = Color(0xFF8A9390)) },
            isError = dniError,
            singleLine = true,
            shape = RoundedCornerShape(18.dp),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Search
            ),
            keyboardActions = KeyboardActions(onSearch = { onSearchClick() }),
            leadingIcon = {
                Icon(
                    Icons.Outlined.Search,
                    contentDescription = "Buscar DNI",
                    tint = if (dniError) MaterialTheme.colorScheme.error else Color(0xFF8A9390),
                    modifier = Modifier.size(if (compact) 24.dp else 28.dp)
                )
            },
            trailingIcon = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onOpenQrScanner, modifier = Modifier.size(if (compact) 40.dp else 44.dp)) {
                        Icon(
                            Icons.Outlined.CameraAlt,
                            contentDescription = "Escanear QR",
                            tint = activeGreen,
                            modifier = Modifier.size(if (compact) 22.dp else 24.dp)
                        )
                    }
                    if (state.dniInput.isNotBlank()) {
                        IconButton(onClick = onClearDniSearch, modifier = Modifier.size(if (compact) 36.dp else 42.dp)) {
                            Icon(
                                Icons.Outlined.Clear,
                                contentDescription = "Limpiar DNI",
                                modifier = Modifier.size(if (compact) 20.dp else 22.dp)
                            )
                        }
                    }
                }
            },
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = activeGreen,
                unfocusedBorderColor = activeGreen,
                errorBorderColor = MaterialTheme.colorScheme.error,
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                cursorColor = activeGreen,
                focusedTextColor = Color(0xFF102219),
                unfocusedTextColor = Color(0xFF102219)
            ),
            supportingText = {
                Text(
                    text = "Formato: 8 digitos",
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = if (compact) 12.sp else 14.sp),
                    color = if (dniError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = onOpenWorkersModal,
                modifier = Modifier.weight(1f).heightIn(min = if (compact) 48.dp else 56.dp),
                shape = RoundedCornerShape(if (compact) 16.dp else 18.dp),
                border = BorderStroke(1.dp, activeGreen),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = activeGreen)
            ) {
                Icon(Icons.Outlined.Group, contentDescription = null, modifier = Modifier.size(if (compact) 20.dp else 24.dp))
                Text(
                    if (compact) " Trab." else " Trabajadores",
                    style = MaterialTheme.typography.bodyLarge.copy(fontSize = if (compact) 14.sp else 16.sp),
                    fontWeight = FontWeight.Bold
                )
            }
            Button(
                onClick = onOpenKitsModal,
                modifier = Modifier.weight(1f).heightIn(min = if (compact) 48.dp else 56.dp),
                enabled = deliverDisabledReason == null,
                shape = RoundedCornerShape(if (compact) 16.dp else 18.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = activeGreen,
                    disabledContainerColor = DisabledButtonContainer,
                    disabledContentColor = DisabledButtonContent
                )
            ) {
                Icon(Icons.Outlined.Category, contentDescription = null, modifier = Modifier.size(if (compact) 20.dp else 24.dp))
                Text(
                    " Entregar",
                    style = MaterialTheme.typography.bodyLarge.copy(fontSize = if (compact) 14.sp else 16.sp),
                    fontWeight = FontWeight.Bold
                )
            }
        }

        if (deliverDisabledReason != null) {
            HorizontalDivider(color = Color(0xFFDDE5DF))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Outlined.Info, contentDescription = null, tint = activeGreen, modifier = Modifier.size(if (compact) 18.dp else 22.dp))
                Text(
                    text = deliverDisabledReason,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = if (compact) 12.sp else 15.sp),
                    color = Color(0xFF6A756F)
                )
            }
        }

        state.workerFound?.let { worker ->
            UnifiedCard(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = worker.fullName,
                    style = MaterialTheme.typography.titleMedium.copy(fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                )
                Text("DNI: ${worker.dni}", style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp))
                Text("Area: ${worker.area}", style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp))
                Text("Gerencia: ${worker.costCenter}", style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp))
                Text(
                    "Sector: ${worker.sectorName.ifBlank { worker.sectorId.ifBlank { "-" } }}",
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp)
                )
                state.lastDeliverySummary?.let { summary ->
                    Text(
                        "Ultima entrega: ${formatUiTimestamp(summary.timestamp)} | Sector: ${summary.sectorLabel} | Entrego: ${summary.deliveredByLabel}",
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp),
                        color = Color(0xFF145A34)
                    )
                }
            }
        }
    }
}

}

@Composable
private fun EventSelectorCard(
    activeEventId: String,
    activeEventName: String,
    options: List<EventOptionUi>,
    compact: Boolean = false,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = if (activeEventName.isNotBlank()) activeEventName else activeEventId
    val brandGreen = Color(0xFF064728)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(if (compact) 18.dp else 24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFBFFFFFF)),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        border = BorderStroke(1.dp, Color(0xFFE2E9E4))
    ) {
        Column(
            modifier = Modifier.padding(if (compact) 10.dp else 18.dp),
            verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 12.dp)
        ) {
        Text(
            text = "Evento vigente",
            style = MaterialTheme.typography.bodyMedium.copy(
                fontSize = if (compact) 14.sp else 18.sp,
                fontWeight = FontWeight.Bold
            ),
            color = Color(0xFF102219)
        )

        Box {
            Button(
                onClick = { expanded = true },
                enabled = options.isNotEmpty(),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = if (compact) 56.dp else 76.dp),
                shape = RoundedCornerShape(if (compact) 16.dp else 18.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF07813C), contentColor = Color.White),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 5.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(if (compact) 10.dp else 14.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(if (compact) 38.dp else 56.dp)
                            .background(Color.White, RoundedCornerShape(if (compact) 12.dp else 16.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Outlined.DateRange,
                            contentDescription = null,
                            tint = brandGreen,
                            modifier = Modifier.size(if (compact) 22.dp else 24.dp)
                        )
                    }
                    Text(
                        text = if (selectedLabel.isNotBlank()) selectedLabel else "Seleccionar evento",
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyLarge.copy(fontSize = if (compact) 16.sp else 21.sp),
                        fontWeight = FontWeight.Bold
                    )
                    if (options.size > 1) {
                        Icon(Icons.Outlined.ArrowDropDown, contentDescription = null, tint = Color.White)
                    }
                }
            }
            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                options.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option.name.ifBlank { option.id }) },
                        onClick = {
                            expanded = false
                            onSelect(option.id)
                        }
                    )
                }
            }
        }
    }
}
}

@Composable
private fun NetworkStatusChip(
    isOnline: Boolean,
    pendingSyncTotal: Int,
    onOpenPendingSyncAlert: () -> Unit
) {
    val chipContainer = if (isOnline) Color(0xFFE9F6EE) else Color(0xFFFDECEC)
    val chipContent = if (isOnline) Color(0xFF145A34) else Color(0xFF9F1D1D)

    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = chipContainer),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        border = BorderStroke(1.dp, chipContent.copy(alpha = 0.12f)),
        onClick = {
            if (pendingSyncTotal > 0) onOpenPendingSyncAlert()
        }
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = Icons.Outlined.CloudSync,
                contentDescription = null,
                tint = chipContent,
                modifier = Modifier.size(22.dp)
            )
            Text(
                text = "Pendientes de Sincronizacion: $pendingSyncTotal",
                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp),
                fontWeight = FontWeight.Bold,
                color = chipContent
            )
        }
    }
}

@Composable
private fun SectorSelectionCard(
    sectors: List<SectorOptionUi>,
    selectedSectorId: String,
    compact: Boolean = false,
    onSelectSector: (String) -> Unit
) {
    if (sectors.isEmpty()) return
    val brandGreen = Color(0xFF064728)

    if (sectors.size == 1) {
        val sector = sectors.first()
        StockSectorSelectorCard(
            sectors = sectors,
            selectedSectorId = sector.id,
            selectedSectorLabel = sector.label,
            compact = compact,
            onSelectSector = onSelectSector
        )
        return
    }

    var expanded by remember { mutableStateOf(false) }
    val selected = sectors.firstOrNull { it.id == selectedSectorId } ?: sectors.first()

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(if (compact) 18.dp else 24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFBFFFFFF)),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        border = BorderStroke(1.dp, Color(0xFFE2E9E4))
    ) {
        Column(
            modifier = Modifier.padding(if (compact) 10.dp else 18.dp),
            verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 12.dp)
        ) {
        Text(
            text = "Sector de entrega",
            style = MaterialTheme.typography.bodyMedium.copy(
                fontSize = if (compact) 15.sp else 19.sp,
                fontWeight = FontWeight.Bold
            ),
            color = Color(0xFF102219)
        )
        Box {
            OutlinedButton(
                onClick = { expanded = true },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = if (compact) 50.dp else 64.dp),
                shape = RoundedCornerShape(if (compact) 15.dp else 18.dp),
                border = BorderStroke(1.dp, Color(0xFF087A3A)),
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = Color.White,
                    contentColor = Color(0xFF102219)
                )
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Outlined.LocationOn,
                        contentDescription = null,
                        tint = brandGreen,
                        modifier = Modifier.size(if (compact) 23.dp else 30.dp)
                    )
                    Text(
                        text = selected.label,
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 12.dp),
                        style = MaterialTheme.typography.bodyLarge.copy(fontSize = if (compact) 16.sp else 20.sp),
                        color = Color(0xFF102219)
                    )
                    Icon(Icons.Outlined.ArrowDropDown, contentDescription = null, tint = Color(0xFF087A3A))
                }
            }
            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                sectors.forEach { sector ->
                    DropdownMenuItem(
                        text = { Text(sector.label) },
                        onClick = {
                            expanded = false
                            onSelectSector(sector.id)
                        }
                    )
                }
            }
        }
    }
    }
}

@Composable
private fun QrScannerModal(
    onDismiss: () -> Unit,
    onCodeScanned: (String) -> Unit
) {
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Escanear QR de fotocheck",
                style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp),
                fontWeight = FontWeight.Bold,
                color = Color(0xFF102219)
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
            Text(
                text = "Enfoca el codigo QR. Al detectarlo, se buscara el DNI automaticamente.",
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp),
                color = Color(0xFF5C6A63)
            )

            if (hasCameraPermission) {
                QrCameraPreview(onCodeScanned = onCodeScanned)
            } else {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF4E5))
                ) {
                    Text(
                        modifier = Modifier.padding(14.dp),
                        text = "Se requiere permiso de camara para escanear el QR.",
                        style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp),
                        color = Color(0xFF6C4A00)
                    )
                }
            }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        },
        shape = RoundedCornerShape(24.dp),
        containerColor = Color(0xFFFBFDF8)
    )
        }

@Composable
private fun QrCameraPreview(onCodeScanned: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnCodeScanned by rememberUpdatedState(onCodeScanned)
    val didScan = remember { AtomicBoolean(false) }
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val mainExecutor = remember(context) { ContextCompat.getMainExecutor(context) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var flashEnabled by remember { mutableStateOf(false) }
    val hasFlash = camera?.cameraInfo?.hasFlashUnit() == true
    val previewShape = RoundedCornerShape(18.dp)
    val scanner = remember {
        MultiFormatReader().apply {
            setHints(
                EnumMap<DecodeHintType, Any>(DecodeHintType::class.java).apply {
                    put(DecodeHintType.POSSIBLE_FORMATS, listOf(BarcodeFormat.QR_CODE))
                    put(DecodeHintType.TRY_HARDER, true)
                }
            )
        }
    }
    val cameraProviderFuture = remember(context) { ProcessCameraProvider.getInstance(context) }

    LaunchedEffect(camera, flashEnabled) {
        camera?.cameraControl?.enableTorch(flashEnabled)
    }

    DisposableEffect(Unit) {
        onDispose {
            runCatching { camera?.cameraControl?.enableTorch(false) }
            runCatching { cameraProviderFuture.get().unbindAll() }
            scanner.reset()
            analysisExecutor.shutdown()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(if (context.resources.configuration.screenHeightDp < 700) 220.dp else 280.dp)
            .clip(previewShape)
            .background(Color(0xFF102219), previewShape)
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { viewContext ->
                PreviewView(viewContext).apply {
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                    cameraProviderFuture.addListener(
                        {
                            val cameraProvider = cameraProviderFuture.get()
                            val preview = Preview.Builder().build().also { preview ->
                                preview.setSurfaceProvider(surfaceProvider)
                            }
                            val imageAnalysis = ImageAnalysis.Builder()
                                .setResolutionSelector(
                                    ResolutionSelector.Builder()
                                        .setResolutionStrategy(
                                            ResolutionStrategy(
                                                Size(1280, 720),
                                                ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER
                                            )
                                        )
                                        .build()
                                )
                                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                .build()
                                .also { analysis ->
                                    analysis.setAnalyzer(analysisExecutor) { imageProxy ->
                                        analyzeQrImageProxy(
                                            imageProxy = imageProxy,
                                            scanner = scanner,
                                            didScan = didScan,
                                            mainExecutor = mainExecutor,
                                            onCodeScanned = currentOnCodeScanned
                                        )
                                    }
                                }

                            runCatching {
                                cameraProvider.unbindAll()
                                camera = cameraProvider.bindToLifecycle(
                                    lifecycleOwner,
                                    CameraSelector.DEFAULT_BACK_CAMERA,
                                    preview,
                                    imageAnalysis
                                )
                            }
                        },
                        mainExecutor
                    )
                }
            }
        )
        IconButton(
            onClick = { flashEnabled = !flashEnabled },
            enabled = hasFlash,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(10.dp)
                .size(42.dp)
                .background(Color.Black.copy(alpha = 0.52f), RoundedCornerShape(21.dp))
        ) {
            Icon(
                imageVector = if (flashEnabled) Icons.Outlined.FlashOff else Icons.Outlined.FlashOn,
                contentDescription = if (flashEnabled) "Apagar flash" else "Activar flash",
                tint = if (hasFlash) Color.White else Color.White.copy(alpha = 0.38f),
                modifier = Modifier.size(23.dp)
            )
        }
    }
}

private fun analyzeQrImageProxy(
    imageProxy: ImageProxy,
    scanner: MultiFormatReader,
    didScan: AtomicBoolean,
    mainExecutor: Executor,
    onCodeScanned: (String) -> Unit
) {
    if (didScan.get()) {
        imageProxy.close()
        return
    }

    try {
        val frame = imageProxy.toLuminanceFrame() ?: return
        val rawValue = decodeQrFrame(
            scanner = scanner,
            data = frame.data,
            width = frame.width,
            height = frame.height,
            preferredRotation = imageProxy.imageInfo.rotationDegrees
        )
        if (!rawValue.isNullOrBlank() && didScan.compareAndSet(false, true)) {
            mainExecutor.execute { onCodeScanned(rawValue) }
        }
    } catch (_: RuntimeException) {
        scanner.reset()
    } finally {
        imageProxy.close()
    }
}

private data class LuminanceFrame(
    val data: ByteArray,
    val width: Int,
    val height: Int
)

private fun ImageProxy.toLuminanceFrame(): LuminanceFrame? {
    val yPlane = planes.firstOrNull() ?: return null
    val buffer = yPlane.buffer
    val rowStride = yPlane.rowStride
    val pixelStride = yPlane.pixelStride
    val width = width
    val height = height
    val data = ByteArray(width * height)

    for (row in 0 until height) {
        for (col in 0 until width) {
            data[row * width + col] = buffer.get(row * rowStride + col * pixelStride)
        }
    }

    return LuminanceFrame(data = data, width = width, height = height)
}

private fun decodeQrFrame(
    scanner: MultiFormatReader,
    data: ByteArray,
    width: Int,
    height: Int,
    preferredRotation: Int
): String? {
    val rotations = buildList {
        add(normalizeRotation(preferredRotation))
        add(0)
        add(90)
        add(180)
        add(270)
    }.distinct()

    for (rotation in rotations) {
        val rotated = rotateLuminance(data = data, width = width, height = height, rotation = rotation)
        val result = decodeQrBitmap(scanner = scanner, frame = rotated)
        if (!result.isNullOrBlank()) return result
    }

    return null
}

private fun decodeQrBitmap(scanner: MultiFormatReader, frame: LuminanceFrame): String? {
    return try {
        val source = PlanarYUVLuminanceSource(
            frame.data,
            frame.width,
            frame.height,
            0,
            0,
            frame.width,
            frame.height,
            false
        )
        scanner.decodeWithState(BinaryBitmap(HybridBinarizer(source))).text
    } catch (_: NotFoundException) {
        null
    } catch (_: ReaderException) {
        null
    } finally {
        scanner.reset()
    }
}

private fun normalizeRotation(rotation: Int): Int {
    return when (((rotation % 360) + 360) % 360) {
        90 -> 90
        180 -> 180
        270 -> 270
        else -> 0
    }
}

private fun rotateLuminance(
    data: ByteArray,
    width: Int,
    height: Int,
    rotation: Int
): LuminanceFrame {
    return when (rotation) {
        90 -> {
            val rotated = ByteArray(data.size)
            for (y in 0 until height) {
                for (x in 0 until width) {
                    rotated[x * height + (height - y - 1)] = data[y * width + x]
                }
            }
            LuminanceFrame(rotated, height, width)
        }
        180 -> {
            val rotated = ByteArray(data.size)
            for (i in data.indices) {
                rotated[data.lastIndex - i] = data[i]
            }
            LuminanceFrame(rotated, width, height)
        }
        270 -> {
            val rotated = ByteArray(data.size)
            for (y in 0 until height) {
                for (x in 0 until width) {
                    rotated[(width - x - 1) * height + y] = data[y * width + x]
                }
            }
            LuminanceFrame(rotated, height, width)
        }
        else -> LuminanceFrame(data, width, height)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkerPickerSheet(
    workers: List<WorkerUi>,
    query: String,
    onQueryChange: (String) -> Unit,
    onClose: () -> Unit,
    onSelect: (String) -> Unit
) {
    val filteredWorkers = remember(workers, query) {
        workers.filter { worker ->
            query.isBlank() ||
                worker.dni.contains(query, ignoreCase = true) ||
                worker.fullName.contains(query, ignoreCase = true)
        }
    }

    ModalBottomSheet(onDismissRequest = onClose) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "Trabajadores",
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp),
                fontWeight = FontWeight.SemiBold
            )

            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = query,
                onValueChange = onQueryChange,
                label = { Text("Buscar por DNI o nombre") },
                singleLine = true,
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) }
            )

            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 460.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(filteredWorkers, key = { it.dni }) { worker ->
                    UnifiedCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(worker.fullName, fontWeight = FontWeight.Medium)
                                Text("DNI: ${worker.dni}", style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp))
                                Text("${worker.area} - Gerencia: ${worker.costCenter}", style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp))
                            }
                            Button(
                                onClick = { onSelect(worker.dni) },
                                modifier = Modifier.heightIn(min = 48.dp)
                            ) {
                                Text("Abrir")
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DeliveryProductsSheet(
    state: AgroKitUiState,
    onClose: () -> Unit,
    onCaptureAndDeliverClick: (List<DeliveryCaptureItemUi>) -> Unit,
    onToggleDeliveryProductSelection: (String, String, Boolean) -> Unit,
    onSelectAllPendingProducts: () -> Unit,
    onClearProductSelection: () -> Unit
) {
    ModalBottomSheet(onDismissRequest = onClose) {
        val pendingCount = state.kits.sumOf { kit -> kit.products.count { it.pendingQuantity > 0.000001 } }
        val totalSelectedUnits = state.selectedProducts.sumOf { it.quantity }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "Entrega por producto",
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp),
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "Pendientes: $pendingCount | Seleccionados: ${state.selectedProducts.size} | Cantidad: ${formatQty(totalSelectedUnits)}",
                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp)
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onSelectAllPendingProducts) {
                    Text("Seleccionar pendientes")
                }
                TextButton(onClick = onClearProductSelection) {
                    Text("Limpiar")
                }
            }

            Button(
                onClick = { onCaptureAndDeliverClick(state.selectedProducts.map(SelectedDeliveryProductUi::toCaptureItem)) },
                enabled = state.selectedProducts.isNotEmpty(),
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                colors = ButtonDefaults.buttonColors(
                    disabledContainerColor = DisabledButtonContainer,
                    disabledContentColor = DisabledButtonContent
                )
            ) {
                Icon(Icons.Outlined.CameraAlt, contentDescription = null)
                Text(" Foto + Entregar seleccion")
            }

            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 520.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(state.kits, key = { it.id }) { kit ->
                    UnifiedCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(kit.name, fontWeight = FontWeight.SemiBold)
                                Text(
                                    "Avance: ${kit.deliveredProducts}/${kit.totalProducts}",
                                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp)
                                )
                            }
                            if (kit.delivered) {
                                Text("Completo")
                            } else {
                                TextButton(
                                    onClick = {
                                        val pending = kit.products
                                            .mapNotNull { product ->
                                                val pendingQty = product.pendingQuantity.coerceAtLeast(0.0)
                                                if (pendingQty <= 0.000001) return@mapNotNull null
                                                DeliveryCaptureItemUi(
                                                    kitId = kit.id,
                                                    productId = product.id,
                                                    productName = product.name,
                                                    quantity = pendingQty
                                                )
                                            }
                                        onCaptureAndDeliverClick(pending)
                                    }
                                ) {
                                    Text("Foto + kit")
                                }
                            }
                        }

                        kit.products.forEach { product ->
                            val productKey = "${kit.id}::${product.id}"
                            val selected = state.selectedProducts.any { it.productKey == productKey }
                            val pendingQuantity = product.pendingQuantity.coerceAtLeast(0.0)

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(product.name, fontWeight = FontWeight.Medium)
                                    Text(
                                        "Req: ${formatQty(product.requiredQuantity)} | Entregado: ${formatQty(product.deliveredQuantity)} | Pendiente: ${formatQty(product.pendingQuantity)}",
                                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp)
                                    )
                                    if (product.deliveredQuantity > 0.000001 && product.latestDeliveryTimestamp != null) {
                                        Text(
                                            "Ult. entrega: ${formatUiTimestamp(product.latestDeliveryTimestamp)} | Sector: ${product.latestDeliverySectorLabel.ifBlank { "-" }} | Entrego: ${product.latestDeliveredByLabel.ifBlank { "-" }}",
                                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                                            color = Color(0xFF145A34)
                                        )
                                    }
                                }
                                if (pendingQuantity <= 0.000001) {
                                    Text("OK")
                                }
                            }

                            if (pendingQuantity > 0.000001) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = if (selected) {
                                            "Seleccionado: se entregara ${formatQty(pendingQuantity)}"
                                        } else {
                                            "Seleccionar producto (entrega ${formatQty(pendingQuantity)})"
                                        },
                                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp)
                                    )
                                    Checkbox(
                                        checked = selected,
                                        onCheckedChange = { checked ->
                                            onToggleDeliveryProductSelection(kit.id, product.id, checked)
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StockSummaryScreen(
    selectedSectorId: String,
    sectors: List<SectorOptionUi>,
    stockSummaryItems: List<StockSummaryItemUi>,
    stockAssignedTotal: Double,
    stockConsumedTotal: Double,
    stockBalanceTotal: Double,
    isLoading: Boolean,
    updatedAt: Long?,
    errorMessage: String?,
    onSelectSector: (String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val selectedSectorLabel = sectors.firstOrNull { it.id == selectedSectorId }?.label
        ?: selectedSectorId.ifBlank { "Todas las sedes" }
    val brandGreen = Color(0xFF064728)

    Box(
        modifier = modifier
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFFEAF5EE), Color.White),
                    radius = 980f
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                IconButton(
                    onClick = onBack,
                    modifier = Modifier
                        .size(46.dp)
                        .background(Color(0xFFEAF5EE), RoundedCornerShape(16.dp))
                ) {
                    Icon(
                        Icons.AutoMirrored.Outlined.ArrowBack,
                        contentDescription = "Volver",
                        tint = brandGreen,
                        modifier = Modifier.size(24.dp)
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Resumen de stock y consumo",
                        style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp),
                        fontWeight = FontWeight.Bold,
                        color = brandGreen
                    )
                    if (updatedAt != null) {
                        Row(
                            modifier = Modifier.padding(top = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.CloudSync,
                                contentDescription = null,
                                tint = Color(0xFF16823A),
                                modifier = Modifier.size(17.dp)
                            )
                            Text(
                                text = "Actualizado: ${formatUiTimestamp(updatedAt)}",
                                style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp),
                                color = Color(0xFF6A756F)
                            )
                        }
                    }
                }
            }

            StockSectorSelectorCard(
                sectors = sectors,
                selectedSectorId = selectedSectorId,
                selectedSectorLabel = selectedSectorLabel,
                onSelectSector = onSelectSector
            )

            StockTotalsCard(
                assigned = stockAssignedTotal,
                consumed = stockConsumedTotal,
                balance = stockBalanceTotal
            )

            if (!errorMessage.isNullOrBlank()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF1F1)),
                    border = BorderStroke(1.dp, Color(0xFFFFD0D0))
                ) {
                    Text(
                        modifier = Modifier.padding(12.dp),
                        text = errorMessage,
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp),
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }

            if (isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 18.dp),
                    contentAlignment = Alignment.Center
                )
                {
                    CircularProgressIndicator(color = brandGreen)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(stockSummaryItems, key = { it.productCode }) { item ->
                        StockProductSummaryCard(item = item)
                    }
                }
            }
    }
}
}

@Composable
private fun StockSectorSelectorCard(
    sectors: List<SectorOptionUi>,
    selectedSectorId: String,
    selectedSectorLabel: String,
    compact: Boolean = false,
    onSelectSector: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val brandGreen = Color(0xFF064728)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(if (compact) 18.dp else 22.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFBFFFFFF)),
        elevation = CardDefaults.cardElevation(defaultElevation = 5.dp),
        border = BorderStroke(1.dp, Color(0xFFE0E7E2))
    ) {
        Column(
            modifier = Modifier.padding(if (compact) 10.dp else 14.dp),
            verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(if (compact) 32.dp else 40.dp)
                        .background(Color(0xFFE3F2E6), RoundedCornerShape(if (compact) 12.dp else 16.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Outlined.LocationOn, contentDescription = null, tint = brandGreen)
                }
                Text(
                    text = "Sector de entrega",
                    style = MaterialTheme.typography.titleMedium.copy(fontSize = if (compact) 14.sp else 16.sp),
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF102219)
                )
            }

            Box(modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(
                    onClick = { expanded = true },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = if (compact) 48.dp else 52.dp),
                    shape = RoundedCornerShape(if (compact) 15.dp else 20.dp),
                    border = BorderStroke(1.dp, Color(0xFF16823A)),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = Color.White,
                        contentColor = Color(0xFF102219)
                    )
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Outlined.LocationOn,
                            contentDescription = null,
                            tint = brandGreen,
                            modifier = Modifier.size(if (compact) 22.dp else 24.dp)
                        )
                        Text(
                            text = selectedSectorLabel,
                            modifier = Modifier
                                .weight(1f)
                                .padding(horizontal = 10.dp),
                            style = MaterialTheme.typography.bodyLarge.copy(fontSize = if (compact) 16.sp else 17.sp),
                            color = Color(0xFF102219)
                        )
                        Icon(Icons.Outlined.ArrowDropDown, contentDescription = null, tint = Color(0xFF102219))
                    }
                }
                DropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { expanded = false }
                ) {
                    sectors.forEach { sector ->
                        DropdownMenuItem(
                            text = { Text(sector.label) },
                            onClick = {
                                expanded = false
                                if (sector.id != selectedSectorId) onSelectSector(sector.id)
                            }
                        )
                    }
                }
            }
        }
        }
    }

@Composable
private fun StockTotalsCard(
    assigned: Double,
    consumed: Double,
    balance: Double
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFBFFFFFF)),
        elevation = CardDefaults.cardElevation(defaultElevation = 5.dp),
        border = BorderStroke(1.dp, Color(0xFFE0E7E2))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            StockTotalMetric(
                icon = Icons.Outlined.Inventory2,
                label = "Stock asignado",
                value = assigned,
                modifier = Modifier.weight(1f)
            )
            StockVerticalDivider()
            StockTotalMetric(
                icon = Icons.Outlined.LocalShipping,
                label = "Consumo",
                value = consumed,
                modifier = Modifier.weight(1f)
            )
            StockVerticalDivider()
            StockTotalMetric(
                icon = Icons.Outlined.CheckCircle,
                label = "Saldo",
                value = balance,
                modifier = Modifier.weight(1f),
                valueColor = if (balance >= 0.0) Color(0xFF0D8C3A) else Color(0xFFB3261E)
            )
        }
    }
}

@Composable
private fun StockTotalMetric(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: Double,
    modifier: Modifier = Modifier,
    valueColor: Color = Color(0xFF0D8C3A)
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Box(
            modifier = Modifier
                .size(50.dp)
                .background(Color(0xFFE3F2E6), RoundedCornerShape(25.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = Color(0xFF0B6B3A), modifier = Modifier.size(28.dp))
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium.copy(fontSize = 12.sp),
            color = Color(0xFF102219)
        )
        Text(
            text = formatQty(value),
            style = MaterialTheme.typography.headlineSmall.copy(fontSize = 30.sp),
            fontWeight = FontWeight.Bold,
            color = valueColor
        )
    }
}

@Composable
private fun StockVerticalDivider() {
    Box(
        modifier = Modifier
            .size(width = 1.dp, height = 84.dp)
            .background(Color(0xFFDDE5DF))
    )
}

@Composable
private fun StockProductSummaryCard(item: StockSummaryItemUi) {
    val balanceColor = if (item.balanceStock >= 0.0) Color(0xFF0D8C3A) else Color(0xFFB3261E)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFBFFFFFF)),
        elevation = CardDefaults.cardElevation(defaultElevation = 5.dp),
        border = BorderStroke(1.dp, Color(0xFFE0E7E2))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(82.dp)
                    .background(Color(0xFFE3F2E6), RoundedCornerShape(41.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Outlined.Category,
                    contentDescription = null,
                    tint = Color(0xFF0B6B3A),
                    modifier = Modifier.size(44.dp)
                )
            }
            Box(
                modifier = Modifier
                    .size(width = 1.dp, height = 104.dp)
                    .background(Color(0xFFDDE5DF))
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = item.productName,
                    style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp),
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF102219)
                )
                StockProductLine(label = "Stock asignado:", value = item.assignedStock)
                HorizontalDivider(color = Color(0xFFE1E6E2))
                StockProductLine(label = "Consumo:", value = item.consumedStock)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFEAF5EE), RoundedCornerShape(10.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Saldo:",
                        style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp),
                        fontWeight = FontWeight.Bold,
                        color = balanceColor
                    )
                    Text(
                        text = formatQty(item.balanceStock),
                        style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp),
                        fontWeight = FontWeight.Bold,
                        color = balanceColor
                    )
                }
            }
        }
        }
    }

@Composable
private fun StockProductLine(label: String, value: Double) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(7.dp)
                    .background(Color(0xFF16823A), RoundedCornerShape(4.dp))
            )
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp),
                color = Color(0xFF24342B)
            )
        }
        Text(
            text = formatQty(value),
            style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp),
            color = Color(0xFF102219)
        )
    }
}

@Composable
private fun UnifiedCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier,
        shape = AppCardShape,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            content = content
        )
    }
}

private fun formatQty(value: Double): String {
    return if (kotlin.math.abs(value - value.toInt().toDouble()) < 0.000001) {
        value.toInt().toString()
    } else {
        String.format(Locale.US, "%.2f", value)
    }
}

private fun formatUiTimestamp(value: Long): String {
    if (value <= 0L) return "-"
    val formatter = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())
    return formatter.format(Date(value))
}
