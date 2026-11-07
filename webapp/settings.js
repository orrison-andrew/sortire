/**
 * settings.js: Settings schema, per-surface storage, settings codes, saved tunings.
 *
 * Three surfaces (COLOR / WOOD / STONE). Each keeps its OWN copy of the per-surface settings
 * (material, lighting, winner effects, colors, finger look); sound, timing, instruction text
 * and "keep screen on" are shared. The two flags woodgrain_enabled / rockgrain_enabled are the
 * stored surface choice (both 0 = COLOR); only SurfaceMode interprets them.
 *
 *   get / bool / set(key, value)          live values of the ACTIVE surface
 *   SURFACES, getMode(), setMode(mode)    switching swaps in that surface's own settings
 *   resetAll()                            every setting back to its default (keeps the surface)
 *   randomize()                           random per-surface settings for the active surface
 *   currentCode() / decode(str) / applyCode(str)
 *   listSaved(mode) / saveCode(name, code) / renameSaved(id, name) / deleteSaved(id)
 *   SCHEMA, GROUPS, format(schema, value), addChangeListener(cb)   (cb(key, value); key 'all' = bulk change)
 *
 * Schema flags: shared (not per-surface), modes (surfaces it applies to), game ('FIRST'|'ORDER'),
 * defs (per-surface default overrides), rand ([lo, hi] range used by randomize), hidden, flag.
 */
(function (root) {
  'use strict';

  var FORMAT_VERSION = 12;
  var KEY_JSON = 'sortire_settings_json';
  var KEY_VER = 'sortire_settings_v';
  var KEY_SAVED = 'sortire_saved_tunings';
  var MAX_SAVED = 100;

  var SURFACES = ['COLOR', 'WOOD', 'STONE'];
  var ALL = SURFACES;
  var TEXTURED = ['WOOD', 'STONE'];
  var COLOR_ONLY = ['COLOR'];

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  function labelsOf(lib, n) {
    if (lib && lib.LABELS && lib.LABELS.length) return lib.LABELS.slice();
    var a = []; for (var i = 0; i < n; i++) a.push('Type ' + (i + 1)); return a;
  }
  var WOOD_LABELS = labelsOf(root.WoodGrain, 12);
  var ROCK_LABELS = labelsOf(root.RockTexture, 12);
  var SOUND_LABELS = (root.SoundManager && root.SoundManager.STYLE_NAMES) ? root.SoundManager.STYLE_NAMES.slice() : ['Pop'];

  var SETTINGS_SCHEMA = [
    // Surface flags (stored state, not shown in the panel)
    { key: 'woodgrain_enabled', group: 'WOOD', label: 'Use wood surface', def: 0, isBool: true, hidden: true, flag: 'WOOD', resetsRound: true },
    { key: 'rockgrain_enabled', group: 'WOOD', label: 'Use stone surface', def: 0, isBool: true, hidden: true, flag: 'STONE', resetsRound: true },

    // Surfaces & materials
    { key: 'wood_type', group: 'WOOD', label: 'Wood material', help: 'The wood the table is made of before anyone wins.', def: 4, options: WOOD_LABELS, modes: ['WOOD'], resetsRound: true },
    { key: 'rock_type', group: 'WOOD', label: 'Stone material', help: 'The stone the table is made of before anyone wins.', def: 0, options: ROCK_LABELS, modes: ['STONE'], defs: { COLOR: 9 }, resetsRound: true },
    { key: 'wood_tilt', group: 'WOOD', label: 'Tilt shifts lighting', help: 'The shine follows how you tilt your phone.', def: 1, isBool: true, modes: TEXTURED },
    { key: 'wood_sheen_anim', group: 'WOOD', label: 'Animate sheen', help: 'The highlight drifts slowly by itself.', def: 1, isBool: true, modes: TEXTURED },
    { key: 'wood_sheen', group: 'WOOD', label: 'Sheen intensity', help: 'How strong the varnish highlight is.', def: 0.15, min: 0, max: 0.5, step: 0.01, modes: TEXTURED, rand: [0, 0.35] },
    { key: 'wood_vignette', group: 'WOOD', label: 'Edge shadows', help: 'How dark the corners of the table get.', def: 0.7, min: 0, max: 1, step: 0.05, modes: TEXTURED, rand: [0.2, 1] },
    { key: 'disc_shadow', group: 'WOOD', label: 'Disc shadow', help: 'How dark the shadow under each disc is.', def: 0.5, min: 0, max: 1, step: 0.05, modes: TEXTURED, rand: [0.2, 1] },

    // Winner actions (Pick one only)
    { key: 'winner_bg_enabled', group: 'WINNER', label: 'Winner claims background', help: 'The winner\u2019s look stays as the table for the next round.', def: 1, isBool: true, game: 'FIRST', resetsRound: true },
    { key: 'winner_flood', group: 'WINNER', label: 'Winner floods out', help: 'The winner\u2019s color or grain spreads over the whole screen.', def: 1, isBool: true, game: 'FIRST' },
    { key: 'wood_flood_ripple', group: 'WINNER', label: 'Flood ripple intensity', help: 'Wobble and glow along the edge of the spreading flood.', def: 0.2, min: 0, max: 1, step: 0.05, modes: TEXTURED, game: 'FIRST' },
    { key: 'flood_grain', group: 'WINNER', label: 'Flood shows underlying grain', help: 'How much the flood\u2019s edge bends along the winner\u2019s grain.', def: 0.5, min: 0, max: 1, step: 0.05, modes: TEXTURED, game: 'FIRST' },
    { key: 'flood_feather', group: 'WINNER', label: 'Flood edge softness', help: 'How blurry the edge of the spreading flood is.', def: 15, min: 0, max: 300, step: 5, unit: 'px', game: 'FIRST', rand: [0, 120] },
    { key: 'flood_ms', group: 'WINNER', label: 'Flood duration', help: 'How long the flood takes to cover the screen.', def: 500, min: 100, max: 2000, step: 50, unit: 'ms', game: 'FIRST', rand: [200, 1200] },
    { key: 'winner_grow', group: 'WINNER', label: 'Winner grows', help: 'The winning disc swells when it is picked.', def: 0, defs: { COLOR: 1 }, isBool: true, game: 'FIRST' },
    { key: 'winner_grow_ms', group: 'WINNER', label: 'Winner grow time', help: 'How long the winning disc takes to swell.', def: 400, defs: { COLOR: 600 }, min: 50, max: 1500, step: 50, unit: 'ms', game: 'FIRST', rand: [100, 800] },
    { key: 'winner_fade_ms', group: 'WINNER', label: 'Losers fade time', help: 'How long the other discs take to fade away.', def: 300, min: 0, max: 1000, step: 50, unit: 'ms', game: 'FIRST', rand: [0, 600] },
    { key: 'fx_shockwave', group: 'WINNER', label: 'Shockwave effect', help: 'A ring pulses out from the winner.', def: 0, isBool: true, game: 'FIRST' },
    { key: 'fx_particles', group: 'WINNER', label: 'Particle count', help: 'Sparks that burst out from the winner.', def: 0, min: 0, max: 150, step: 5, game: 'FIRST', rand: [0, 100] },

    // Audio & haptics (shared)
    { key: 'sound_enabled', group: 'AUDIO', label: 'Sound effects', help: 'Pops, clicks and the winner chime.', def: 1, isBool: true, shared: true },
    { key: 'sound_volume', group: 'AUDIO', label: 'Volume', help: 'How loud all sounds are.', def: 1, min: 0, max: 1, step: 0.05, shared: true },
    { key: 'sound_style', group: 'AUDIO', label: 'Pop sound', help: 'The sound when a finger goes down or lifts.', def: 0, options: SOUND_LABELS, shared: true },
    { key: 'haptic_tap', group: 'AUDIO', label: 'Haptic on tap', help: 'A short buzz when a finger lands.', def: 1, isBool: true, shared: true },
    { key: 'haptic_tick', group: 'AUDIO', label: 'Haptic on reveal', help: 'A buzz for each number revealed.', def: 1, isBool: true, shared: true, game: 'ORDER' },
    { key: 'haptic_result', group: 'AUDIO', label: 'Haptic on final result', help: 'A longer buzz when the result is in.', def: 1, isBool: true, shared: true },

    // Colors & background (Color surface)
    { key: 'color_variety', group: 'COLORS', label: 'Color variety', help: 'Low: every finger is vivid. High: pale, deep and muted tones mixed in.', def: 1, min: 0, max: 1, step: 0.05, modes: COLOR_ONLY },
    { key: 'saturation', group: 'COLORS', label: 'Color saturation', help: 'How rich the finger colors are.', def: 0.85, min: 0.1, max: 1, step: 0.05, modes: COLOR_ONLY, rand: [0.3, 1] },
    { key: 'value_even', group: 'COLORS', label: 'Color brightness', help: 'How light the finger colors are.', def: 0.95, min: 0.1, max: 1, step: 0.05, modes: COLOR_ONLY, rand: [0.5, 1] },
    { key: 'random_hue', group: 'COLORS', label: 'Random background color', help: 'A new background hue every round.', def: 1, isBool: true, modes: COLOR_ONLY },
    { key: 'base_hue', group: 'COLORS', label: 'Fixed background hue', help: 'Used when the background is not random.', def: 210, min: 0, max: 360, step: 1, unit: '\u00B0', modes: COLOR_ONLY },
    { key: 'bg_saturation', group: 'COLORS', label: 'Background saturation', help: 'How colorful the background is.', def: 0.15, defs: { COLOR: 0.5 }, min: 0, max: 1, step: 0.05, modes: COLOR_ONLY },
    { key: 'bg_value', group: 'COLORS', label: 'Background brightness', help: 'How light the background is.', def: 0.12, defs: { COLOR: 0.42 }, min: 0, max: 1, step: 0.02, modes: COLOR_ONLY, rand: [0.05, 0.5] },

    // Appearance & rings
    { key: 'radius', group: 'APPEARANCE', label: 'Base finger size', help: 'The size of each finger disc.', def: 60, min: 30, max: 120, step: 2, unit: 'px', rand: [40, 90] },
    { key: 'pulse_amount', group: 'APPEARANCE', label: 'Pulse size', help: 'How much the discs breathe in and out.', def: 0, defs: { COLOR: 0.03 }, min: 0, max: 0.3, step: 0.01, rand: [0, 0.15] },
    { key: 'pulse_speed', group: 'APPEARANCE', label: 'Pulse speed', help: 'How fast the discs breathe.', def: 1, defs: { COLOR: 4.5 }, min: 1, max: 20, step: 0.5, rand: [1, 12] },
    { key: 'ring_enabled', group: 'APPEARANCE', label: 'Countdown ring', help: 'A ring fills around each finger during the countdown.', def: 1, isBool: true },
    { key: 'ring_offset', group: 'APPEARANCE', label: 'Ring distance', help: 'The gap between the disc and its ring.', def: 12, min: 2, max: 40, step: 1, unit: 'px', rand: [4, 24] },
    { key: 'ring_stroke', group: 'APPEARANCE', label: 'Ring thickness', help: 'How thick the countdown ring is.', def: 6, defs: { COLOR: 12 }, min: 1, max: 20, step: 1, unit: 'px', rand: [2, 12] },
    { key: 'ring_opacity', group: 'APPEARANCE', label: 'Ring opacity', help: 'How see-through the countdown ring is.', def: 0.8, defs: { COLOR: 0.7 }, min: 0.1, max: 1, step: 0.05, rand: [0.4, 1] },
    { key: 'marker_enabled', group: 'APPEARANCE', label: 'Winner center marker', help: 'A ring and dot on the winning disc.', def: 0, defs: { COLOR: 1 }, isBool: true, modes: COLOR_ONLY, game: 'FIRST' },
    { key: 'marker_radius', group: 'APPEARANCE', label: 'Marker ring size', help: 'The size of the marker ring.', def: 0.65, defs: { COLOR: 1 }, min: 0.2, max: 1.2, step: 0.05, modes: COLOR_ONLY, game: 'FIRST', rand: [0.4, 1.1] },
    { key: 'marker_stroke', group: 'APPEARANCE', label: 'Marker thickness', help: 'How thick the marker ring is.', def: 6, min: 0, max: 20, step: 1, unit: 'px', modes: COLOR_ONLY, game: 'FIRST', rand: [2, 12] },
    { key: 'marker_dot', group: 'APPEARANCE', label: 'Marker dot size', help: 'The size of the dot in the middle.', def: 0.2, min: 0, max: 0.5, step: 0.05, modes: COLOR_ONLY, game: 'FIRST' },
    { key: 'hint_enabled', group: 'APPEARANCE', label: 'Show instructions', help: 'The text shown before anyone touches the screen.', def: 1, isBool: true, shared: true },
    { key: 'hint_size', group: 'APPEARANCE', label: 'Instruction text size', help: 'How big the instructions are.', def: 18, min: 10, max: 40, step: 1, unit: 'px', shared: true },
    { key: 'hint_opacity', group: 'APPEARANCE', label: 'Instruction opacity', help: 'How faint the instructions are.', def: 0.4, min: 0.1, max: 1, step: 0.05, shared: true },

    // Timing & order mode (shared)
    { key: 'min_fingers', group: 'TIMING', label: 'Minimum fingers to start', help: 'The countdown starts once this many fingers are down.', def: 2, min: 2, max: 10, step: 1, shared: true },
    { key: 'countdown_ms', group: 'TIMING', label: 'Countdown time', help: 'How long everyone must hold still.', def: 2000, min: 500, max: 5000, step: 100, unit: 'ms', shared: true },
    { key: 'reveal_gap_ms', group: 'TIMING', label: 'Order reveal gap', help: 'The pause between one number and the next.', def: 600, min: 100, max: 2000, step: 50, unit: 'ms', shared: true, game: 'ORDER' },
    { key: 'order_pop_ms', group: 'TIMING', label: 'Order reveal pop time', help: 'How long each number\u2019s pop lasts.', def: 400, min: 50, max: 1000, step: 50, unit: 'ms', shared: true, game: 'ORDER' },
    { key: 'order_pop_amount', group: 'TIMING', label: 'Order pop extra size', help: 'How much a number swells when revealed.', def: 0.2, min: 0, max: 1, step: 0.05, shared: true, game: 'ORDER' },
    { key: 'order_revealed_scale', group: 'TIMING', label: 'Revealed item scale', help: 'The size of a disc once its number is shown.', def: 1.1, min: 0.5, max: 2, step: 0.05, shared: true, game: 'ORDER' },
    { key: 'order_text_scale', group: 'TIMING', label: 'Order text scale', help: 'The size of the number on the disc.', def: 0.9, min: 0.3, max: 1.5, step: 0.05, shared: true, game: 'ORDER' },
    { key: 'order_pending_scale', group: 'TIMING', label: 'Unrevealed item scale', help: 'The size of discs still waiting their turn.', def: 0.7, min: 0.2, max: 1, step: 0.05, shared: true, game: 'ORDER' },
    { key: 'order_pending_alpha', group: 'TIMING', label: 'Unrevealed opacity', help: 'How faint discs still waiting their turn are.', def: 0.3, min: 0, max: 1, step: 0.05, shared: true, game: 'ORDER' },

    // System (shared)
    { key: 'keep_awake', group: 'SYSTEM', label: 'Keep screen on', help: 'Stops the screen from dimming while the app is open.', def: 1, isBool: true, shared: true }
  ];

  var GROUPS = {
    WOOD: { title: 'Surfaces & Materials' },
    WINNER: { title: 'Winner Actions' },
    AUDIO: { title: 'Audio & Haptics' },
    COLORS: { title: 'Colors & Background' },
    APPEARANCE: { title: 'Appearance & Rings' },
    TIMING: { title: 'Timing & Order Mode' },
    SYSTEM: { title: 'System' }
  };

  var byKey = {};
  SETTINGS_SCHEMA.forEach(function (sc) {
    byKey[sc.key] = sc;
    if (sc.options) { sc.min = 0; sc.max = sc.options.length - 1; sc.step = 1; }
    if (sc.isBool) { sc.min = 0; sc.max = 1; sc.step = 1; }
  });

  function isSurfaceKey(sc) { return !sc.shared && !sc.flag; }
  function appliesTo(sc, surface) { return !sc.modes || sc.modes.indexOf(surface) >= 0; }

  function defaultFor(sc, surface) {
    if (sc.flag) return sc.flag === surface ? 1 : 0;
    if (!sc.shared && surface && sc.defs && sc.defs[surface] !== undefined) return sc.defs[surface];
    return sc.def;
  }

  function decimals(step) { var s = String(step), i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }
  function round(v, step) { return parseFloat(v.toFixed(decimals(step))); }

  // Coerce any stored / imported value into the setting's valid range
  function clean(sc, v, surface) {
    v = Number(v);
    if (!isFinite(v)) return defaultFor(sc, surface);
    if (sc.isBool) return v !== 0 ? 1 : 0;
    v = Math.max(sc.min, Math.min(sc.max, v));
    return round(sc.min + Math.round((v - sc.min) / sc.step) * sc.step, sc.step);
  }

  // ── Live state ────────────────────────────────────────────────────────────
  var state = {};          // live values: flags, shared settings, and the ACTIVE surface's settings
  var surfaceStore = {};   // surface -> its saved per-surface values
  var listeners = [];

  function getMode() {
    if (state.woodgrain_enabled) return 'WOOD';
    if (state.rockgrain_enabled) return 'STONE';
    return 'COLOR';
  }

  function writeFlags(surface) {
    state.woodgrain_enabled = surface === 'WOOD' ? 1 : 0;
    state.rockgrain_enabled = surface === 'STONE' ? 1 : 0;
  }

  function snapshot(surface) {
    var blob = {};
    SETTINGS_SCHEMA.forEach(function (sc) { if (isSurfaceKey(sc)) blob[sc.key] = state[sc.key]; });
    surfaceStore[surface] = blob;
  }

  function loadSurfaceValues(surface) {
    var blob = surfaceStore[surface];
    SETTINGS_SCHEMA.forEach(function (sc) {
      if (!isSurfaceKey(sc)) return;
      state[sc.key] = (blob && blob[sc.key] !== undefined) ? clean(sc, blob[sc.key], surface) : defaultFor(sc, surface);
    });
  }

  function fillDefaults(surface) {
    SETTINGS_SCHEMA.forEach(function (sc) { state[sc.key] = defaultFor(sc, surface); });
  }

  function save() {
    snapshot(getMode());
    store.set(KEY_JSON, JSON.stringify({ v: FORMAT_VERSION, state: state, surfaces: surfaceStore }));
    store.set(KEY_VER, String(FORMAT_VERSION));
  }

  function notify(key, value) {
    listeners.forEach(function (cb) { cb(key, value); });
  }

  // Reads the current format and the older flat one (a plain key -> value object)
  function load() {
    fillDefaults('WOOD');
    surfaceStore = {};
    var data = null;
    try { data = JSON.parse(store.get(KEY_JSON)); } catch (e) {}
    if (!data || typeof data !== 'object') return;

    var flat = (data.state && typeof data.state === 'object') ? data.state : data;
    SETTINGS_SCHEMA.forEach(function (sc) {
      if (flat[sc.key] !== undefined) state[sc.key] = clean(sc, flat[sc.key], null);
    });
    writeFlags(getMode());   // never both flags on (the old default had both)

    if (data.surfaces && typeof data.surfaces === 'object') {
      SURFACES.forEach(function (s) {
        if (data.surfaces[s] && typeof data.surfaces[s] === 'object') surfaceStore[s] = data.surfaces[s];
      });
    }
  }

  function get(key) {
    if (state[key] !== undefined) return state[key];
    var sc = byKey[key];
    return sc ? sc.def : 0;
  }

  function bool(key) { return get(key) !== 0; }

  function set(key, value) {
    var sc = byKey[key];
    state[key] = sc ? clean(sc, value, getMode()) : value;
    save();
    notify(key, state[key]);
  }

  function setMode(mode) {
    if (SURFACES.indexOf(mode) < 0 || mode === getMode()) return;
    snapshot(getMode());
    writeFlags(mode);
    loadSurfaceValues(mode);
    save();
    notify('all', null);
  }

  // Everything back to defaults on every surface; the current surface stays selected
  function resetAll() {
    var mode = getMode();
    surfaceStore = {};
    fillDefaults(mode);
    save();
    notify('all', null);
  }

  function randomValue(sc) {
    if (sc.isBool) return Math.random() < 0.5 ? 0 : 1;
    var lo = sc.rand ? sc.rand[0] : sc.min, hi = sc.rand ? sc.rand[1] : sc.max;
    var n = Math.max(0, Math.round((hi - lo) / sc.step));
    return clean(sc, lo + Math.floor(Math.random() * (n + 1)) * sc.step, getMode());
  }

  // A fully random tuning for the active surface (shared settings are left alone)
  function randomize() {
    var mode = getMode();
    SETTINGS_SCHEMA.forEach(function (sc) {
      if (isSurfaceKey(sc) && appliesTo(sc, mode)) state[sc.key] = randomValue(sc);
    });
    save();
    notify('all', null);
  }

  function format(sc, val) {
    if (sc.options) return sc.options[Math.round(val)];
    if (sc.isBool) return val ? 'On' : 'Off';
    var out = val.toFixed(decimals(sc.step));
    return sc.unit ? out + sc.unit : out;
  }

  // ── Settings codes ────────────────────────────────────────────────────────
  // APPEND-ONLY once released: never reorder, edit or delete an entry. [key, min, max, step]
  // hue_step and value_odd are retired: they stay in the layout (written as their minimum) so old codes still decode.
  var CODE_FIELDS = [
    ['woodgrain_enabled', 0, 1, 1],
    ['rockgrain_enabled', 0, 1, 1],
    ['wood_type', 0, 11, 1],
    ['rock_type', 0, 11, 1],
    ['wood_tilt', 0, 1, 1],
    ['wood_sheen_anim', 0, 1, 1],
    ['wood_sheen', 0, 0.5, 0.01],
    ['wood_vignette', 0, 1.0, 0.05],
    ['winner_bg_enabled', 0, 1, 1],
    ['winner_flood', 0, 1, 1],
    ['wood_flood_ripple', 0, 1, 0.05],
    ['flood_grain', 0, 1, 0.05],
    ['flood_feather', 0, 300, 5],
    ['flood_ms', 100, 2000, 50],
    ['winner_grow', 0, 1, 1],
    ['winner_grow_ms', 50, 1500, 50],
    ['winner_fade_ms', 0, 1000, 50],
    ['fx_shockwave', 0, 1, 1],
    ['fx_particles', 0, 150, 5],
    ['sound_enabled', 0, 1, 1],
    ['sound_style', 0, 3, 1],
    ['haptic_tap', 0, 1, 1],
    ['haptic_tick', 0, 1, 1],
    ['haptic_result', 0, 1, 1],
    ['hue_step', 10, 180, 0.5],
    ['saturation', 0.1, 1.0, 0.05],
    ['value_even', 0.1, 1.0, 0.05],
    ['value_odd', 0.1, 1.0, 0.05],
    ['random_hue', 0, 1, 1],
    ['base_hue', 0, 360, 1],
    ['bg_saturation', 0, 1, 0.05],
    ['bg_value', 0, 1, 0.02],
    ['radius', 30, 120, 2],
    ['pulse_amount', 0, 0.3, 0.01],
    ['pulse_speed', 1, 20, 0.5],
    ['ring_enabled', 0, 1, 1],
    ['ring_offset', 2, 40, 1],
    ['ring_stroke', 1, 20, 1],
    ['ring_opacity', 0.1, 1.0, 0.05],
    ['marker_enabled', 0, 1, 1],
    ['marker_radius', 0.2, 1.2, 0.05],
    ['marker_stroke', 0, 20, 1],
    ['marker_dot', 0, 0.5, 0.05],
    ['hint_enabled', 0, 1, 1],
    ['hint_size', 10, 40, 1],
    ['hint_opacity', 0.1, 1.0, 0.05],
    ['min_fingers', 2, 10, 1],
    ['countdown_ms', 500, 5000, 100],
    ['reveal_gap_ms', 100, 2000, 50],
    ['order_pop_ms', 50, 1000, 50],
    ['order_pop_amount', 0, 1.0, 0.05],
    ['order_revealed_scale', 0.5, 2.0, 0.05],
    ['order_text_scale', 0.3, 1.5, 0.05],
    ['order_pending_scale', 0.2, 1.0, 0.05],
    ['order_pending_alpha', 0, 1.0, 0.05],
    ['disc_shadow', 0, 1.0, 0.05],
    ['color_variety', 0, 1.0, 0.05]
  ];

  var CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  function fieldSteps(f) { return Math.round((f[2] - f[1]) / f[3]); }
  function fieldBits(f) {
    var n = fieldSteps(f) + 1, bits = 1;
    while ((1 << bits) < n) bits++;
    return bits;
  }
  var TOTAL_BITS = CODE_FIELDS.reduce(function (a, f) { return a + fieldBits(f); }, 0);
  var EXPECTED_CHARS = Math.ceil(TOTAL_BITS / 5);

  function encode() {
    var bits = [];
    CODE_FIELDS.forEach(function (f) {
      var sc = byKey[f[0]];
      // Retired fields -> minimum; shared settings -> their defaults; the rest -> live values
      var val = !sc ? f[1] : (sc.shared ? sc.def : get(f[0]));
      val = Math.max(f[1], Math.min(f[2], val));
      var v = Math.round((val - f[1]) / f[3]);
      for (var b = 0, n = fieldBits(f); b < n; b++) bits.push((v >> b) & 1);
    });
    var str = '';
    for (var i = 0; i < bits.length; i += 5) {
      var chunk = 0;
      for (var j = 0; j < 5; j++) if (bits[i + j]) chunk |= (1 << j);
      str += CODE_CHARS[chunk];
    }
    return str;
  }

  function fail(msg) { return { ok: false, error: msg }; }

  // -> { ok, surface, data } or { ok: false, error }. Fields missing from an older, shorter code get defaults.
  function decode(input) {
    var str = String(input == null ? '' : input).replace(/\s+/g, '').toUpperCase();
    if (!str) return fail('Paste a settings code first.');
    if (/[^A-Z2-7]/.test(str)) return fail('That doesn\u2019t look like a settings code. Codes only use the letters A-Z and the digits 2-7.');
    if (str.length < 10) return fail('That code is too short. It was probably cut off: copy the whole code and try again.');
    if (str.length > EXPECTED_CHARS) return fail('That code looks damaged. Copy the whole code and try again.');

    var bits = [];
    for (var i = 0; i < str.length; i++) {
      var c = CODE_CHARS.indexOf(str[i]);
      for (var j = 0; j < 5; j++) bits.push((c >> j) & 1);
    }

    var raw = [], pos = 0;
    for (var k = 0; k < CODE_FIELDS.length; k++) {
      var f = CODE_FIELDS[k], n = fieldBits(f);
      if (pos + n > bits.length) break;   // an older code that ends before this field
      var v = 0;
      for (var b = 0; b < n; b++) v |= bits[pos++] << b;
      if (v > fieldSteps(f)) return fail('That code looks damaged. Copy the whole code and try again.');
      raw.push(v);
    }
    if (raw[0] && raw[1]) return fail('That code looks damaged. Copy the whole code and try again.');
    var surface = raw[0] ? 'WOOD' : (raw[1] ? 'STONE' : 'COLOR');

    var data = {};
    CODE_FIELDS.forEach(function (f, idx) {
      var sc = byKey[f[0]];
      data[f[0]] = idx < raw.length ? round(f[1] + raw[idx] * f[3], f[3]) : (sc ? defaultFor(sc, surface) : f[1]);
    });
    return { ok: true, surface: surface, data: data };
  }

  // Applies the surface and its per-surface settings; shared settings are never touched by a code
  function applyCode(str) {
    var r = decode(str);
    if (!r.ok) return r;
    var current = getMode();
    if (r.surface !== current) {
      snapshot(current);
      writeFlags(r.surface);
    }
    SETTINGS_SCHEMA.forEach(function (sc) {
      if (!isSurfaceKey(sc)) return;
      state[sc.key] = r.data[sc.key] !== undefined ? clean(sc, r.data[sc.key], r.surface) : defaultFor(sc, r.surface);
    });
    save();
    notify('all', null);
    return { ok: true };
  }

  // ── Saved tunings ─────────────────────────────────────────────────────────
  function readSaved() {
    var l = null;
    try { l = JSON.parse(store.get(KEY_SAVED)); } catch (e) {}
    return Array.isArray(l) ? l.filter(function (x) { return x && typeof x.code === 'string'; }) : [];
  }

  function writeSaved(l) { return store.set(KEY_SAVED, JSON.stringify(l)); }

  // Saved tunings of one surface (a code carries its surface)
  function listSaved(mode) {
    return readSaved().filter(function (x) {
      var r = decode(x.code);
      return r.ok && (!mode || r.surface === mode);
    });
  }

  function saveCode(name, code) {
    var r = decode(code);
    if (!r.ok) return r;
    var l = readSaved();
    if (l.length >= MAX_SAVED) return fail('You have saved the maximum number of tunings. Delete one first.');
    name = String(name == null ? '' : name).trim().slice(0, 40) || 'Tuning ' + (l.length + 1);
    l.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, code: code.replace(/\s+/g, '').toUpperCase() });
    return writeSaved(l) ? { ok: true } : fail('Couldn\u2019t save it (storage is full or blocked).');
  }

  function deleteSaved(id) {
    writeSaved(readSaved().filter(function (x) { return x.id !== id; }));
  }

  function renameSaved(id, name) {
    name = String(name == null ? '' : name).trim().slice(0, 40);
    if (!name) return;
    var l = readSaved();
    l.forEach(function (x) { if (x.id === id) x.name = name; });
    writeSaved(l);
  }

  load();

  root.Settings = {
    SCHEMA: SETTINGS_SCHEMA,
    GROUPS: GROUPS,
    SURFACES: SURFACES,
    CODE_FIELDS: CODE_FIELDS,
    get: get,
    bool: bool,
    set: set,
    getMode: getMode,
    setMode: setMode,
    resetAll: resetAll,
    randomize: randomize,
    format: format,
    currentCode: encode,
    decode: decode,
    applyCode: applyCode,
    listSaved: listSaved,
    saveCode: saveCode,
    deleteSaved: deleteSaved,
    renameSaved: renameSaved,
    addChangeListener: function (cb) { listeners.push(cb); }
  };
})(typeof window !== 'undefined' ? window : this);
