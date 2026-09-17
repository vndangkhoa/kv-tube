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

/**
 * YouTube TV-style loading and splash screen.
 *
 * Displays the signature YouTube lockup (red rounded play badge + heavy white wordmark)
 * branded as "KV-TUBE", with a smooth breathing/pulse animation and a subtle bottom spinner.
 */
@Composable
fun KvTubeLoadingScreen(
    isLoading: Boolean,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = isLoading,
        enter = fadeIn(animationSpec = tween(300)),
        exit = fadeOut(animationSpec = tween(400, easing = FastOutSlowInEasing)) +
                scaleOut(targetScale = 1.04f, animationSpec = tween(400, easing = FastOutSlowInEasing)),
        modifier = modifier
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(YTBackground),
            contentAlignment = Alignment.Center
        ) {
            // Infinite breathing/pulse animation on the badge and logo lockup
            val infiniteTransition = rememberInfiniteTransition(label = "KvPulse")
            val pulseScale by infiniteTransition.animateFloat(
                initialValue = 1.0f,
                targetValue = 1.045f,
                animationSpec = infiniteRepeatable(
                    animation = tween(1200, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "PulseScale"
            )

            // Entrance animation (scale from 0.88 to 1.0 and fade in)
            var hasEntered by remember { mutableStateOf(false) }
            val enterScale by animateFloatAsState(
                targetValue = if (hasEntered) 1.0f else 0.88f,
                animationSpec = tween(400, easing = FastOutSlowInEasing),
                label = "EnterScale"
            )
            LaunchedEffect(Unit) {
                hasEntered = true
            }

            // Centered YouTube-style logo lockup
            Row(
                modifier = Modifier
                    .scale(enterScale * pulseScale)
                    .padding(horizontal = 24.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                // Red Play Badge
                Box(
                    modifier = Modifier
                        .size(width = 72.dp, height = 50.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(YTBrandRed),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Filled.PlayArrow,
                        contentDescription = "KV-TUBE Logo",
                        tint = Color.White,
                        modifier = Modifier.size(36.dp)
                    )
                }

                Spacer(Modifier.width(16.dp))

                // Brand Name "KV-TUBE" in YouTube bold sans typography
                Text(
                    text = "KV-TUBE",
                    color = Color.White,
                    fontSize = 40.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.SansSerif,
                    letterSpacing = (-0.8).sp,
                )
            }

            // Bottom loading spinner
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 56.dp)
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(26.dp),
                    color = YTBrandRed,
                    strokeWidth = 2.5.dp,
                    trackColor = Color.White.copy(alpha = 0.1f)
                )
            }
        }
    }
}
