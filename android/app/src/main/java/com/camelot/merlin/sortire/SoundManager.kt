package com.camelot.merlin.sortire

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.SoundPool
import android.os.SystemClock
import java.io.File
import java.io.FileOutputStream
import kotlin.math.exp
import kotlin.math.sin

object SoundManager {
    private var soundPool: SoundPool? = null
    private var loadedStyle = -1
    private var loadedSoundId = 0
    private var clickSoundId = 0
    private var lastPlayTimeMs = 0L
    private const val MIN_SOUND_INTERVAL_MS = 50L
    private var isInitialized = false
    private var appContext: Context? = null

    fun init(context: Context) {
        if (isInitialized) return
        isInitialized = true
        appContext = context.applicationContext

        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        soundPool = SoundPool.Builder()
            .setMaxStreams(1) // Single stream prevents simultaneous overlapping sounds
            .setAudioAttributes(audioAttributes)
            .build()

        // Background thread pre-generates active sound on startup with 0 UI thread impact
        Thread {
            runCatching {
                val style = Settings[Setting.SOUND_STYLE].toInt().coerceIn(0, 9)
                ensureStyleLoaded(style)
            }
        }.start()
    }

    @Synchronized
    private fun ensureStyleLoaded(style: Int) {
        if (loadedStyle == style && loadedSoundId != 0) return
        val ctx = appContext ?: return
        val cacheDir = ctx.cacheDir
        val names = arrayOf("pop", "bubble", "blip", "laser", "snap", "beep", "thud", "ping", "boing", "click")
        val file = File(cacheDir, "synth_${names[style]}_v3.wav")

        if (!file.exists()) {
            when (style) {
                0 -> generatePopWav(file)
                1 -> generateBubbleWav(file)
                2 -> generateBlipWav(file)
                3 -> generateLaserWav(file)
                4 -> generateSnapWav(file)
                5 -> generateBeepWav(file)
                6 -> generateThudWav(file)
                7 -> generatePingWav(file)
                8 -> generateBoingWav(file)
                9 -> generateClickWav(file)
                else -> generatePopWav(file)
            }
        }

        if (loadedSoundId != 0) {
            soundPool?.unload(loadedSoundId)
        }

        loadedSoundId = soundPool?.load(file.absolutePath, 1) ?: 0
        loadedStyle = style
    }

    @Synchronized
    private fun ensureClickLoaded() {
        if (clickSoundId != 0) return
        val ctx = appContext ?: return
        val file = File(ctx.cacheDir, "synth_click_v3.wav")
        if (!file.exists()) generateClickWav(file)
        clickSoundId = soundPool?.load(file.absolutePath, 1) ?: 0
    }

    fun playPop() {
        if (!Settings.bool(Setting.SOUND_ENABLED)) return
        val now = SystemClock.uptimeMillis()
        if (now - lastPlayTimeMs < MIN_SOUND_INTERVAL_MS) return
        lastPlayTimeMs = now

        val style = Settings[Setting.SOUND_STYLE].toInt().coerceIn(0, 9)
        ensureStyleLoaded(style)
        soundPool?.play(loadedSoundId, 1f, 1f, 1, 0, 1f)
    }

    fun playClick() {
        if (!Settings.bool(Setting.SOUND_ENABLED)) return
        val now = SystemClock.uptimeMillis()
        if (now - lastPlayTimeMs < MIN_SOUND_INTERVAL_MS) return
        lastPlayTimeMs = now

        ensureClickLoaded()
        soundPool?.play(clickSoundId, 0.8f, 0.8f, 1, 0, 1f)
    }

    fun playWinnerSound(context: Context) {
        if (!Settings.bool(Setting.SOUND_ENABLED)) return
        val now = SystemClock.uptimeMillis()
        lastPlayTimeMs = now + 500L

        val customFile = File(context.cacheDir, "custom_winner.m4a")
        if (customFile.exists()) {
            runCatching {
                MediaPlayer().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_GAME)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    setDataSource(customFile.absolutePath)
                    prepare()
                    start()
                    setOnCompletionListener { release() }
                }
            }
        } else {
            val style = Settings[Setting.SOUND_STYLE].toInt().coerceIn(0, 9)
            ensureStyleLoaded(style)
            soundPool?.play(loadedSoundId, 1f, 1f, 1, 0, 1.4f)
        }
    }

    // 0: Pop (Cartoon high-pitch drop)
    private fun generatePopWav(file: File) {
        val sampleRate = 44100
        val numSamples = (sampleRate * 28) / 1000
        val data = ByteArray(numSamples * 2)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            val freq = 1600.0 - (i.toDouble() / numSamples) * 1100.0
            val env = exp(-i.toDouble() / (sampleRate * 0.003))
            val sample = (sin(2.0 * Math.PI * freq * t) * 32767.0 * env).toInt().toShort()
            data[i * 2] = (sample.toInt() and 0xff).toByte()
            data[i * 2 + 1] = ((sample.toInt() ushr 8) and 0xff).toByte()
        }
        writeWavFile(file, data, sampleRate)
    }

    // 1: Bubble (Low to high pitch sweep)
    private fun generateBubbleWav(file: File) {
        val sampleRate = 44100
        val numSamples = (sampleRate * 50) / 1000
        val data = ByteArray(numSamples * 2)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            val freq = 300.0 + (i.toDouble() / numSamples) * 900.0
            val env = exp(-i.toDouble() / (sampleRate * 0.012))
            val sample = (sin(2.0 * Math.PI * freq * t) * 32767.0 * env).toInt().toShort()
            data[i * 2] = (sample.toInt() and 0xff).toByte()
            data[i * 2 + 1] = ((sample.toInt() ushr 8) and 0xff).toByte()
        }
        writeWavFile(file, data, sampleRate)
    }

    // 2: Blip (8-bit square wave)
    private fun generateBlipWav(file: File) {
        val sampleRate = 44100
        val numSamples = (sampleRate * 30) / 1000
        val data = ByteArray(numSamples * 2)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            val sine = sin(2.0 * Math.PI * 880.0 * t)
            val square = if (sine >= 0) 1.0 else -1.0
            val env = exp(-i.toDouble() / (sampleRate * 0.006))
            val sample = (square * 20000.0 * env).toInt().toShort()
            data[i * 2] = (sample.toInt() and 0xff).toByte()
            data[i * 2 + 1] = ((sample.toInt() ushr 8) and 0xff).toByte()
        }
        writeWavFile(file, data, sampleRate)
    }

    // 3: Laser (Rapid sci-fi sweep)
    private fun generateLaserWav(file: File) {
        val sampleRate = 44100
        val numSamples = (sampleRate * 80) / 1000
        val data = ByteArray(numSamples * 2)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            val freq = 2400.0 * exp(-t * 30.0)
            val env = exp(-i.toDouble() / (sampleRate * 0.02))
            val sample = (sin(2.0 * Math.PI * freq * t) * 32767.0 * env).toInt().toShort()
            data[i * 2] = (sample.toInt() and 0xff).toByte()
            data[i * 2 + 1] = ((sample.toInt() ushr 8) and 0xff).toByte()
        }
        writeWavFile(file, data, sampleRate)
    }

    // 4: Snap (Noise snap)
    private fun generateSnapWav(file: File) {
        val sampleRate = 44100
        val numSamples = (sampleRate * 20) / 1000
        val data = ByteArray(numSamples * 2)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            val noise = (Math.random() * 2.0 - 1.0)
            val env = exp(-i.toDouble() / (sampleRate * 0.003))
            val sample = (noise * 30000.0 * env).toInt().toShort()
            data[i * 2] = (sample.toInt() and 0xff).toByte()
            data[i * 2 + 1] = ((sample.toInt() ushr 8) and 0xff).toByte()
        }
        writeWavFile(file, data, sampleRate)
    }

    // 5: Beep (Clean C6 tone)
    private fun generateBeepWav(file: File) {
        val sampleRate = 44100
        val numSamples = (sampleRate * 60) / 1000
        val data = ByteArray(numSamples * 2)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            val env = exp(-i.toDouble() / (sampleRate * 0.015))
            val sample = (sin(2.0 * Math.PI * 1046.5 * t) * 32767.0 * env).toInt().toShort()
            data[i * 2] = (sample.toInt() and 0xff).toByte()
            data[i * 2 + 1] = ((sample.toInt() ushr 8) and 0xff).toByte()
        }
        writeWavFile(file, data, sampleRate)
    }

    // 6: Thud (Sub-bass drop)
    private fun generateThudWav(file: File) {
        val sampleRate = 44100
        val numSamples = (sampleRate * 90) / 1000
        val data = ByteArray(numSamples * 2)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            val freq = 160.0 - (i.toDouble() / numSamples) * 120.0
            val env = exp(-i.toDouble() / (sampleRate * 0.025))
            val sample = (sin(2.0 * Math.PI * freq * t) * 32767.0 * env).toInt().toShort()
            data[i * 2] = (sample.toInt() and 0xff).toByte()
            data[i * 2 + 1] = ((sample.toInt() ushr 8) and 0xff).toByte()
        }
        writeWavFile(file, data, sampleRate)
    }

    // 7: Ping (High crystalline C7 bell)
    private fun generatePingWav(file: File) {
        val sampleRate = 44100
        val numSamples = (sampleRate * 120) / 1000
        val data = ByteArray(numSamples * 2)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            val env = exp(-i.toDouble() / (sampleRate * 0.03))
            val sample = (sin(2.0 * Math.PI * 2093.0 * t) * 32767.0 * env).toInt().toShort()
            data[i * 2] = (sample.toInt() and 0xff).toByte()
            data[i * 2 + 1] = ((sample.toInt() ushr 8) and 0xff).toByte()
        }
        writeWavFile(file, data, sampleRate)
    }

    // 8: Boing (Wobbly bounce)
    private fun generateBoingWav(file: File) {
        val sampleRate = 44100
        val numSamples = (sampleRate * 80) / 1000
        val data = ByteArray(numSamples * 2)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            val freq = 500.0 + sin(2.0 * Math.PI * 30.0 * t) * 200.0
            val env = exp(-i.toDouble() / (sampleRate * 0.02))
            val sample = (sin(2.0 * Math.PI * freq * t) * 32767.0 * env).toInt().toShort()
            data[i * 2] = (sample.toInt() and 0xff).toByte()
            data[i * 2 + 1] = ((sample.toInt() ushr 8) and 0xff).toByte()
        }
        writeWavFile(file, data, sampleRate)
    }

    // 9: Click (Sharp wooden click)
    private fun generateClickWav(file: File) {
        val sampleRate = 44100
        val numSamples = (sampleRate * 25) / 1000
        val data = ByteArray(numSamples * 2)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            val env = exp(-i.toDouble() / (sampleRate * 0.004))
            val sample = (sin(2.0 * Math.PI * 1400.0 * t) * 32767.0 * env).toInt().toShort()
            data[i * 2] = (sample.toInt() and 0xff).toByte()
            data[i * 2 + 1] = ((sample.toInt() ushr 8) and 0xff).toByte()
        }
        writeWavFile(file, data, sampleRate)
    }

    private fun writeWavFile(file: File, pcmData: ByteArray, sampleRate: Int) {
        val totalDataLen = pcmData.size + 36
        val channels = 1
        val byteRate = sampleRate * channels * 2

        FileOutputStream(file).use { out ->
            out.write("RIFF".toByteArray())
            out.write(intToByteArray(totalDataLen), 0, 4)
            out.write("WAVE".toByteArray())
            out.write("fmt ".toByteArray())
            out.write(intToByteArray(16), 0, 4)
            out.write(shortToByteArray(1.toShort()), 0, 2)
            out.write(shortToByteArray(channels.toShort()), 0, 2)
            out.write(intToByteArray(sampleRate), 0, 4)
            out.write(intToByteArray(byteRate), 0, 4)
            out.write(shortToByteArray((channels * 2).toShort()), 0, 2)
            out.write(shortToByteArray(16.toShort()), 0, 2)
            out.write("data".toByteArray())
            out.write(intToByteArray(pcmData.size), 0, 4)
            out.write(pcmData)
        }
    }

    private fun intToByteArray(i: Int): ByteArray = byteArrayOf(
        (i and 0xff).toByte(),
        ((i ushr 8) and 0xff).toByte(),
        ((i ushr 16) and 0xff).toByte(),
        ((i ushr 24) and 0xff).toByte()
    )

    private fun shortToByteArray(s: Short): ByteArray = byteArrayOf(
        (s.toInt() and 0xff).toByte(),
        ((s.toInt() ushr 8) and 0xff).toByte()
    )
}
