package com.kvtube.android.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.kvtube.android.R

/**
 * Astryx neutral typography: Figtree (body + headings), scale base 14sp with a
 * 1.2 ratio → 11.7 / 14 / 16.8 / 20.2 / 24.2 / 29 / 34.9. Figtree has no
 * Vietnamese glyphs, so accented Vietnamese letters fall back per-glyph to the
 * system sans (Roboto) — the same fallback chain Astryx declares for the web.
 */
val FigtreeFamily = FontFamily(
    Font(R.font.figtree_regular, FontWeight.Normal),
    Font(R.font.figtree_medium, FontWeight.Medium),
    Font(R.font.figtree_semibold, FontWeight.SemiBold),
    Font(R.font.figtree_bold, FontWeight.Bold)
)

@Suppress("unused")
val RobotoFamily = FigtreeFamily // legacy alias used across the app

private fun style(size: Double, weight: FontWeight, line: Double = size * 1.4) = TextStyle(
    fontFamily = FigtreeFamily,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = 0.sp
)

val Typography = Typography(
    displayLarge = style(41.8, FontWeight.Bold, 50.0),
    displayMedium = style(34.9, FontWeight.Bold, 42.0),
    displaySmall = style(29.0, FontWeight.Bold, 36.0),
    headlineLarge = style(29.0, FontWeight.Bold, 36.0),
    headlineMedium = style(24.2, FontWeight.Bold, 30.0),
    headlineSmall = style(20.2, FontWeight.Bold, 26.0),
    titleLarge = style(20.2, FontWeight.Bold, 26.0),
    titleMedium = style(14.0, FontWeight.SemiBold, 20.0),
    titleSmall = style(12.0, FontWeight.SemiBold, 16.0),
    bodyLarge = style(16.8, FontWeight.Normal, 24.0),
    bodyMedium = style(14.0, FontWeight.Normal, 20.0),
    bodySmall = style(12.0, FontWeight.Normal, 16.0),
    labelLarge = style(14.0, FontWeight.SemiBold, 20.0),
    labelMedium = style(12.0, FontWeight.Medium, 16.0),
    labelSmall = style(11.0, FontWeight.Medium, 16.0)
)
