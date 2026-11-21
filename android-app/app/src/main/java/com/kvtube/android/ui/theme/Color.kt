package com.kvtube.android.ui.theme

import androidx.compose.ui.graphics.Color

/*
 * Legacy color names, now resolved from the Astryx neutral theme
 * (see Astryx.kt) so every existing reference picks up the new look.
 */

// Dark
val YTBackgroundDark = AstryxDark.backgroundBody
val YTSurfaceDark = AstryxDark.backgroundCard
val YTHoverDark = AstryxDark.backgroundSurface
val YTActiveDark = AstryxDark.accentMuted
val YTBorderDark = AstryxDark.borderEmphasized
val YTTextPrimaryDark = AstryxDark.textPrimary
val YTTextSecondaryDark = AstryxDark.textSecondary
val YTSearchBgDark = AstryxDark.backgroundSurface
val YTSearchBorderDark = AstryxDark.borderEmphasized
val YTSearchBtnDark = AstryxDark.backgroundSurface

// Light
val YTBackgroundLight = AstryxLight.backgroundBody
val YTSurfaceLight = AstryxLight.backgroundCard
val YTHoverLight = Color(0xFFE2E2E2)
val YTActiveLight = AstryxLight.accentMuted
val YTBorderLight = AstryxLight.borderEmphasized
val YTTextPrimaryLight = AstryxLight.textPrimary
val YTTextSecondaryLight = AstryxLight.textSecondary
val YTSearchBgLight = AstryxLight.backgroundSurface
val YTSearchBorderLight = AstryxLight.borderEmphasized
val YTSearchBtnLight = AstryxLight.backgroundSurface

/** KV-Tube brand/like red, taken from the Astryx red family (red.light[55]). */
val YTBrandRed = Color(0xFFDE4745)

/** Info blue = Astryx `--color-info` (dark). */
val YTBlue = AstryxDark.info

// Skeleton
val SkeletonDark = AstryxDark.skeleton
val SkeletonHighlightDark = AstryxDark.accentMuted
val SkeletonLight = AstryxLight.skeleton
val SkeletonHighlightLight = AstryxLight.backgroundBody
