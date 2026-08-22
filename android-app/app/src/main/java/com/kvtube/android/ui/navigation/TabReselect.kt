package com.kvtube.android.ui.navigation

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Fired when the user taps an already-active bottom tab. Screens listen for
 * their route and reset their content to the very first item (top of feed,
 * first short, top of account page) — YouTube-style.
 */
object TabReselect {
    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val events: SharedFlow<String> = _events.asSharedFlow()

    fun notify(route: String) {
        _events.tryEmit(route)
    }
}
