package com.kvtube.tv.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp

/**
 * TV-safe text field.
 *
 * A plain TextField traps the D-pad: LEFT/RIGHT move the caret and there is no
 * obvious way out on a remote. This wrapper guarantees escape routes:
 *  - UP / DOWN      → always moves focus out of the field
 *  - LEFT at pos 0  → moves focus to the previous focusable
 *  - RIGHT at end   → moves focus to the next focusable
 *  - IME Done/Search → runs [onImeAction] then clears focus
 */
@Composable
fun TvTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: (@Composable () -> Unit)? = null,
    placeholder: (@Composable () -> Unit)? = null,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    singleLine: Boolean = true,
    imeAction: ImeAction = ImeAction.Done,
    onImeAction: (() -> Unit)? = null,
) {
    val focusManager: FocusManager = LocalFocusManager.current
    var hasFocus by remember { mutableStateOf(false) }
    var fieldValue by remember {
        mutableStateOf(TextFieldValue(value, TextRange(value.length)))
    }

    // Keep external value changes in sync while the field is not being edited.
    LaunchedEffect(value) {
        if (!hasFocus && fieldValue.text != value) {
            fieldValue = TextFieldValue(value, TextRange(value.length))
        }
    }

    Box(
        modifier = modifier.onPreviewKeyEvent { e ->
            if (e.type != KeyEventType.KeyUp) return@onPreviewKeyEvent false
            when (e.key) {
                Key.DirectionUp -> { focusManager.moveFocus(FocusDirection.Up); true }
                Key.DirectionDown -> { focusManager.moveFocus(FocusDirection.Down); true }
                Key.DirectionLeft -> {
                    val collapsedAtStart =
                        fieldValue.selection.collapsed && fieldValue.selection.start == 0
                    if (collapsedAtStart) { focusManager.moveFocus(FocusDirection.Left); true } else false
                }
                Key.DirectionRight -> {
                    val collapsedAtEnd =
                        fieldValue.selection.collapsed &&
                            fieldValue.selection.end == fieldValue.text.length
                    if (collapsedAtEnd) { focusManager.moveFocus(FocusDirection.Right); true } else false
                }
                else -> false
            }
        }
    ) {
        OutlinedTextField(
            value = fieldValue,
            onValueChange = {
                fieldValue = it
                onValueChange(it.text)
            },
            label = label,
            placeholder = placeholder,
            leadingIcon = leadingIcon,
            trailingIcon = trailingIcon,
            singleLine = singleLine,
            keyboardOptions = KeyboardOptions(imeAction = imeAction),
            keyboardActions = KeyboardActions(
                onDone = {
                    onImeAction?.invoke()
                    focusManager.clearFocus(force = true)
                },
                onSearch = {
                    onImeAction?.invoke()
                    focusManager.clearFocus(force = true)
                },
            ),
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { hasFocus = it.isFocused || it.hasFocus },
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                cursorColor = Color.White,
                focusedBorderColor = Color.White.copy(alpha = 0.6f),
                unfocusedBorderColor = Color.White.copy(alpha = 0.22f),
                focusedContainerColor = Color(0xFF212121),
                unfocusedContainerColor = Color(0xFF212121),
                focusedLabelColor = Color(0xFFAAAAAA),
                unfocusedLabelColor = Color(0xFFAAAAAA),
                focusedPlaceholderColor = Color(0xFF6E6E6E),
                unfocusedPlaceholderColor = Color(0xFF6E6E6E),
            ),
        )
    }
}
