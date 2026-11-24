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
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import com.kvtube.tv.ui.theme.YTBorder
import com.kvtube.tv.ui.theme.YTFocus
import com.kvtube.tv.ui.theme.YTSurfaceElevated
import com.kvtube.tv.ui.theme.YTTextPrimary
import com.kvtube.tv.ui.theme.YTTextSecondary
import com.kvtube.tv.ui.theme.YTTextTertiary

/**
 * TV-safe text field restyled on Kabuki's `#212121` rounded pill surface with `#F1F1F1` focus rim.
 * Guarantees D-pad escape routes:
 *  - UP / DOWN      -> moves focus out of the field
 *  - LEFT at pos 0  -> moves focus left
 *  - RIGHT at end   -> moves focus right
 *  - IME Done/Search -> runs [onImeAction], hides keyboard, clears focus
 *  - Back / Escape  -> dismisses keyboard and clears focus
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
    val keyboardController = LocalSoftwareKeyboardController.current
    var hasFocus by remember { mutableStateOf(false) }
    var fieldValue by remember {
        mutableStateOf(TextFieldValue(value, TextRange(value.length)))
    }

    LaunchedEffect(value) {
        if (fieldValue.text != value) {
            fieldValue = TextFieldValue(value, TextRange(value.length))
        }
    }

    Box(
        modifier = modifier.onKeyEvent { e ->
            if (e.type != KeyEventType.KeyUp) return@onKeyEvent false
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
                Key.Back, Key.Escape -> {
                    if (hasFocus) {
                        keyboardController?.hide()
                        focusManager.clearFocus()
                        true
                    } else false
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
                    keyboardController?.hide()
                    onImeAction?.invoke()
                    focusManager.clearFocus(force = true)
                },
                onSearch = {
                    keyboardController?.hide()
                    onImeAction?.invoke()
                    focusManager.clearFocus(force = true)
                },
            ),
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { hasFocus = it.isFocused || it.hasFocus },
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = YTTextPrimary,
                unfocusedTextColor = YTTextPrimary,
                cursorColor = YTFocus,
                focusedBorderColor = YTFocus,
                unfocusedBorderColor = YTBorder,
                focusedContainerColor = YTSurfaceElevated,
                unfocusedContainerColor = YTSurfaceElevated,
                focusedLabelColor = YTTextSecondary,
                unfocusedLabelColor = YTTextSecondary,
                focusedPlaceholderColor = YTTextTertiary,
                unfocusedPlaceholderColor = YTTextTertiary,
            ),
        )
    }
}
