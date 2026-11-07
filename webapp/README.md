# Sortire

**Put every finger on the screen. Sortire decides who goes first.**

Use it to pick who starts a game, who gets the last slice, or who has to do the dishes. Everyone touches the screen, a short countdown runs, and one finger is chosen (or everyone gets a number).

## 👉 [Open Sortire](https://orrison-andrew.github.io/sortire/)

That link works right now, in your browser. There is nothing to download, no account and no app store. If you like it, you can add it to your home screen so it works like any other app (see below).

---


## Add it to your home screen (recommended)

### iPhone or iPad
You must use **Safari** for this. Other browsers on iPhone can't install web apps.

1. Open the link above in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**. The Sortire icon is now on your home screen.

### Android
Use **Chrome** (or Samsung Internet).

1. Open the link above in Chrome.
2. Tap the **⋮** menu at the top right.
3. Tap **Install app** (or **Add to Home screen**).
4. Tap **Install**. The Sortire icon is now in your app list and on your home screen.

### Computer (Windows, Mac, Chromebook)
1. Open the link in **Chrome** or **Edge**.
2. Click the **install icon** at the right end of the address bar (a small screen with a down arrow), then click **Install**.
3. On a Mac with Safari: choose **File → Add to Dock**.

You can skip installing and just keep using the link in your browser.

---
## What is a PWA?

Sortire is a **PWA** (progressive web app). That just means it is a website that can behave like an app:

- **No app store.** Open a link and it works.
- **Installs in seconds.** Add it to your home screen and it gets its own icon and opens full screen.
- **Works offline.** After the first time you open it, it keeps working without internet.
- **Updates itself.** When there's a new version, a small "Update" button appears.
- **Tiny and private.** No account, no ads, no tracking. Your settings are stored only on your device.

---

## How to Use

1. Open Sortire. Pick a mode in the settings (the ⚙ button, top right):
   - **Pick one:** one finger is chosen as the winner.
   - **Order all:** every finger gets a number, revealed one by one.
2. Everyone puts **one finger** on the screen and keeps it there.
3. A countdown ring runs. When it finishes, the result appears.
4. Lift your fingers and touch again for a new round.

No touchscreen? On a computer, click to place a finger. Hold **Shift** while clicking to place several at once.

### Settings
Tap **⚙** to open the settings, and tap it again (or **Done**) to close them. At the top are **Game Mode** (**Pick one** or **Order all**) and **Surface**: **Color** (flat colored circles), **Wood** or **Stone**. Right under them are **Import** (paste a settings code), **Copy** (copy the current settings code) and **Reset**. Each surface keeps its own settings (materials, lighting, winner effects, colors, finger look), so changing one never disturbs the others; sound, timing and instruction text are shared. Rows that don't apply to a surface are hidden (for example the winner marker ring is Color only). Wood and stone give the textured-disc look and lets you pick the wood, shine, tilt lighting and winner effects. When someone wins, their wood spreads over the table in a fresh grain of its own, and that grain stays as the table for the next round. **Flood duration**, **Flood edge softness**, **Flood ripple intensity** and **Flood shows underlying grain** shape how it spreads, and **Winner grows** only controls the winning disc. **Disc shadow** sets how dark the shadow under each wood or stone disc is. Other sections cover the countdown length, **Volume** and sounds, vibration, and **Keep screen on** (stops the screen from dimming while the app is open). Every setting has a one-line explanation under its name, and settings that only matter in one game mode (winner effects for **Pick one**, reveal timing for **Order all**) are hidden in the other. **Reset** puts everything back to the defaults.

### No two fingers look alike
On **Color**, fingers draw from a palette of 100 colors (pale, vivid, deep and muted tones all mixed), and each new finger gets the color that is furthest from every color already on screen. **Color variety**, **Color saturation** and **Color brightness** shape the palette. On **Wood** and **Stone**, each finger gets a different material where possible, and every disc has its own freshly generated grain (nothing is stored or reused). Discs of the same material are also made slightly lighter or darker than each other, spaced as far apart as possible.

### Fair results
The winner (or the order) is picked with the browser's cryptographic random generator, using nothing but the number of fingers down: not their position, color, material or the order they touched. The pick is made halfway through the countdown, and any finger added or lifted restarts the countdown and throws that pick away, so the result is always a fresh, equal-chance draw among the fingers that are down at the end.

### Share and save your tunings
Each surface's tuning is captured in one **settings code**, a short string of letters and numbers shown at the top of the settings panel (under **Share & Saved Tunings**).

- **Copy code** copies it so you can send it to someone. They tap **Import**, paste it, and get exactly your tuning.
- **Save this tuning** keeps it in your own list with a name you choose. Tap a saved tuning to apply it, ✎ to rename it, ✕ to delete it. Saved tunings stay on your device.
- **Shuffle** applies a fully random set of settings for the current surface (material, lighting, winner effects, colors, finger look). Sound, timing and instruction text are left alone. Press it again for another; use **Save this tuning** to keep one you like.

Codes made by older versions of the app keep working after updates. Settings added later simply use their defaults.

### Tilt lighting (iPhone)
The first time you tap, your iPhone may ask to use motion sensors. If you allow it, the shine on the wood follows how you tilt your phone. If you say no, everything still works.

---

## Updates
When a new version is ready, a pill that says **"New version available"** appears with an **Update** button. Tap it and the app reloads with the latest version. A new version never replaces the running one by itself, so a round is never interrupted.

## Troubleshooting

| Problem | What to try |
|---|---|
| No "Add to Home Screen" on iPhone | You're not in Safari. If you opened the link from another app (Messages, Instagram, Facebook), tap the browser icon to open it in Safari first. |
| No "Install" option on Android | Use Chrome and refresh the page once. "Add to Home screen" in the ⋮ menu also works. |
| It looks like an old version | Close the app completely and reopen it, or tap **Update** if you see it. Still stuck? Remove the app and add it again. |
| The wood background looks flat or effects are missing | Your device's graphics don't support the fancy effects. Everything else still works. |
| Fingers aren't all detected | Some phones only track a limited number of touches. Try fewer fingers, and keep them apart. |
| A settings code says it is damaged, too short, or not a settings code | It was probably cut off or changed when copying. Copy the whole code again. Codes only use the letters A-Z and the digits 2-7. |

## Removing the app
- **iPhone:** press and hold the icon, then tap **Remove App**.
- **Android:** press and hold the icon, then tap **Uninstall**.
- **Computer:** open the app, click the **⋮** menu in its window, then **Uninstall**.

---

## For whoever hosts this (players can skip this part)

- A PWA must be served over **HTTPS**. Any static host works: GitHub Pages, Netlify, Cloudflare Pages, or your own server. Upload the contents of this folder so that `index.html` is at the root of your URL.
- **GitHub Pages:** in the repository go to **Settings → Pages** and set **Source** to **GitHub Actions**. The workflow in `.github/workflows/deploy-pwa.yml` deploys the `webapp` folder on every push to `main`.
- Replace `https://YOUR-APP-URL-HERE/` at the top of this file with your real address.
- The deploy workflow stamps `CACHE_NAME` in `sw.js` with the commit ID on every deploy, and checks that every file in the precache list exists. This is how installed copies know to update. If you host somewhere else, change `CACHE_NAME` by hand on every release (for example `sortire-pwa-v20`).
- Do not deploy `rockgrain-gl.js` or `settings.js.bak`: nothing loads them and they can be deleted from the repository.
- The app makes no network requests of its own beyond loading its own files: no analytics, no tracking, no accounts. The service worker only caches the app's own files.

### Settings codes (for developers)
- Format: a base32 string (letters A-Z and digits 2-7). Each entry of `CODE_FIELDS` is packed into just enough bits and the bits are written in order, 5 per character. There is no checksum: a code is rejected if it contains other characters or is shorter than 10 characters. If a code is shorter than the current layout (made by an older version), the missing fields use their defaults.
- **`CODE_FIELDS` is append-only once codes are released.** Until the first public release the layout may still change (codes made before such a change stop working).
- **`CODE_FIELDS` is append-only.** Never reorder, edit or delete an entry. A new setting goes on the end, and its schema entry gets added in the same change. Only per-surface settings are stored in codes; shared ones (audio, timing, instruction text, keep awake) are written as defaults.
- If you keep a codec test (for example `tools/settings-codec.test.js`), make sure it matches this format: round-trips, an older shorter code, and a "golden" code that must always decode the same way. Run it before releasing a change to `settings.js`.
- `codes.txt` only lists the built-in default code for each surface, for reference. The app does not read it.

### Code layout (for developers)
Scripts load in this order (see `index.html`); each one only uses the ones above it.

| File | Responsibility |
|---|---|
| `gl-util.js` | Shared WebGL helpers, seeded PRNG, offscreen texture generator, LRU cache |
| `disc.js` | Renders a shaded round puck from any material texture |
| `table-layer.js` | The live GPU table surface and winner flood (one shader for every material) |
| `material-set.js` | Builds the common API (keys, caches, discs, table layer) from a material definition |
| `woodgrain.js` | Wood species data + wood texture shader |
| `rocktexture.js` | Stone data + stone texture shader |
| `effects.js` | Winner shockwave / particle layer |
| `sound.js` | Procedural audio |
| `settings.js` | Settings schema, codes, saved tunings, presets |
| `surface-mode.js` | Single place that decides wood / stone / flat colour |
| `table.js` | Picks the layer for the active surface mode |
| `app.js` | Game logic, canvas rendering, settings panel |

To add a new material type (for example metal), create a file like `rocktexture.js` that calls `MaterialSet.create(...)`, then add it to `SurfaceMode`, `TableManager` and `index.html`.
