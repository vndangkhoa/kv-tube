package com.kvtube.android.data.model

import kotlinx.serialization.Serializable

@Serializable
data class CommentsPage(
    val comments: List<Comment> = emptyList(),
    val continuation: String? = null,
    val commentCount: Int? = null
)
