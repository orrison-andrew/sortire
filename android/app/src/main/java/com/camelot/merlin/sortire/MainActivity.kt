package com.camelot.merlin.sortire

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {

    private lateinit var arena: ArenaView
    private lateinit var tuneButton: View
    private lateinit var panel: SettingsPanel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Settings.init(this)   // must happen before ArenaView is created
        SoundManager.init(this)

        arena = ArenaView(this)
        tuneButton = buildTuneButton()
        panel = SettingsPanel(
            this,
            onChange = { arena.onSettingChanged(it) },
            getCurrentMode = { arena.mode },
            onModeChange = { mode -> select(mode) },
            onClose = { closePanel() }
        ).apply { visibility = View.GONE }

        val root = FrameLayout(this)
        root.addView(arena, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        root.addView(
            tuneButton,
            FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.TOP or Gravity.END)
                .apply { topMargin = dp(36); marginEnd = dp(16) }
        )
        root.addView(panel, FrameLayout.LayoutParams(MATCH_PARENT, dp(320), Gravity.BOTTOM))
        setContentView(root)

        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        setupImmersiveMode()

        val prefs = getSharedPreferences("sortire", MODE_PRIVATE)
        val saved = runCatching { Mode.valueOf(prefs.getString("mode", Mode.FIRST.name)!!) }
            .getOrDefault(Mode.FIRST)
        select(saved, save = false)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) setupImmersiveMode()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (panel.visibility == View.VISIBLE) closePanel() else super.onBackPressed()
    }

    private fun openPanel() {
        val h = resources.displayMetrics.heightPixels
        val landscape = resources.displayMetrics.widthPixels > h
        (panel.layoutParams as FrameLayout.LayoutParams).height = (h * if (landscape) 0.75f else 0.55f).toInt()
        panel.requestLayout()
        panel.visibility = View.VISIBLE
        tuneButton.visibility = View.GONE
    }

    private fun closePanel() {
        panel.visibility = View.GONE
        tuneButton.visibility = View.VISIBLE
    }

    private fun select(mode: Mode, save: Boolean = true) {
        arena.mode = mode
        if (save) getSharedPreferences("sortire", MODE_PRIVATE).edit().putString("mode", mode.name).apply()
    }

    private fun buildTuneButton() = TextView(this).apply {
        text = "⚙"
        textSize = 22f
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
        setPadding(dp(12), dp(10), dp(12), dp(10))
        background = GradientDrawable().apply {
            cornerRadius = dp(100).toFloat()
            setColor(Color.argb(90, 0, 0, 0))
        }
        setOnClickListener { openPanel() }
    }

    private fun setupImmersiveMode() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { controller ->
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsets.Type.systemBars())

                val hideHandler = Handler(Looper.getMainLooper())
                val hideRunnable = Runnable {
                    controller.hide(WindowInsets.Type.systemBars())
                }

                window.decorView.setOnApplyWindowInsetsListener { view, insets ->
                    val navVisible = insets.isVisible(WindowInsets.Type.navigationBars())
                    val statusVisible = insets.isVisible(WindowInsets.Type.statusBars())
                    if (navVisible || statusVisible) {
                        hideHandler.removeCallbacks(hideRunnable)
                        hideHandler.postDelayed(hideRunnable, 6000L) // Stay visible for 6 seconds
                    }
                    view.onApplyWindowInsets(insets)
                }
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}
