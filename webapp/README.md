# Sortire

**Put every finger on the screen. Sortire decides who goes first.**

Use it to pick who starts a game, who gets the last slice, or who has to do the dishes. Everyone touches the screen, a short countdown runs, and one finger is chosen (or everyone gets a number).

## 👉 [Open Sortire](https://YOUR-APP-URL-HERE/)

That link works right now, in your browser. There is nothing to download, no account and no app store. If you like it, you can add it to your home screen so it works like any other app (see below).

---

## What is a PWA?

Sortire is a **PWA** (progressive web app). That just means it is a website that can behave like an app:

- **No app store.** Open a link and it works.
- **Installs in seconds.** Add it to your home screen and it gets its own icon and opens full screen.
- **Works offline.** After the first time you open it, it keeps working without internet.
- **Updates itself.** When there's a new version, a small "Update" button appears.
- **Tiny and private.** No account, no ads, no tracking. Your settings are stored only on your device.

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

## How to play

1. Open Sortire. Pick a mode in the settings (the ⚙ button, top right):
   - **Pick one:** one finger is chosen as the winner.
   - **Order all:** every finger gets a number, revealed one by one.
2. Everyone puts **one finger** on the screen and keeps it there.
3. A countdown ring runs. When it finishes, the result appears.
4. Lift your fingers and touch again for a new round.

No touchscreen? On a computer, click to place a finger. Hold **Shift** while clicking to place several at once.

### Settings
Tap **⚙** to change how it looks and feels. The **Woodgrain** section switches between the wooden-disc look and the plain colors look, and lets you pick the wood, shine, tilt lighting and winner effects. Other sections cover the countdown length, sounds and vibration. **Reset** puts everything back to the defaults.

### Tilt lighting (iPhone)
The first time you tap, your iPhone may ask to use motion sensors. If you allow it, the shine on the wood follows how you tilt your phone. If you say no, everything still works.

---

## Updates
When a new version is ready, a pill that says **"New version available"** appears with an **Update** button. Tap it and the app reloads with the latest version.

## Troubleshooting

| Problem | What to try |
|---|---|
| No "Add to Home Screen" on iPhone | You're not in Safari. If you opened the link from another app (Messages, Instagram, Facebook), tap the browser icon to open it in Safari first. |
| No "Install" option on Android | Use Chrome and refresh the page once. "Add to Home screen" in the ⋮ menu also works. |
| It looks like an old version | Close the app completely and reopen it, or tap **Update** if you see it. Still stuck? Remove the app and add it again. |
| The wood background looks flat or effects are missing | Your device's graphics don't support the fancy effects. Everything else still works. |
| Fingers aren't all detected | Some phones only track a limited number of touches. Try fewer fingers, and keep them apart. |

## Removing the app
- **iPhone:** press and hold the icon, then tap **Remove App**.
- **Android:** press and hold the icon, then tap **Uninstall**.
- **Computer:** open the app, click the **⋮** menu in its window, then **Uninstall**.

---

## For whoever hosts this (players can skip this part)

- A PWA must be served over **HTTPS**. Any static host works: GitHub Pages, Netlify, Cloudflare Pages, or your own server. Upload the contents of this folder so that `index.html` is at the root of your URL.
- Replace `https://YOUR-APP-URL-HERE/` at the top of this file with your real address.
- When you change any file, bump `CACHE_NAME` in `sw.js` (for example `sortire-pwa-v9`). This is how installed copies know to update.
- The app makes no network requests of its own: no analytics, no tracking, no accounts. The service worker only caches the app's own files.
