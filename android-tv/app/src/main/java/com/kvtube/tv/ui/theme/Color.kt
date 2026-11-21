package com.kvtube.tv.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver

/*
 * TV is dark-only: colors resolve from the Astryx neutral theme (dark mode),
 * see Astryx.kt. Legacy names are kept so every existing reference re-themes.
 */
val YTBackground = AstryxDark.backgroundBody
val YTSurface = AstryxDark.backgroundSurface
val YTSurfaceVariant = AstryxDark.neutralFill.compositeOver(AstryxDark.backgroundBody)
val YTChip = AstryxDark.neutralFill.compositeOver(AstryxDark.backgroundBody)
val YTChipActive = AstryxDark.accent
val YTBorder = AstryxDark.borderEmphasized
val YTTextPrimary = AstryxDark.textPrimary
val YTTextSecondary = AstryxDark.textSecondary
/** Brand/like red from the Astryx red family (red.light[55]). */
val YTBrandRed = Color(0xFFDE4745)
val YTBlue = AstryxDark.info
val YTFocus = Color(0xFFFFFFFF)
val YTFocusGlow = Color(0x33FFFFFF)

val NetflixRed = Color(0xFFE50914)
