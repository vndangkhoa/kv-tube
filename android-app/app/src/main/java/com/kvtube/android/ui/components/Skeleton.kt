package com.kvtube.android.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp

@Composable
fun ShimmerEffect(
    modifier: Modifier = Modifier
) {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val translateAnim by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmer"
    )

    val base = MaterialTheme.colorScheme.surfaceContainer
    val highlight = MaterialTheme.colorScheme.surfaceVariant
    val brush = Brush.linearGradient(
        colors = listOf(base, highlight, base),
        start = Offset(translateAnim - 200f, 0f),
        end = Offset(translateAnim, 0f)
    )

    Box(
        modifier = modifier.background(brush)
    )
}

@Composable
fun VideoCardSkeleton(modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(12.dp))
        ) {
            ShimmerEffect(modifier = Modifier.fillMaxSize())
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
            verticalAlignment = Alignment.Top
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
            ) {
                ShimmerEffect(modifier = Modifier.fillMaxSize())
            }
            Spacer(modifier = Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.9f)
                        .height(14.dp)
                        .clip(RoundedCornerShape(4.dp))
                ) {
                    ShimmerEffect(modifier = Modifier.fillMaxSize())
                }
                Spacer(modifier = Modifier.height(6.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.6f)
                        .height(12.dp)
                        .clip(RoundedCornerShape(4.dp))
                ) {
                    ShimmerEffect(modifier = Modifier.fillMaxSize())
                }
            }
        }
    }
}

@Composable
fun CompactVideoRowSkeleton(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top
    ) {
        Box(
            modifier = Modifier
                .width(136.dp)
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(8.dp))
        ) {
            ShimmerEffect(modifier = Modifier.fillMaxSize())
        }
        Column(modifier = Modifier.weight(1f)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.92f)
                    .height(13.dp)
                    .clip(RoundedCornerShape(4.dp))
            ) {
                ShimmerEffect(modifier = Modifier.fillMaxSize())
            }
            Spacer(modifier = Modifier.height(6.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.58f)
                    .height(11.dp)
                    .clip(RoundedCornerShape(4.dp))
            ) {
                ShimmerEffect(modifier = Modifier.fillMaxSize())
            }
        }
    }
}

@Composable
fun VideoGridSkeleton() {
    val chromeInsets = com.kvtube.android.ui.theme.LocalGlassChromeInsets.current
    CenteredContent {
    LazyVerticalGrid(
        columns = rememberVideoGridCells(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = 12.dp,
            end = 12.dp,
            top = 8.dp,
            bottom = chromeInsets.calculateBottomPadding() + 12.dp
        ),
        horizontalArrangement = Arrangement.spacedBy(gridHorizontalSpacing()),
        verticalArrangement = Arrangement.spacedBy(gridVerticalSpacing())
    ) {
        items(12) {
            VideoCardSkeleton()
        }
    }
    }
}
