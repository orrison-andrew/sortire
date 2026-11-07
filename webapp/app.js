/**
 * app.js: Main application logic and canvas renderer for Sortire PWA.
 * Uses TableManager and SurfaceMode for unified surface and arena rendering.
 */
(function () {
  'use strict';

  var MODES = {
    FIRST: {
      id: 'FIRST',
      title: 'Pick one',
      hint: 'Everyone put a finger on the screen.\nOne gets picked.'
    },
    ORDER: {
      id: 'ORDER',
      title: 'Order all',
      hint: 'Everyone put a finger on the screen.\nEveryone gets a number.'
    }
  };

  var SURFACE_LABELS = { COLOR: 'Color', WOOD: 'Wood', STONE: 'Stone' };

  // localStorage can throw (private mode, blocked storage), so every use goes through here
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  var currentMode = store.get('sortire_mode') === 'ORDER' ? MODES.ORDER : MODES.FIRST;

  // Unbiased random integer 0..n-1 from the browser's cryptographic generator.
  // Used for everything that decides a result (winner, order), so it cannot be
  // predicted or nudged, and it depends on nothing but n.
  function randInt(n) {
    if (n <= 1) return 0;
    var c = window.crypto || window.msCrypto;
    if (c && c.getRandomValues) {
      var buf = new Uint32Array(1);
      var limit = Math.floor(4294967296 / n) * n;   // reject the biased tail
      do { c.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  function hsvToRgb(h, s, v) {
    h = (h % 360 + 360) % 360;
    var c = v * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = v - c;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var d = max - min;
    var h = 0, s = max === 0 ? 0 : d / max, v = max;
    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h * 360, s: s, v: v };
  }

  function rgbString(rgb, a) {
    if (a !== undefined && a < 1) {
      return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + a + ')';
    }
    return 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
  }

  function blendColors(c1, c2, ratio) {
    ratio = Math.max(0, Math.min(1, ratio));
    var ir = 1 - ratio;
    return {
      r: Math.round(c1.r * ir + c2.r * ratio),
      g: Math.round(c1.g * ir + c2.g * ratio),
      b: Math.round(c1.b * ir + c2.b * ratio)
    };
  }

  function getAdaptiveMarkerColor(color) {
    var hsv = rgbToHsv(color.r, color.g, color.b);
    var sat = hsv.s;
    var v = hsv.v;
    if (v > 0.65) {
      hsv.s = Math.min(1, sat * 1.3);
      hsv.v = Math.max(0, v * 0.35);
    } else {
      hsv.s = Math.max(0, sat * 0.35);
      hsv.v = Math.min(1, v * 1.6 + 0.25);
    }
    return hsvToRgb(hsv.h, hsv.s, hsv.v);
  }

  var lastWinnerColor   = null;
  var lastWinnerWood    = null;
  var lastWinnerRock    = null;
  var lastWinnerSeed    = 0;

  var bgSeed = Math.floor(Math.random() * 100000) + 1;

  // Forget the previous winner's table, so the chosen material is what shows
  function clearWinnerTable() {
    lastWinnerWood = lastWinnerRock = lastWinnerColor = null;
    lastWinnerSeed = 0;
  }

  // ── Finger colours ────────────────────────────────────────────────────────
  // A palette of 100 colours. Hues walk round the wheel by the golden angle, and each
  // colour gets a different tone (pale, vivid, deep, muted...), so neighbours in the
  // list look nothing alike. A new finger takes the palette colour that is furthest
  // (in perceived colour) from every colour already on screen, so no two match.
  var PALETTE_SIZE = 100;
  var GOLDEN_ANGLE = 137.508;
  var COLOR_TONES = [   // [saturation, brightness]
    [0.95, 0.96], [0.50, 1.00], [0.85, 0.74], [0.28, 0.96], [1.00, 0.58],
    [0.70, 1.00], [0.42, 0.70], [0.90, 0.88], [0.60, 0.86], [1.00, 0.78]
  ];

  function rgbToLab(c) {
    function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    var r = lin(c.r), g = lin(c.g), b = lin(c.b);
    var x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    var y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
    var z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }

  function labDistance(a, b) {
    var dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  function buildPalette(hueOffset, satScale, briScale, variety) {
    var list = [];
    for (var i = 0; i < PALETTE_SIZE; i++) {
      var tone = COLOR_TONES[i % COLOR_TONES.length];
      var s = 0.9 + (tone[0] - 0.9) * variety;      // variety 0: every colour vivid; 1: full mix of tones
      var v = 0.9 + (tone[1] - 0.9) * variety;
      list.push(hsvToRgb(hueOffset + i * GOLDEN_ANGLE,
                         Math.max(0.05, Math.min(1, s * satScale)),
                         Math.max(0.15, Math.min(1, v * briScale))));
    }
    return list;
  }

  function Palette() {
    this.baseHue = Math.random() * 360;   // where the palette starts on the colour wheel (new every round)
    this.bgHue = Math.random() * 360;     // random background hue, fixed for the round
    this.refresh();
  }

  // Re-read the colour settings, so their sliders take effect immediately
  Palette.prototype.refresh = function () {
    this.colors = buildPalette(this.baseHue, Settings.get('saturation') / 0.85,
                               Settings.get('value_even') / 0.95, Settings.get('color_variety'));
    this.labs = this.colors.map(rgbToLab);

    if (Settings.bool('winner_bg_enabled') && lastWinnerColor) {
      var hsv = rgbToHsv(lastWinnerColor.r, lastWinnerColor.g, lastWinnerColor.b);
      var mutedSat = Math.min(Settings.get('bg_saturation'), hsv.s * 0.65);
      this.background = hsvToRgb(hsv.h, mutedSat, Settings.get('bg_value'));
    } else {
      var bgHue = Settings.bool('random_hue') ? this.bgHue : Settings.get('base_hue');
      this.background = hsvToRgb(bgHue % 360, Settings.get('bg_saturation'), Settings.get('bg_value'));
    }
  };

  // The palette colour furthest from every colour in `used` (a little random among the best)
  Palette.prototype.pick = function (used) {
    var usedLabs = used.map(rgbToLab);
    var scored = this.colors.map(function (c, i) {
      var d = usedLabs.length ? Infinity : Math.random();
      for (var u = 0; u < usedLabs.length; u++) d = Math.min(d, labDistance(this.labs[i], usedLabs[u]));
      return { c: c, d: d };
    }, this);
    scored.sort(function (p, q) { return q.d - p.d; });
    return scored[Math.floor(Math.random() * Math.min(6, scored.length))].c;
  };

  var canvas = document.getElementById('arena');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;

  var fingers = {};
  var fingerIds = [];
  var palette = new Palette();
  var phase = 'WAITING';
  var countdownStart = 0;
  var resultStart = 0;
  var animationEnd = 0;
  var winnerId = null;
  var ranking = [];
  var revealed = 0;
  var animFrameId = null;

  function Finger(x, y, color, discSpecies, seed, shadeShift, discRockType) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.discSpecies = discSpecies;
    this.seed = seed;
    this.shadeShift = shadeShift;
    this.discRockType = discRockType;
    this.down = true;

    var baseRadius = Settings.get('radius');
    var discDiameter = Math.max(32, Math.round(baseRadius * 2 * dpr * 1.5));
    var mode = SurfaceMode.getActiveMode();
    var set = surfaceSet(mode);
    if (set) {
      var key = (mode === SurfaceMode.MODES.STONE) ? discRockType : discSpecies;
      this.puckCanvas = set.getDiscCanvas(discDiameter, key, seed, shadeShift);
    }
  }

  // The material set (WoodGrain / RockTexture) behind a surface mode, or null for flat colour
  function surfaceSet(mode) {
    if (mode === SurfaceMode.MODES.WOOD) return WoodGrain;
    if (mode === SurfaceMode.MODES.STONE) return RockTexture;
    return null;
  }

  function getBaseWoodTypeKey() { return WoodGrain.getKey(Settings.get('wood_type')); }
  function getBaseRockTypeKey() { return RockTexture.getKey(Settings.get('rock_type')); }

  function haptic(type) {
    if (!('vibrate' in navigator)) return;
    try {
      if (type === 'tap' && Settings.bool('haptic_tap')) navigator.vibrate(15);
      else if (type === 'tick' && Settings.bool('haptic_tick')) navigator.vibrate(25);
      else if (type === 'result' && Settings.bool('haptic_result')) navigator.vibrate([40, 60, 80]);
    } catch (e) {}
  }

  // Halfway through the countdown the winner and their grain are chosen and the grain
  // is generated, so the flood starts without a hitch. Any finger change restarts the
  // countdown and throws the pick away, so it is exactly as fair as picking at the end.
  var warmTimer = 0;
  var pendingWinner = null;
  var pendingSeed = 0;

  function restartCountdown() {
    var minF = Math.round(Settings.get('min_fingers'));
    phase = (fingerIds.length >= minF) ? 'COUNTING' : 'WAITING';
    countdownStart = performance.now();

    clearTimeout(warmTimer);
    pendingWinner = null;
    pendingSeed = 0;
    if (phase === 'COUNTING' && currentMode === MODES.FIRST && Settings.bool('winner_flood')) {
      warmTimer = setTimeout(function () {
        if (phase !== 'COUNTING' || !fingerIds.length) return;
        pendingWinner = fingerIds[randInt(fingerIds.length)];
        pendingSeed = Math.floor(Math.random() * 100000) + 1;
        var f = fingers[pendingWinner];
        var mode = SurfaceMode.getActiveMode();
        var set = surfaceSet(mode);
        if (f && set) set.master(mode === SurfaceMode.MODES.STONE ? f.discRockType : f.discSpecies, pendingSeed);
      }, Settings.get('countdown_ms') * 0.5);
    }
    requestDraw();
  }

  var fx = null;
  var floodTable = null;
  var floodGrain = null;

  function currentTableWood() {
    return (Settings.bool('winner_bg_enabled') && lastWinnerWood) ? lastWinnerWood : null;
  }

  function currentTableRock() {
    return (Settings.bool('winner_bg_enabled') && lastWinnerRock) ? lastWinnerRock : null;
  }

  function currentTableGrain() {
    if (Settings.bool('winner_bg_enabled') && (lastWinnerWood || lastWinnerRock)) {
      return { species: lastWinnerWood || getBaseWoodTypeKey(), rockType: lastWinnerRock || getBaseRockTypeKey(), seed: lastWinnerSeed };
    }
    return { species: getBaseWoodTypeKey(), rockType: getBaseRockTypeKey(), seed: bgSeed };
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 2.5); }

  var tilt = { x: 0, y: 0, settled: false, pending: false };

  function onDeviceOrientation(e) {
    if (!Settings.bool('wood_tilt') || e.gamma === null || e.beta === null) return;
    var nx = Math.max(-1, Math.min(1, e.gamma / 30));
    var ny = Math.max(-1, Math.min(1, (e.beta - 40) / 30));
    var px = tilt.x, py = tilt.y;
    tilt.x += (nx - tilt.x) * 0.25;
    tilt.y += (ny - tilt.y) * 0.25;
    if (Math.abs(tilt.x - px) + Math.abs(tilt.y - py) > 0.004) requestDraw();
  }

  function requestTiltPermission() {
    if (tilt.settled || tilt.pending) return;
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        tilt.pending = true;
        DeviceOrientationEvent.requestPermission().then(function (r) {
          tilt.pending = false;
          tilt.settled = true;
          if (r === 'granted') window.addEventListener('deviceorientation', onDeviceOrientation);
        }).catch(function () { tilt.pending = false; });
      } else {
        tilt.settled = true;
        window.addEventListener('deviceorientation', onDeviceOrientation);
      }
    } catch (e) { tilt.settled = true; }
  }

  function lightVec() {
    var on = Settings.bool('wood_tilt');
    return {
      x: Math.max(-1.2, Math.min(1.2, -0.55 + (on ? tilt.x : 0) * 0.8)),
      y: Math.max(-1.2, Math.min(1.2, -0.65 + (on ? tilt.y : 0) * 0.8))
    };
  }

  function triggerWinnerFx(w) {
    if (!fx) return;
    var shock = Settings.bool('fx_shockwave');
    var n = Math.round(Settings.get('fx_particles'));
    if (!shock && n <= 0) return;

    var mode = SurfaceMode.getActiveMode();
    var set = surfaceSet(mode);
    var color = w.color, colA = w.color, colB = { r: 255, g: 255, b: 255 };
    if (set) {
      var cols = set.getColors(mode === SurfaceMode.MODES.STONE ? w.discRockType : w.discSpecies);
      color = { r: cols.light[0], g: cols.light[1], b: cols.light[2] };
      colA = color;
      colB = { r: cols.dark[0], g: cols.dark[1], b: cols.dark[2] };
    }
    fx.trigger(w.x, w.y, {
      color: color, colA: colA, colB: colB,
      shock: shock, particles: n
    });
  }

  var BG_DIM_LEVEL = 0.35;
  var bgMix = 0;
  var bgMixTime = 0;
  var floodBase = null;

  function brightBackground() {
    return (Settings.bool('winner_bg_enabled') && lastWinnerColor) ? lastWinnerColor : palette.background;
  }

  function currentBackgroundColor() {
    return blendColors(palette.background, brightBackground(), bgMix);
  }

  function winnerGrowMs() {
    return Settings.bool('winner_grow') ? Settings.get('winner_grow_ms') : 0;
  }

  function winnerScale(grow) {
    return Settings.bool('winner_grow') ? 1 + 0.3 * grow : 1;
  }

  function bgMixTarget() {
    var w = fingers[winnerId];
    if (phase === 'RESULT' && currentMode === MODES.FIRST && Settings.bool('winner_flood') && w) return 1;
    return fingerIds.length > 0 ? BG_DIM_LEVEL : 0;
  }

  function updateBgMix(now) {
    var dt = bgMixTime ? Math.min(100, now - bgMixTime) : 16;
    bgMixTime = now;
    var target = bgMixTarget();
    var tau = target > bgMix ? 150 : 450;
    bgMix += (target - bgMix) * (1 - Math.exp(-dt / tau));
    if (Math.abs(target - bgMix) < 0.004) bgMix = target;
  }

  function reset() {
    fingers = {};
    fingerIds = [];
    ranking = [];
    winnerId = null;
    revealed = 0;
    phase = 'WAITING';
    palette = new Palette();

    if (!Settings.bool('winner_bg_enabled')) {
      lastWinnerWood = null;
      lastWinnerRock = null;
      lastWinnerSeed = 0;
      lastWinnerColor = null;
      bgSeed = Math.floor(Math.random() * 100000) + 1;
    }

    clearTimeout(warmTimer);
    pendingWinner = null;
    pendingSeed = 0;
    if (fx) fx.stop();
    requestDraw();
  }

  function resolve(now) {
    phase = 'RESULT';
    resultStart = now;
    var ids = fingerIds.slice();

    if (currentMode === MODES.FIRST) {
      winnerId = (pendingWinner && fingers[pendingWinner]) ? pendingWinner : ids[randInt(ids.length)];
      var floodSeed = pendingSeed || (Math.floor(Math.random() * 100000) + 1);
      pendingWinner = null;
      pendingSeed = 0;
      var growMs = winnerGrowMs();
      var floodMs = Settings.get('flood_ms');
      animationEnd = now + Math.max(growMs, floodMs, 1200);

      var w = fingers[winnerId];
      if (w) {
        floodBase = currentBackgroundColor();
        floodTable = currentTableGrain();
        floodGrain = {
          species: w.discSpecies,
          rockType: w.discRockType,
          seed: floodSeed
        };
        lastWinnerColor = w.color;
        lastWinnerWood  = floodGrain.species;
        lastWinnerRock  = floodGrain.rockType;
        lastWinnerSeed  = floodGrain.seed;
        if (Settings.bool('winner_flood')) bgMix = 1;
        triggerWinnerFx(w);
      }

      SoundManager.playWinner();
      haptic('result');
    } else {
      for (var i = ids.length - 1; i > 0; i--) {
        var j = randInt(i + 1);
        var temp = ids[i]; ids[i] = ids[j]; ids[j] = temp;
      }
      ranking = ids;
      revealed = 0;
      var revealGap = Settings.get('reveal_gap_ms');
      var popMs = Settings.get('order_pop_ms');
      animationEnd = now + ranking.length * revealGap + popMs;
      advanceReveal(now);
    }
    requestDraw();
  }

  function advanceReveal(now) {
    var revealGap = Settings.get('reveal_gap_ms');
    var target = Math.min(
      ranking.length,
      Math.floor((now - resultStart) / revealGap) + 1
    );
    while (revealed < target) {
      revealed++;
      var isSuccess = (revealed === ranking.length);
      haptic(isSuccess ? 'result' : 'tick');
      if (isSuccess) {
        SoundManager.playWinner();
      } else {
        SoundManager.playClick();
      }
    }
  }

  // Least-used material first, never the table's own material (so discs stay visible)
  function pickDiscKey(set, tableKey, field) {
    var used = {};
    set.KEYS.forEach(function (k) { used[k] = 0; });
    fingerIds.forEach(function (id) {
      var f = fingers[id];
      if (f && used[f[field]] !== undefined) used[f[field]]++;
    });
    var best = Infinity, pool = [];
    set.KEYS.forEach(function (k) {
      var score = used[k] + (k === tableKey ? 100 : 0);
      if (score < best) { best = score; pool = [k]; }
      else if (score === best) pool.push(k);
    });
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Discs of the same wood/stone get different shades (a little lighter or darker),
  // each as far as possible from the shades already on screen
  var SHADE_RANGE = 0.22;
  function pickShade(field, key) {
    var used = [];
    fingerIds.forEach(function (id) {
      var f = fingers[id];
      if (f && f[field] === key) used.push(f.shadeShift);
    });
    if (!used.length) return (Math.random() * 2 - 1) * SHADE_RANGE;
    // Put the new shade in the middle of the widest gap between the shades already used
    var pts = used.concat([-SHADE_RANGE, SHADE_RANGE]).sort(function (p, q) { return p - q; });
    var bestGap = -1, mid = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var gap = pts[i + 1] - pts[i];
      if (gap > bestGap) { bestGap = gap; mid = (pts[i] + pts[i + 1]) / 2; }
    }
    return mid + (Math.random() - 0.5) * bestGap * 0.2;
  }

  function addFinger(id, x, y) {
    id = String(id);
    SoundManager.unlock();
    if (phase === 'RESULT') {
      var anyDown = false;
      for (var k in fingers) {
        if (fingers[k].down) { anyDown = true; break; }
      }
      if (anyDown) return;
      reset();
    }

    var discWood = pickDiscKey(WoodGrain, currentTableWood() || getBaseWoodTypeKey(), 'discSpecies');
    var discRock = pickDiscKey(RockTexture, currentTableRock() || getBaseRockTypeKey(), 'discRockType');
    var surfMode = SurfaceMode.getActiveMode();
    var shadeShift = pickShade(surfMode === SurfaceMode.MODES.STONE ? 'discRockType' : 'discSpecies',
                               surfMode === SurfaceMode.MODES.STONE ? discRock : discWood);
    var seed;
    do {   // every disc gets a seed no other disc on screen has, so no two grains match
      seed = Math.floor(Math.random() * 100000);
    } while (fingerIds.some(function (fid) { return fingers[fid] && fingers[fid].seed === seed; }));
    var inUse = fingerIds.map(function (fid) { return fingers[fid].color; });
    var color = palette.pick(inUse);

    fingers[id] = new Finger(x, y, color, discWood, seed, shadeShift, discRock);
    fingerIds.push(id);

    var style = Math.round(Settings.get('sound_style'));
    if (Settings.bool('sound_enabled')) SoundManager.playPop(style);
    haptic('tap');
    restartCountdown();
    syncWakeLock();
  }

  function liftFinger(id) {
    id = String(id);
    var fg = fingers[id];
    if (!fg || !fg.down) return;
    if (Settings.bool('sound_enabled')) {
      var style = Math.round(Settings.get('sound_style'));
      SoundManager.playPop(style);
    }
    if (phase === 'RESULT') {
      fg.down = false;
    } else {
      delete fingers[id];
      var idx = fingerIds.indexOf(id);
      if (idx !== -1) fingerIds.splice(idx, 1);
      restartCountdown();
    }
    requestDraw();
  }

  function moveFinger(id, x, y) {
    id = String(id);
    var fg = fingers[id];
    if (fg && fg.down) {
      fg.x = x;
      fg.y = y;
      requestDraw();
    }
  }

  function onTouchStart(e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      addFinger(t.identifier, t.clientX - rect.left, t.clientY - rect.top);
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      moveFinger(t.identifier, t.clientX - rect.left, t.clientY - rect.top);
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    SoundManager.unlock();   // iOS only unlocks audio on touchend
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      liftFinger(t.identifier);
    }
  }

  function onTouchCancel(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      liftFinger(t.identifier);
    }
  }

  var mouseId = 999999;
  var mouseDown = false;
  var pinnedMouseCount = 0;

  function onMouseDown(e) {
    if (e.target.closest('#tune-btn') || e.target.closest('#tuning-panel') || e.target.closest('#import-modal') || e.target.closest('#update-toast')) return;
    // Shift-click "pins" never lift, so release them once a result is showing
    if (phase === 'RESULT') {
      for (var pk in fingers) if (pk.indexOf('pin_') === 0) fingers[pk].down = false;
    }
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    if (e.shiftKey) {
      var pinId = 'pin_' + (++pinnedMouseCount);
      addFinger(pinId, x, y);
    } else {
      mouseDown = true;
      addFinger(mouseId, x, y);
    }
  }

  function onMouseMove(e) {
    if (mouseDown) {
      var rect = canvas.getBoundingClientRect();
      moveFinger(mouseId, e.clientX - rect.left, e.clientY - rect.top);
    }
  }

  function onMouseUp(e) {
    if (mouseDown) {
      mouseDown = false;
      liftFinger(mouseId);
    }
  }

  function resizeCanvas() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    requestDraw();
  }

  var SHADOW_BLUR = 0.2;   // blur as a fraction of the disc diameter

  // The puck's silhouette, blurred, on a padded transparent canvas (cached on the puck)
  function shadowSprite(src) {
    if (src.shadowCv) return src.shadowCv;
    var S = src.width;
    var blur = SHADOW_BLUR * S / (src.drawScale || 1);
    var pad = Math.ceil(blur * 2);
    var OFF = 10000;
    var c = document.createElement('canvas');
    c.width = c.height = S + pad * 2;
    var x = c.getContext('2d');
    // Drawn far off-canvas; only its shadow lands on the canvas
    x.shadowColor = 'rgba(0,0,0,1)';
    x.shadowBlur = blur;
    x.shadowOffsetX = OFF;
    x.drawImage(src, pad - OFF, pad);
    c.pad = pad;
    src.shadowCv = c;
    return c;
  }

  function drawCircle(fg, x, y, r, color, alpha) {
    if (r <= 0) return;
    alpha = (alpha === undefined) ? 1 : Math.max(0, Math.min(1, alpha));
    if (fg && fg.puckCanvas) {
      var L = lightVec();
      var pr = r * (fg.puckCanvas.drawScale || 1);
      var strength = Settings.get('disc_shadow');
      if (strength > 0) {
        // Pre-blurred shadow sprite (made once per puck): scaling it is far cheaper than blurring every frame
        var sp = shadowSprite(fg.puckCanvas);
        var k = (pr * 2) / fg.puckCanvas.width;
        ctx.save();
        ctx.globalAlpha = alpha * strength;
        ctx.drawImage(sp, x - pr - L.x * r * 0.17 - sp.pad * k, y - pr - L.y * r * 0.17 - sp.pad * k, sp.width * k, sp.height * k);
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(fg.puckCanvas, x - pr, y - pr, pr * 2, pr * 2);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = rgbString(color, alpha);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawLive(now) {
    var countdownMs = Math.max(1, Settings.get('countdown_ms'));
    var progress = Math.min(1, (now - countdownStart) / countdownMs);
    var pulseAmount = Settings.get('pulse_amount');
    var pulseSpeed = Settings.get('pulse_speed');
    var baseRadius = Settings.get('radius');
    var showRing = (phase === 'COUNTING') && Settings.bool('ring_enabled');
    var ringOffset = Settings.get('ring_offset');
    var ringStroke = Settings.get('ring_stroke');
    var ringOpacity = Settings.get('ring_opacity');

    var i = 0;
    for (var k in fingers) {
      var fg = fingers[k];
      var r = baseRadius * (1 + pulseAmount * Math.sin(now / 1000 * pulseSpeed + i));
      drawCircle(fg, fg.x, fg.y, r, fg.color, 1);

      if (showRing) {
        var rr = r + ringOffset;
        ctx.save();
        ctx.lineWidth = ringStroke;
        ctx.strokeStyle = fg.puckCanvas ? 'rgba(255,255,255,' + ringOpacity + ')'
                                      : rgbString(fg.color, ringOpacity);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(fg.x, fg.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();
        ctx.restore();
      }
      i++;
    }
  }

  function drawWinner(now) {
    var baseRadius = Settings.get('radius');
    var fadeS = Settings.get('winner_fade_ms') / 1000;
    var growS = winnerGrowMs() / 1000;
    var e = (now - resultStart) / 1000;
    var fade = (fadeS <= 0) ? 0 : Math.max(0, 1 - e / fadeS);

    if (fade > 0) {
      for (var k in fingers) {
        if (k !== winnerId) {
          var fg = fingers[k];
          drawCircle(fg, fg.x, fg.y, baseRadius, fg.color, fade);
        }
      }
    }

    var w = fingers[winnerId];
    if (!w) return;

    var t = (growS <= 0) ? 1 : Math.min(1, e / growS);
    var grow = 1 - Math.pow(1 - t, 3);
    var radius = baseRadius * winnerScale(grow);
    drawCircle(w, w.x, w.y, radius, w.color, 1);

    if (Settings.bool('marker_enabled') && SurfaceMode.getActiveMode() === SurfaceMode.MODES.COLOR) {
      var markerColor = getAdaptiveMarkerColor(w.color);
      var markerStroke = Settings.get('marker_stroke');
      var markerRadius = baseRadius * Settings.get('marker_radius');

      if (markerStroke > 0) {
        ctx.save();
        ctx.lineWidth = markerStroke;
        ctx.strokeStyle = rgbString(markerColor, 1);
        ctx.beginPath();
        ctx.arc(w.x, w.y, markerRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      var dotRadius = baseRadius * Settings.get('marker_dot') * grow;
      if (dotRadius > 0) {
        ctx.save();
        ctx.fillStyle = rgbString(markerColor, 1);
        ctx.beginPath();
        ctx.arc(w.x, w.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawRanking(now) {
    var baseRadius = Settings.get('radius');
    var popS = Settings.get('order_pop_ms') / 1000;
    var revealGapMs = Settings.get('reveal_gap_ms');
    var revealedScale = Settings.get('order_revealed_scale');
    var popAmount = Settings.get('order_pop_amount');
    var textScale = Settings.get('order_text_scale');
    var pendingScale = Settings.get('order_pending_scale');
    var pendingAlpha = Settings.get('order_pending_alpha');

    for (var k in fingers) {
      var fg = fingers[k];
      var idx = ranking.indexOf(k);
      if (idx < 0) continue;

      if (idx < revealed) {
        var age = (now - (resultStart + idx * revealGapMs)) / 1000;
        var pop = (popS <= 0) ? 0 : Math.max(0, 1 - age / popS);
        var r = baseRadius * (revealedScale + popAmount * pop);
        drawCircle(fg, fg.x, fg.y, r, fg.color, 1);

        ctx.save();
        ctx.font = 'bold ' + Math.round(r * textScale) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4;
        ctx.fillText((idx + 1).toString(), fg.x, fg.y);
        ctx.restore();
      } else {
        var rPend = baseRadius * pendingScale;
        drawCircle(fg, fg.x, fg.y, rPend, fg.color, pendingAlpha);
      }
    }
  }

  function drawHint() {
    if (!Settings.bool('hint_enabled')) return;
    var lines = currentMode.hint.split('\n');
    var fontSize = Settings.get('hint_size');
    var opacity = Settings.get('hint_opacity');

    ctx.save();
    ctx.font = fontSize + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,' + opacity + ')';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var lineHeight = fontSize * 1.35;
    var w = window.innerWidth;
    var h = window.innerHeight;
    var startY = h / 2 - (lines.length - 1) * lineHeight / 2;

    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], w / 2, startY + i * lineHeight);
    }
    ctx.restore();
  }

  function render(now) {
    animFrameId = null;

    var countdownMs = Settings.get('countdown_ms');
    if (phase === 'COUNTING' && now - countdownStart >= countdownMs) {
      resolve(now);
    }
    if (phase === 'RESULT' && currentMode === MODES.ORDER) {
      advanceReveal(now);
    }

    updateBgMix(now);

    ctx.save();
    ctx.scale(dpr, dpr);
    var w = window.innerWidth;
    var h = window.innerHeight;

    ctx.clearRect(0, 0, w, h);

    var winnerFg = fingers[winnerId];
    var floodActive = phase === 'RESULT' && currentMode === MODES.FIRST &&
                      Settings.bool('winner_flood') && !!winnerFg;
    var feather = Settings.get('flood_feather');
    var grow = 0, spread = 0, discR = 0, far = 0;
    if (floodActive) {
      var e = (now - resultStart) / 1000;
      var growS = winnerGrowMs() / 1000;
      grow = easeOut((growS <= 0) ? 1 : Math.min(1, e / growS));
      var spreadS = Settings.get('flood_ms') / 1000;
      spread = easeOut(Math.min(1, e / spreadS));
      discR = Settings.get('radius') * winnerScale(grow);
      far = Math.max(
        Math.hypot(winnerFg.x, winnerFg.y),
        Math.hypot(w - winnerFg.x, winnerFg.y),
        Math.hypot(winnerFg.x, h - winnerFg.y),
        Math.hypot(w - winnerFg.x, h - winnerFg.y)
      ) + 2;
    }

    var activeMode = SurfaceMode.getActiveMode();
    var stone = activeMode === SurfaceMode.MODES.STONE;
    var drawnGL = false;

    if (activeMode !== SurfaceMode.MODES.COLOR) {
      var grainEdge = Settings.get('flood_grain');
      var ripple = Settings.get('wood_flood_ripple');
      var flood = null;
      if (floodActive && floodGrain) {
        // Distance past the farthest corner the front must travel to leave no edge visible
        var reach = feather * (1.1 + 1.25 * grainEdge + 0.3 * ripple);
        flood = {
          x: winnerFg.x, y: winnerFg.y,
          r: discR + (far + reach - discR) * spread,
          feather: feather, ripple: ripple, grain: grainEdge,
          material: stone ? floodGrain.rockType : floodGrain.species,
          seed: floodGrain.seed
        };
      }
      var tiltOn = Settings.bool('wood_tilt');
      // Keep the previous table grain underneath the active flood
      var tGrain = (floodActive && floodTable) ? floodTable : currentTableGrain();

      drawnGL = TableManager.draw({
        material: stone ? tGrain.rockType : tGrain.species,
        seed: tGrain.seed,
        flood: flood,
        time: Settings.bool('wood_sheen_anim') ? now / 1000 : 0,
        tiltX: tiltOn ? tilt.x : 0, tiltY: tiltOn ? tilt.y : 0,
        sheen: Settings.get('wood_sheen'),
        vignette: Settings.get('wood_vignette')
      });
    }

    // Flat colour mode, or the GPU surface is unavailable: paint the table on the canvas
    if (!drawnGL) {
      TableManager.hide();
      if (floodActive) {
        ctx.fillStyle = rgbString(floodBase || currentBackgroundColor());
        ctx.fillRect(0, 0, w, h);
        var Rc = discR + (far + feather - discR) * spread;
        if (feather > 0) {
          var rg = ctx.createRadialGradient(winnerFg.x, winnerFg.y, Math.max(0, Rc - feather),
                                            winnerFg.x, winnerFg.y, Rc);
          rg.addColorStop(0, rgbString(winnerFg.color, 1));
          rg.addColorStop(1, rgbString(winnerFg.color, 0));
          ctx.fillStyle = rg;
          ctx.fillRect(0, 0, w, h);
        } else {
          ctx.fillStyle = rgbString(winnerFg.color);
          ctx.beginPath();
          ctx.arc(winnerFg.x, winnerFg.y, Rc, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = rgbString(currentBackgroundColor());
        ctx.fillRect(0, 0, w, h);
      }
    }

    if (fx) fx.draw(now);

    if (fingerIds.length === 0) {
      drawHint();
    } else {
      if (phase === 'WAITING' || phase === 'COUNTING') {
        drawLive(now);
      } else if (phase === 'RESULT') {
        if (currentMode === MODES.FIRST) drawWinner(now);
        else drawRanking(now);
      }
    }

    ctx.restore();

    var needsFrame = (fingerIds.length > 0) || (phase === 'RESULT' && now < animationEnd) || (bgMix !== bgMixTarget()) || (fx && fx.isActive());
    if (needsFrame) {
      animFrameId = requestAnimationFrame(render);
    }
  }

  function requestDraw() {
    if (!animFrameId) {
      animFrameId = requestAnimationFrame(render);
    }
  }

  // Surface = Color / Wood / Stone. Each keeps its own settings (see settings.js).
  function selectSurface(surface) {
    if (SurfaceMode.getActiveMode() === surface) return;
    SurfaceMode.setActiveMode(surface);
    reset();
    buildTuningPanel();
    warmAtlases();
  }

  function selectMode(mode) {
    if (currentMode === mode) return;
    currentMode = mode;
    store.set('sortire_mode', mode.id);
    reset();
    buildTuningPanel();
  }

  function syncSound() {
    SoundManager.setEnabled(Settings.bool('sound_enabled'));
    SoundManager.setVolume(Settings.get('sound_volume'));
  }

  // Keep the screen on while the app is open (it usually sits on a table)
  var wakeLock = null;
  var wakePending = false;
  function syncWakeLock() {
    if (!('wakeLock' in navigator)) return;
    var want = Settings.bool('keep_awake') && document.visibilityState === 'visible';
    if (want && !wakeLock && !wakePending) {
      wakePending = true;
      navigator.wakeLock.request('screen').then(function (l) {
        wakePending = false;
        wakeLock = l;
        l.addEventListener('release', function () { wakeLock = null; });
        syncWakeLock();   // the setting may have changed while the request was in flight
      }).catch(function () { wakePending = false; });
    } else if (!want && wakeLock) {
      try { wakeLock.release(); } catch (e) {}
      wakeLock = null;
    }
  }

  function whenIdle(fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 3000 });
    else setTimeout(fn, 250);
  }

  // Compile the active surface's texture generator in idle time, so the first finger isn't delayed
  function warmAtlases() {
    var set = surfaceSet(SurfaceMode.getActiveMode());
    if (set && set.warm) set.warm();
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { ta.setSelectionRange(0, text.length); document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function copyText(text, btn, label) {
    function done() {
      if (!btn) return;
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = label; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  function formatCode(code) { return code.replace(/(.{4})(?=.)/g, '$1 '); }

  function updateCodeBox() {
    var el = document.getElementById('code-box');
    if (el) el.textContent = formatCode(Settings.currentCode());
  }

  function applyCodeAndRefresh(code) {
    var r = Settings.applyCode(code);
    if (!r.ok) { alert(r.error); return false; }
    clearWinnerTable();
    buildTuningPanel();
    reset();
    return true;
  }

  function renderSavedList(wrap) {
    wrap.innerHTML = '';
    var list = Settings.listSaved(Settings.getMode());
    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'saved-empty';
      empty.textContent = 'Tunings you save for ' + SURFACE_LABELS[Settings.getMode()].toLowerCase() + ' will show up here.';
      wrap.appendChild(empty);
      return;
    }
    var current = Settings.currentCode();
    list.forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'saved-row';

      var nameBtn = document.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'saved-name' + (entry.code === current ? ' active' : '');
      nameBtn.textContent = entry.name;
      nameBtn.title = 'Apply this tuning';
      nameBtn.addEventListener('click', function () {
        SoundManager.playClick();
        applyCodeAndRefresh(entry.code);
      });

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'tune-mini-btn';
      editBtn.textContent = '✎';
      editBtn.title = 'Rename';
      editBtn.addEventListener('click', function () {
        var n = prompt('Rename tuning:', entry.name);
        if (n === null) return;
        Settings.renameSaved(entry.id, n);
        renderSavedList(wrap);
      });

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'tune-mini-btn';
      delBtn.textContent = '✕';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', function () {
        if (!confirm('Delete "' + entry.name + '"?')) return;
        Settings.deleteSaved(entry.id);
        renderSavedList(wrap);
      });

      row.appendChild(nameBtn);
      row.appendChild(editBtn);
      row.appendChild(delBtn);
      wrap.appendChild(row);
    });
  }

  function buildCodesSection(content) {
    var title = document.createElement('div');
    title.className = 'panel-group-title';
    title.textContent = SURFACE_LABELS[Settings.getMode()] + ' tuning: share & saved';
    content.appendChild(title);

    var box = document.createElement('div');
    box.className = 'panel-group code-section';

    var codeEl = document.createElement('div');
    codeEl.id = 'code-box';
    codeEl.className = 'code-box';
    codeEl.textContent = formatCode(Settings.currentCode());
    box.appendChild(codeEl);

    var btnRow = document.createElement('div');
    btnRow.className = 'code-btn-row';

    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'panel-btn';
    copyBtn.textContent = 'Copy code';
    copyBtn.addEventListener('click', function () {
      SoundManager.playClick();
      copyText(Settings.currentCode(), copyBtn, 'Copy code');
    });
    codeEl.addEventListener('click', function () { copyText(Settings.currentCode(), null, ''); });

    var savedWrap = document.createElement('div');
    savedWrap.className = 'saved-list';

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'panel-btn done';
    saveBtn.textContent = 'Save this tuning';
    saveBtn.addEventListener('click', function () {
      SoundManager.playClick();
      var name = prompt('Name this tuning:', 'Tuning ' + (Settings.listSaved(Settings.getMode()).length + 1));
      if (name === null) return;
      var r = Settings.saveCode(name, Settings.currentCode());
      if (!r.ok) { alert(r.error); return; }
      renderSavedList(savedWrap);
    });

    var shuffleBtn = document.createElement('button');
    shuffleBtn.type = 'button';
    shuffleBtn.className = 'panel-btn';
    shuffleBtn.textContent = 'Shuffle';
    shuffleBtn.title = 'Apply a fully random set of settings for this surface';
    shuffleBtn.addEventListener('click', function () {
      SoundManager.playClick();
      Settings.randomize();
      clearWinnerTable();
      buildTuningPanel();
      reset();
    });

    var importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'panel-btn';
    importBtn.textContent = 'Import';
    importBtn.title = 'Paste a settings code';
    importBtn.addEventListener('click', function () {
      SoundManager.playClick();
      var modal = document.getElementById('import-modal');
      var text = document.getElementById('import-text');
      if (!modal) return;
      if (text) text.value = '';
      modal.classList.add('visible');
    });

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'panel-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Put every setting back to its default';
    resetBtn.addEventListener('click', function () {
      SoundManager.playClick();
      Settings.resetAll();
      clearWinnerTable();
      buildTuningPanel();
      reset();
    });

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(copyBtn);
    btnRow.appendChild(importBtn);
    btnRow.appendChild(shuffleBtn);
    btnRow.appendChild(resetBtn);
    box.appendChild(btnRow);

    renderSavedList(savedWrap);
    box.appendChild(savedWrap);
    content.appendChild(box);
  }

  function buildTuningPanel() {
    var content = document.getElementById('tuning-content');
    if (!content) return;

    content.innerHTML = '';

    var surface = SurfaceMode.getActiveMode();

    var modeHeader = document.createElement('div');
    modeHeader.className = 'panel-group-title';
    modeHeader.textContent = 'Game Mode';
    content.appendChild(modeHeader);

    var modeBox = document.createElement('div');
    modeBox.className = 'panel-group mode-box';
    for (var mKey in MODES) {
      (function (m) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode-pill-panel' + (currentMode === m ? ' active' : '');
        btn.textContent = m.title;
        btn.addEventListener('click', function () {
          SoundManager.playClick();
          selectMode(m);
        });
        modeBox.appendChild(btn);
      })(MODES[mKey]);
    }
    content.appendChild(modeBox);

    var surfHeader = document.createElement('div');
    surfHeader.className = 'panel-group-title';
    surfHeader.textContent = 'Surface';
    content.appendChild(surfHeader);

    var surfBox = document.createElement('div');
    surfBox.className = 'panel-group mode-box';
    Settings.SURFACES.forEach(function (sf) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-pill-panel' + (surface === sf ? ' active' : '');
      btn.textContent = SURFACE_LABELS[sf];
      btn.addEventListener('click', function () {
        SoundManager.playClick();
        selectSurface(sf);
      });
      surfBox.appendChild(btn);
    });
    content.appendChild(surfBox);

    buildCodesSection(content);

    var groupOrder = ['WOOD', 'WINNER', 'AUDIO', 'COLORS', 'APPEARANCE', 'TIMING', 'SYSTEM'];

    groupOrder.forEach(function (groupKey) {
      var groupItems = Settings.SCHEMA.filter(function (s) {
        return s.group === groupKey && !s.hidden && (!s.modes || s.modes.indexOf(surface) >= 0) &&
               (!s.game || s.game === currentMode.id);
      });
      if (groupItems.length === 0 && groupKey !== 'SYSTEM') return;

      var header = document.createElement('div');
      header.className = 'panel-group-title';
      header.textContent = Settings.GROUPS[groupKey].title;
      content.appendChild(header);

      var groupEl = document.createElement('div');
      groupEl.className = 'panel-group';

      groupItems.forEach(function (s) {
        var row = document.createElement('div');
        row.className = 'tune-row';

        var label = document.createElement('div');
        label.className = 'tune-label';
        label.textContent = s.label;
        if (s.help) {
          var help = document.createElement('div');
          help.className = 'tune-help';
          help.textContent = s.help;
          label.appendChild(help);
        }

        var control = document.createElement('div');
        control.className = 'tune-control';

        if (s.options) {
          var select = document.createElement('select');
          s.options.forEach(function (opt, idx) {
            var o = document.createElement('option');
            o.value = idx;
            o.textContent = opt;
            if (idx === Math.round(Settings.get(s.key))) o.selected = true;
            select.appendChild(o);
          });
          select.addEventListener('change', function () {
            var idx = parseInt(select.value, 10);
            Settings.set(s.key, idx);
            if (s.key === 'sound_style') {
              SoundManager.playPop(idx);
            }
            if (s.key === 'wood_type' || s.key === 'rock_type') clearWinnerTable();
            if (s.key === 'wood_type' || s.key === 'rock_type' || s.resetsRound) reset(); else requestDraw();
          });
          control.appendChild(select);

          if (s.key === 'sound_style') {
            var playBtn = document.createElement('button');
            playBtn.className = 'tune-mini-btn';
            playBtn.type = 'button';
            playBtn.textContent = '▶';
            playBtn.title = 'Test sound';
            playBtn.addEventListener('click', function () {
              var idx = parseInt(select.value, 10);
              SoundManager.playPop(idx);
            });
            control.appendChild(playBtn);
          }
        } else if (s.isBool) {
          var toggle = document.createElement('label');
          toggle.className = 'switch';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = Settings.bool(s.key);
          var slider = document.createElement('span');
          slider.className = 'slider';
          toggle.appendChild(cb);
          toggle.appendChild(slider);
          cb.addEventListener('change', function () {
            Settings.set(s.key, cb.checked ? 1 : 0);
            if (s.resetsRound) reset(); else requestDraw();
          });
          control.appendChild(toggle);
        } else {
          var valDisplay = document.createElement('span');
          valDisplay.className = 'tune-val';
          valDisplay.textContent = Settings.format(s, Settings.get(s.key));

          var range = document.createElement('input');
          range.type = 'range';
          range.min = s.min;
          range.max = s.max;
          range.step = s.step;
          range.value = Settings.get(s.key);
          range.addEventListener('input', function () {
            var val = parseFloat(range.value);
            Settings.set(s.key, val);
            valDisplay.textContent = Settings.format(s, val);
            if (s.resetsRound) reset(); else requestDraw();
          });
          control.appendChild(range);
          control.appendChild(valDisplay);
        }

        row.appendChild(label);
        row.appendChild(control);
        groupEl.appendChild(row);
      });

      if (groupKey === 'SYSTEM') {
        var updateRow = document.createElement('div');
        updateRow.className = 'tune-row';
        var updateLabel = document.createElement('div');
        updateLabel.className = 'tune-label';
        updateLabel.textContent = 'App version & updates';
        var updateCtrl = document.createElement('div');
        updateCtrl.className = 'tune-control';
        var checkBtn = document.createElement('button');
        checkBtn.className = 'panel-btn';
        checkBtn.type = 'button';
        checkBtn.textContent = 'Check for updates';
        checkBtn.addEventListener('click', function () {
          SoundManager.playClick();
          checkBtn.textContent = 'Checking...';
          checkForUpdates(function (hasUpdate) {
            checkBtn.textContent = hasUpdate ? 'Update ready!' : 'Up to date';
            setTimeout(function () { checkBtn.textContent = 'Check for updates'; }, 2500);
          });
        });
        updateCtrl.appendChild(checkBtn);
        updateRow.appendChild(updateLabel);
        updateRow.appendChild(updateCtrl);
        groupEl.appendChild(updateRow);
      }

      content.appendChild(groupEl);
    });
  }

  function init() {
    var woodEl = document.getElementById('wood-bg');
    if (woodEl) {
      TableManager.init(woodEl);
    }
    var fxEl = document.getElementById('fx');
    if (fxEl) {
      fx = Effects.create(fxEl);
      fx.onRestore = requestDraw;
    }

    window.addEventListener('touchend', requestTiltPermission, { passive: true });
    window.addEventListener('click', requestTiltPermission, { passive: true });
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission !== 'function') requestTiltPermission();

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchCancel, { passive: false });

    document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturechange', function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('gestureend', function (e) { e.preventDefault(); }, { passive: false });

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    var tuneBtn = document.getElementById('tune-btn');
    var panel = document.getElementById('tuning-panel');
    var doneBtn = document.getElementById('tune-done');

    var importModal = document.getElementById('import-modal');
    var importText = document.getElementById('import-text');
    var importSubmit = document.getElementById('import-submit');
    var importCancel = document.getElementById('import-cancel');

    if (tuneBtn && panel) {
      tuneBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        SoundManager.playClick();
        if (panel.classList.contains('visible')) {
          panel.classList.remove('visible');
        } else {
          buildTuningPanel();
          panel.classList.add('visible');
        }
      });
    }

    if (doneBtn && panel) {
      doneBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        SoundManager.playClick();
        panel.classList.remove('visible');
      });
    }

    if (importCancel && importModal) {
      importCancel.addEventListener('click', function () {
        SoundManager.playClick();
        importModal.classList.remove('visible');
      });
    }

    if (importSubmit && importModal) {
      importSubmit.addEventListener('click', function () {
        SoundManager.playClick();
        var txt = importText.value.trim();
        if (!txt) return;
        var r = Settings.applyCode(txt);
        if (r.ok) {
          importModal.classList.remove('visible');
          clearWinnerTable();
          buildTuningPanel();
          reset();
        } else {
          alert(r.error);
        }
      });
    }

    syncSound();
    syncWakeLock();
    Settings.addChangeListener(function (key) {
      if (key === 'all' || /^(color_variety|saturation|value_even|random_hue|base_hue|bg_saturation|bg_value)$/.test(key)) palette.refresh();
      if (key === 'all' || key === 'sound_enabled' || key === 'sound_volume') syncSound();
      if (key === 'all' || key === 'keep_awake') syncWakeLock();
      requestDraw();
      updateCodeBox();
    });
    document.addEventListener('visibilitychange', syncWakeLock);
    whenIdle(warmAtlases);
    setupServiceWorker();
    requestDraw();
  }

  var swRegistration = null;
  var waitingWorker = null;

  function showUpdateToast(worker) {
    waitingWorker = worker;
    var toast = document.getElementById('update-toast');
    if (toast) {
      toast.classList.add('visible');
    }
  }

  function checkForUpdates(cb) {
    if (!swRegistration) {
      if (cb) cb(false);
      return;
    }
    swRegistration.update().then(function (reg) {
      if (reg && reg.waiting) {
        showUpdateToast(reg.waiting);
        if (cb) cb(true);
      } else if (reg && reg.installing) {
        if (cb) cb(true);
      } else {
        if (cb) cb(false);
      }
    }).catch(function () {
      if (cb) cb(false);
    });
  }

  function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    var updateBtn = document.getElementById('update-btn');
    if (updateBtn) {
      updateBtn.addEventListener('click', function () {
        SoundManager.playClick();
        if (waitingWorker) {
          waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        } else {
          window.location.reload();
        }
      });
    }

    function register() {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        swRegistration = reg;
        console.log('Sortire Service Worker registered:', reg.scope);

        if (reg.waiting) {
          showUpdateToast(reg.waiting);
        }

        reg.addEventListener('updatefound', function () {
          var newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', function () {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast(newWorker);
            }
          });
        });

        reg.update().catch(function () {});

        setInterval(function () {
          reg.update().catch(function () {});
        }, 15 * 60 * 1000);
      }).catch(function (err) {
        console.error('Sortire Service Worker registration failed:', err);
      });
    }
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && swRegistration) {
        swRegistration.update().catch(function () {});
      }
    });

    // Reload only when an already-running copy is replaced (the person tapped Update).
    // The very first install also fires controllerchange; that must not reload.
    var hadController = !!navigator.serviceWorker.controller;
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
