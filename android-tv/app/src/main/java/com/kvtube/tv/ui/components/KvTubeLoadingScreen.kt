package com.kvtube.tv.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kvtube.tv.ui.theme.YTBackground
import com.kvtube.tv.ui.theme.YTBrandRed
import com.kvtube.tv.ui.theme.YTPlayBadgeRed
import com.kvtube.tv.ui.theme.YTTextPrimary

/**
 * YouTube TV 8.03.300 cinema splash & boot loading overlay (`#0F0F0F`),
 * strictly branded as "KV-Tube" with subtle scale/opacity breathing.
 */
@Composable
fun KvTubeLoadingScreen(
    isLoading: Boolean,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = isLoading,
        enter = fadeIn(animationSpec = tween(260)),
        exit = fadeOut(animationSpec = tween(360, easing = FastOutSlowInEasing)) +
            scaleOut(targetScale = 1.03f, animationSpec = tween(360, easing = FastOutSlowInEasing)),
        modifier = modifier,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(YTBackground),
            contentAlignment = Alignment.Center,
        ) {
            val infiniteTransition = rememberInfiniteTransition(label = "KvPulse")
            val pulseScale by infiniteTransition.animateFloat(
                initialValue = 1.0f,
                targetValue = 1.035f,
                animationSpec = infiniteRepeatable(
                    animation = tween(1200, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "PulseScale",
            )

            var hasEntered by remember { mutableStateOf(false) }
            val enterScale by animateFloatAsState(
                targetValue = if (hasEntered) 1.0f else 0.90f,
                animationSpec = tween(360, easing = FastOutSlowInEasing),
                label = "EnterScale",
            )
            LaunchedEffect(Unit) { hasEntered = true }

            Row(
                modifier = Modifier
                    .scale(enterScale * pulseScale)
                    .padding(horizontal = 24.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(width = 72.dp, height = 50.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(YTPlayBadgeRed),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.PlayArrow,
                        contentDescription = "KV-Tube",
                        tint = Color.White,
                        modifier = Modifier.size(34.dp),
                    )
                }

                Spacer(Modifier.width(16.dp))

                Text(
                    text = "KV-Tube",
                    color = YTTextPrimary,
                    fontSize = 38.sp,
                    fontWeight = FontWeight.ExtraBold,
                    fontFamily = FontFamily.SansSerif,
                    letterSpacing = (-1.1).sp,
                )
            }

            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 52.dp),
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(26.dp),
                    color = YTBrandRed,
                    strokeWidth = 2.5.dp,
                    trackColor = Color.White.copy(alpha = 0.12f),
                )
            }
        }
    }
}
