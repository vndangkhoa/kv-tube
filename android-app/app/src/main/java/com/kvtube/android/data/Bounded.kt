package com.kvtube.android.data

import kotlinx.coroutines.withTimeoutOrNull

/**
 * Runs [block] but gives up after [timeoutMs] (default 5s), returning null on
 * timeout. Used to keep slow/blocked backend calls from hanging the UI.
 */
suspend fun <T> bounded(timeoutMs: Long = 5_000L, block: suspend () -> T): T? =
    withTimeoutOrNull(timeoutMs) { block() }
