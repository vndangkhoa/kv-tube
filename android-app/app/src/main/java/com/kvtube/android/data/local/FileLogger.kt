package com.kvtube.android.data.local

import android.content.Context
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Minimal ring-buffer log written to the app's external files dir:
 *   /sdcard/Android/data/com.kvtube.android/files/kvtube-log.txt
 * Exists because this device's ROM restricts `adb logcat`. Pull with:
 *   adb pull /sdcard/Android/data/com.kvtube.android/files/kvtube-log.txt
 */
@Singleton
class FileLogger @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val FILE_NAME = "kvtube-log.txt"
        private const val MAX_BYTES = 512 * 1024L
        private val fmt = SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US)

        /** Global access for non-injected crash handlers. */
        @Volatile
        var instance: FileLogger? = null
            private set
    }

    private val file: File by lazy {
        File(context.getExternalFilesDir(null), FILE_NAME)
    }

    init {
        instance = this
    }

    @Synchronized
    fun write(tag: String, message: String, error: Throwable? = null) {
        try {
            if (file.length() > MAX_BYTES) file.delete()
            file.appendText(
                buildString {
                    append(fmt.format(Date()))
                    append(' ')
                    append(tag)
                    append(": ")
                    append(message)
                    error?.let {
                        append("\n  !! ")
                        append(it.javaClass.simpleName)
                        append(": ")
                        append(it.message)
                    }
                    append('\n')
                }
            )
        } catch (_: Exception) {
            // Logging must never break the app.
        }
    }

    fun installCrashHandler() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            write("CRASH", "uncaught on ${thread.name}", throwable)
            previous?.uncaughtException(thread, throwable)
        }
    }
}

/** Convenience for call sites without injection. */
fun Any.logToFile(tag: String, message: String, error: Throwable? = null) {
    try {
        Log.w(tag, message, error)
        FileLogger.instance?.write(tag, message, error)
    } catch (_: Exception) {}
}
