package com.camelot.merlin.sortire

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import android.os.SystemClock
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.random.Random

/**
 * Full-screen multi-touch surface. All look/feel values come from [Settings] and are read live,
 * so the tuning panel changes take effect immediately. Frames are only requested while animating.
 */
class ArenaView(context: Context) : View(context) {

    private inner class Finger(
        var x: Float,
        var y: Float,
        val color: Int,
        val discWoodType: WoodType,
        seed: Long,
        shadeShift: Float
    ) {
        var down = true
        val puckBitmap: Bitmap = WoodgrainEngine.getWoodDiscBitmap((baseRadius * 2f).roundToInt(), discWoodType, seed, shadeShift)
    }

    private enum class Phase { WAITING, COUNTING, RESULT }

    var mode: Mode = Mode.FIRST
        set(value) {
            if (field != value) {
                field = value
                reset()
            }
        }

    private val density = resources.displayMetrics.density
    private fun f(s: Setting) = Settings[s]
    private fun on(s: Setting) = Settings.bool(s)

    private val baseRadius get() = f(Setting.RADIUS) * density
    private val countdownMs get() = f(Setting.COUNTDOWN_MS).toLong().coerceAtLeast(1L)
    private val revealGapMs get() = f(Setting.REVEAL_GAP_MS).toLong().coerceAtLeast(1L)
    private val minFingers get() = f(Setting.MIN_FINGERS).toInt()

    private val fingers = LinkedHashMap<Int, Finger>()   // pointerId -> finger, in arrival order
    private var palette = Palette()
    private var nextColorIndex = 0
    private var phase = Phase.WAITING
    private var countdownStart = 0L
    private var resultStart = 0L
    private var animationEnd = 0L
    private var winnerId = -1
    private var ranking: List<Int> = emptyList()
    private var revealed = 0

    private val woodType: WoodType
        get() {
            val idx = f(Setting.WOOD_TYPE).toInt().coerceIn(0, WoodType.values().size - 1)
            return WoodType.values()[idx]
        }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val markerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }
    private val arcRect = RectF()
    private val bgDstRect = RectF()

    init {
        isHapticFeedbackEnabled = true
    }

    /** Called by the tuning panel. */
    fun onSettingChanged(s: Setting?) {
        if (s == null || s.resetsRound) reset() else invalidate()
    }

    // region Touch

    override fun onTouchEvent(e: MotionEvent): Boolean {
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                val i = e.actionIndex
                addFinger(e.getPointerId(i), e.getX(i), e.getY(i))
            }
            MotionEvent.ACTION_MOVE -> {
                for (i in 0 until e.pointerCount) {
                    val fg = fingers[e.getPointerId(i)] ?: continue
                    if (fg.down) { fg.x = e.getX(i); fg.y = e.getY(i) }
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> liftFinger(e.getPointerId(e.actionIndex))
            MotionEvent.ACTION_CANCEL -> for (i in 0 until e.pointerCount) liftFinger(e.getPointerId(i))
        }
        invalidate()
        return true
    }

    private fun addFinger(id: Int, x: Float, y: Float) {
        if (phase == Phase.RESULT) {
            // Only start a new round once every finger from the last one is up.
            if (fingers.values.any { it.down }) return
            reset()
        }
        val woodTypes = WoodType.values()
        val discWood = woodTypes.random()
        val shadeShift = (Random.nextFloat() * 0.5f - 0.25f)
        val randomSeed = Random.nextLong()
        fingers[id] = Finger(x, y, palette.color(nextColorIndex++), discWood, randomSeed, shadeShift)
        haptic(Haptic.TAP)
        SoundManager.playPop()
        restartCountdown()
    }

    private fun liftFinger(id: Int) {
        val fg = fingers[id] ?: return
        if (!fg.down) return
        SoundManager.playPop()
        if (phase == Phase.RESULT) {
            fg.down = false                   // keep it on screen as part of the result
        } else {
            fingers.remove(id)
            restartCountdown()
        }
    }

    // endregion

    // region State

    private fun restartCountdown() {
        phase = if (fingers.size >= minFingers) Phase.COUNTING else Phase.WAITING
        countdownStart = SystemClock.uptimeMillis()
    }

    private fun reset() {
        fingers.clear()
        ranking = emptyList()
        winnerId = -1
        revealed = 0
        nextColorIndex = 0
        phase = Phase.WAITING
        palette = Palette()
        invalidate()
    }

    private fun resolve(now: Long) {
        phase = Phase.RESULT
        resultStart = now
        val ids = fingers.keys.toList()
        when (mode) {
            Mode.FIRST -> {
                winnerId = ids.random()
                animationEnd = now + max(f(Setting.WINNER_FADE_MS), f(Setting.WINNER_GROW_MS)).toLong() + 200
                haptic(Haptic.SUCCESS)
                SoundManager.playWinnerSound(context)
            }
            Mode.ORDER -> {
                ranking = ids.shuffled()
                revealed = 0
                animationEnd = now + (ranking.size - 1) * revealGapMs + f(Setting.ORDER_POP_MS).toLong() + 150
                advanceReveal(now)
            }
        }
    }

    private fun advanceReveal(now: Long) {
        val target = min(ranking.size, ((now - resultStart) / revealGapMs).toInt() + 1)
        while (revealed < target) {
            revealed++
            val isSuccess = revealed == ranking.size
            haptic(if (isSuccess) Haptic.SUCCESS else Haptic.TICK)
            if (isSuccess) {
                SoundManager.playWinnerSound(context)
            } else {
                SoundManager.playClick()
            }
        }
    }

    private fun needsFrames(now: Long) = when (phase) {
        Phase.WAITING, Phase.COUNTING -> fingers.isNotEmpty()
        Phase.RESULT -> now < animationEnd
    }

    // endregion

    // region Haptics

    private enum class Haptic { TAP, TICK, SUCCESS }

    private fun haptic(kind: Haptic) {
        val enabled = when (kind) {
            Haptic.TAP -> on(Setting.HAPTIC_TAP)
            Haptic.TICK -> on(Setting.HAPTIC_TICK)
            Haptic.SUCCESS -> on(Setting.HAPTIC_RESULT)
        }
        if (!enabled) return

        try {
            val vibrator = if (Build.VERSION.SDK_INT >= 31) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? android.os.VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? android.os.Vibrator
            }

            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= 26) {
                    val duration = when (kind) {
                        Haptic.TAP -> 45L
                        Haptic.TICK -> 35L
                        Haptic.SUCCESS -> 100L
                    }
                    val amplitude = when (kind) {
                        Haptic.TAP -> android.os.VibrationEffect.DEFAULT_AMPLITUDE
                        Haptic.TICK -> 200
                        Haptic.SUCCESS -> 255
                    }
                    vibrator.vibrate(android.os.VibrationEffect.createOneShot(duration, amplitude))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(if (kind == Haptic.SUCCESS) 90L else 45L)
                }
                return
            }
        } catch (_: Exception) {}

        val constant = when (kind) {
            Haptic.TAP -> HapticFeedbackConstants.LONG_PRESS
            Haptic.TICK -> HapticFeedbackConstants.KEYBOARD_TAP
            Haptic.SUCCESS ->
                if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM
                else HapticFeedbackConstants.LONG_PRESS
        }
        performHapticFeedback(constant)
    }

    // endregion

    // region Drawing

    override fun onDraw(canvas: Canvas) {
        val now = SystemClock.uptimeMillis()
        if (phase == Phase.COUNTING && now - countdownStart >= countdownMs) resolve(now)
        if (phase == Phase.RESULT && mode == Mode.ORDER) advanceReveal(now)

        val w = fingers[winnerId]
        if (phase == Phase.RESULT && mode == Mode.FIRST && on(Setting.WINNER_FLOOD) && w != null) {
            val e = (now - resultStart) / 1000f
            val growS = f(Setting.WINNER_GROW_MS) / 1000f
            val t = if (growS <= 0f) 1f else min(1f, e / growS)
            val grow = 1f - (1f - t).pow(3)

            if (on(Setting.WOODGRAIN_ENABLED)) {
                val bgWinner = WoodgrainEngine.getWoodBackgroundBitmap(w.discWoodType)
                val bgOrig = WoodgrainEngine.getWoodBackgroundBitmap(woodType)
                bgDstRect.set(0f, 0f, width.toFloat(), height.toFloat())
                bitmapPaint.alpha = 255
                canvas.drawBitmap(bgOrig, null, bgDstRect, bitmapPaint)
                bitmapPaint.alpha = (grow.coerceIn(0f, 1f) * 255).toInt()
                canvas.drawBitmap(bgWinner, null, bgDstRect, bitmapPaint)
            } else {
                val blendedColor = blendColors(palette.background, w.color, grow)
                canvas.drawColor(blendedColor)
            }
        } else {
            if (on(Setting.WOODGRAIN_ENABLED)) {
                val bg = WoodgrainEngine.getWoodBackgroundBitmap(woodType)
                bgDstRect.set(0f, 0f, width.toFloat(), height.toFloat())
                bitmapPaint.alpha = 255
                canvas.drawBitmap(bg, null, bgDstRect, bitmapPaint)
            } else {
                canvas.drawColor(palette.background)
            }
        }

        if (fingers.isEmpty()) {
            drawHint(canvas)
            return
        }
        when (phase) {
            Phase.WAITING, Phase.COUNTING -> drawLive(canvas, now)
            Phase.RESULT -> if (mode == Mode.FIRST) drawWinner(canvas, now) else drawRanking(canvas, now)
        }
        if (needsFrames(now)) postInvalidateOnAnimation()
    }

    private fun circle(c: Canvas, fg: Finger, x: Float, y: Float, r: Float, color: Int, alpha: Float = 1f) {
        if (r <= 0f) return
        if (on(Setting.WOODGRAIN_ENABLED)) {
            // Drop shadow behind wooden puck
            shadowPaint.color = Color.argb((alpha * 90).toInt(), 0, 0, 0)
            c.drawCircle(x + 5f * density, y + 7f * density, r + 2f * density, shadowPaint)

            // Draw static wooden puck bitmap matching this finger's assigned wood species
            val rect = RectF(x - r, y - r, x + r, y + r)
            bitmapPaint.alpha = (alpha.coerceIn(0f, 1f) * 255).toInt()
            c.drawBitmap(fg.puckBitmap, null, rect, bitmapPaint)
        } else {
            paint.style = Paint.Style.FILL
            paint.color = color
            paint.alpha = (alpha.coerceIn(0f, 1f) * 255).toInt()
            c.drawCircle(x, y, r, paint)
        }
    }

    private fun drawLive(c: Canvas, now: Long) {
        val progress = min(1f, (now - countdownStart).toFloat() / countdownMs)
        val pulseAmount = f(Setting.PULSE_AMOUNT)
        val pulseSpeed = f(Setting.PULSE_SPEED)
        val showRing = phase == Phase.COUNTING && on(Setting.RING_ENABLED)
        if (showRing) {
            ringPaint.strokeWidth = f(Setting.RING_STROKE) * density
            ringPaint.alpha = (f(Setting.RING_OPACITY) * 255).toInt()
        }
        var i = 0
        for (fg in fingers.values) {
            val r = baseRadius * (1f + pulseAmount * sin(now / 1000f * pulseSpeed + i))
            circle(c, fg, fg.x, fg.y, r, fg.color)
            if (showRing) {
                val rr = r + f(Setting.RING_OFFSET) * density
                arcRect.set(fg.x - rr, fg.y - rr, fg.x + rr, fg.y + rr)
                ringPaint.color = fg.color
                ringPaint.alpha = (f(Setting.RING_OPACITY) * 255).toInt()
                c.drawArc(arcRect, -90f, 360f * progress, false, ringPaint)
            }
            i++
        }
    }

    private fun getAdaptiveMarkerColor(circleColor: Int): Int {
        val hsv = FloatArray(3)
        Color.colorToHSV(circleColor, hsv)
        val sat = hsv[1]
        val v = hsv[2]

        if (v > 0.65f) {
            hsv[1] = (sat * 1.3f).coerceIn(0f, 1f)
            hsv[2] = (v * 0.35f).coerceIn(0f, 1f)
        } else {
            hsv[1] = (sat * 0.35f).coerceIn(0f, 1f)
            hsv[2] = min(1f, v * 1.6f + 0.25f)
        }
        return Color.HSVToColor(hsv)
    }

    private fun drawWinner(c: Canvas, now: Long) {
        val e = (now - resultStart) / 1000f
        val fadeS = f(Setting.WINNER_FADE_MS) / 1000f
        val growS = f(Setting.WINNER_GROW_MS) / 1000f
        val fade = if (fadeS <= 0f) 0f else max(0f, 1f - e / fadeS)
        if (fade > 0f) {
            for ((id, fg) in fingers) if (id != winnerId) circle(c, fg, fg.x, fg.y, baseRadius, fg.color, fade)
        }
        val w = fingers[winnerId] ?: return
        val t = if (growS <= 0f) 1f else min(1f, e / growS)
        val grow = 1f - (1f - t).pow(3)
        val radius = baseRadius * (1f + 0.3f * grow)
        circle(c, w, w.x, w.y, radius, w.color)

        // Adaptive marker ring & center dot (never jarring white)
        if (on(Setting.MARKER_ENABLED)) {
            val markerColor = getAdaptiveMarkerColor(w.color)
            val stroke = f(Setting.MARKER_STROKE) * density
            if (stroke > 0f) {
                markerPaint.strokeWidth = stroke
                markerPaint.color = markerColor
                c.drawCircle(w.x, w.y, baseRadius * f(Setting.MARKER_RADIUS), markerPaint)
            }
            paint.style = Paint.Style.FILL
            paint.color = markerColor
            c.drawCircle(w.x, w.y, baseRadius * f(Setting.MARKER_DOT) * grow, paint)
        }
    }

    private fun drawRanking(c: Canvas, now: Long) {
        val popS = f(Setting.ORDER_POP_MS) / 1000f
        for ((id, fg) in fingers) {
            val k = ranking.indexOf(id)
            if (k < 0) continue
            if (k < revealed) {
                val age = (now - (resultStart + k * revealGapMs)) / 1000f
                val pop = if (popS <= 0f) 0f else max(0f, 1f - age / popS)
                val r = baseRadius * (f(Setting.ORDER_REVEALED_SCALE) + f(Setting.ORDER_POP_AMOUNT) * pop)
                circle(c, fg, fg.x, fg.y, r, fg.color)
                textPaint.typeface = Typeface.DEFAULT_BOLD
                textPaint.textSize = r * f(Setting.ORDER_TEXT_SCALE)
                textPaint.color = Color.WHITE
                // Vertically center text
                val textY = fg.y - (textPaint.descent() + textPaint.ascent()) / 2f
                c.drawText("${k + 1}", fg.x, textY, textPaint)
            } else {
                val r = baseRadius * f(Setting.ORDER_PENDING_SCALE)
                circle(c, fg, fg.x, fg.y, r, fg.color, f(Setting.ORDER_PENDING_ALPHA))
            }
        }
    }

    private fun blendColors(color1: Int, color2: Int, ratio: Float): Int {
        val r = ratio.coerceIn(0f, 1f)
        val ir = 1f - r
        val a = Color.alpha(color1) * ir + Color.alpha(color2) * r
        val red = Color.red(color1) * ir + Color.red(color2) * r
        val green = Color.green(color1) * ir + Color.green(color2) * r
        val blue = Color.blue(color1) * ir + Color.blue(color2) * r
        return Color.argb(a.toInt(), red.toInt(), green.toInt(), blue.toInt())
    }

    private fun drawHint(c: Canvas) {
        if (!on(Setting.HINT_ENABLED)) return
        val text = mode.hint
        textPaint.typeface = Typeface.DEFAULT
        textPaint.textSize = f(Setting.HINT_SIZE) * density
        textPaint.color = Color.WHITE
        textPaint.alpha = (f(Setting.HINT_OPACITY) * 255).toInt()
        val lines = text.split("\n")
        val lineH = textPaint.descent() - textPaint.ascent()
        val startY = height / 2f - (lines.size - 1) * lineH / 2f
        for ((i, line) in lines.withIndex()) {
            c.drawText(line, width / 2f, startY + i * lineH, textPaint)
        }
    }

    // endregion
}
