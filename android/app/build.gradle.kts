import java.awt.BasicStroke
import java.awt.Color
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.camelot.merlin.sortire"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.camelot.merlin.sortire"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    applicationVariants.all {
        val variant = this
        outputs.all {
            val output = this as com.android.build.gradle.internal.api.BaseVariantOutputImpl
            output.outputFileName = "sortie-${variant.name}.apk"
        }
    }
}

// Intentionally no dependencies: plain Android Views = smallest APK, fastest cold start.
dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("com.google.android.material:material:1.12.0")
}

tasks.register("generateLauncherIcons") {
    doLast {
        val densities = mapOf(
            "mdpi" to 48,
            "hdpi" to 72,
            "xhdpi" to 96,
            "xxhdpi" to 144,
            "xxxhdpi" to 192
        )
        densities.forEach { (density, size) ->
            val dir = File(project.projectDir, "src/main/res/mipmap-$density")
            dir.mkdirs()

            val img = BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB)
            val g2 = img.createGraphics()
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)

            // 1. Background: Walnut wood base color with grain lines
            g2.color = Color(92, 64, 47)
            g2.fillRoundRect(0, 0, size, size, size / 4, size / 4)

            g2.color = Color(46, 29, 20, 80)
            val strokeWidth = (size * 0.04f).coerceAtLeast(1f)
            g2.stroke = BasicStroke(strokeWidth)
            var y = -size
            while (y < size * 2) {
                g2.drawLine(0, y, size, y + size)
                y += (size / 8)
            }

            // Helper function to draw a 3D wood disc with shadow and bevel
            fun drawWoodDisc(cx: Int, cy: Int, radius: Int, baseCol: Color, rimCol: Color) {
                // Drop shadow
                g2.color = Color(0, 0, 0, 110)
                g2.fillOval(cx - radius + 2, cy - radius + 4, radius * 2, radius * 2)

                // Base wood disc
                g2.color = baseCol
                g2.fillOval(cx - radius, cy - radius, radius * 2, radius * 2)

                // Grain rim
                g2.color = rimCol
                g2.stroke = BasicStroke((radius * 0.12f).coerceAtLeast(1f))
                g2.drawOval(cx - radius, cy - radius, radius * 2, radius * 2)

                // Highlight
                g2.color = Color(255, 255, 255, 60)
                g2.stroke = BasicStroke((radius * 0.08f).coerceAtLeast(1f))
                g2.drawOval(cx - radius + 2, cy - radius + 2, radius * 2 - 4, radius * 2 - 4)
            }

            val r = (size * 0.22f).toInt()
            // Disc 1: Top Center (Maple)
            drawWoodDisc(size / 2, (size * 0.32f).toInt(), r, Color(238, 206, 159), Color(180, 140, 90))
            // Disc 2: Bottom Left (Red Oak)
            drawWoodDisc((size * 0.32f).toInt(), (size * 0.68f).toInt(), r, Color(198, 140, 105), Color(140, 85, 55))
            // Disc 3: Bottom Right (Purpleheart)
            drawWoodDisc((size * 0.68f).toInt(), (size * 0.68f).toInt(), r, Color(134, 72, 122), Color(60, 27, 58))

            g2.dispose()

            ImageIO.write(img, "png", File(dir, "ic_launcher.png"))
            ImageIO.write(img, "png", File(dir, "ic_launcher_round.png"))
        }
    }
}

tasks.named("preBuild").configure {
    dependsOn("generateLauncherIcons")
}
