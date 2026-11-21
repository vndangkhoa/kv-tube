package com.kvtube.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kvtube.android.ui.theme.AstryxRadius
import com.kvtube.android.ui.theme.YTBrandRed

@Composable
fun LiveBadge(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .background(YTBrandRed, RoundedCornerShape(AstryxRadius.inner))
            .padding(horizontal = 5.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "LIVE",
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            lineHeight = 14.sp
        )
    }
}

@Composable
fun DurationBadge(
    duration: String,
    modifier: Modifier = Modifier
) {
    if (duration.isBlank()) return
    Box(
        modifier = modifier
            .background(
                color = Color.Black.copy(alpha = 0.78f),
                shape = RoundedCornerShape(AstryxRadius.inner)
            )
            .padding(horizontal = 4.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = duration,
            color = Color.White,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            lineHeight = 14.sp
        )
    }
}
