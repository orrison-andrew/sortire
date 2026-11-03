package com.camelot.merlin.sortire

import android.graphics.Color
import kotlin.random.Random

/** A palette generated from the current color settings. A new one is created each round. */
class Palette {
    private val baseHue =
        if (Settings.bool(Setting.RANDOM_HUE)) Random.nextFloat() * 360f else Settings[Setting.BASE_HUE]
    private val hueStep = Settings[Setting.HUE_STEP]
    private val saturation = Settings[Setting.SATURATION]
    private val valueEven = Settings[Setting.VALUE_EVEN]
    private val valueOdd = Settings[Setting.VALUE_ODD]

    val background: Int = Color.HSVToColor(
        floatArrayOf(baseHue % 360f, Settings[Setting.BG_SATURATION], Settings[Setting.BG_VALUE])
    )

    fun color(index: Int): Int {
        val hue = (baseHue + index * hueStep) % 360f
        val value = if (index % 2 == 0) valueEven else valueOdd
        return Color.HSVToColor(floatArrayOf(hue, saturation, value))
    }
}
