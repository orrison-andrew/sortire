# Sortire

Put every finger on the screen. Sortire decides who goes first.

Two modes (toggle at the bottom of the screen):

- **Pick one** — after a 2-second countdown one finger wins; the screen floods with the winner's color.
- **Order all** — everyone gets a number (1, 2, 3 …) revealed one at a time.

Works with any number of fingers. Each round uses a freshly generated random color palette or procedural woodgrain discs.
Haptic feedback on touch, on each reveal, and on the final result.

Goal: **instant launch**. All apps are fully native / vanilla with zero third-party dependencies.

| Platform | Stack | Folder |
|----------|-------|--------|
| iPhone   | Swift + SwiftUI shell, UIKit touch/drawing view | `ios/` |
| Android  | Kotlin, plain Views (no Compose/AndroidX)       | `android/` |
| Web (PWA)| Vanilla JS, Canvas, Web Audio API, Service Worker | `webapp/` |

## Build

### Web (Progressive Web App)
Zero build steps or third-party dependencies required. Run locally with any static web server:
```sh
cd webapp
npx serve .
# or:
python -m http.server 8000
```
Open `http://localhost:8000` on your desktop or phone.
- **Installable PWA**: Install to your phone's home screen directly from Safari (Share > *Add to Home Screen*) or Chrome (*Install app*).
- **GitHub Pages Deployment**: Automatically deployed on every push to `main` via the GitHub Actions workflow at [`.github/workflows/deploy-pwa.yml`](.github/workflows/deploy-pwa.yml). To activate: in repository **Settings > Pages**, set **Source** to **GitHub Actions**.

### iOS (Xcode 15+, iOS 16+)
```sh
brew install xcodegen
cd ios
xcodegen generate     # creates Sortire.xcodeproj from project.yml
open Sortire.xcodeproj
```
Set your Team under Signing & Capabilities, change the bundle ID if you like, and run on a real device
(the simulator can't do multi-touch well or haptics).

### Android (Android Studio Koala+, JDK 17)
Open the `android/` folder in Android Studio and let it sync, then run on a real device.
The project is pinned to **Gradle 8.7** (via `gradle/wrapper/gradle-wrapper.properties`) to match Android Gradle Plugin 8.5.2.
In Studio, *Settings > Build Tools > Gradle > Use Gradle from* should be **'gradle-wrapper.properties' file**.
If you build from the command line with a newer system Gradle (9.x), it will fail; use the wrapper (`gradle wrapper --gradle-version 8.7` once, using a Gradle 8.x install) instead.

## Tuning (Android & Web)
Tap **Tune** (top right) to open the tuning panel. Every timing, size, animation, color, woodgrain species, sound style, and haptic
value is a live slider/switch, and the top of the screen stays usable so you can test touches while you tweak.
- **Copy** puts all current values on the clipboard as `key = value` text, so you can paste them back
  to lock in the defaults (and to mirror them across platforms).
- **Reset** restores the built-in defaults.
- Values persist between launches.
- On Android, add a new tunable to the `Setting` enum in `Settings.kt`.
- On Web, tunables are defined in `webapp/settings.js`.

Palette logic is in `Palette.swift` / `Palette.kt` / `webapp/app.js` (golden-angle hue spacing from a base hue).

## Behavior notes
- Adding or removing a finger restarts the countdown. At least 2 fingers are needed.
- After a result, keep fingers down as long as you like; a new round starts on the next touch once all fingers are lifted.
- Switching modes resets the round.
