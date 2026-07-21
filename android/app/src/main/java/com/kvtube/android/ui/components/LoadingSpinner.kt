package com.kvtube.android.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.kvtube.android.R

@Composable
fun LoadingSpinner(
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    fullScreen: Boolean = false
) {
    val content: @Composable () -> Unit = {
        AsyncImage(
            model = R.drawable.loading,
            contentDescription = "Loading",
            modifier = Modifier.size(size)
        )
    }

    if (fullScreen) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            content()
        }
    } else {
        content()
    }
}
