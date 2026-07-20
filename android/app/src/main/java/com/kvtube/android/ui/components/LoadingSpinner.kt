package com.kvtube.android.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun LoadingSpinner(
    modifier: Modifier = Modifier,
    size: Dp = 36.dp,
    fullScreen: Boolean = false
) {
    if (fullScreen) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(size),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                strokeWidth = 3.dp
            )
        }
    } else {
        CircularProgressIndicator(
            modifier = modifier.size(size),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            strokeWidth = 3.dp
        )
    }
}
