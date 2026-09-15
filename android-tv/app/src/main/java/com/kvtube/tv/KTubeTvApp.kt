package com.kvtube.tv

import android.app.Application
import com.kvtube.tv.data.api.ApiClient
import com.kvtube.tv.data.local.tvDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import androidx.datastore.preferences.core.stringPreferencesKey

class KTubeTvApp : Application() {
    companion object {
        lateinit var instance: KTubeTvApp
            private set
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        instance = this
        try {
            kotlinx.coroutines.runBlocking(Dispatchers.IO) {
                com.kvtube.tv.data.local.TvPrefs(this@KTubeTvApp).bootstrap()
            }
        } catch (_: Exception) {
            ApiClient.setInstance(ApiClient.DEFAULT_INSTANCE)
        }
    }
}
