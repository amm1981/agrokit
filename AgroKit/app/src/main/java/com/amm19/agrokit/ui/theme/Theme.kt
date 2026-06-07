package com.amm19.agrokit.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = SeedGreenDark,
    secondary = FieldGreenDark,
    tertiary = SkyBlueDark,
    background = SurfaceDark,
    surface = SurfaceDark2,
    surfaceVariant = SurfaceDark,
    primaryContainer = FieldGreenDark,
    secondaryContainer = ClayOrangeDark,
    outline = OutlineSoftDark,
    error = ClayOrangeDark,
    onPrimary = InkDark,
    onSecondary = InkDark,
    onTertiary = InkDark,
    onBackground = InkLight,
    onSurface = InkLight,
    onPrimaryContainer = InkDark,
    onSecondaryContainer = InkDark,
    onSurfaceVariant = InkLight
)

private val LightColorScheme = lightColorScheme(
    primary = SeedGreen,
    secondary = FieldGreen,
    tertiary = SkyBlue,
    background = SurfaceMint,
    surface = Color.White,
    surfaceVariant = SurfaceLeaf,
    primaryContainer = SurfaceLeaf,
    secondaryContainer = Color(0xFFFFEDD8),
    outline = OutlineSoft,
    error = ErrorRed,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onTertiary = Color.White,
    onBackground = InkDark,
    onSurface = InkDark,
    onPrimaryContainer = InkDark,
    onSecondaryContainer = InkDark,
    onSurfaceVariant = InkDark
)

@Composable
fun AgroKitTheme(
    darkTheme: Boolean = false,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
