/**
 * app.js: Main application logic and canvas renderer for Sortire PWA.
 * Fully mirrors Android ArenaView, MainActivity, and Palette with 60/120fps canvas rendering.
 */
(function () {
  'use strict';

  // --- Modes ---
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

  var currentMode = localStorage.getItem('sortire_mode') === 'ORDER' ? MODES.ORDER : MODES.FIRST;

  // --- Color & Palette Helpers ---
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

  // --- Palette Class & Session Winner Tracking ---
  var lastWinnerSpecies = null;
  var lastWinnerSeed    = null;
  var lastWinnerColor   = null;

  // Per-session background seed — randomised on first load and whenever the
  // species background changes so the grain pattern never looks identical.
  var bgSeed = Math.floor(Math.random() * 100000) + 1;

  function Palette() {
    this.hueStep = Settings.get('hue_step');
    this.saturation = Settings.get('saturation');
    this.valueEven = Settings.get('value_even');
    this.valueOdd = Settings.get('value_odd');

    if (Settings.bool('winner_bg_enabled') && lastWinnerColor) {
      // Background derived from slightly muted version of last winning color
      var hsv = rgbToHsv(lastWinnerColor.r, lastWinnerColor.g, lastWinnerColor.b);
      this.baseHue = hsv.h;
      var mutedSat = Math.min(Settings.get('bg_saturation'), hsv.s * 0.65);
      var mutedVal = Settings.get('bg_value');
      this.background = hsvToRgb(hsv.h, mutedSat, mutedVal);
    } else {
      this.baseHue = Settings.bool('random_hue') ? Math.random() * 360 : Settings.get('base_hue');
      this.background = hsvToRgb(
        this.baseHue % 360,
        Settings.get('bg_saturation'),
        Settings.get('bg_value')
      );
    }
  }

  Palette.prototype.color = function (index) {
    var hue = (this.baseHue + index * this.hueStep) % 360;
    var value = (index % 2 === 0) ? this.valueEven : this.valueOdd;
    return hsvToRgb(hue, this.saturation, value);
  };

  // --- Arena State Machine ---
  var canvas = document.getElementById('arena');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;

  var fingers = {};           // id -> Finger object
  var fingerIds = [];         // insertion order
  var palette = new Palette();
  var nextColorIndex = 0;
  var phase = 'WAITING';      // WAITING, COUNTING, RESULT
  var countdownStart = 0;
  var resultStart = 0;
  var animationEnd = 0;
  var winnerId = null;
  var ranking = [];
  var revealed = 0;
  var animFrameId = null;

  function Finger(x, y, color, discSpecies, seed, shadeShift) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.discSpecies = discSpecies;
    this.seed = seed;
    this.shadeShift = shadeShift;
    this.down = true;

    // Pre-generate wooden puck canvas once at crisp resolution
    var baseRadius = Settings.get('radius');
    var discDiameter = Math.max(32, Math.round(baseRadius * 2 * dpr * 1.5));
    this.puckCanvas = WoodGrain.getDiscCanvas(discDiameter, discSpecies, seed, shadeShift);
  }

  function getBaseWoodTypeKey() {
    var idx = Math.round(Settings.get('wood_type'));
    return WoodGrain.getSpeciesKey(idx);
  }

  function haptic(type) {
    if (!('vibrate' in navigator)) return;
    try {
      if (type === 'tap' && Settings.bool('haptic_tap')) navigator.vibrate(15);
      else if (type === 'tick' && Settings.bool('haptic_tick')) navigator.vibrate(25);
      else if (type === 'result' && Settings.bool('haptic_result')) navigator.vibrate([40, 60, 80]);
    } catch (e) {}
  }

  function restartCountdown() {
    var minF = Math.round(Settings.get('min_fingers'));
    phase = (fingerIds.length >= minF) ? 'COUNTING' : 'WAITING';
    countdownStart = performance.now();
    requestDraw();
  }

  function updateTabletopBackground() {
    var bgEl = document.getElementById('wood-bg');
    if (!bgEl) return;

    var woodOn = Settings.bool('woodgrain_enabled');
    if (!woodOn) return;   // canvas draw() handles the colour fill instead

    // winner_bg_enabled ON + a previous winner exists → use their species (muted)
    // winner_bg_enabled OFF (or no previous winner)   → use the chosen species + fresh seed
    if (Settings.bool('winner_bg_enabled') && lastWinnerSpecies) {
      // Same species + seed the winner flood used, so the grain carries over
      WoodGrain.renderBackground(bgEl, lastWinnerSpecies, lastWinnerSeed, /*isMuted=*/true);
    } else {
      WoodGrain.renderBackground(bgEl, getBaseWoodTypeKey(), bgSeed, /*isMuted=*/false);
    }
  }

  function reset() {
    fingers = {};
    fingerIds = [];
    ranking = [];
    winnerId = null;
    revealed = 0;
    nextColorIndex = 0;
    phase = 'WAITING';
    palette = new Palette();

    // Fresh grain pattern each round (new seed → different pith position / ring phase)
    bgSeed = Math.floor(Math.random() * 100000) + 1;

    var bgWinnerEl = document.getElementById('wood-bg-winner');
    if (bgWinnerEl) bgWinnerEl.style.opacity = '0';

    updateTabletopBackground();
    requestDraw();
  }
  function resolve(now) {
    phase = 'RESULT';
    resultStart = now;
    var ids = fingerIds.slice();

    if (currentMode === MODES.FIRST) {
      winnerId = ids[Math.floor(Math.random() * ids.length)];
      var growMs = Settings.get('winner_grow_ms');
      animationEnd = now + Math.max(growMs, 800);

      var w = fingers[winnerId];
      if (w) {
        // Remember the winner so the next round's background can match it
        lastWinnerSpecies = w.discSpecies;
        lastWinnerSeed    = w.seed;
        lastWinnerColor   = w.color;
      }
      var bgWinnerEl = document.getElementById('wood-bg-winner');
      if (w && bgWinnerEl && Settings.bool('woodgrain_enabled')) {
        WoodGrain.renderBackground(bgWinnerEl, w.discSpecies, w.seed);
      }

      SoundManager.playWinner();
      haptic('result');
    } else {
      // ORDER mode: Fisher-Yates shuffle
      for (var i = ids.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
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

  function addFinger(id, x, y) {
    SoundManager.unlock();
    if (phase === 'RESULT') {
      var anyDown = false;
      for (var k in fingers) {
        if (fingers[k].down) { anyDown = true; break; }
      }
      if (anyDown) return;
      reset();
    }

    var discWood = WoodGrain.getRandomSpecies();
    var shadeShift = (Math.random() * 0.5 - 0.25);
    var seed = Math.floor(Math.random() * 100000);
    var color = palette.color(nextColorIndex++);

    fingers[id] = new Finger(x, y, color, discWood, seed, shadeShift);
    fingerIds.push(id);

    var style = Math.round(Settings.get('sound_style'));
    if (Settings.bool('sound_enabled')) SoundManager.playPop(style);
    haptic('tap');
    restartCountdown();
  }

  function liftFinger(id) {
    var fg = fingers[id];
    if (!fg || !fg.down) return;
    if (Settings.bool('sound_enabled')) {
      var style = Math.round(Settings.get('sound_style'));
      SoundManager.playPop(style);
    }
    if (phase === 'RESULT') {
      fg.down = false; // keep visually on screen
    } else {
      delete fingers[id];
      var idx = fingerIds.indexOf(id);
      if (idx !== -1) fingerIds.splice(idx, 1);
      restartCountdown();
    }
    requestDraw();
  }

  function moveFinger(id, x, y) {
    var fg = fingers[id];
    if (fg && fg.down) {
      fg.x = x;
      fg.y = y;
      requestDraw();
    }
  }

  // --- Touch Event Handlers ---
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

  // Desktop mouse fallback & multi-touch testing (Hold Shift to pin multiple fingers)
  var mouseId = 999999;
  var mouseDown = false;
  var pinnedMouseCount = 0;

  function onMouseDown(e) {
    if (e.target.closest('#tune-btn') || e.target.closest('#tuning-panel') || e.target.closest('#import-modal')) return;
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

  // --- Rendering Functions ---
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

  function drawCircle(fg, x, y, r, color, alpha) {
    if (r <= 0) return;
    alpha = (alpha === undefined) ? 1 : Math.max(0, Math.min(1, alpha));
    var woodgrainOn = Settings.bool('woodgrain_enabled');

    if (woodgrainOn && fg && fg.puckCanvas) {
      // Drop shadow behind wooden puck. The shadow-casting disc is drawn far off-screen
      // and only its shadow is offset back into view, so no opaque black disc shows
      // through when the puck is translucent. Shadow offsets/blur ignore the canvas
      // transform, hence the dpr scaling.
      var SHADOW_OFF = 10000;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,' + (0.45 * alpha) + ')';
      ctx.shadowBlur = r * 0.35 * dpr;
      ctx.shadowOffsetX = SHADOW_OFF * dpr;
      ctx.shadowOffsetY = r * 0.12 * dpr;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x - SHADOW_OFF, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Disc image from pre-rendered puck canvas
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(fg.puckCanvas, x - r, y - r, r * 2, r * 2);
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
        ctx.strokeStyle = 'rgba(255,255,255,' + ringOpacity + ')';
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
    var growS = Settings.get('winner_grow_ms') / 1000;
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
    var radius = baseRadius * (1 + 0.3 * grow);
    drawCircle(w, w.x, w.y, radius, w.color, 1);

    if (Settings.bool('marker_enabled')) {
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

        // Draw rank number
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
    animFrameId = null; // Mark current frame as consumed

    var countdownMs = Settings.get('countdown_ms');
    if (phase === 'COUNTING' && now - countdownStart >= countdownMs) {
      resolve(now);
    }
    if (phase === 'RESULT' && currentMode === MODES.ORDER) {
      advanceReveal(now);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    var w = window.innerWidth;
    var h = window.innerHeight;

    ctx.clearRect(0, 0, w, h);

    var woodgrainOn = Settings.bool('woodgrain_enabled');
    var bgEl = document.getElementById('wood-bg');
    var bgWinnerEl = document.getElementById('wood-bg-winner');
    var winnerFg = fingers[winnerId];

    if (woodgrainOn) {
      if (bgEl && bgEl.style.display !== 'block') bgEl.style.display = 'block';
      if (bgWinnerEl && bgWinnerEl.style.display !== 'block') bgWinnerEl.style.display = 'block';

      if (phase === 'RESULT' && currentMode === MODES.FIRST && Settings.bool('winner_flood') && winnerFg) {
        var growS = Settings.get('winner_grow_ms') / 1000;
        var e = (now - resultStart) / 1000;
        var t = (growS <= 0) ? 1 : Math.min(1, e / growS);
        var grow = 1 - Math.pow(1 - t, 3);
        if (bgWinnerEl) bgWinnerEl.style.opacity = grow.toFixed(3);
      } else {
        if (bgWinnerEl) bgWinnerEl.style.opacity = '0';
      }
    } else {
      if (bgEl && bgEl.style.display !== 'none') bgEl.style.display = 'none';
      if (bgWinnerEl && bgWinnerEl.style.display !== 'none') bgWinnerEl.style.display = 'none';

      if (phase === 'RESULT' && currentMode === MODES.FIRST && Settings.bool('winner_flood') && winnerFg) {
        var growS = Settings.get('winner_grow_ms') / 1000;
        var e = (now - resultStart) / 1000;
        var t = (growS <= 0) ? 1 : Math.min(1, e / growS);
        var grow = 1 - Math.pow(1 - t, 3);
        var blended = blendColors(palette.background, winnerFg.color, grow);
        ctx.fillStyle = rgbString(blended);
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = rgbString(palette.background);
        ctx.fillRect(0, 0, w, h);
      }
    }

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

    var needsFrame = (fingerIds.length > 0) || (phase === 'RESULT' && now < animationEnd);
    if (needsFrame) {
      animFrameId = requestAnimationFrame(render);
    }
  }

  function requestDraw() {
    if (!animFrameId) {
      animFrameId = requestAnimationFrame(render);
    }
  }

  function selectMode(mode) {
    if (currentMode === mode) return;
    currentMode = mode;
    localStorage.setItem('sortire_mode', mode.id);
    reset();
    buildTuningPanel();
  }

  // --- Tuning Panel Builder ---
  function buildTuningPanel() {
    var content = document.getElementById('tuning-content');
    if (!content) return;

    content.innerHTML = '';

    // 1. GAME MODE section
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

    // 2-7 Remaining Settings Groups
    var groupOrder = ['WINNER', 'AUDIO', 'COLORS', 'APPEARANCE', 'TIMING', 'SYSTEM'];

    groupOrder.forEach(function (groupKey) {
      var groupItems = Settings.SCHEMA.filter(function (s) { return s.group === groupKey; });
      if (groupItems.length === 0) return;

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
            if (s.resetsRound) reset(); else requestDraw();
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

  // --- App Initialization ---
  function init() {
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Attach touch listeners to canvas
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchCancel, { passive: false });

    // Prevent iOS Safari multi-finger gesture interference (pinch zoom, rotate)
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturechange', function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('gestureend', function (e) { e.preventDefault(); }, { passive: false });

    // Desktop mouse fallback
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Tune Button & Panel
    var tuneBtn = document.getElementById('tune-btn');
    var panel = document.getElementById('tuning-panel');
    var doneBtn = document.getElementById('tune-done');
    var resetBtn = document.getElementById('tune-reset');
    var copyBtn = document.getElementById('tune-copy');
    var copyJsonBtn = document.getElementById('tune-copy-json');
    var importBtn = document.getElementById('tune-import');

    var importModal = document.getElementById('import-modal');
    var importJsonText = document.getElementById('import-json-text');
    var importSubmit = document.getElementById('import-submit');
    var importCancel = document.getElementById('import-cancel');

    if (tuneBtn && panel) {
      tuneBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        SoundManager.playClick();
        buildTuningPanel();
        panel.classList.add('visible');
      });
    }

    if (doneBtn && panel) {
      doneBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        SoundManager.playClick();
        panel.classList.remove('visible');
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        SoundManager.playClick();
        Settings.resetAll();
        buildTuningPanel();
        reset();
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        SoundManager.playClick();
        var dumpText = Settings.dump();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(dumpText).then(function () {
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
          });
        }
      });
    }

    if (copyJsonBtn) {
      copyJsonBtn.addEventListener('click', function () {
        SoundManager.playClick();
        var jsonText = Settings.dumpJson();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(jsonText).then(function () {
            copyJsonBtn.textContent = 'Copied!';
            setTimeout(function () { copyJsonBtn.textContent = 'JSON'; }, 1500);
          });
        }
      });
    }

    if (importBtn && importModal) {
      importBtn.addEventListener('click', function () {
        SoundManager.playClick();
        importJsonText.value = '';
        importModal.classList.add('visible');
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
        var ok = Settings.importJson(importJsonText.value);
        if (ok) {
          importModal.classList.remove('visible');
          buildTuningPanel();
          reset();
        } else {
          alert('Invalid JSON configuration');
        }
      });
    }

    // Render initial vector SVG tabletop background
    updateTabletopBackground();

    Settings.addChangeListener(function (s) {
      if (!s || s.key === 'wood_type' || s.key === 'woodgrain_enabled' || s.key === 'winner_bg_enabled') {
        updateTabletopBackground();
      }
    });

    // Setup proactive Service Worker update checking
    setupServiceWorker();

    // Start initial frame render
    requestDraw();
  }

  // --- Proactive PWA Update Management ---
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

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        swRegistration = reg;
        console.log('Sortire Service Worker registered:', reg.scope);

        // 1. If an updated worker is already waiting, prompt immediately
        if (reg.waiting) {
          showUpdateToast(reg.waiting);
        }

        // 2. Watch for an incoming updated worker
        reg.addEventListener('updatefound', function () {
          var newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', function () {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast(newWorker);
            }
          });
        });

        // 3. Proactively check on startup
        reg.update().catch(function () {});

        // 4. Periodic check every 15 minutes while app is running
        setInterval(function () {
          reg.update().catch(function () {});
        }, 15 * 60 * 1000);
      }).catch(function (err) {
        console.error('Sortire Service Worker registration failed:', err);
      });
    });

    // 5. Proactively check whenever user switches back to the app / tab
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && swRegistration) {
        swRegistration.update().catch(function () {});
      }
    });

    // 6. Automatically reload when the new worker takes control
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
