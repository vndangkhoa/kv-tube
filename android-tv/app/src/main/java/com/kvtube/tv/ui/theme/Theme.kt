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
import com.kvtube.tv.R
import androidx.tv.material3.ColorScheme
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Typography

data class KTubeTvColors(
    val primary: Color = AstryxDark.accent,
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

/** Astryx neutral typography: Figtree (no Vietnamese glyphs → per-glyph system fallback). */
val FigtreeFamily = FontFamily(
    Font(R.font.figtree_regular, FontWeight.Normal),
    Font(R.font.figtree_medium, FontWeight.Medium),
    Font(R.font.figtree_semibold, FontWeight.SemiBold),
    Font(R.font.figtree_bold, FontWeight.Bold)
)

private val KTubeTypography = Typography(
    displayLarge = TextStyle(fontFamily = FigtreeFamily, fontSize = 40.sp, fontWeight = FontWeight.Bold, color = YTTextPrimary),
    headlineLarge = TextStyle(fontFamily = FigtreeFamily, fontSize = 28.sp, fontWeight = FontWeight.Bold, color = YTTextPrimary),
    titleLarge = TextStyle(fontFamily = FigtreeFamily, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = YTTextPrimary),
    titleMedium = TextStyle(fontFamily = FigtreeFamily, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = YTTextPrimary),
    titleSmall = TextStyle(fontFamily = FigtreeFamily, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = YTTextPrimary),
    bodyLarge = TextStyle(fontFamily = FigtreeFamily, fontSize = 16.sp, color = YTTextPrimary),
    bodyMedium = TextStyle(fontFamily = FigtreeFamily, fontSize = 14.sp, color = YTTextSecondary),
    bodySmall = TextStyle(fontFamily = FigtreeFamily, fontSize = 12.sp, color = YTTextSecondary),
    labelLarge = TextStyle(fontFamily = FigtreeFamily, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = YTTextPrimary),
    labelMedium = TextStyle(fontFamily = FigtreeFamily, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = YTTextPrimary),
    labelSmall = TextStyle(fontFamily = FigtreeFamily, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = YTTextPrimary),
)

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun KTubeTvTheme(content: @Composable () -> Unit) {
    val colors = KTubeTvColors()
    val scheme = ColorScheme(
        primary = colors.primary, onPrimary = AstryxDark.onAccent,
        primaryContainer = AstryxDark.accentMuted, onPrimaryContainer = Color.White,
        secondary = YTChip, onSecondary = YTTextPrimary,
        secondaryContainer = YTChip.copy(alpha = 0.6f), onSecondaryContainer = YTTextPrimary,
        tertiary = YTBlue, onTertiary = Color.White,
        tertiaryContainer = YTBlue.copy(alpha = 0.2f), onTertiaryContainer = Color.White,
        background = colors.background, onBackground = YTTextPrimary,
        surface = colors.surface, onSurface = YTTextPrimary,
        surfaceVariant = colors.surfaceVariant, onSurfaceVariant = YTTextSecondary,
        error = AstryxDark.error, onError = AstryxDark.onError,
        errorContainer = AstryxDark.errorMuted, onErrorContainer = Color.White,
        border = YTBorder, borderVariant = YTBorder.copy(0.6f),
        scrim = Color.Black, inverseSurface = YTTextPrimary, inverseOnSurface = YTBackground,
        inversePrimary = colors.primary, surfaceTint = colors.primary,
    )
    CompositionLocalProvider(LocalKTubeTvColors provides colors) {
        MaterialTheme(colorScheme = scheme, typography = KTubeTypography, content = content)
    }
}
