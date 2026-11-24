# Liquid Glass Design System — Cross-Platform Style Guide

Clean-room specification distilled from static reverse-engineering of modern Android Liquid Glass implementations (two-pass variance-split blur, vibrancy boost, rounded-rect SDF rim refraction, dual-lobe gravity-reactive specular border, variance-space progressive edge fades with IGN dithering, and 4-tier graceful degradation), adapted for **Web (CSS)** and **Android (Jetpack Compose)** alongside Astryx / Material 3 tokens.

---

## 1. Optical Anatomy (5 Layers + Progressive Edge Scrims)

A convincing Liquid Glass surface never looks like flat translucent gray. It stacks five distinct optical layers:

```
┌─────────────────────────────────────────────────────────┐
│ 5. Dual-Lobe Specular Rim Border (directional / gravity) │
│ 4. Thickness Cues (outer drop shadow + inner lip glow)  │
│ 3. Dual-Layer Tint Fill (dark base + subtle light lift) │
│ 2. Rounded-Rect Rim Refraction (flat center untouched)  │
│ 1. Vibrancy Boost + Two-Pass Variance-Split Blur        │
└─────────────────────────────────────────────────────────┘
          ▲ samples live scrolling content behind
```

1. **Backdrop Capture + Vibrancy Boost**:
   - Underlying content is sampled live and boosted in saturation (`saturate(180%)` on Web; `ColorMatrix.setSaturation(1.24f)` + subtle luminance lift `1.04×` dark / `1.02×` light on Android) *before* blurring so bright thumbnails stay luminous rather than turning muddy gray.
2. **Two-Pass Variance-Split Gaussian Blur + $3\sigma$ Padding**:
   - Single-pass heavy blurs ($>5\text{ px}$) exhibit Skia downsampling stair-stepping and edge bleed.
   - Convert radius $r$ to Gaussian sigma $\sigma = 0.57735\,r + 0.5$. When $r > 5\text{ px}$, split into two chained passes whose variances sum to $\sigma^2$:
     $$\sigma_1 = \min(16,\; 0.5\,\sigma), \qquad \sigma_2 = \sqrt{\sigma^2 - \sigma_1^2}$$
   - Expand backdrop crop padding by $\sum \lceil 3\sigma_i \rceil + \text{refractionHeight}$ with clamp tile mode so edges never darken.
3. **Bounded Rounded-Rect Edge Refraction (Android API 33+ AGSL)**:
   - Evaluate signed distance `sdRoundedRect` relative to half-size and corner radius.
   - Leave the flat interior completely legible (`if (-sd >= refractionHeight) return content.eval(coord);`).
   - Bend only the outer rim of thickness `refractionHeight = min(10dp, 0.25 * minDim)` with `refractionAmount = 2 * refractionHeight` using a circular lens curve `1 - sqrt(1 - x²)` along the softened SDF gradient (`gradRadius = min(1.5 * r, min(w/2, h/2))`).
4. **Dual-Layer Tint & Thickness Cues**:
   - **Dark mode**: dark tint base (`0.25–0.32` alpha) + subtle crisp white lift (`0.075` alpha) — keeps foreground text contrast $\ge 4.5:1$ over vivid media while looking glassy.
   - **AMOLED mode**: deeper tint base (`0.42–0.52` alpha) + `0.06` white lift so pure-black backdrops keep separation.
   - **Light mode**: luminous white tint (`0.48–0.60` alpha) + subtle `0.015–0.03` dark ink anchor.
   - **Thickness**: soft outer drop shadow (`10–24px/dp` blur, slight $+Y$ offset) paired with an inset top highlight (`1px/dp` white lip) and subtle bottom inner shadow.
5. **Gravity-Reactive Dual-Lobe Specular Rim Border**:
   - Light angle defaults to `-35°` (top-left light source, shifted by `-75°` in shader space).
   - On Android devices with a gravity/accelerometer sensor, smooth `(x, -y)` via exponential low-pass ($\alpha = 0.12$), ignore near-flat tilts ($\text{mag} < 0.75$), apply a $1^\circ$ deadband and $\pm 4^\circ$/event slew clamp, and feed a precomputed 25-stop sweep gradient matrix (`translate → rotate → -translate`) with two opposing smoothstep lobes ($\pm 58^\circ$, $f^2(3 - 2f)$, opposing lobe at $+180^\circ$ scaled by $0.9\times$).
6. **Progressive Blur Edge Scrims + IGN Dithering (Top/Bottom Bars)**:
   - When fading scrolling feeds toward top/bottom system chrome, blend blur levels in **variance space**:
     $$\text{upper} = \operatorname{clamp}\!\left(\frac{u^2 - a^2}{b^2 - a^2},\; 0,\; 1\right)$$
     across a 4-level pyramid $\{0,\; 0.125\sigma,\; 0.5\sigma,\; 1.0\sigma\}$.
   - Add **Interleaved Gradient Noise (IGN)** (`fract(52.9829189 * fract(dot(floor(p), float2(0.06711056, 0.00583715))))`) at $\pm 2/255$ alpha and $\pm 0.5/255$ RGB so OLED displays show zero 8-bit gradient banding.

---

## 2. Surface Roles & Token Matrix

| Role | Use Case | Blur | Refraction | Tint (Dark / AMOLED / Light) | Border & Shadow |
|---|---|---|---|---|---|
| `glass-floating` | Floating headers, capsule bottom docks, modals, drawers, sheets | `20px / 20dp` | `min(10dp, 0.25 * minDim)` | Dark `#0F0F0F @ 66%` + `#FFF @ 6%` · AMOLED `#080808 @ 76%` · Light `#FFF @ 74%` | Dual-lobe specular rim (`1px/dp`) + outer soft shadow (`0 10px 30px`) + inset top highlight |
| `glass-compact` | Search pills, floating mini-player, chips, tooltips, popovers, icon buttons | `10–12px / 10dp` | `min(6dp, 0.20 * minDim)` | Dark `surface @ 68%` · AMOLED `#0E0E0E @ 78%` · Light `#FFF @ 78%` | Fine specular rim (`0.8–1dp`) + light drop shadow (`0 4px 16px`) |
| `glass-icon-group` | Paired toolbar actions (e.g. Notifications + Search) | `20px / 20dp` | `min(10dp, 0.25 * minDim)` | Same as `glass-floating` | **Rule**: Two independent actions share **one capsule** (`CircleShape`), never two disconnected circles |
| `glass-gradient-bar` | Edge-to-edge top/bottom chrome scrim behind floating pills | Edge fade `0 → 24px/dp` | None | Vertical `pageColor` scrim (`1.0 → midpointAlpha → 0.0`) with IGN dithering | No border |

**Contrast & Accessibility Guarantees**:
- Primary text and active icons on any glass surface must maintain **$\ge 4.5:1$** contrast (WCAG 1.4.3) and **$\ge 3:1$** for large titles, icons, and component boundaries (WCAG 1.4.11) even over bright white or saturated thumbnails.
- Always honor user preferences:
  - Web: `@supports not (backdrop-filter: blur(1px))`, `@media (prefers-reduced-transparency: reduce)`, `@media (prefers-reduced-motion: reduce)`, `@media (forced-colors: active)`.
  - Android: 4-tier degradation (API 33+ AGSL → API 31–32 `RenderEffect` + sweep rim → API 21–30 translucent/solid Astryx fallback → standalone `backdrop == null` fallback).

---

## 3. Web CSS Drop-In Recipe

1. **Color-Space Safe Mixing**: Always use `color-mix(in oklab, ...)` for neutral glass tints—never `in oklch`, which triggers hue shifts on low-chroma neutrals in Chromium. Feature-detect gradient interpolation with `--in-oklab`.
2. **Core Tokens (`:root` / `[data-theme='dark'|'amoled'|'light']`)**:

```css
:root {
  --in-oklab: ;
  --lg-blur-floating: 28px;
  --lg-blur-panel: 32px;
  --lg-blur-compact: 18px;
  --lg-rim-angle: -35deg;
}

@supports (background: linear-gradient(in oklab, white, black)) {
  :root { --in-oklab: in oklab; }
}

[data-theme='dark'] {
  color-scheme: dark;
  --lg-vibrancy: saturate(170%) brightness(0.95);
  --lg-bg-floating: color-mix(in oklab, var(--yt-surface, #101010) 76%, transparent);
  --lg-bg-panel: color-mix(in oklab, var(--yt-surface, #101010) 85%, transparent);
  --lg-bg-compact: color-mix(in oklab, var(--yt-hover, #202020) 76%, transparent);
  --lg-bg-solid-fallback: #161616;
  --lg-rim-hi: rgba(255, 255, 255, 0.34);
  --lg-rim-lo: rgba(255, 255, 255, 0.07);
  --lg-rim-base: rgba(255, 255, 255, 0.14);
  --lg-inset-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 0 -1px 0 rgba(0, 0, 0, 0.25);
  --lg-shadow-floating: 0 10px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.28);
  --lg-shadow-compact: 0 4px 16px rgba(0, 0, 0, 0.32);
}

[data-theme='amoled'] {
  color-scheme: dark;
  --lg-vibrancy: saturate(175%) brightness(0.92);
  --lg-bg-floating: rgba(6, 6, 6, 0.82);
  --lg-bg-panel: rgba(6, 6, 6, 0.89);
  --lg-bg-compact: rgba(20, 20, 20, 0.82);
  --lg-bg-solid-fallback: #0a0a0a;
  --lg-rim-hi: rgba(255, 255, 255, 0.30);
  --lg-rim-lo: rgba(255, 255, 255, 0.06);
  --lg-rim-base: rgba(255, 255, 255, 0.13);
  --lg-inset-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.14), inset 0 -1px 0 rgba(0, 0, 0, 0.6);
  --lg-shadow-floating: 0 12px 36px rgba(0, 0, 0, 0.85), 0 2px 10px rgba(0, 0, 0, 0.6);
  --lg-shadow-compact: 0 4px 18px rgba(0, 0, 0, 0.72);
}

[data-theme='light'] {
  color-scheme: light;
  --lg-vibrancy: saturate(165%) brightness(1.03);
  --lg-bg-floating: rgba(255, 255, 255, 0.80);
  --lg-bg-panel: rgba(255, 255, 255, 0.88);
  --lg-bg-compact: rgba(244, 244, 246, 0.82);
  --lg-bg-solid-fallback: #ffffff;
  --lg-rim-hi: rgba(255, 255, 255, 0.92);
  --lg-rim-lo: rgba(15, 15, 15, 0.08);
  --lg-rim-base: rgba(15, 15, 15, 0.10);
  --lg-inset-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.85), inset 0 -1px 0 rgba(15, 15, 15, 0.06);
  --lg-shadow-floating: 0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
  --lg-shadow-compact: 0 4px 14px rgba(0, 0, 0, 0.08);
}
```

3. **Reusable Utility Classes (`.lg-floating`, `.lg-compact`, `.lg-capsule`)**:
   - **Tailwind v4 / LightningCSS rule**: Always declare `-webkit-backdrop-filter` **before** unprefixed `backdrop-filter`. Placing `-webkit-backdrop-filter` *after* `backdrop-filter` causes LightningCSS to deduplicate/strip the unprefixed property, disabling blur in Firefox.
   - Use `--lg-bg-panel` + `28–32px` heavy frost blur for dense text panels (notification popovers, account menus, search suggestions, navigation drawers, modals) so labels stay high-contrast over bright thumbnails.
   - Dual-lobe specular border is drawn via `::before` with `padding: 1px`, `conic-gradient(from var(--lg-rim-angle), var(--lg-rim-hi), var(--lg-rim-lo) 90deg, var(--lg-rim-hi) 180deg, var(--lg-rim-lo) 270deg, var(--lg-rim-hi) 360deg)`, and `mask-composite: exclude` (`-webkit-mask-composite: xor`).
   - Always include `@supports not (backdrop-filter: blur(1px))`, `@media (prefers-reduced-transparency: reduce)`, `@media (prefers-reduced-motion: no-preference)`, and `@media (forced-colors: active)`.

---

## 4. Android Jetpack Compose Drop-In Recipe

Core file: `android-app/app/src/main/java/com/kvtube/android/ui/theme/LiquidGlass.kt`.

1. **Wrap your root scrollable container & provide locals**:
   ```kotlin
   val backdropLayer = rememberGraphicsLayer()
   val backdropState = remember(backdropLayer) { LiquidGlassBackdropState(backdropLayer) }
   val lightAngle = rememberLiquidGlassLightAngle()

   CompositionLocalProvider(
       LocalLiquidGlassBackdrop provides backdropState,
       LocalLiquidGlassLightAngle provides lightAngle,
       LocalGlassChromeInsets provides chromeInsets,
   ) {
       Box(Modifier.fillMaxSize()) {
           // 1. Scrollable content captured into backdropLayer
           Box(Modifier.fillMaxSize().liquidGlassBackdropSource(backdropState)) {
               MainContent()
           }
           // 2. Floating Liquid Glass chrome overlaid on top
           FloatingTopBar(Modifier.align(Alignment.TopCenter))
           FloatingBottomDock(Modifier.align(Alignment.BottomCenter))
       }
   }
   ```
2. **Apply modifiers to any floating UI component**:
   - `Modifier.liquidGlassFloating(shape = CircleShape)` — top bars, bottom dock, floating sheets.
   - `Modifier.liquidGlassCompact(shape = CircleShape)` — chips, search pill, icon buttons, mini-player.
   - `Modifier.liquidGlassBorder(shape = RoundedCornerShape(14.dp))` — gravity-reactive specular rim alone (great on video thumbnails or wide-screen PiP cards).
   - `Modifier.liquidGlassEdgeFade(toTop = true / false)` — IGN-dithered page scrim behind floating chrome.

---

## 5. Layout & Ergonomics Rules

1. **Content scrolls behind chrome**: Scrollable `LazyColumn` / `LazyVerticalGrid` / page content must extend edge-to-edge under floating top/bottom glass bars, padded via `LocalGlassChromeInsets` (Android) or `padding-top` / `padding-bottom` (Web) so the first and last items rest clear of chrome while scrolling glides underneath.
2. **Reserve glass for floating layers**: Never apply `backdrop-filter` or `RenderEffect` backdrop sampling to repeating feed cards—only to floating headers, navigation docks, mini-players, drawers, popovers, and modal overlays.
3. **Group paired actions & size docks to content**: Two independent toolbar actions (e.g., Notifications + Search) share **one capsule** (`CircleShape`) rather than two adjacent separate circular buttons. Keep 3-tab floating capsule docks compact (`~244dp` / `252px`, `58dp/px` tall) so they hug their tabs, and glide a full-height iOS-style frosted lens pill across tabs on tap, drag, or pointer hover.
4. **Chromeless routes stay clean**: Full-bleed playback (`Watch`, `LocalWatch`, `Shorts` video canvas) hides heavy glass bars; only compact floating controls (e.g., Shorts search pill) use `liquidGlassCompact`.
