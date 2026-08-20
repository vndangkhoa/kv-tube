# KV-Tube TV — Android TV (Leanback) App

Native Leanback YouTube clone for Android TV, built with **Compose for TV** + **Media3 (ExoPlayer)** + **Invidious** as backend.

- Separate module from `../android-app/` (phone/tablet) — do not merge.
- Mirrors the web frontend data contract in `../frontend/app/services/invidious.ts` and `../frontend/app/clientActions.ts` (Invidious `/api/v1`).

## Stack

- Compose for TV (`tv-material` + `tv-foundation` `1.0.0-alpha11` / `1.0.0`) — same as `kv-netflix/android-tv` reference.
- Retrofit + Moshi + OkHttp (stable Invidious + image pipeline; no Ktor).
- Media3 ExoPlayer / Media3 UI for HLS/DASH playback.
- DataStore Preferences for `invidiousInstanceUrl`, `invidiousToken`, theme.

## Structure

```
android-tv/
  build.gradle.kts / settings.gradle.kts / gradle.properties
  gradle/wrapper/
  app/
    build.gradle.kts
    src/main/
      AndroidManifest.xml
      java/com/kvtube/tv/
        MainActivity.kt
        KTubeTvApp.kt
        data/{api,model,repository}
        ui/{theme,components,navigation,screens}
        viewmodel/
```

## Backend

- Invidious: `../docker-compose.yml` → `invidious` + `companion` + `invidious-db`.  
  Web frontend proxies `/api/invidious/[...path]` → `INVIDIOUS_URL`.  
  TV app talks directly to the Invidious instance (default `https://yt.khoavo.myds.me`, override in Settings).
- Auth: `SID` / `Bearer {json}` token stored in DataStore, forwarded as `x-invidious-token` via proxy or direct.

## Build

From `android-tv/`:

```bash
./gradlew :app:assembleDebug
# or
./gradlew :app:installDebug   # with device/emulator attached
```

Requires Android SDK 35, JDK 17.
