# kv-tube — "Liquid Glass" UI Extraction

Reverse-engineered from `kv-tube.apk` v1.1.5-tv (apktool smali) **and** the shipped
source at `android-tv/app/src/main/java/com/kvtube/tv/ui/theme/`. The source is the
authoritative copy; smali confirmed the runtime behavior.

**Verdict:** kv-tube has no custom glass code. The "liquid glass" look is entirely
`androidx.tv.material3` (TV Material 3) dynamic-material rendering, and kv-tube only
supplies **colors + typography** on top of it, sourced from the **Astryx** design
system. The word "glass" never appears in the app.

---

## 1. Where the look comes from (layer stack)

```
Astryx design tokens   (packages/themes/neutral, git.khoavo.myds.me/vndangkhoa/astryx)
   │  palette + semantic roles + radius/motion/spacing
   ▼
KTubeTvTheme / KTubeTvColors  (app theme entry point, com/kvtube/tv/ui/theme)
   │  builds a ColorScheme + Typography from Astryx
   ▼
androidx.tv.material3  (SurfaceKt, SurfaceGlow*, SurfaceScale*)
   │  the actual surface: rounded shape + fake glow + focus/press scale animation
   ▼
SurfaceGlowNode  →  android.graphics.Paint.setShadowLayer()
   └─  the "glow" is drawn, not blurred
```

The app is **Jetpack Compose + `androidx.tv.material3` (TV Material 3) + Leanback +
Media3**. Every "glass" surface in the app is an `androidx.tv.material3` `Surface`
decorated with the app's `MaterialTheme`. Nothing in the app package (`com/kvtube`)
implements glass itself — a grep for `glass|frosted|backdrop|translucent|liquid|Blur`
across `com/kvtube` returns nothing.

---

## 2. The glow mechanism (the real "liquid glass" primitive)

`SurfaceGlowNode` is what paints the glow behind a surface. It is **not** a GPU blur.

- It keeps a `frameworkPaint: android.graphics.Paint` (the raw Android `Paint`) plus a
  Compose `paint: androidx.compose.ui.graphics.Paint`.
- `initializePaint()` creates the `frameworkPaint`.
- `setShadowLayer()` (SurfaceGlow.kt :178) sets the shadow **color** from
  `element.color`, then calls `frameworkPaint.setShadowLayer(...)`.
- `SurfaceShapeOutlineCache` caches the rounded-rectangle outline of the shape.
- `draw()` fills/strokes that outline and, because of the shadow layer, paints a
  colored halo around the shape edge.

So the glow is a **colored outline shadow** (`Paint.setShadowLayer`), which fakes a
soft rim light. It follows the surface's rounded corners. `SurfaceGlowElement`
carries `glowBlurRadiusPx` + `color`; `Glow` defaults to `Glow.None` in
`ClickableSurfaceDefaults`, so most surfaces glow only when focused (see §3).

> **Reimplementation note:** to reproduce the rim glow without Android, you can't
> fake it with a CSS `filter: blur()` cleanly — the app fakes it with a shadow
> outline, so the closest equivalent is a blurred copy of the *stroke*, not the fill.
> A true `backdrop-filter` blur (like iOS liquid glass) is *not* what this app does.

---

## 3. Interaction animation (the "glass reacts to focus" part)

`SurfaceScaleKt` animates a **scale** on focus / press / release, wired through the
`tvSurfaceScale` modifier:

- `animateFloatAsState(...)` + `graphicsLayer(scaleX, scaleY)` — a spring/ tween scale.
- Driven by focus state + `Interaction` (press), via `SurfaceScaleTokens`.
- Default token durations (library defaults, not app-tuned):
  - `focusDuration` = 0x12c = **300 ms**
  - `pressedDuration` = 0x78 = **120 ms**
  - `releaseDuration` = 0x12c = **300 ms**
  - `unFocusDuration` = 0x1f4 = **500 ms**
  - `enterEasing` = `CubicBezierEasing(0.2, 1.0, 0.0, ...)`
- `ClickableSurfaceScale` takes 5 floats (min/max scale for focus + press states).
- Every element has a sibling `*Scale` (ButtonScale, CardScale, ClickableChipScale,
  ClickableSurfaceScale…) — the animation is the library's, applied per component.

This focus/press "breathing" scale is the second half of the liquid-glass feel: the
surface visibly grows toward the user when it's the focused target.

---

## 4. App color + typography overrides (what kv-tube actually customized)

`KTubeTvColors` (the only app-level theme data class) supplies:

| field          | default value            |
|----------------|--------------------------|
| `primary`      | `AstryxDark.accent`      |
| `background`   | `YTBackground`           |
| `surface`      | `YTSurface`              |
| `surfaceVariant` | `YTSurfaceVariant`     |
| `textPrimary`  | `YTTextPrimary`          |
| `textSecondary`| `YTTextSecondary`        |

`KTubeTvTheme()` builds a full `androidx.tv.material3.ColorScheme` from these plus
Astryx semantic roles (`onAccent`, `accentMuted`, `secondary`, `tertiary`,
`error`, `border`/`borderVariant`, `scrim`, `inverse*`, `surfaceTint`) and wraps the
content in `MaterialTheme(colorScheme, typography)`.

**Palette (Color.kt / ColorKt)** — TV is dark-only; legacy `YT*` names map to
Astryx dark roles.

> **Drift:** the compiled APK (v1.1.5-tv) hardcodes legacy hex; the current repo
> `Color.kt` remaps most names to Astryx roles. "APK" = shipped value, "source" =
> current mapping. Text colors drifted: APK hardcoded them, source now points at
> Astryx roles, so a rebuild changes text color.

| token          | APK (shipped) | source (current)                    |
|----------------|---------------|-------------------------------------|
| `YTBackground`   | `#0F0F0F`     | `AstryxDark.backgroundBody` (N10)   |
| `YTSurface`      | `#1A1A1A`     | `AstryxDark.backgroundSurface` (N15)|
| `YTSurfaceVariant`| `#212121`    | `backgroundSurface` composited      |
| `YTChip`         | `#272727`     | `neutralFill` composite             |
| `YTChipActive`   | `#F1F1F1`     | `accent` (N95)                      |
| `YTBorder`       | `#3F3F3F`     | `borderEmphasized` (N35)            |
| `YTTextPrimary`  | `#F1F1F1`     | `textPrimary` (N100 = `#FFFFFF`) ⚠️ |
| `YTTextSecondary`| `#AAAAAA`     | `textSecondary` (N65 = `#9E9E9E`) ⚠️ |
| `YTBrandRed`     | `#DE4745`     | Astryx red.light[55]                |
| `YTBlue`         | `#3EA6FF`     | `info`                              |
| `YTFocus`        | `#FFFFFF`     | —                                   |
| `YTFocusGlow`    | `#33FFFFFF`   | focus rim color                     |

**Typography** — Astryx neutral, **Figtree** only (no Vietnamese glyphs → per-glyph
system fallback). Sizes 11–40 sp; bold/semibold for headings.

---

## 5. Astryx tokens (the design system behind the look)

`Astryx.kt` ports `@astryxdesign/theme-neutral` 1:1. It is the real source of the
"liquid glass" values:

- **Neutral palette** `N0..N100` (black → white) — the stops the generated palette
  uses.
- **Semantic roles** `--color-*` resolved for dark: `backgroundBody/Surface/Card`,
  `accent`/`accentMuted`/`onAccent`, `neutralFill` (the translucent chip fill),
  `border`/`borderEmphasized`, `overlay*`, `info/success/warning/error`.
- **Radius** `AstryxRadius`: inner 6, element 10, container 12, page 28 dp.
- **Motion** `AstryxMotion`: fast 125 / medium 300 / slow 700 ms.
- **Spacing** `AstryxSpacing`: 4/8/12/16/20/24 dp.
- Variants: `AstryxLight`, `AstryxDark` (default), `AstryxAmoled` (true-black OLED).

Every Compose component reads these through `MaterialTheme` / `LocalAstryx`.

---

## 6. Reimplementation recipe

To recreate the look without Android:

1. **Surface:** rounded rectangle (radius = container 12 dp; page 28 dp for sheets).
2. **Rim glow:** colored shadow outline around the shape edge (the app uses
   `setShadowLayer`, not a backdrop blur) — color from `YTFocusGlow` when focused,
   otherwise none.
3. **Focus/press:** tween scale on `tvSurfaceScale` timings (focus 300 ms in,
   press 120 ms, release 300 ms, unfocus 500 ms; `enterEasing ≈ (0.2,1.0,0.0)`).
4. **Colors:** dark Astryx palette above; `primary`/`surfaceTint` = accent.
5. **Type:** Figtree, the 11–40 sp ramp.

---

## 7. Files (source)

- `android-tv/app/src/main/java/com/kvtube/tv/ui/theme/Color.kt`
- `android-tv/app/src/main/java/com/kvtube/tv/ui/theme/Theme.kt`
- `android-tv/app/src/main/java/com/kvtube/tv/ui/theme/Typography.kt`
- `android-tv/app/src/main/java/com/kvtube/tv/ui/theme/Astryx.kt`

## 8. Files (smali, runtime confirmation)

- `smali_classes3/androidx/tv/material3/SurfaceGlowNode.smali` — `setShadowLayer`, `SurfaceShapeOutlineCache`, `draw`.
- `smali_classes3/androidx/tv/material3/SurfaceGlowElement.smali` — `glowBlurRadiusPx`, `color`.
- `smali_classes3/androidx/tv/material3/SurfaceScaleKt.smali` — `animateFloatAsState` + `graphicsLayer` wiring.
- `smali_classes3/androidx/tv/material3/tokens/SurfaceScaleTokens.smali` — default durations.
- `smali_classes3/androidx/tv/material3/*.smali` — `SurfaceKt`, `ClickableSurfaceDefaults`, `Glow`, `*Scale`, `*Glow`.
