package com.camelot.merlin.sortire

import android.graphics.*
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.*
import kotlin.random.Random

data class WoodSpecies(
    val label: String,
    val light: IntArray,
    val dark: IntArray,
    val rings: Double,
    val tilt: Double,
    val sharp: Double,
    val contrast: Double,
    val fiber: Double,
    val pores: Double,
    val rays: Double,
    val warp: Double,
    val tone: Double
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is WoodSpecies) return false
        return label == other.label && light.contentEquals(other.light) && dark.contentEquals(other.dark)
    }

    override fun hashCode(): Int {
        var result = label.hashCode()
        result = 31 * result + light.contentHashCode()
        result = 31 * result + dark.contentHashCode()
        return result
    }
}

enum class WoodType(val label: String, val species: WoodSpecies) {
    MAPLE("Maple", WoodSpecies("Maple", intArrayOf(236, 212, 170), intArrayOf(204, 168, 116), 14.0, 0.40, 2.2, 0.35, 0.10, 0.0, 0.0, 0.10, 0.04)),
    WHITE_OAK("White Oak", WoodSpecies("White Oak", intArrayOf(208, 183, 141), intArrayOf(148, 116, 78), 9.0, 0.35, 2.6, 0.75, 0.12, 0.5, 0.25, 0.18, 0.08)),
    RED_OAK("Red Oak", WoodSpecies("Red Oak", intArrayOf(208, 152, 114), intArrayOf(142, 84, 58), 8.0, 0.35, 2.6, 0.80, 0.12, 0.6, 0.20, 0.18, 0.08)),
    WALNUT("Walnut", WoodSpecies("Walnut", intArrayOf(112, 78, 56), intArrayOf(46, 29, 20), 7.0, 0.40, 2.4, 0.85, 0.16, 0.2, 0.0, 0.25, 0.10)),
    EBONY("Ebony", WoodSpecies("Ebony", intArrayOf(66, 54, 45), intArrayOf(13, 10, 9), 5.0, 0.45, 2.0, 0.45, 0.40, 0.0, 0.0, 0.30, 0.10)),
    PURPLEHEART("Purpleheart", WoodSpecies("Purpleheart", intArrayOf(134, 72, 122), intArrayOf(60, 27, 58), 5.0, 0.45, 2.0, 0.45, 0.22, 0.0, 0.0, 0.12, 0.06));

    val baseColor: Int get() = Color.rgb(species.light[0], species.light[1], species.light[2])
    val grainColor: Int get() = Color.rgb(species.dark[0], species.dark[1], species.dark[2])
}

object WoodgrainEngine {

    private val masterTextureCache = ConcurrentHashMap<WoodType, Bitmap>()
    private val discTextureCache = ConcurrentHashMap<String, Bitmap>()

    private class Mulberry32(seed: Long) {
        private var a = seed.toInt()
        fun nextFloat(): Float {
            a = (a + 0x6D2B79F5.toInt()) or 0
            var t = (a xor (a ushr 15)) * (1 or a)
            t = (t + (t xor (t ushr 7)) * (61 or t)) xor t
            val u = ((t xor (t ushr 14)) ushr 0) and 0x7FFFFFFF
            return u.toFloat() / 2147483648.0f
        }
    }

    private class ValueNoise2D(seed: Long) {
        private val p = IntArray(256)
        private val P = IntArray(512)
        private val V = FloatArray(256)

        init {
            val r = Mulberry32(seed)
            for (i in 0 until 256) {
                p[i] = i
                V[i] = r.nextFloat()
            }
            for (i in 255 downTo 1) {
                val j = (r.nextFloat() * (i + 1)).toInt()
                val t = p[i]
                p[i] = p[j]
                p[j] = t
            }
            for (i in 0 until 512) {
                P[i] = p[i and 255]
            }
        }

        fun eval(x: Double, y: Double): Double {
            val xi = floor(x).toInt()
            val yi = floor(y).toInt()
            val xf = x - xi
            val yf = y - yi
            val X = xi and 255
            val Y = yi and 255

            val a = V[P[P[X] + Y]].toDouble()
            val b = V[P[P[X + 1] + Y]].toDouble()
            val c = V[P[P[X] + Y + 1]].toDouble()
            val d = V[P[P[X + 1] + Y + 1]].toDouble()

            val u = xf * xf * (3.0 - 2.0 * xf)
            val v = yf * yf * (3.0 - 2.0 * yf)

            return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
        }

        fun fbm(x: Double, y: Double, octaves: Int): Double {
            var s = 0.0
            var amp = 0.5
            var freq = 1.0
            var tot = 0.0
            for (i in 0 until octaves) {
                s += amp * eval(x * freq, y * freq)
                tot += amp
                freq *= 2.0
                amp *= 0.5
            }
            return s / tot
        }
    }

    /** Generates master wood grain texture canvas for a species (cached). */
    fun getWoodBackgroundBitmap(woodType: WoodType, size: Int = 512): Bitmap {
        return masterTextureCache.getOrPut(woodType) {
            generate(woodType, size, 42)
        }
    }

    fun generate(woodType: WoodType, size: Int = 512, seed: Long = 1): Bitmap {
        val sp = woodType.species
        val rng = Mulberry32(seed * 7919 + woodType.ordinal * 131)
        val nA = ValueNoise2D(seed * 3 + 1)
        val nB = ValueNoise2D(seed * 3 + 2)
        val nC = ValueNoise2D(seed * 3 + 3)

        val cx = if (rng.nextFloat() < 0.55f) 0.15 + rng.nextFloat() * 0.7 else if (rng.nextFloat() < 0.5f) -0.4 - rng.nextFloat() * 0.6 else 1.4 + rng.nextFloat() * 0.6
        val v0 = 0.2 + rng.nextFloat() * 0.6

        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val pixels = IntArray(size * size)
        val L = sp.light
        val K = sp.dark

        for (y in 0 until size) {
            val v = y.toDouble() / size
            for (x in 0 until size) {
                val u = x.toDouble() / size

                val d = hypot(u - cx, (v - v0) * sp.tilt) + (nA.fbm(u * 2.5, v * 1.2, 3) - 0.5) * sp.warp
                val t = d * sp.rings
                val k = floor(t)
                val f = t - k
                val w = f.pow(sp.sharp) * (0.75 + 0.5 * nB.eval(k * 1.7 + 0.3, 7.7))

                val fib = nB.fbm(u * 160.0, v * 7.0, 2) - 0.5
                var m = 0.35 + (w - 0.4) * sp.contrast * 1.6 + fib * sp.fiber * 2.0
                m = m.coerceIn(0.0, 1.0)
                val tone = 1.0 + (nC.fbm(u * 1.6, v * 1.2, 3) - 0.5) * sp.tone * 2.0

                var R = (L[0] + (K[0] - L[0]) * m) * tone
                var G = (L[1] + (K[1] - L[1]) * m) * tone
                var B = (L[2] + (K[2] - L[2]) * m) * tone

                if (sp.pores > 0) {
                    val pr = nC.eval(u * 200.0, v * 14.0)
                    if (pr > 0.78) {
                        val q = 1.0 - 0.55 * ((pr - 0.78) / 0.22) * sp.pores * (1.0 - f * 0.6)
                        R *= q; G *= q; B *= q
                    }
                }

                if (sp.rays > 0) {
                    val ry = nA.eval(u * 8.0, v * 110.0)
                    if (ry > 0.82) {
                        val s = ((ry - 0.82) / 0.18) * sp.rays * 40.0
                        R += s; G += s; B += s
                    }
                }

                val red = R.roundToInt().coerceIn(0, 255)
                val green = G.roundToInt().coerceIn(0, 255)
                val blue = B.roundToInt().coerceIn(0, 255)

                pixels[y * size + x] = Color.rgb(red, green, blue)
            }
        }
        bitmap.setPixels(pixels, 0, size, 0, 0, size, size)
        return bitmap
    }

    /** Creates or fetches a cached wooden disc bitmap with unique shade shift, 3D edge shading and highlights. */
    fun getWoodDiscBitmap(sizePx: Int, woodType: WoodType, seed: Long = 0, shadeShift: Float = 0f): Bitmap {
        val size = sizePx.coerceAtLeast(16)
        val key = "${woodType.name}_${size}_${seed}_$shadeShift"
        return discTextureCache.getOrPut(key) {
            val masterTex = getWoodBackgroundBitmap(woodType)
            createWoodDiscBitmapInternal(size, masterTex, seed, shadeShift)
        }
    }

    private fun createWoodDiscBitmapInternal(size: Int, tex: Bitmap, seed: Long, shadeShift: Float): Bitmap {
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val r = size / 2f
        val rng = Random(seed)

        val path = Path().apply {
            addCircle(r, r, r, Path.Direction.CW)
        }

        canvas.save()
        canvas.clipPath(path)

        // Random crop and rotation from master texture
        val matrix = Matrix().apply {
            val sw = tex.width * 0.5f
            val sampleX = rng.nextFloat() * (tex.width - sw)
            val sampleY = rng.nextFloat() * (tex.height - sw)
            postTranslate(-sampleX, -sampleY)
            val scaleRatio = (2f * r) / sw
            postScale(scaleRatio, scaleRatio)
            postRotate(rng.nextFloat() * 360f, r, r)
        }
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
        canvas.drawBitmap(tex, matrix, paint)

        // Apply unique shade shift (darken or lighten wood tone per disc)
        if (shadeShift != 0f) {
            val shadePaint = Paint(Paint.ANTI_ALIAS_FLAG)
            if (shadeShift < 0) {
                val alpha = (-shadeShift * 255).toInt().coerceIn(0, 160)
                shadePaint.color = Color.argb(alpha, 0, 0, 0)
            } else {
                val alpha = (shadeShift * 255).toInt().coerceIn(0, 160)
                shadePaint.color = Color.argb(alpha, 255, 255, 255)
            }
            canvas.drawCircle(r, r, r, shadePaint)
        }

        // Radial Edge Shading (darkens outer edge for 3D curvature)
        val radialShader = RadialGradient(
            r, r, r,
            intArrayOf(Color.TRANSPARENT, Color.argb(100, 0, 0, 0)),
            floatArrayOf(0.55f, 1.0f),
            Shader.TileMode.CLAMP
        )
        val shaderPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply { shader = radialShader }
        canvas.drawCircle(r, r, r, shaderPaint)

        // Top-Left Highlight Gradient
        val linearShader = LinearGradient(
            0f, 0f, size.toFloat(), size.toFloat(),
            intArrayOf(Color.argb(55, 255, 255, 255), Color.TRANSPARENT, Color.argb(45, 0, 0, 0)),
            floatArrayOf(0f, 0.5f, 1.0f),
            Shader.TileMode.CLAMP
        )
        shaderPaint.shader = linearShader
        canvas.drawCircle(r, r, r, shaderPaint)

        // Rim border
        val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = max(2f, r * 0.05f)
            color = Color.argb(90, 0, 0, 0)
        }
        canvas.drawCircle(r, r, r - rimPaint.strokeWidth / 2f, rimPaint)

        // Bevel Highlight
        val bevelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = max(1.5f, r * 0.03f)
            color = Color.argb(35, 255, 255, 255)
        }
        canvas.drawCircle(r, r, r * 0.93f, bevelPaint)

        canvas.restore()
        return bitmap
    }
}
