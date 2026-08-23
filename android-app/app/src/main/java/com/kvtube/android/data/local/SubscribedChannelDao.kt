package com.kvtube.android.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert

@Dao
interface SubscribedChannelDao {

    @Query("SELECT * FROM subscribed_channels ORDER BY channelName COLLATE NOCASE")
    suspend fun getAll(): List<SubscribedChannelEntity>

    @Upsert
    suspend fun upsert(channel: SubscribedChannelEntity)

    @Query("DELETE FROM subscribed_channels WHERE channelId = :channelId")
    suspend fun delete(channelId: String)

    @Query("SELECT COUNT(*) > 0 FROM subscribed_channels WHERE channelId = :channelId")
    suspend fun exists(channelId: String): Boolean

    @Query("SELECT channelAvatar FROM subscribed_channels WHERE channelId = :channelId AND channelAvatar != '' LIMIT 1")
    suspend fun avatarOf(channelId: String): String?
}
