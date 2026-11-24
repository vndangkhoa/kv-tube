package com.kvtube.tv.ui.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver

/*
 * Google YouTube for Android TV 8.03.300 (Cobalt Kabuki) design palette
 * unified with Astryx dark-room cinema tokens.
 *
 * All TV surfaces are dark-only on a single obsidian canvas (#0F0F0F) with
 * glare-safe off-white focus/ink (#F1F1F1) and calibrated white translucent pills.
 */
val YTBackground = Color(0xFF0F0F0F)
val YTSurface = Color(0xFF181818)          // .oT4Ebf secondary container / panels
val YTSurfaceElevated = Color(0xFF212121)  // .NjeSEe / .JMeAff elevated cards & search input
val YTSurfaceVariant = YTSurfaceElevated
val YTChip = Color(0x1AFFFFFF)             // rgba(255,255,255,0.10) idle chip/button fill
val YTChipSelected = Color(0x47FFFFFF)     // rgba(255,255,255,0.28) selected unfocused pill
val YTChipSolid = Color(0xFF272727)        // opaque chip fallback for stacked imagery
val YTChipActive = Color(0xFFF1F1F1)
val YTBorder = Color(0x26FFFFFF)           // subtle inner hairline highlight
val YTBorderSubtle = Color(0x14FFFFFF)     // low-emphasis divider / hairline
val YTTextPrimary = Color(0xFFF1F1F1)      // Kabuki glare-safe off-white primary ink
val YTTextSecondary = Color(0xFFAAAAAA)    // metadata, unselected guide labels
val YTTextTertiary = Color(0xFF909090)     // subtle captions & hints
val YTTextDisabled = Color(0xFF717171)

/** Modern YouTube TV crimson accent for scrubber progress bars & active indicators. */
val YTBrandRed = Color(0xFFFF0033)
/** Scrubber highlight gradient tail extracted from Kabuki `.wTHb2c`. */
val YTProgressEndPink = Color(0xFFFF2791)
/** Live badge fill extracted from Kabuki `.HCzIPb`. */
val YTLiveRed = Color(0xE6E1002D)
/** Signature red play badge fill for the KV-Tube brand lockup. */
val YTPlayBadgeRed = Color(0xFFFF0000)

val YTBlue = Color(0xFF3EA6FF)
val YTFocus = Color(0xFFF1F1F1)
val YTFocusInk = Color(0xFF0F0F0F)
val YTFocusGlow = Color(0x33FFFFFF)

val NetflixRed = Color(0xFFE50914)

/** Keep composite helper available for callers that need an opaque surface tint. */
val YTSurfaceMutedSolid = Color(0x1AFFFFFF).compositeOver(YTBackground)

/** Horizontal gradient brush for watch-history and seekbar progress bars (.wTHb2c). */
val ytProgressBrush: Brush = Brush.horizontalGradient(
    0.0f to YTBrandRed,
    0.8f to YTBrandRed,
    1.0f to YTProgressEndPink,
)

private val SCRIM_EXP_ALPHAS = floatArrayOf(
    0.000f, 0.029f, 0.060f, 0.093f, 0.129f, 0.170f, 0.216f, 0.268f,
    0.326f, 0.392f, 0.467f, 0.551f, 0.646f, 0.752f, 0.869f, 1.000f
)

/**
 * 14-stop exponential scrim curve reverse-engineered from YouTube TV Kabuki CSS
 * (`rgba(15,15,15,.0290826) .. rgba(15,15,15,.869379)`), eliminating visible 8-bit banding
 * across large TV gradients.
 */
fun ytExponentialScrimStops(
    baseColor: Color = YTBackground,
    startFraction: Float = 0f,
    endFraction: Float = 1f,
    maxAlpha: Float = 1f,
    reverse: Boolean = false,
): Array<Pair<Float, Color>> {
    val count = SCRIM_EXP_ALPHAS.size
    return Array(count) { idx ->
        val t = idx.toFloat() / (count - 1).toFloat()
        val pos = startFraction + (endFraction - startFraction) * t
        val alphaIdx = if (reverse) (count - 1 - idx) else idx
        pos.coerceIn(0f, 1f) to baseColor.copy(alpha = (SCRIM_EXP_ALPHAS[alphaIdx] * maxAlpha).coerceIn(0f, 1f))
    }
}
