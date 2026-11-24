package com.kvtube.android.ui.theme

import android.content.Context
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.RenderEffect as AndroidRenderEffect
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.graphics.SweepGradient
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.RenderEffect
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Clean-room Liquid Glass engine for Jetpack Compose (zero external dependencies).
 *
 * Implements:
 * - Offscreen backdrop capture via [GraphicsLayer] + scroll-driven draw invalidation
 * - Vibrancy ColorMatrix + two-pass variance-split Gaussian blur + 3-sigma padding (API 31+)
 * - Bounded rounded-rect SDF rim refraction AGSL shader (API 33+)
 * - Gravity-reactive dual-lobe specular rim border (API 31+)
 * - IGN-dithered edge scrim shader (API 33+) with gradient fallback
 * - 4-tier graceful degradation down to API 21
 */

private const val DEFAULT_LIGHT_ANGLE_DEG = -35f
private const val LIGHT_ANGLE_OFFSET_DEG = -75f
private const val LOBE_HALF_WIDTH_DEG = 58f

@Stable
class LiquidGlassBackdropState(val graphicsLayer: GraphicsLayer) {
    var sourceOffsetInRoot by mutableStateOf(Offset.Zero)
    var isRecording = false

    /**
     * Incremented outside the draw phase (on scroll/fling/route/async content draw) so sibling
     * glass overlays redraw whenever underlying content moves, without recomposing.
     */
    var frameTick by mutableIntStateOf(0)

    private var pendingNotify = false
    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val notifyRunnable = Runnable {
        pendingNotify = false
        frameTick++
    }

    fun scheduleOverlayRefresh() {
        if (!pendingNotify) {
            pendingNotify = true
            mainHandler.post(notifyRunnable)
        }
    }

    val nestedScrollConnection: NestedScrollConnection = object : NestedScrollConnection {
        override fun onPostScroll(
            consumed: Offset,
            available: Offset,
            source: NestedScrollSource,
        ): Offset {
            if (consumed != Offset.Zero) {
                frameTick++
            }
            return Offset.Zero
        }

        override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
            frameTick++
            return Velocity.Zero
        }
    }
}

val LocalLiquidGlassBackdrop = androidx.compose.runtime.staticCompositionLocalOf<LiquidGlassBackdropState?> { null }
val LocalLiquidGlassLightAngle = androidx.compose.runtime.staticCompositionLocalOf<State<Float>> {
    mutableFloatStateOf(DEFAULT_LIGHT_ANGLE_DEG)
}
val LocalGlassChromeInsets = androidx.compose.runtime.compositionLocalOf { PaddingValues(0.dp) }
val LocalIsDarkGlassTheme = androidx.compose.runtime.staticCompositionLocalOf { true }
val LocalIsAmoledGlassTheme = androidx.compose.runtime.staticCompositionLocalOf { false }

/**
 * Lifecycle-aware smoothed gravity tilt angle in degrees (default -35°).
 * Uses exponential low-pass filtering (alpha = 0.12), 1° deadband, and ±4° slew clamp.
 */
@Composable
fun rememberLiquidGlassLightAngle(): State<Float> {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val rawAngle = remember { mutableFloatStateOf(DEFAULT_LIGHT_ANGLE_DEG) }

    if (Build.VERSION.SDK_INT >= 31) {
        DisposableEffect(context, lifecycleOwner) {
            val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
            val sensor = sensorManager?.getDefaultSensor(Sensor.TYPE_GRAVITY)
                ?: sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

            var filteredX = 0f
            var filteredY = 0f
            var initialized = false

            val listener = object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent) {
                    if (event.values.size < 2) return
                    val gx = event.values[0]
                    val gy = -event.values[1]
                    if (!gx.isFinite() || !gy.isFinite()) return

                    if (!initialized) {
                        filteredX = gx
                        filteredY = gy
                        initialized = true
                    } else {
                        filteredX += (gx - filteredX) * 0.12f
                        filteredY += (gy - filteredY) * 0.12f
                    }

                    if (hypot(filteredX, filteredY) < 0.75f) return

                    val target = atan2(filteredY, filteredX) * (180f / Math.PI.toFloat())
                    val current = rawAngle.floatValue
                    val delta = (((target - current) + 540f) % 360f) - 180f
                    if (abs(delta) >= 1.0f) {
                        rawAngle.floatValue = current + delta.coerceIn(-4.0f, 4.0f)
                    }
                }

                override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
            }

            fun register() {
                if (sensorManager != null && sensor != null) {
                    sensorManager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_UI)
                }
            }

            fun unregister() {
                sensorManager?.unregisterListener(listener)
            }

            val observer = LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_RESUME -> register()
                    Lifecycle.Event.ON_PAUSE -> unregister()
                    else -> Unit
                }
            }
            lifecycleOwner.lifecycle.addObserver(observer)
            if (lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
                register()
            }

            onDispose {
                lifecycleOwner.lifecycle.removeObserver(observer)
                unregister()
            }
        }
    }

    return animateFloatAsState(
        targetValue = rawAngle.floatValue,
        animationSpec = tween(durationMillis = 120),
        label = "liquidGlassLightAngle",
    )
}

/**
 * Captures the underlying scrollable tree into [state] so floating glass overlays
 * can sample and blur/refract live content without recomposing on scroll.
 */
fun Modifier.liquidGlassBackdropSource(state: LiquidGlassBackdropState): Modifier =
    this
        .nestedScroll(state.nestedScrollConnection)
        .onGloballyPositioned { state.sourceOffsetInRoot = it.positionInRoot() }
        .drawWithCache {
            onDrawWithContent {
                val layer = state.graphicsLayer
                if (!layer.isReleased && !state.isRecording && size.width >= 1f && size.height >= 1f) {
                    state.isRecording = true
                    try {
                        layer.record {
                            this@onDrawWithContent.drawContent()
                        }
                    } finally {
                        state.isRecording = false
                    }
                    drawLayer(layer)
                    state.scheduleOverlayRefresh()
                } else {
                    drawContent()
                }
            }
        }

fun Modifier.liquidGlassFloating(
    shape: Shape = CircleShape,
    blurDp: Dp = 24.dp,
    enableRefraction: Boolean = true,
    tintOverride: Color? = null,
): Modifier = liquidGlassSurface(
    shape = shape,
    blurDp = blurDp,
    maxRefractionDp = if (enableRefraction) 10.dp else 0.dp,
    refractionRatio = 0.25f,
    shadowDp = 10.dp,
    isFloating = true,
    tintOverride = tintOverride,
)

fun Modifier.liquidGlassCompact(
    shape: Shape = CircleShape,
    blurDp: Dp = 14.dp,
    tintOverride: Color? = null,
): Modifier = liquidGlassSurface(
    shape = shape,
    blurDp = blurDp,
    maxRefractionDp = 6.dp,
    refractionRatio = 0.20f,
    shadowDp = 5.dp,
    isFloating = false,
    tintOverride = tintOverride,
)

private fun Modifier.liquidGlassSurface(
    shape: Shape,
    blurDp: Dp,
    maxRefractionDp: Dp,
    refractionRatio: Float,
    shadowDp: Dp,
    isFloating: Boolean,
    tintOverride: Color?,
): Modifier = composed {
    val backdropState = LocalLiquidGlassBackdrop.current
    val isDark = LocalIsDarkGlassTheme.current
    val isAmoled = LocalIsAmoledGlassTheme.current
    val pageBackground = MaterialTheme.colorScheme.background
    val fallbackSurface = MaterialTheme.colorScheme.surfaceContainer
    val fallbackBorder = MaterialTheme.colorScheme.outlineVariant

    val sampledLayer = if (Build.VERSION.SDK_INT >= 31 && backdropState != null) {
        rememberGraphicsLayer()
    } else {
        null
    }

    var overlayOffsetInRoot by remember { mutableStateOf(Offset.Zero) }

    val baseShadowModifier = this.graphicsLayer {
        this.shape = shape
        this.shadowElevation = shadowDp.toPx()
        this.ambientShadowColor = Color.Black.copy(alpha = if (isDark) 0.45f else 0.14f)
        this.spotShadowColor = Color.Black.copy(alpha = if (isDark) 0.55f else 0.18f)
        this.clip = false
    }

    baseShadowModifier
        .onGloballyPositioned { overlayOffsetInRoot = it.positionInRoot() }
        .drawWithCache {
            val outline = shape.createOutline(size, layoutDirection, this)
            val outlinePath = Path().apply { addOutline(outline) }
            val minDim = min(size.width, size.height)
            val blurPx = blurDp.toPx()
            val refractionHeightPx = if (maxRefractionDp > 0.dp && minDim > 2f) {
                min(maxRefractionDp.toPx(), minDim * refractionRatio)
            } else {
                0f
            }

            val corners = extractCornerRadii(outline, minDim)
            val effectBundle = if (Build.VERSION.SDK_INT >= 31 && backdropState != null && minDim >= 1f) {
                buildLiquidGlassEffect(
                    widthPx = size.width,
                    heightPx = size.height,
                    cornerRadii = corners,
                    blurRadiusPx = blurPx,
                    refractionHeightPx = refractionHeightPx,
                    isDark = isDark,
                )
            } else {
                null
            }

            // Dual-layer tint fill calibrated for contrast >= 4.5:1 over vivid media
            val hasLiveBackdrop = Build.VERSION.SDK_INT >= 31 && backdropState != null && effectBundle != null
            val primaryTint = when {
                tintOverride != null -> tintOverride
                !hasLiveBackdrop -> fallbackSurface.copy(alpha = if (isFloating) 0.96f else 0.94f)
                isAmoled -> Color.Black.copy(alpha = if (isFloating) 0.64f else 0.68f)
                isDark -> Color(0xFF0C0C0E).copy(alpha = if (isFloating) 0.58f else 0.64f)
                else -> Color.White.copy(alpha = if (isFloating) 0.74f else 0.78f)
            }
            val liftTint = when {
                !hasLiveBackdrop -> Color.Transparent
                isDark -> Color.White.copy(alpha = if (isFloating) 0.065f else 0.055f)
                else -> Color.Black.copy(alpha = if (isFloating) 0.025f else 0.02f)
            }
            val innerTopLip = if (isDark) Color.White.copy(alpha = 0.14f) else Color.White.copy(alpha = 0.70f)
            val innerBottomShade = if (isDark) Color.Black.copy(alpha = 0.22f) else Color.Black.copy(alpha = 0.06f)
            val lipHeightPx = 1.dp.toPx()

            onDrawWithContent {
                val frameTick = backdropState?.frameTick ?: 0
                @Suppress("UNUSED_EXPRESSION")
                frameTick

                if (
                    Build.VERSION.SDK_INT >= 31 &&
                    backdropState != null &&
                    sampledLayer != null &&
                    effectBundle != null &&
                    !backdropState.graphicsLayer.isReleased &&
                    !backdropState.isRecording &&
                    !sampledLayer.isReleased &&
                    size.width >= 1f &&
                    size.height >= 1f
                ) {
                    val (composeEffect, padPx) = effectBundle
                    val capW = (ceil(size.width).toInt() + padPx * 2).coerceAtLeast(1)
                    val capH = (ceil(size.height).toInt() + padPx * 2).coerceAtLeast(1)
                    val dx = backdropState.sourceOffsetInRoot.x - overlayOffsetInRoot.x
                    val dy = backdropState.sourceOffsetInRoot.y - overlayOffsetInRoot.y

                    sampledLayer.record(
                        density = this,
                        layoutDirection = layoutDirection,
                        size = IntSize(capW, capH),
                    ) {
                        drawRect(color = pageBackground)
                        translate(left = dx + padPx.toFloat(), top = dy + padPx.toFloat()) {
                            drawLayer(backdropState.graphicsLayer)
                        }
                    }
                    sampledLayer.renderEffect = composeEffect

                    clipPath(outlinePath) {
                        translate(left = -padPx.toFloat(), top = -padPx.toFloat()) {
                            drawLayer(sampledLayer)
                        }
                        drawOutline(outline, color = primaryTint)
                        if (liftTint.alpha > 0f) {
                            drawOutline(outline, color = liftTint)
                        }
                        // Inner vertical thickness sheen
                        drawRect(
                            brush = Brush.verticalGradient(
                                0f to innerTopLip,
                                0.18f to Color.Transparent,
                                0.85f to Color.Transparent,
                                1f to innerBottomShade,
                            ),
                        )
                    }
                } else {
                    clipPath(outlinePath) {
                        drawOutline(outline, color = primaryTint)
                        if (!hasLiveBackdrop && Build.VERSION.SDK_INT < 31) {
                            drawOutline(
                                outline,
                                color = fallbackBorder.copy(alpha = 0.45f),
                                style = Stroke(width = lipHeightPx),
                            )
                        }
                    }
                }

                clipPath(outlinePath) {
                    this@onDrawWithContent.drawContent()
                }
            }
        }
        .liquidGlassBorder(shape = shape, strokeWidth = 1.dp)
}

/**
 * Gravity-reactive dual-lobe specular rim border (API 31+) with hairline fallback below API 31.
 */
fun Modifier.liquidGlassBorder(
    shape: Shape,
    strokeWidth: Dp = 1.dp,
): Modifier = composed {
    val lightAngleState = LocalLiquidGlassLightAngle.current
    val isDark = LocalIsDarkGlassTheme.current
    val fallbackOutline = MaterialTheme.colorScheme.outlineVariant

    this.drawWithCache {
        val strokePx = strokeWidth.toPx()
        if (strokePx <= 0f || size.width < 1f || size.height < 1f) {
            return@drawWithCache onDrawWithContent { drawContent() }
        }

        val outline = shape.createOutline(size, layoutDirection, this)
        if (Build.VERSION.SDK_INT < 31) {
            return@drawWithCache onDrawWithContent {
                drawContent()
                drawOutline(
                    outline = outline,
                    color = fallbackOutline.copy(alpha = 0.55f),
                    style = Stroke(width = strokePx),
                )
            }
        }

        val centerX = size.width * 0.5f
        val centerY = size.height * 0.5f
        val baseRimColor = if (isDark) {
            Color(0xFF303030).copy(alpha = 0.55f)
        } else {
            Color.Black.copy(alpha = 0.10f)
        }
        val peakSpecColor = if (isDark) {
            Color.White.copy(alpha = 0.36f)
        } else {
            Color.White.copy(alpha = 0.90f)
        }

        // 25-stop dual-lobe smoothstep sweep shader baked once per size/theme
        val stops = 25
        val positions = FloatArray(stops)
        val colors = IntArray(stops)
        for (i in 0 until stops) {
            val frac = i.toFloat() / (stops - 1)
            val deg = frac * 360f
            val w1 = smoothLobeWeight(deg, 0f)
            val w2 = smoothLobeWeight(deg, 180f) * 0.90f
            val intensity = maxOf(w1, w2).coerceIn(0f, 1f)
            positions[i] = frac
            colors[i] = peakSpecColor.copy(alpha = peakSpecColor.alpha * intensity).toArgb()
        }

        val sweepShader = SweepGradient(centerX, centerY, colors, positions)
        val matrix = Matrix()
        val sweepBrush = object : ShaderBrush() {
            override fun createShader(size: androidx.compose.ui.geometry.Size): Shader = sweepShader
        }
        val baseStroke = Stroke(width = strokePx * 1.25f)
        val specStroke = Stroke(width = strokePx)
        val clipOutlinePath = Path().apply { addOutline(outline) }

        onDrawWithContent {
            drawContent()
            val angleDeg = lightAngleState.value + LIGHT_ANGLE_OFFSET_DEG
            matrix.reset()
            matrix.postRotate(angleDeg, centerX, centerY)
            sweepShader.setLocalMatrix(matrix)

            clipPath(clipOutlinePath) {
                drawOutline(outline = outline, color = baseRimColor, style = baseStroke)
                drawOutline(outline = outline, brush = sweepBrush, style = specStroke)
            }
        }
    }
}

/**
 * Vertical page-color fade scrim behind top/bottom floating chrome.
 * On API 33+ uses IGN dithering in AGSL to prevent 8-bit gradient banding on OLED screens.
 */
fun Modifier.liquidGlassEdgeFade(
    toTop: Boolean,
    midpointAlpha: Float = 0.55f,
): Modifier = composed {
    val pageColor = MaterialTheme.colorScheme.background

    this.drawWithCache {
        if (size.width < 1f || size.height < 1f) {
            return@drawWithCache onDrawBehind { }
        }

        if (Build.VERSION.SDK_INT >= 33) {
            val shader = RuntimeShader(AGSL_EDGE_FADE_SHADER)
            shader.setColorUniform("pageColor", pageColor.copy(alpha = 0.92f).toArgb())
            shader.setFloatUniform("bounds", size.width, size.height)
            shader.setFloatUniform("midpointAlpha", midpointAlpha)
            shader.setFloatUniform("toTop", if (toTop) 1f else 0f)
            val brush = ShaderBrush(shader)
            onDrawBehind {
                drawRect(brush = brush)
            }
        } else {
            val colors = if (toTop) {
                listOf(
                    pageColor.copy(alpha = 0.92f),
                    pageColor.copy(alpha = 0.92f * midpointAlpha),
                    pageColor.copy(alpha = 0f),
                )
            } else {
                listOf(
                    pageColor.copy(alpha = 0f),
                    pageColor.copy(alpha = 0.92f * midpointAlpha),
                    pageColor.copy(alpha = 0.92f),
                )
            }
            val brush = Brush.verticalGradient(colors = colors)
            onDrawBehind {
                drawRect(brush = brush)
            }
        }
    }
}

private fun smoothLobeWeight(angleDeg: Float, targetDeg: Float): Float {
    val diff = abs((((angleDeg - targetDeg) + 540f) % 360f) - 180f)
    if (diff >= LOBE_HALF_WIDTH_DEG) return 0f
    val t = 1f - (diff / LOBE_HALF_WIDTH_DEG)
    return t * t * (3f - 2f * t)
}

private fun extractCornerRadii(outline: Outline, minDim: Float): FloatArray = when (outline) {
    is Outline.Rounded -> floatArrayOf(
        outline.roundRect.topLeftCornerRadius.x,
        outline.roundRect.topRightCornerRadius.x,
        outline.roundRect.bottomRightCornerRadius.x,
        outline.roundRect.bottomLeftCornerRadius.x,
    )
    is Outline.Rectangle -> floatArrayOf(0f, 0f, 0f, 0f)
    is Outline.Generic -> {
        val r = minDim * 0.5f
        floatArrayOf(r, r, r, r)
    }
}

@RequiresApi(31)
private fun buildLiquidGlassEffect(
    widthPx: Float,
    heightPx: Float,
    cornerRadii: FloatArray,
    blurRadiusPx: Float,
    refractionHeightPx: Float,
    isDark: Boolean,
): Pair<RenderEffect, Int>? {
    if (blurRadiusPx <= 0f && refractionHeightPx <= 0f) return null

    // 1. Vibrancy pre-filter
    val satMatrix = ColorMatrix().apply { setSaturation(1.24f) }
    val lumScale = if (isDark) 1.04f else 1.02f
    val lumMatrix = ColorMatrix(
        floatArrayOf(
            lumScale, 0f, 0f, 0f, 0f,
            0f, lumScale, 0f, 0f, 0f,
            0f, 0f, lumScale, 0f, 0f,
            0f, 0f, 0f, 1f, 0f,
        ),
    )
    satMatrix.postConcat(lumMatrix)
    var currentEffect: AndroidRenderEffect =
        AndroidRenderEffect.createColorFilterEffect(ColorMatrixColorFilter(satMatrix))

    // 2. Two-pass variance-split Gaussian blur (sigma = 0.57735 * r + 0.5)
    var totalBlurPad = 0f
    if (blurRadiusPx > 0.5f) {
        val sigma = blurRadiusPx * 0.57735f + 0.5f
        val sigmas = if (blurRadiusPx <= 5f) {
            floatArrayOf(sigma)
        } else {
            val s1 = min(16f, 0.5f * sigma)
            val s2 = sqrt((sigma * sigma) - (s1 * s1))
            floatArrayOf(s1, s2)
        }
        for (s in sigmas) {
            val sigmaPass = s.coerceAtLeast(0.5f)
            totalBlurPad += ceil(2.5f * sigmaPass)
            val blurPass = AndroidRenderEffect.createBlurEffect(sigmaPass, sigmaPass, Shader.TileMode.CLAMP)
            currentEffect = AndroidRenderEffect.createChainEffect(blurPass, currentEffect)
        }
    }

    val refractionPad = if (Build.VERSION.SDK_INT >= 33) refractionHeightPx else 0f
    val paddingPx = ceil(totalBlurPad + refractionPad).toInt().coerceIn(0, 96)

    // 3. Bounded rounded-rect SDF edge lens refraction (API 33+)
    if (Build.VERSION.SDK_INT >= 33 && refractionHeightPx > 0.5f) {
        val shader = RuntimeShader(AGSL_REFRACTION_SHADER)
        shader.setFloatUniform("size", widthPx, heightPx)
        shader.setFloatUniform("offset", -paddingPx.toFloat(), -paddingPx.toFloat())
        shader.setFloatUniform(
            "cornerRadii",
            cornerRadii[0],
            cornerRadii[1],
            cornerRadii[2],
            cornerRadii[3],
        )
        shader.setFloatUniform("refractionHeight", refractionHeightPx)
        shader.setFloatUniform("refractionAmount", refractionHeightPx * 2.0f)
        val refractionEffect = AndroidRenderEffect.createRuntimeShaderEffect(shader, "content")
        currentEffect = AndroidRenderEffect.createChainEffect(refractionEffect, currentEffect)
    }

    return currentEffect.asComposeRenderEffect() to paddingPx
}

private const val AGSL_REFRACTION_SHADER = """
uniform shader content;
uniform float2 size;
uniform float2 offset;
uniform float4 cornerRadii;
uniform float refractionHeight;
uniform float refractionAmount;

float cornerRadiusFor(float2 pos, float4 radii) {
    if (pos.x >= 0.0) {
        return pos.y <= 0.0 ? radii.y : radii.z;
    } else {
        return pos.y <= 0.0 ? radii.x : radii.w;
    }
}

float sdBoxRounded(float2 p, float2 halfExtent, float r) {
    float2 q = abs(p) - (halfExtent - float2(r));
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float2 sdBoxGradient(float2 p, float2 halfExtent, float r) {
    float2 q = abs(p) - (halfExtent - float2(r));
    if (q.x >= 0.0 || q.y >= 0.0) {
        return sign(p) * normalize(max(q, 0.0));
    }
    float gx = step(q.y, q.x);
    return sign(p) * float2(gx, 1.0 - gx);
}

half4 main(float2 coord) {
    float2 halfExtent = size * 0.5;
    float2 localPos = (coord + offset) - halfExtent;
    float r = cornerRadiusFor(localPos, cornerRadii);
    float sd = sdBoxRounded(localPos, halfExtent, r);
    if (-sd >= refractionHeight) {
        return content.eval(coord);
    }
    float clamped = clamp(1.0 - (-min(sd, 0.0) / max(refractionHeight, 0.001)), 0.0, 1.0);
    float lensCurve = 1.0 - sqrt(max(0.0, 1.0 - clamped * clamped));
    float2 grad = sdBoxGradient(localPos, halfExtent, min(r * 1.5, min(halfExtent.x, halfExtent.y)));
    return content.eval(coord + grad * (lensCurve * refractionAmount));
}
"""

private const val AGSL_EDGE_FADE_SHADER = """
layout(color) uniform half4 pageColor;
uniform float2 bounds;
uniform float midpointAlpha;
uniform float toTop;

half4 main(float2 p) {
    float t = clamp(p.y / max(bounds.y, 1.0), 0.0, 1.0);
    float pos = toTop > 0.5 ? t : (1.0 - t);
    float alpha = pos < 0.5
        ? mix(1.0, midpointAlpha, pos * 2.0)
        : mix(midpointAlpha, 0.0, (pos - 0.5) * 2.0);
    alpha *= pageColor.a;
    float ignAlpha = fract(52.9829189 * fract(dot(floor(p) + float2(37.0, 17.0), float2(0.06711056, 0.00583715)))) * 2.0 - 1.0;
    float range = min(2.0 / 255.0, min(alpha, 1.0 - alpha));
    float ditheredAlpha = clamp(alpha + ignAlpha * range, 0.0, 1.0);
    float ignRgb = fract(52.9829189 * fract(dot(floor(p), float2(0.06711056, 0.00583715)))) - 0.5;
    float3 rgb = clamp(pageColor.rgb * ditheredAlpha + ignRgb * (1.0 / 255.0) * ditheredAlpha, float3(0.0), float3(ditheredAlpha));
    return half4(rgb, ditheredAlpha);
}
"""
