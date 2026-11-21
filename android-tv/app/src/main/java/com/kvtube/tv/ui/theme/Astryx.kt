package com.kvtube.tv.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Astryx design tokens for Android.
 *
 * Ported 1:1 from the Astryx `@astryxdesign/theme-neutral` theme
 * (https://git.khoavo.myds.me/vndangkhoa/astryx → packages/themes/neutral):
 * the generated neutral palette stops, the semantic `--color-*` roles resolved
 * for light and dark, and the `--radius-*` / motion tokens. Astryx itself is a
 * React/StyleX library, so a native app consumes its *tokens*; every Compose
 * component then reads them through [MaterialTheme] / [LocalAstryx].
 */

// ---- Neutral palette (neutralPalettes.generated.ts) ------------------------
private val N0 = Color(0xFF000000)
private val N5 = Color(0xFF111111)
private val N10 = Color(0xFF1B1B1B)
private val N15 = Color(0xFF262626)
private val N20 = Color(0xFF303030)
private val N30 = Color(0xFF474747)
private val N35 = Color(0xFF525252)
private val N45 = Color(0xFF6A6A6A)
private val N60 = Color(0xFF919191)
private val N65 = Color(0xFF9E9E9E)
private val N85 = Color(0xFFD4D4D4)
private val N90 = Color(0xFFE2E2E2)
private val N95 = Color(0xFFF1F1F1)
private val N100 = Color(0xFFFFFFFF)

/** Semantic color roles (`--color-*`) resolved for one color mode. */
@Immutable
data class AstryxColors(
    val backgroundBody: Color,
    val backgroundSurface: Color,
    val backgroundCard: Color,
    val accent: Color,
    val accentMuted: Color,
    val onAccent: Color,
    /** `--color-neutral`: the translucent fill behind chips / quiet buttons. */
    val neutralFill: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textDisabled: Color,
    val iconSecondary: Color,
    val border: Color,
    val borderEmphasized: Color,
    val overlay: Color,
    val overlayHover: Color,
    val overlayPressed: Color,
    val skeleton: Color,
    val info: Color,
    val success: Color,
    val warning: Color,
    val error: Color,
    val onError: Color,
    val errorMuted: Color,
)

val AstryxLight = AstryxColors(
    backgroundBody = N95,
    backgroundSurface = N100,
    backgroundCard = N100,
    accent = N10,
    accentMuted = N85,
    onAccent = N100,
    neutralFill = N0.copy(alpha = 0x0F / 255f),
    textPrimary = N0,
    textSecondary = N30,
    textDisabled = N60,
    iconSecondary = N45,
    border = N0.copy(alpha = 0x14 / 255f),
    borderEmphasized = N85,
    overlay = N0.copy(alpha = 0x80 / 255f),
    overlayHover = N0.copy(alpha = 0x0D / 255f),
    overlayPressed = N0.copy(alpha = 0x1A / 255f),
    skeleton = N85,
    info = Color(0xFF0074E2),
    success = Color(0xFF198100),
    warning = Color(0xFFFFCE2F),
    error = Color(0xFFC9303A),
    onError = N100,
    errorMuted = Color(0xFFFFC4BE),
)

val AstryxDark = AstryxColors(
    backgroundBody = N10,
    backgroundSurface = N15,
    backgroundCard = N10,
    accent = N95,
    accentMuted = N30,
    onAccent = N5,
    neutralFill = N100.copy(alpha = 0x1A / 255f),
    textPrimary = N100,
    textSecondary = N65,
    textDisabled = N35,
    iconSecondary = N65,
    border = N100.copy(alpha = 0x1A / 255f),
    borderEmphasized = N35,
    overlay = N0.copy(alpha = 0xCC / 255f),
    overlayHover = N100.copy(alpha = 0x0D / 255f),
    overlayPressed = N100.copy(alpha = 0x1A / 255f),
    skeleton = N35,
    info = Color(0xFF6D9CFE),
    success = Color(0xFF64AF4C),
    warning = Color(0xFFFFCE2F),
    error = Color(0xFFFF705D),
    onError = N5,
    errorMuted = Color(0xFFDE4745).copy(alpha = 0x3D / 255f),
)

/** True-black variant for OLED panels (kept from the previous theme modes). */
val AstryxAmoled = AstryxDark.copy(
    backgroundBody = N0,
    backgroundSurface = Color(0xFF0C0C0C),
    backgroundCard = N0,
)

/** `--radius-*` tokens (neutral theme). */
object AstryxRadius {
    val inner = 6.dp       // 0.375rem — badges, chips' inner marks
    val element = 10.dp    // 0.625rem — buttons, inputs, chips
    val container = 12.dp  // 0.75rem  — cards, thumbnails, menus
    val page = 28.dp       // 1.75rem  — sheets / hero surfaces
}

/** Motion tokens: neutral theme `motion: {fast: 125, medium: 300, slow: 700}`. */
object AstryxMotion {
    const val FAST_MS = 125
    const val MEDIUM_MS = 300
    const val SLOW_MS = 700
}

/** 4dp-based spacing ramp (`--spacing-*`). */
object AstryxSpacing {
    val s1 = 4.dp
    val s2 = 8.dp
    val s3 = 12.dp
    val s4 = 16.dp
    val s5 = 20.dp
    val s6 = 24.dp
}

val LocalAstryx = staticCompositionLocalOf { AstryxDark }
