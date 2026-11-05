package com.camelot.merlin.sortire

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import java.io.File

class SoundRecorder(private val context: Context) {
    private var mediaRecorder: MediaRecorder? = null
    private val outputFile = File(context.cacheDir, "custom_winner.m4a")

    fun startRecording(): Boolean {
        return try {
            if (outputFile.exists()) outputFile.delete()
            mediaRecorder = (if (Build.VERSION.SDK_INT >= 31) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }).apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(outputFile.absolutePath)
                prepare()
                start()
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    fun stopRecording() {
        runCatching {
            mediaRecorder?.stop()
            mediaRecorder?.release()
            mediaRecorder = null
        }
    }

    fun hasCustomSound(): Boolean = outputFile.exists()

    fun deleteCustomSound() {
        if (outputFile.exists()) outputFile.delete()
    }
}
