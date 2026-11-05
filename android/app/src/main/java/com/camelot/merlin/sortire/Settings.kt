package com.camelot.merlin.sortire

import android.content.Context
import android.content.SharedPreferences

enum class Group(val title: String) {
    TIMING("Timing"),
    CIRCLES("Circles"),
    RING("Countdown ring"),
    WINNER("Pick one: result"),
    ORDER("Order all: result"),
    COLORS("Color Controls"),
    HAPTICS("Audio & Feedback"),
    TEXT("Hint text")
}

/**
 * Every tunable value in the app. Add an entry here and it automatically shows up in the
 * tuning panel and gets persisted. Booleans are stored as 0f / 1f.
 *
 * resetsRound = true means changing it clears the current round (so you see the change immediately,
 * e.g. a new palette is generated).
 */
enum class Setting(
    val group: Group,
    val label: String,
    val def: Float,
    val min: Float = 0f,
    val max: Float = 1f,
    val step: Float = 1f,
    val unit: String = "",
    val isBool: Boolean = false,
    val resetsRound: Boolean = false
) {
    // Timing
    COUNTDOWN_MS(Group.TIMING, "Countdown before choosing", 2000f, 500f, 6000f, 100f, "ms"),
    MIN_FINGERS(Group.TIMING, "Minimum fingers", 2f, 1f, 5f, 1f, "", resetsRound = true),
    REVEAL_GAP_MS(Group.TIMING, "Order: gap between numbers", 450f, 100f, 1500f, 50f, "ms"),

    // Circles / Appearance
    WOOD_TYPE(Group.CIRCLES, "Wood type", 3f, 0f, 5f, 1f, ""),
    RENDER_MODE(Group.CIRCLES, "Render mode", 0f, 0f, 1f, 1f, ""),
    RADIUS(Group.CIRCLES, "Circle radius", 60f, 20f, 120f, 2f, "dp"),
    PULSE_AMOUNT(Group.CIRCLES, "Pulse amount", 0.06f, 0f, 0.3f, 0.01f),
    PULSE_SPEED(Group.CIRCLES, "Pulse speed", 3.5f, 0f, 20f, 0.5f),

    // Countdown ring
    RING_ENABLED(Group.RING, "Show countdown ring", 1f, isBool = true),
    RING_OFFSET(Group.RING, "Ring distance from circle", 14f, 0f, 40f, 1f, "dp"),
    RING_STROKE(Group.RING, "Ring thickness", 7f, 1f, 20f, 1f, "dp"),
    RING_OPACITY(Group.RING, "Ring opacity", 0.9f, 0f, 1f, 0.05f),

    // Pick one result
    WINNER_FLOOD(Group.WINNER, "Winner floods the screen", 1f, isBool = true),
    MARKER_ENABLED(Group.WINNER, "Show winner marker ring", 1f, isBool = true),
    WINNER_FADE_MS(Group.WINNER, "Losers fade-out time", 300f, 0f, 1500f, 50f, "ms"),
    WINNER_GROW_MS(Group.WINNER, "Winner grow time", 600f, 0f, 2000f, 50f, "ms"),
    MARKER_RADIUS(Group.WINNER, "Marker ring size", 1.3f, 1f, 2f, 0.05f, "×"),
    MARKER_STROKE(Group.WINNER, "Marker ring thickness", 8f, 0f, 20f, 1f, "dp"),
    MARKER_DOT(Group.WINNER, "Marker center dot size", 0.2f, 0f, 1f, 0.05f, "×"),

    // Order result
    ORDER_REVEALED_SCALE(Group.ORDER, "Revealed circle size", 1.05f, 0.5f, 2f, 0.05f, "×"),
    ORDER_POP_AMOUNT(Group.ORDER, "Pop-in overshoot", 0.25f, 0f, 1f, 0.05f, "×"),
    ORDER_POP_MS(Group.ORDER, "Pop-in time", 250f, 0f, 1000f, 25f, "ms"),
    ORDER_PENDING_SCALE(Group.ORDER, "Not-yet-revealed size", 0.8f, 0f, 1.5f, 0.05f, "×"),
    ORDER_PENDING_ALPHA(Group.ORDER, "Not-yet-revealed opacity", 0.35f, 0f, 1f, 0.05f),
    ORDER_TEXT_SCALE(Group.ORDER, "Number size", 0.95f, 0.3f, 2f, 0.05f, "×"),

    // Colors (changing these starts a fresh round)
    WOODGRAIN_ENABLED(Group.COLORS, "Enable woodgrain style", 0f, isBool = true, resetsRound = true),
    RANDOM_HUE(Group.COLORS, "Random base hue each round", 0f, isBool = true, resetsRound = true),
    BASE_HUE(Group.COLORS, "Base hue", 260f, 0f, 360f, 5f, "°", resetsRound = true),
    BG_SATURATION(Group.COLORS, "Background saturation", 0.45f, 0f, 1f, 0.02f, resetsRound = true),
    BG_VALUE(Group.COLORS, "Background brightness", 0.14f, 0f, 1f, 0.02f, resetsRound = true),
    SATURATION(Group.COLORS, "Circle saturation", 0.78f, 0f, 1f, 0.02f, resetsRound = true),
    HUE_STEP(Group.COLORS, "Hue step between fingers", 137.5f, 0f, 360f, 0.5f, "°", resetsRound = true),
    VALUE_EVEN(Group.COLORS, "Brightness (1st, 3rd… finger)", 0.95f, 0f, 1f, 0.02f, resetsRound = true),
    VALUE_ODD(Group.COLORS, "Brightness (2nd, 4th… finger)", 0.85f, 0f, 1f, 0.02f, resetsRound = true),

    // Haptics & Audio
    SOUND_ENABLED(Group.HAPTICS, "Enable sound effects", 1f, isBool = true),
    SOUND_STYLE(Group.HAPTICS, "Pop sound style", 0f, 0f, 9f, 1f, ""),
    HAPTIC_TAP(Group.HAPTICS, "Buzz on finger down", 1f, isBool = true),
    HAPTIC_TICK(Group.HAPTICS, "Buzz on each number reveal", 1f, isBool = true),
    HAPTIC_RESULT(Group.HAPTICS, "Buzz on final result", 1f, isBool = true),

    // Hint text
    HINT_ENABLED(Group.TEXT, "Show hint text", 1f, isBool = true),
    HINT_SIZE(Group.TEXT, "Hint text size", 23f, 12f, 40f, 1f, "dp"),
    HINT_OPACITY(Group.TEXT, "Hint text opacity", 0.35f, 0f, 1f, 0.05f);

    val key: String get() = name.lowercase()
}

object Settings {
    private val values = FloatArray(Setting.values().size) { Setting.values()[it].def }
    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        val p = context.getSharedPreferences("sortire_settings", Context.MODE_PRIVATE)
        prefs = p
        for (s in Setting.values()) values[s.ordinal] = p.getFloat(s.key, s.def)
    }

    operator fun get(s: Setting): Float = values[s.ordinal]

    fun bool(s: Setting): Boolean = values[s.ordinal] >= 0.5f

    fun set(s: Setting, v: Float) {
        values[s.ordinal] = v
        val editor = prefs?.edit()
        editor?.putFloat(s.key, v)
        if (s == Setting.BASE_HUE) {
            values[Setting.RANDOM_HUE.ordinal] = 0f
            editor?.putFloat(Setting.RANDOM_HUE.key, 0f)
        }
        editor?.apply()
    }

    fun resetAll() {
        val e = prefs?.edit()
        for (s in Setting.values()) {
            values[s.ordinal] = s.def
            e?.remove(s.key)
        }
        e?.apply()
    }

    /** Plain-text dump you can paste back to finalize the defaults. */
    fun dump(): String = buildString {
        var group: Group? = null
        for (s in Setting.values()) {
            if (s.group != group) {
                group = s.group
                append("\n# ").append(s.group.title).append('\n')
            }
            append(s.key).append(" = ").append(format(s, this@Settings[s])).append('\n')
        }
    }.trim()

    fun format(s: Setting, v: Float): String {
        if (s == Setting.WOOD_TYPE) {
            return when (v.toInt()) {
                0 -> "Maple"
                1 -> "White Oak"
                2 -> "Red Oak"
                3 -> "Walnut"
                4 -> "Ebony"
                5 -> "Purpleheart"
                else -> "Walnut"
            }
        }
        if (s == Setting.RENDER_MODE) {
            return if (v >= 0.5f) "3D Fast" else "2D"
        }
        if (s == Setting.SOUND_STYLE) {
            return when (v.toInt()) {
                0 -> "Pop"
                1 -> "Bubble"
                2 -> "Blip"
                3 -> "Laser"
                4 -> "Snap"
                5 -> "Beep"
                6 -> "Thud"
                7 -> "Ping"
                8 -> "Boing"
                9 -> "Click"
                else -> "Pop"
            }
        }
        if (s.isBool) return if (v >= 0.5f) "on" else "off"
        val decimals = when {
            s.step >= 1f -> 0
            s.step >= 0.1f -> 1
            else -> 2
        }
        val text = "%.${decimals}f".format(v)
        return if (s.unit.isEmpty()) text else "$text ${s.unit}"
    }
}
