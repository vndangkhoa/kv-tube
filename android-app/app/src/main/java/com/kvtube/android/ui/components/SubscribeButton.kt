package com.kvtube.android.ui.components

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.kvtube.android.ui.theme.AstryxRadius

@Composable
fun SubscribeButton(
    isSubscribed: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (isSubscribed) {
        Button(
            onClick = onToggle,
            modifier = modifier,
            shape = RoundedCornerShape(AstryxRadius.element),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurface
            )
        ) {
            Text(
                text = "Subscribed",
                style = MaterialTheme.typography.labelMedium
            )
        }
    } else {
        Button(
            onClick = onToggle,
            modifier = modifier,
            shape = RoundedCornerShape(AstryxRadius.element),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            )
        ) {
            Text(
                text = "Subscribe",
                style = MaterialTheme.typography.labelMedium
            )
        }
    }
}
