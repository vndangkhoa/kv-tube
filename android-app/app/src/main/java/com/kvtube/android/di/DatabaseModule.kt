package com.kvtube.android.di

import android.content.Context
import androidx.room.Room
import com.kvtube.android.data.local.AppDatabase
import com.kvtube.android.data.local.DownloadedVideoDao
import com.kvtube.android.data.local.SubscribedChannelDao
import com.kvtube.android.data.local.WatchHistoryDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase {
        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            "kvtube.db"
        ).fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    @Singleton
    fun provideWatchHistoryDao(database: AppDatabase): WatchHistoryDao {
        return database.watchHistoryDao()
    }

    @Provides
    @Singleton
    fun provideDownloadedVideoDao(database: AppDatabase): DownloadedVideoDao {
        return database.downloadedVideoDao()
    }

    @Provides
    @Singleton
    fun provideSubscribedChannelDao(database: AppDatabase): SubscribedChannelDao {
        return database.subscribedChannelDao()
    }
}
