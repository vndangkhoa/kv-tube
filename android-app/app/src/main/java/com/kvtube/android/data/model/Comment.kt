package com.kvtube.android.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Comment(
    val id: String = "",
    val text: String = "",
    val author: String = "",
    @SerialName("author_id")
    val authorId: String = "",
    @SerialName("author_thumbnail")
    val authorThumbnail: String = "",
    val likes: Int = 0,
    @SerialName("is_reply")
    val isReply: Boolean = false,
    val parent: String = "",
    val timestamp: String = "",
    val published: String = ""
) {
    val displayTime: String
        get() = timestamp.ifEmpty { published }
}
