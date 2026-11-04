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
    private val getCurrentMode: () -> Mode,
    private val onModeChange: (Mode) -> Unit,
    private val onClose: () -> Unit
) : LinearLayout(context) {

    private val list = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }

    init {
        orientation = LinearLayout.VERTICAL
        isClickable = true   // swallow touches so they don't reach the arena underneath
        background = GradientDrawable().apply {
            setColor(Color.argb(244, 18, 18, 24))
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

        // 1. Top Section: Game Mode (Pick one / Order all)
        list.addView(groupHeader("Game Mode"))
        list.addView(modeRow())

        // 2. Top Section: Winner floods screen
        list.addView(boolRow(Setting.WINNER_FLOOD))

        // 3. Rest of settings (excluding WINNER_FLOOD)
        var current: Group? = null
        for (s in Setting.values()) {
            if (s == Setting.WINNER_FLOOD) continue
            if (s.group != current) {
                current = s.group
                list.addView(groupHeader(s.group.title))
            }
            list.addView(
                when {
                    s.isBool -> boolRow(s)
                    s == Setting.SOUND_STYLE -> dropdownRow(s)
                    else -> sliderRow(s)
                }
            )
        }
        list.addView(View(context), LinearLayout.LayoutParams(MATCH_PARENT, dp(32)))
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

    private fun header(): View {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(12), dp(12), dp(8))
        }
        val title = TextView(context).apply {
            text = "Tuning"
            setTextColor(Color.WHITE)
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
        }
        row.addView(title, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        row.addView(pill("Upload") { showUploadDialog() })
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
            val options = arrayOf("Pop", "Bubble", "Blip", "Laser", "Snap", "Beep", "Thud", "Ping", "Boing", "Click")
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

    private fun showUploadDialog() {
        val input = android.widget.EditText(context).apply {
            hint = "Enter file name"
            setText("sortire-tuning")
            setSelection(text.length)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.argb(120, 255, 255, 255))
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }

        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(16), dp(24), dp(0))
            addView(input, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        }

        android.app.AlertDialog.Builder(context)
            .setTitle("Upload Tunings to Google Drive")
            .setMessage("Enter a file name for your settings. You can then select Google Drive to upload it directly into your shared folder.")
            .setView(container)
            .setPositiveButton("Upload / Share") { _, _ ->
                val fileName = input.text.toString().trim().ifEmpty { "sortire-tuning" }
                exportAndShareSettings(fileName)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun exportAndShareSettings(fileName: String) {
        try {
            val content = Settings.dump()
            val file = java.io.File(context.cacheDir, "$fileName.txt")
            file.writeText(content)

            val uri = androidx.core.content.FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )

            val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(android.content.Intent.EXTRA_STREAM, uri)
                putExtra(android.content.Intent.EXTRA_SUBJECT, "Sortire Settings: $fileName")
                addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            context.startActivity(android.content.Intent.createChooser(intent, "Upload to Google Drive"))
        } catch (e: Exception) {
            Toast.makeText(context, "Error exporting settings: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}
