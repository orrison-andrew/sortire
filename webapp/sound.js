/**
 * sound.js: Procedural audio synthesis for Sortire PWA using Web Audio API.
 * Mirrors SoundManager.kt in the Android app - zero external WAV/MP3 files needed.
 */
(function (root) {
  'use strict';

  var audioCtx = null;
  var lastPlayTime = 0;
  var MIN_INTERVAL_MS = 50;
  var master = null;
  var volume = 1;
  var enabled = true;

  // Every sound goes through one master gain, so volume and mute apply to all of them
  function dest(ctx) {
    if (!master || master.context !== ctx) {
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    master.gain.value = volume;
    return master;
  }

  function getAudioContext() {
    if (!audioCtx) {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Ensure AudioContext is unlocked on user interaction
  function unlockAudio() {
    var ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  // 0: Pop (Cartoon high-pitch drop)
  function synthPop(ctx, t) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);

    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(dest(ctx));
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // 1: Bubble (Water droplet rising pitch)
  function synthBubble(ctx, t) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(850, t + 0.07);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.connect(gain);
    gain.connect(dest(ctx));
    osc.start(t);
    osc.stop(t + 0.07);
  }

  // 2: Blip (Retro 8-bit blip)
  function synthBlip(ctx, t) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1760, t + 0.02);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(dest(ctx));
    osc.start(t);
    osc.stop(t + 0.04);
  }

  // 3: Laser (Arcade laser zap)
  function synthLaser(ctx, t) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2200, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.09);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(dest(ctx));
    osc.start(t);
    osc.stop(t + 0.09);
  }

  // 4: Snap (Finger snap - filtered noise burst + transient)
  function synthSnap(ctx, t) {
    var bufferSize = Math.floor(ctx.sampleRate * 0.04);
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));
    }
    var noise = ctx.createBufferSource();
    noise.buffer = buffer;

    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 2.0;

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest(ctx));
    noise.start(t);
  }

  // 5: Beep (Clean C6 tone)
  function synthBeep(ctx, t) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, t);

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(dest(ctx));
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // 6: Thud (Sub-bass drop)
  function synthThud(ctx, t) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.09);

    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(dest(ctx));
    osc.start(t);
    osc.stop(t + 0.09);
  }

  // 7: Ping (High crystalline C7 bell)
  function synthPing(ctx, t) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2093, t);

    gain.gain.setValueAtTime(0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(dest(ctx));
    osc.start(t);
    osc.stop(t + 0.12);
  }

  // 8: Boing (Wobbly bounce)
  function synthBoing(ctx, t) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var mod = ctx.createOscillator();
    var modGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, t);

    mod.frequency.setValueAtTime(30, t);
    modGain.gain.setValueAtTime(200, t);
    mod.connect(modGain);
    modGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(dest(ctx));

    mod.start(t);
    osc.start(t);
    mod.stop(t + 0.08);
    osc.stop(t + 0.08);
  }

  // 9: Click (Sharp wooden click)
  function synthClick(ctx, t) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.025);

    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    osc.connect(gain);
    gain.connect(dest(ctx));
    osc.start(t);
    osc.stop(t + 0.025);
  }

  var STYLES = [
    synthPop,     // 0
    synthBubble,  // 1
    synthBlip,    // 2
    synthLaser,   // 3
    synthSnap,    // 4
    synthBeep,    // 5
    synthThud,    // 6
    synthPing,    // 7
    synthBoing,   // 8
    synthClick    // 9
  ];

  function playPop(styleIndex) {
    if (!enabled) return;
    var ctx = getAudioContext();
    if (!ctx) return;
    var now = performance.now();
    if (now - lastPlayTime < MIN_INTERVAL_MS) return;
    lastPlayTime = now;

    var style = (styleIndex !== undefined ? styleIndex : 0) | 0;
    if (style < 0 || style >= STYLES.length) style = 0;
    var fn = STYLES[style];
    fn(ctx, ctx.currentTime);
  }

  function playClick() {
    if (!enabled) return;
    var ctx = getAudioContext();
    if (!ctx) return;
    var now = performance.now();
    if (now - lastPlayTime < MIN_INTERVAL_MS) return;
    lastPlayTime = now;
    synthClick(ctx, ctx.currentTime);
  }

  function playTick() {
    if (!enabled) return;
    var ctx = getAudioContext();
    if (!ctx) return;
    synthPing(ctx, ctx.currentTime);
  }

  // ── Custom winning sound (a recording, decoded once) ──────────────────────
  var customBuf = null;
  var customGain = 1;

  function dataUrlToBuffer(url) {
    var bin = atob(url.slice(url.indexOf(',') + 1));
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }

  // Works with both the promise and the older callback form of decodeAudioData
  function decode(ctx, ab) {
    return new Promise(function (resolve, reject) {
      var p = ctx.decodeAudioData(ab, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  }

  // Resolves true when the recording was decoded and is now the winning sound.
  // A recording that fails to decode leaves the current sound untouched.
  function setCustomWinner(url) {
    return new Promise(function (resolve) {
      try {
        var ctx = getAudioContext();
        if (!ctx) return resolve(false);
        decode(ctx, dataUrlToBuffer(url)).then(function (buf) {
          var peak = 0;
          for (var c = 0; c < buf.numberOfChannels; c++) {
            var d = buf.getChannelData(c);
            for (var i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > peak) peak = a; }
          }
          customBuf = buf;
          customGain = peak > 0.001 ? Math.min(4, 0.9 / peak) : 1;   // quiet recordings are brought up
          resolve(true);
        }, function () { resolve(false); });
      } catch (e) { resolve(false); }
    });
  }

  function clearCustomWinner() { customBuf = null; }

  // force = play even when sound effects are switched off (used by the Play preview button)
  function playWinner(force) {
    if (!enabled && force !== true) return;
    var ctx = getAudioContext();
    if (!ctx) return;
    if (customBuf) {
      var src = ctx.createBufferSource();
      var g = ctx.createGain();
      src.buffer = customBuf;
      g.gain.value = customGain;
      src.connect(g);
      g.connect(dest(ctx));
      src.start();
      return;
    }
    var t = ctx.currentTime;
    // Cheerful arpeggio chord
    var notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach(function (freq, i) {
      var noteTime = t + i * 0.07;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.5, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

      osc.connect(gain);
      gain.connect(dest(ctx));
      osc.start(noteTime);
      osc.stop(noteTime + 0.35);
    });
  }

  root.SoundManager = {
    unlock: unlockAudio,
    setEnabled: function (b) { enabled = !!b; },
    setVolume: function (v) { volume = Math.max(0, Math.min(1, +v || 0)); },
    playPop: playPop,
    playClick: playClick,
    playTick: playTick,
    playWinner: playWinner,
    setCustomWinner: setCustomWinner,
    clearCustomWinner: clearCustomWinner,
    STYLE_NAMES: ['Pop', 'Bubble', 'Blip', 'Laser', 'Snap', 'Beep', 'Thud', 'Ping', 'Boing', 'Click']
  };
})(typeof window !== 'undefined' ? window : this);
