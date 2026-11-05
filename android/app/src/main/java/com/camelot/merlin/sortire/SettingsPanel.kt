package com.camelot.merlin.sortire

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import kotlin.math.roundToInt

/**
 * Full Settings screen organized into distinct sections:
 * Game Mode, Winner Options, Color Controls, Audio & Recording, Appearance & Themes, Countdown Ring & Timing, System & Feedback.
 */
class SettingsPanel(
    context: Context,
    private val onChange: (Setting?) -> Unit,   // null = everything changed (reset)
    private val getCurrentMode: () -> Mode,
    private val onModeChange: (Mode) -> Unit,
    private val onClose: () -> Unit
) : LinearLayout(context) {

    private val list = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    private val recorder = SoundRecorder(context)
    private var isRecording = false
    private val recordingHandler = Handler(Looper.getMainLooper())
    private var stopRecordingRunnable: Runnable? = null

    init {
        orientation = LinearLayout.VERTICAL
        isClickable = true   // swallow touches so they don't reach the arena underneath
        background = GradientDrawable().apply {
            setColor(Color.argb(248, 18, 18, 24))
            val r = dp(20).toFloat()
            cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
        }
        addView(header(), LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        val scroll = ScrollView(context).apply { addView(list) }
        addView(scroll, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
        build()
    }

    private fun build() {
        list.removeAllViews()

        // 1. Game Mode
        list.addView(groupHeader("Game Mode"))
        list.addView(modeRow())

        // 2. Winner Options
        list.addView(groupHeader("Winner Options"))
        list.addView(boolRow(Setting.WINNER_FLOOD))
        list.addView(boolRow(Setting.MARKER_ENABLED))
        list.addView(sliderRow(Setting.WINNER_FADE_MS))
        list.addView(sliderRow(Setting.WINNER_GROW_MS))
        list.addView(sliderRow(Setting.MARKER_RADIUS))
        list.addView(sliderRow(Setting.MARKER_STROKE))
        list.addView(sliderRow(Setting.MARKER_DOT))

        // 3. Audio & Recording
        list.addView(groupHeader("Audio & Recording"))
        list.addView(boolRow(Setting.SOUND_ENABLED))
        list.addView(dropdownRow(Setting.SOUND_STYLE))
        list.addView(actionRow("Select System Sound") {
            val intent = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
                putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION or RingtoneManager.TYPE_ALARM)
                putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Select System Sound")
                putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
                putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
            }
            (context as? android.app.Activity)?.startActivityForResult(intent, 999)
        })
        list.addView(recordingRow())

        // 4. Color Controls
        list.addView(groupHeader("Color Controls"))
        list.addView(boolRow(Setting.WOODGRAIN_ENABLED))
        list.addView(boolRow(Setting.RANDOM_HUE))
        list.addView(colorSliderRow(Setting.BASE_HUE))
        list.addView(colorSliderRow(Setting.BG_SATURATION))
        list.addView(colorSliderRow(Setting.BG_VALUE))
        list.addView(colorSliderRow(Setting.SATURATION))
        list.addView(sliderRow(Setting.HUE_STEP))
        list.addView(sliderRow(Setting.VALUE_EVEN))
        list.addView(sliderRow(Setting.VALUE_ODD))

        // 5. Appearance & Themes
        list.addView(groupHeader("Appearance & Themes"))
        list.addView(dropdownRow(Setting.WOOD_TYPE))
        list.addView(dropdownRow(Setting.RENDER_MODE))
        list.addView(sliderRow(Setting.RADIUS))
        list.addView(sliderRow(Setting.PULSE_AMOUNT))
        list.addView(sliderRow(Setting.PULSE_SPEED))

        // 6. Countdown Ring & Timing
        list.addView(groupHeader("Countdown Ring & Timing"))
        list.addView(sliderRow(Setting.COUNTDOWN_MS))
        list.addView(sliderRow(Setting.MIN_FINGERS))
        list.addView(sliderRow(Setting.REVEAL_GAP_MS))
        list.addView(boolRow(Setting.RING_ENABLED))
        list.addView(sliderRow(Setting.RING_OFFSET))
        list.addView(sliderRow(Setting.RING_STROKE))
        list.addView(sliderRow(Setting.RING_OPACITY))

        // 7. System & Feedback
        list.addView(groupHeader("System & Feedback"))
        list.addView(actionRow("Send Feedback") {
            val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://forms.gle/utmz4GkKSHzwL4nP"))
            context.startActivity(intent)
        })
        list.addView(actionRow("Export Settings (JSON)") {
            val json = buildString {
                append("{\n")
                var first = true
                for (s in Setting.values()) {
                    val v = Settings[s]
                    if (v != s.def) {
                        if (!first) append(",\n")
                        append("  \"${s.key}\": $v")
                        first = false
                    }
                }
                append("\n}")
            }
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("Sortire Config", json))
            Toast.makeText(context, "Settings JSON copied to clipboard", Toast.LENGTH_SHORT).show()
        })
        list.addView(actionRow("Import Settings (JSON)") {
            showImportJsonDialog()
        })

        list.addView(View(context), LinearLayout.LayoutParams(MATCH_PARENT, dp(32)))
    }

    private fun header(): View {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(12), dp(12), dp(8))
        }
        val title = TextView(context).apply {
            text = "Settings"
            setTextColor(Color.WHITE)
            textSize = 20f
            typeface = Typeface.DEFAULT_BOLD
        }
        row.addView(title, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        row.addView(pill("Reset") {
            Settings.resetAll()
            build()
            onChange(null)
        })
        row.addView(pill("✕") { onClose() })
        return row
    }

    private fun modeRow(): View {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), dp(6), dp(16), dp(8))
        }
        for (m in Mode.values()) {
            val isSelected = m == getCurrentMode()
            val tv = TextView(context).apply {
                text = m.title
                textSize = 14f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dp(20), dp(10), dp(20), dp(10))
                gravity = android.view.Gravity.CENTER
                setTextColor(if (isSelected) Color.BLACK else Color.WHITE)
                background = GradientDrawable().apply {
                    cornerRadius = dp(100).toFloat()
                    setColor(if (isSelected) Color.argb(235, 255, 255, 255) else Color.argb(50, 255, 255, 255))
                }
            }
            tv.setOnClickListener {
                onModeChange(m)
                build()
            }
            val lp = LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply {
                if (m != Mode.values().first()) marginStart = dp(8)
            }
            row.addView(tv, lp)
        }
        return row
    }

    private fun recordingRow(): View {
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(6), dp(16), dp(6))
        }
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
        }
        val recButton = TextView(context).apply {
            text = if (isRecording) "🔴 Recording (Max 10s)... Tap to Stop" else "🎙️ Record Win Sound"
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(14), dp(10), dp(14), dp(10))
            background = GradientDrawable().apply {
                cornerRadius = dp(100).toFloat()
                setColor(if (isRecording) Color.argb(180, 220, 50, 50) else Color.argb(60, 255, 255, 255))
            }
            setOnClickListener {
                if (isRecording) {
                    stopRecording()
                } else {
                    startRecording()
                }
            }
        }
        row.addView(recButton, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))

        if (recorder.hasCustomSound()) {
            val playButton = TextView(context).apply {
                text = "▶️ Play"
                setTextColor(Color.WHITE)
                textSize = 14f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = GradientDrawable().apply {
                    cornerRadius = dp(100).toFloat()
                    setColor(Color.argb(60, 255, 255, 255))
                }
                layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { marginStart = dp(8) }
                setOnClickListener { SoundManager.playWinnerSound(context) }
            }
            val delButton = TextView(context).apply {
                text = "🗑️ Delete"
                setTextColor(Color.WHITE)
                textSize = 14f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = GradientDrawable().apply {
                    cornerRadius = dp(100).toFloat()
                    setColor(Color.argb(60, 255, 255, 255))
                }
                layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { marginStart = dp(8) }
                setOnClickListener {
                    recorder.deleteCustomSound()
                    build()
                }
            }
            row.addView(playButton)
            row.addView(delButton)
        }
        col.addView(row)
        return col
    }

    private fun startRecording() {
        val activity = context as? android.app.Activity
        if (activity != null && activity.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            activity.requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO), 101)
            Toast.makeText(context, "Grant microphone permission and try again", Toast.LENGTH_SHORT).show()
            return
        }

        if (recorder.startRecording()) {
            isRecording = true
            build()
            Toast.makeText(context, "Recording started (10s max)...", Toast.LENGTH_SHORT).show()

            stopRecordingRunnable = Runnable { stopRecording() }
            recordingHandler.postDelayed(stopRecordingRunnable!!, 10000L) // 10s cap
        } else {
            Toast.makeText(context, "Could not start recording", Toast.LENGTH_SHORT).show()
        }
    }

    private fun stopRecording() {
        stopRecordingRunnable?.let { recordingHandler.removeCallbacks(it) }
        recorder.stopRecording()
        isRecording = false
        build()
        Toast.makeText(context, "Custom win sound saved!", Toast.LENGTH_SHORT).show()
    }

    private fun colorSliderRow(s: Setting): View {
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(6), dp(16), dp(2))
        }
        val top = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
        }
        val name = TextView(context).apply {
            text = s.label
            setTextColor(Color.WHITE)
            textSize = 14f
        }
        val colorSwatch = View(context).apply {
            val bgHue = Settings[Setting.BASE_HUE] % 360f
            val bgSat = Settings[Setting.BG_SATURATION]
            val bgVal = Settings[Setting.BG_VALUE]
            val sampleColor = Color.HSVToColor(floatArrayOf(bgHue, bgSat, bgVal))
            background = GradientDrawable().apply {
                setColor(sampleColor)
                cornerRadius = dp(6).toFloat()
                setStroke(dp(1), Color.argb(100, 255, 255, 255))
            }
            layoutParams = LinearLayout.LayoutParams(dp(24), dp(24)).apply { marginEnd = dp(8) }
        }
        val valueView = TextView(context).apply {
            text = Settings.format(s, Settings[s])
            setTextColor(Color.argb(200, 255, 255, 255))
            textSize = 14f
        }
        top.addView(colorSwatch)
        top.addView(name, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        top.addView(valueView)

        val seek = android.widget.SeekBar(context).apply {
            max = ((s.max - s.min) / s.step).roundToInt()
            progress = ((Settings[s] - s.min) / s.step).roundToInt()
            setOnSeekBarChangeListener(object : android.widget.SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: android.widget.SeekBar, p: Int, fromUser: Boolean) {
                    if (!fromUser) return
                    val v = ((s.min + p * s.step).coerceIn(s.min, s.max) * 1000f).roundToInt() / 1000f
                    Settings.set(s, v)
                    valueView.text = Settings.format(s, v)
                    val bgHue = Settings[Setting.BASE_HUE] % 360f
                    val bgSat = Settings[Setting.BG_SATURATION]
                    val bgVal = Settings[Setting.BG_VALUE]
                    val sampleColor = Color.HSVToColor(floatArrayOf(bgHue, bgSat, bgVal))
                    colorSwatch.background = GradientDrawable().apply {
                        setColor(sampleColor)
                        cornerRadius = dp(6).toFloat()
                        setStroke(dp(1), Color.argb(100, 255, 255, 255))
                    }
                    onChange(s)
                }
                override fun onStartTrackingTouch(sb: android.widget.SeekBar) {}
                override fun onStopTrackingTouch(sb: android.widget.SeekBar) {}
            })
        }
        col.addView(top, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        col.addView(seek, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        return col
    }

    private fun sliderRow(s: Setting): View {
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(6), dp(16), dp(2))
        }
        val top = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        val name = TextView(context).apply {
            text = s.label
            setTextColor(Color.WHITE)
            textSize = 14f
        }
        val valueView = TextView(context).apply {
            text = Settings.format(s, Settings[s])
            setTextColor(Color.argb(200, 255, 255, 255))
            textSize = 14f
        }
        top.addView(name, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        top.addView(valueView)

        val seek = android.widget.SeekBar(context).apply {
            max = ((s.max - s.min) / s.step).roundToInt()
            progress = ((Settings[s] - s.min) / s.step).roundToInt()
            setOnSeekBarChangeListener(object : android.widget.SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: android.widget.SeekBar, p: Int, fromUser: Boolean) {
                    if (!fromUser) return
                    val v = ((s.min + p * s.step).coerceIn(s.min, s.max) * 1000f).roundToInt() / 1000f
                    Settings.set(s, v)
                    valueView.text = Settings.format(s, v)
                    onChange(s)
                }
                override fun onStartTrackingTouch(sb: android.widget.SeekBar) {}
                override fun onStopTrackingTouch(sb: android.widget.SeekBar) {}
            })
        }
        col.addView(top, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        col.addView(seek, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        return col
    }

    private fun dropdownRow(s: Setting): View {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(12))
            background = GradientDrawable().apply {
                setColor(Color.argb(25, 255, 255, 255))
                cornerRadius = dp(10).toFloat()
            }
        }
        val name = TextView(context).apply {
            text = s.label
            setTextColor(Color.WHITE)
            textSize = 14f
        }
        val valueView = TextView(context).apply {
            text = Settings.format(s, Settings[s])
            setTextColor(Color.argb(200, 255, 255, 255))
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
        }
        row.addView(name, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        row.addView(valueView)

        row.setOnClickListener {
            val options = when (s) {
                Setting.SOUND_STYLE -> arrayOf("Pop", "Bubble", "Blip", "Laser", "Snap", "Beep", "Thud", "Ping", "Boing", "Click")
                Setting.WOOD_TYPE -> arrayOf("Maple", "White Oak", "Red Oak", "Walnut", "Ebony", "Purpleheart")
                Setting.RENDER_MODE -> arrayOf("2D", "3D Fast")
                else -> arrayOf("Off", "On")
            }
            val currentIdx = Settings[s].toInt().coerceIn(0, options.size - 1)

            android.app.AlertDialog.Builder(context)
                .setTitle(s.label)
                .setSingleChoiceItems(options, currentIdx) { dialog, which ->
                    Settings.set(s, which.toFloat())
                    valueView.text = Settings.format(s, which.toFloat())
                    onChange(s)
                    dialog.dismiss()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        val wrapper = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(6), dp(16), dp(6))
            addView(row, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        }
        return wrapper
    }

    private fun actionRow(title: String, onClick: () -> Unit): View {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(12))
            background = GradientDrawable().apply {
                setColor(Color.argb(25, 255, 255, 255))
                cornerRadius = dp(10).toFloat()
            }
        }
        val name = TextView(context).apply {
            text = title
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
        }
        row.addView(name, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        row.setOnClickListener { onClick() }

        val wrapper = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(6), dp(16), dp(6))
            addView(row, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        }
        return wrapper
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

    private fun showImportJsonDialog() {
        val input = android.widget.EditText(context).apply {
            hint = "Paste JSON configuration here..."
            setTextColor(Color.WHITE)
            setHintTextColor(Color.argb(120, 255, 255, 255))
            setPadding(dp(16), dp(16), dp(16), dp(16))
            minLines = 4
        }
        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(16), dp(24), dp(0))
            addView(input, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        }
        android.app.AlertDialog.Builder(context)
            .setTitle("Import Settings JSON")
            .setView(container)
            .setPositiveButton("Import") { _, _ ->
                val json = input.text.toString()
                try {
                    for (s in Setting.values()) {
                        val regex = "\"${s.key}\"\\s*:\\s*([0-9.]+)".toRegex()
                        val match = regex.find(json)
                        if (match != null) {
                            val v = match.groupValues[1].toFloatOrNull()
                            if (v != null) {
                                Settings.set(s, v)
                            }
                        }
                    }
                    build()
                    onChange(null)
                    Toast.makeText(context, "Settings imported successfully", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Toast.makeText(context, "Invalid JSON format", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
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
        layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { marginStart = dp(8) }
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

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}
