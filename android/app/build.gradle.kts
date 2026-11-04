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

            g2.color = Color(26, 26, 26)
            g2.fillRoundRect(0, 0, size, size, size / 4, size / 4)

            g2.color = Color.WHITE
            val margin = size / 6
            g2.fillOval(margin, margin, size - 2 * margin, size - 2 * margin)

            g2.dispose()

            ImageIO.write(img, "png", File(dir, "ic_launcher.png"))
            ImageIO.write(img, "png", File(dir, "ic_launcher_round.png"))
        }
    }
}

tasks.named("preBuild").configure {
    dependsOn("generateLauncherIcons")
}
