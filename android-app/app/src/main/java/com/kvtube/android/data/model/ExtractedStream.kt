package com.kvtube.android.data.model

data class ExtractedStream(
    val videoUrl: String,
    val audioUrl: String? = null,
    val height: Int = 0,
    val isDash: Boolean = false
)
