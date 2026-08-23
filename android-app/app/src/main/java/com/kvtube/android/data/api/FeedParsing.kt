package com.kvtube.android.data.api

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Parses the /auth/feed payload into a single list of video objects.
 *
 * Invidious answers in two shapes:
 *  - legacy: a plain JSON array of videos
 *  - current: {"notifications": [...], "videos": [...]} where freshly uploaded
 *    videos land under "notifications" (often the vast majority — with many
 *    subscriptions almost everything arrives as a notification).
 *
 * Both lists hold the same video object shape, so they are merged, deduped by
 * videoId and returned for recency sorting by the caller.
 */
internal fun parseSubscriptionFeed(element: JsonElement?): List<JsonObject> = when (element) {
    null -> emptyList()
    is JsonArray -> element.mapNotNull { it as? JsonObject }
    is JsonObject -> {
        val videos = element["videos"] as? JsonArray
        val notifications = element["notifications"] as? JsonArray
        when {
            videos == null && notifications == null ->
                listOfNotNull(element)
                    .filter { it.containsKey("videoId") }
            else -> sequenceOf(notifications, videos)
                .filterNotNull()
                .flatMap { array -> array.asSequence() }
                .mapNotNull { item -> item as? JsonObject }
                .toList()
        }
    }
    else -> emptyList()
}
