package com.kvtube.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ColorScheme
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Typography
import com.kvtube.tv.R

data class KTubeTvColors(
    val primary: Color = YTFocus,
    val background: Color = YTBackground,
    val surface: Color = YTSurface,
    val surfaceVariant: Color = YTSurfaceElevated,
    val textPrimary: Color = YTTextPrimary,
    val textSecondary: Color = YTTextSecondary,
)

val LocalKTubeTvColors = staticCompositionLocalOf { KTubeTvColors() }

object KTubeTvTheme {
    val colors: KTubeTvColors
        @Composable @ReadOnlyComposable get() = LocalKTubeTvColors.current

    val typography = KTubeTypography
}

/** Retained for optional brand-accent use; primary TV UI uses native Roboto for crisp Vietnamese glyphs. */
val FigtreeFamily = FontFamily(
    Font(R.font.figtree_regular, FontWeight.Normal),
    Font(R.font.figtree_medium, FontWeight.Medium),
    Font(R.font.figtree_semibold, FontWeight.SemiBold),
    Font(R.font.figtree_bold, FontWeight.Bold),
)

/**
 * YouTube TV (Kabuki) typographic scale calibrated for 960x540dp living-room canvas (1rem = 12dp).
 * IMPORTANT: Leave `color = Color.Unspecified` on all TextStyles so TV Material Surfaces and Buttons
 * can dynamically invert content color (e.g., #F1F1F1 idle -> #0F0F0F focused).
 */
private val YtUiFontFamily = FontFamily.SansSerif

private val KTubeTypography = Typography(
    displayLarge = TextStyle(fontFamily = YtUiFontFamily, fontSize = 38.sp, lineHeight = 46.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
    displayMedium = TextStyle(fontFamily = YtUiFontFamily, fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
    displaySmall = TextStyle(fontFamily = YtUiFontFamily, fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.2).sp),
    headlineLarge = TextStyle(fontFamily = YtUiFontFamily, fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.2).sp),
    headlineMedium = TextStyle(fontFamily = YtUiFontFamily, fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.1).sp),
    headlineSmall = TextStyle(fontFamily = YtUiFontFamily, fontSize = 19.sp, lineHeight = 25.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontFamily = YtUiFontFamily, fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontFamily = YtUiFontFamily, fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontFamily = YtUiFontFamily, fontSize = 14.sp, lineHeight = 19.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontFamily = YtUiFontFamily, fontSize = 15.sp, lineHeight = 21.sp, fontWeight = FontWeight.Normal),
    bodyMedium = TextStyle(fontFamily = YtUiFontFamily, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Normal),
    bodySmall = TextStyle(fontFamily = YtUiFontFamily, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Normal),
    labelLarge = TextStyle(fontFamily = YtUiFontFamily, fontSize = 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontFamily = YtUiFontFamily, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontFamily = YtUiFontFamily, fontSize = 11.sp, lineHeight = 14.sp, fontWeight = FontWeight.Medium),
)

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun KTubeTvTheme(content: @Composable () -> Unit) {
    val colors = KTubeTvColors()
    val scheme = ColorScheme(
        primary = YTFocus,
        onPrimary = YTFocusInk,
        primaryContainer = YTSurfaceElevated,
        onPrimaryContainer = YTTextPrimary,
        secondary = YTChip,
        onSecondary = YTTextPrimary,
        secondaryContainer = YTChipSelected,
        onSecondaryContainer = YTTextPrimary,
        tertiary = YTBlue,
        onTertiary = Color.White,
        tertiaryContainer = YTBlue.copy(alpha = 0.2f),
        onTertiaryContainer = Color.White,
        background = colors.background,
        onBackground = YTTextPrimary,
        surface = colors.surface,
        onSurface = YTTextPrimary,
        surfaceVariant = colors.surfaceVariant,
        onSurfaceVariant = YTTextSecondary,
        error = AstryxDark.error,
        onError = AstryxDark.onError,
        errorContainer = AstryxDark.errorMuted,
        onErrorContainer = Color.White,
        border = YTBorder,
        borderVariant = YTBorderSubtle,
        scrim = YTBackground,
        inverseSurface = YTFocus,
        inverseOnSurface = YTFocusInk,
        inversePrimary = YTFocus,
        surfaceTint = YTFocus,
    )
    CompositionLocalProvider(LocalKTubeTvColors provides colors) {
        MaterialTheme(colorScheme = scheme, typography = KTubeTypography, content = content)
    }
}
