package com.camelot.merlin.sortire

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import kotlin.math.roundToInt

/**
 * Bottom-sheet style tuning panel built entirely from the Setting enum.
 * Every change is applied live; the top of the screen stays usable so you can test touches.
 */
class SettingsPanel(
    context: Context,
    private val onChange: (Setting?) -> Unit,   // null = everything changed (reset)
    private val onClose: () -> Unit
) : LinearLayout(context) {

    private val list = LinearLayout(context).apply { orientation = VERTICAL }

    init {
        orientation = VERTICAL
        isClickable = true   // swallow touches so they don't reach the arena underneath
        background = GradientDrawable().apply {
            setColor(Color.argb(244, 18, 18, 24))
            val r = dp(20).toFloat()
            cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
        }
        addView(header(), LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        val scroll = ScrollView(context).apply { addView(list) }
        addView(scroll, LayoutParams(MATCH_PARENT, 0, 1f))
        build()
    }

    private fun build() {
        list.removeAllViews()
        var current: Group? = null
        for (s in Setting.values()) {
            if (s.group != current) {
                current = s.group
                list.addView(groupHeader(s.group.title))
            }
            list.addView(if (s.isBool) boolRow(s) else sliderRow(s))
        }
        list.addView(View(context), LayoutParams(MATCH_PARENT, dp(32)))
    }

    private fun header(): View {
        val row = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(12), dp(12), dp(8))
        }
        val title = TextView(context).apply {
            text = "Tuning"
            setTextColor(Color.WHITE)
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
        }
        row.addView(title, LayoutParams(0, WRAP_CONTENT, 1f))
        row.addView(pill("Copy") {
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("Sortire settings", Settings.dump()))
            Toast.makeText(context, "Settings copied", Toast.LENGTH_SHORT).show()
        })
        row.addView(pill("Reset") {
            Settings.resetAll()
            build()
            onChange(null)
        })
        row.addView(pill("Close") { onClose() })
        return row
    }

    private fun pill(text: String, onClick: () -> Unit) = TextView(context).apply {
        this.text = text
        setTextColor(Color.WHITE)
        textSize = 14f
        typeface = Typeface.DEFAULT_BOLD
        setPadding(dp(14), dp(8), dp(14), dp(8))
        background = GradientDrawable().apply {
            cornerRadius = dp(100).toFloat()
            setColor(Color.argb(60, 255, 255, 255))
        }
        layoutParams = LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { marginStart = dp(8) }
        setOnClickListener { onClick() }
    }

    private fun groupHeader(title: String) = TextView(context).apply {
        text = title.uppercase()
        setTextColor(Color.argb(150, 255, 255, 255))
        textSize = 12f
        typeface = Typeface.DEFAULT_BOLD
        letterSpacing = 0.08f
        setPadding(dp(16), dp(20), dp(16), dp(4))
    }

    private fun sliderRow(s: Setting): View {
        val col = LinearLayout(context).apply {
            orientation = VERTICAL
            setPadding(dp(16), dp(6), dp(16), dp(2))
        }
        val top = LinearLayout(context).apply { orientation = HORIZONTAL }
        val name = TextView(context).apply {
            text = s.label
            setTextColor(Color.WHITE)
            textSize = 14f
        }
        val value = TextView(context).apply {
            text = Settings.format(s, Settings[s])
            setTextColor(Color.argb(200, 255, 255, 255))
            textSize = 14f
        }
        top.addView(name, LayoutParams(0, WRAP_CONTENT, 1f))
        top.addView(value)

        val seek = SeekBar(context).apply {
            max = ((s.max - s.min) / s.step).roundToInt()
            progress = ((Settings[s] - s.min) / s.step).roundToInt()
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: SeekBar, p: Int, fromUser: Boolean) {
                    if (!fromUser) return
                    val v = ((s.min + p * s.step).coerceIn(s.min, s.max) * 1000f).roundToInt() / 1000f
                    Settings.set(s, v)
                    value.text = Settings.format(s, v)
                    onChange(s)
                }
                override fun onStartTrackingTouch(sb: SeekBar) {}
                override fun onStopTrackingTouch(sb: SeekBar) {}
            })
        }
        col.addView(top, LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        col.addView(seek, LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        return col
    }

    private fun boolRow(s: Setting): View {
        return Switch(context).apply {
            text = s.label
            setTextColor(Color.WHITE)
            textSize = 14f
            isChecked = Settings.bool(s)
            setPadding(dp(16), dp(10), dp(16), dp(10))
            setOnCheckedChangeListener { _, checked ->
                Settings.set(s, if (checked) 1f else 0f)
                onChange(s)
            }
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}
