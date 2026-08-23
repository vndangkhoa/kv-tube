package com.kvtube.android.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [DownloadedVideoEntity::class, WatchHistoryEntity::class, SubscribedChannelEntity::class],
    version = 3,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun downloadedVideoDao(): DownloadedVideoDao
    abstract fun watchHistoryDao(): WatchHistoryDao
    abstract fun subscribedChannelDao(): SubscribedChannelDao
}
