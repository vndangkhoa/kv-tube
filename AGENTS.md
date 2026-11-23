# kv-tube — agent instructions

## Mode: ponytail (level: full)
Lazy senior dev. Before any code, ask: does it need to exist (YAGNI)? Standard lib / native platform feature? Can it be one line? Build the minimum that works. No unrequested abstractions, no avoidable deps, no boilerplate. Deliberate simplifications that cut a real corner get a `shortcut: <ceiling>, <upgrade path>` comment. Fix the root cause once; keep the diff short.

## Update the kv-tube Android app
Working dir: `android-app/` (Kotlin, Gradle, Hilt, Compose). Repo root: this dir (branch `main`).

1. Edit code in `android-app/app/src/main/`.
2. Build to verify: `cd android-app && ./gradlew :app:assembleRelease --no-daemon`
   - APK lands at `android-app/app/build/outputs/apk/release/app-release.apk`.
   - Bump versionCode/versionName in `android-app/app/build.gradle.kts` only when a new release is warranted.
3. Commit: `git -C android-app ...` OR commit at repo root (single repo), then push.
4. Ship to forges + SPK mirror:
   - Android release (tag + APK asset) → `cd "/mnt/data/Package Center/spk" && ./ship.sh kvtube phone <version>`
   - SPK publish → `./ship.sh kvtube spk 1.0.0-60`
   - Preview both first: `SHIP_DRYRUN=1 ./ship.sh kvtube phone <version>`
5. SPK activation is manual-confirm: log into https://syno.vndns.net/admin → Packages → kvtube → build → Edit → active. `ship.sh` already activates build 60; other builds may need it.

## Known gotchas (from prior releases)
- `HomeViewModel` category load-more uses `category` as the searchPage arg, NOT an undefined `query`.
- `ship.sh` force-overwrites the `v1.11.3` tag — expected for a release.
- `.secrets.env` (repo root parent) holds all creds; `set -a; source "/mnt/data/Package Center/.secrets.env"; set +a` before scripts that need SPKREPO_* / git tokens.
