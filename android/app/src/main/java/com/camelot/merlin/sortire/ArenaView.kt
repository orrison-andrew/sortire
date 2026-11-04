package com.camelot.merlin.sortire

import android.content.Context
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
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * Full-screen multi-touch surface. All look/feel values come from [Settings] and are read live,
 * so the tuning panel changes take effect immediately. Frames are only requested while animating.
 */
class ArenaView(context: Context) : View(context) {

    private class Finger(var x: Float, var y: Float, val color: Int) {
        var down = true
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

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val markerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = Color.WHITE
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }
    private val arcRect = RectF()

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
        fingers[id] = Finger(x, y, palette.color(nextColorIndex++))
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

        canvas.drawColor(palette.background)

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

    private fun circle(c: Canvas, x: Float, y: Float, r: Float, color: Int, alpha: Float = 1f) {
        if (r <= 0f) return
        paint.style = Paint.Style.FILL
        paint.color = color
        paint.alpha = (alpha.coerceIn(0f, 1f) * 255).toInt()
        c.drawCircle(x, y, r, paint)
    }

    private fun drawLive(c: Canvas, now: Long) {
        val progress = min(1f, (now - countdownStart).toFloat() / countdownMs)
        val pulseAmount = f(Setting.PULSE_AMOUNT)
        val pulseSpeed = f(Setting.PULSE_SPEED)
        val showRing = phase == Phase.COUNTING && on(Setting.RING_ENABLED)
        if (showRing) {
            ringPaint.strokeWidth = f(Setting.RING_STROKE) * density
            ringPaint.color = Color.WHITE
            ringPaint.alpha = (f(Setting.RING_OPACITY) * 255).toInt()
        }
        var i = 0
        for (fg in fingers.values) {
            val r = baseRadius * (1f + pulseAmount * sin(now / 1000f * pulseSpeed + i))
            circle(c, fg.x, fg.y, r, fg.color)
            if (showRing) {
                val rr = r + f(Setting.RING_OFFSET) * density
                arcRect.set(fg.x - rr, fg.y - rr, fg.x + rr, fg.y + rr)
                c.drawArc(arcRect, -90f, 360f * progress, false, ringPaint)
            }
            i++
        }
    }

    private fun drawWinner(c: Canvas, now: Long) {
        val e = (now - resultStart) / 1000f
        val fadeS = f(Setting.WINNER_FADE_MS) / 1000f
        val growS = f(Setting.WINNER_GROW_MS) / 1000f
        val fade = if (fadeS <= 0f) 0f else max(0f, 1f - e / fadeS)
        if (fade > 0f) {
            for ((id, fg) in fingers) if (id != winnerId) circle(c, fg.x, fg.y, baseRadius, fg.color, fade)
        }
        val w = fingers[winnerId] ?: return
        val t = if (growS <= 0f) 1f else min(1f, e / growS)
        val grow = 1f - (1f - t).pow(3)
        val radius = if (on(Setting.WINNER_FLOOD)) {
            val maxR = hypot(width.toFloat(), height.toFloat())
            baseRadius + (maxR - baseRadius) * grow
        } else {
            baseRadius * (1f + 0.3f * grow)
        }
        circle(c, w.x, w.y, radius, w.color)

        // White marker so you can see exactly who was picked.
        val stroke = f(Setting.MARKER_STROKE) * density
        if (stroke > 0f) {
            markerPaint.strokeWidth = stroke
            c.drawCircle(w.x, w.y, baseRadius * f(Setting.MARKER_RADIUS), markerPaint)
        }
        circle(c, w.x, w.y, baseRadius * f(Setting.MARKER_DOT) * grow, Color.WHITE)
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
                circle(c, fg.x, fg.y, r, fg.color)
                textPaint.typeface = Typeface.DEFAULT_BOLD
                textPaint.color = Color.WHITE
                textPaint.textSize = r * f(Setting.ORDER_TEXT_SCALE)
                val baseline = fg.y - (textPaint.ascent() + textPaint.descent()) / 2f
                c.drawText((k + 1).toString(), fg.x, baseline, textPaint)
            } else {
                circle(
                    c, fg.x, fg.y,
                    baseRadius * f(Setting.ORDER_PENDING_SCALE),
                    fg.color, f(Setting.ORDER_PENDING_ALPHA)
                )
            }
        }
    }

    private fun drawHint(c: Canvas) {
        if (!on(Setting.HINT_ENABLED)) return
        textPaint.typeface = Typeface.DEFAULT
        textPaint.color = Color.WHITE
        textPaint.alpha = (f(Setting.HINT_OPACITY) * 255).toInt()
        textPaint.textSize = f(Setting.HINT_SIZE) * density
        val lines = mode.hint.split("\n")
        val lineHeight = textPaint.fontSpacing
        var y = height / 2f - lineHeight * (lines.size - 1) / 2f -
                (textPaint.ascent() + textPaint.descent()) / 2f
        for (line in lines) {
            c.drawText(line, width / 2f, y, textPaint)
            y += lineHeight
        }
    }

    // endregion
}
