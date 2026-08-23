package com.kvtube.android.data

/**
 * Rough recency score (in minutes) parsed from Invidious "publishedText"
 * labels like "3 hours ago", "2 weeks ago", "Streamed 1 day ago".
 * Newer videos yield smaller values (0 = just now / live / unknown).
 */
internal fun String.relativeRecencyMinutes(): Long {
    val text = lowercase()
    val number = Regex("(\\d+)").find(text)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
    return when {
        "second" in text -> number / 60L
        "minute" in text -> number
        "hour" in text -> number * 60L
        "day" in text -> number * 60L * 24L
        "week" in text -> number * 60L * 24L * 7L
        "month" in text -> number * 60L * 24L * 30L
        "year" in text -> number * 60L * 24L * 365L
        else -> 0L
    }
}
