package com.kvtube.tv.data.local

import android.content.Context
import androidx.datastore.preferences.preferencesDataStore

// Single DataStore instance for the entire TV app — prevents
// "multiple DataStores active for the same file" crash.
val Context.tvDataStore by preferencesDataStore(name = "kvtube_tv_prefs")
