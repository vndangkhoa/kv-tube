# Keep Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.kvtube.android.**$$serializer { *; }
-keepclassmembers class com.kvtube.android.** {
    *** Companion;
}
-keepclasseswithmembers class com.kvtube.android.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep Hilt
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }

# Keep OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# Keep Ktor
-dontwarn io.ktor.**
-keep class io.ktor.** { *; }

# Keep NewPipeExtractor
-keep class org.schabi.newpipe.** { *; }

# Keep Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class * { *; }

# Keep ExoPlayer
-keep class androidx.media3.** { *; }

# Keep data models for serialization
-keep class com.kvtube.android.data.model.** { *; }
-keep class com.kvtube.android.data.api.** { *; }
