package com.kvtube.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ColorScheme
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Typography

data class KTubeTvColors(
    val primary: Color = YTBrandRed,
    val background: Color = YTBackground,
    val surface: Color = YTSurface,
    val surfaceVariant: Color = YTSurfaceVariant,
    val textPrimary: Color = YTTextPrimary,
    val textSecondary: Color = YTTextSecondary,
)

val LocalKTubeTvColors = staticCompositionLocalOf { KTubeTvColors() }

object KTubeTvTheme {
    val colors: KTubeTvColors
        @Composable @ReadOnlyComposable get() = LocalKTubeTvColors.current

    val typography = KTubeTypography
}

private val KTubeTypography = Typography(
    displayLarge = TextStyle(fontSize = 40.sp, fontWeight = FontWeight.Bold, color = YTTextPrimary),
    headlineLarge = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold, color = YTTextPrimary),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Bold, color = YTTextPrimary),
    bodyLarge = TextStyle(fontSize = 16.sp, color = YTTextPrimary),
    bodyMedium = TextStyle(fontSize = 14.sp, color = YTTextSecondary),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = YTTextPrimary),
)

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun KTubeTvTheme(content: @Composable () -> Unit) {
    val colors = KTubeTvColors()
    val scheme = ColorScheme(
        primary = colors.primary, onPrimary = Color.White,
        primaryContainer = colors.primary.copy(alpha = 0.3f), onPrimaryContainer = Color.White,
        secondary = YTChip, onSecondary = YTTextPrimary,
        secondaryContainer = YTChip.copy(alpha = 0.6f), onSecondaryContainer = YTTextPrimary,
        tertiary = YTBlue, onTertiary = Color.White,
        tertiaryContainer = YTBlue.copy(alpha = 0.2f), onTertiaryContainer = Color.White,
        background = colors.background, onBackground = YTTextPrimary,
        surface = colors.surface, onSurface = YTTextPrimary,
        surfaceVariant = colors.surfaceVariant, onSurfaceVariant = YTTextSecondary,
        error = Color(0xFFCF212E), onError = Color.White,
        errorContainer = Color(0xFFCF212E).copy(0.15f), onErrorContainer = Color.White,
        border = YTBorder, borderVariant = YTBorder.copy(0.6f),
        scrim = Color.Black, inverseSurface = YTTextPrimary, inverseOnSurface = YTBackground,
        inversePrimary = colors.primary, surfaceTint = colors.primary,
    )
    CompositionLocalProvider(LocalKTubeTvColors provides colors) {
        MaterialTheme(colorScheme = scheme, typography = KTubeTypography, content = content)
    }
}
