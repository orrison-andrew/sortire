/**
 * settings.js: Manages all adjustable parameters, defaults, and the shareable base64 format for Sortire.
 */
(function () {
  'use strict';

  var SETTINGS_VERSION = '10';

  // localStorage can throw (private mode, blocked storage): never let that kill the app
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  // Dropdown labels come from the material modules so they can never drift out of order.
  function labelsFrom(mod) {
    if (mod && mod.LABELS) return mod.LABELS;
    var a = []; for (var i = 0; i < 12; i++) a.push(String(i + 1));
    return a;
  }
  var WOOD_LABELS = labelsFrom(window.WoodGrain);
  var ROCK_LABELS = labelsFrom(window.RockTexture);
  var SOUND_NAMES = (window.SoundManager && window.SoundManager.STYLE_NAMES) || ['Pop', 'Bubble', 'Blip', 'Laser'];

  // Schema defines the UI groups, sliders, and encoding bounds for the shareable format.
  var SETTINGS_SCHEMA = [
    { key: 'woodgrain_enabled', group: 'WOOD', label: 'Use woodgrain surface', def: 1, isBool: true, resetsRound: true },
    { key: 'rockgrain_enabled', group: 'WOOD', label: 'Use stone surface', def: 0, isBool: true, resetsRound: true },
    { key: 'wood_type', group: 'WOOD', label: 'Wood material', def: 4, min: 0, max: 11, step: 1, options: WOOD_LABELS, resetsRound: true },
    { key: 'rock_type', group: 'WOOD', label: 'Stone material', def: 0, min: 0, max: 11, step: 1, options: ROCK_LABELS, resetsRound: true },
    { key: 'wood_tilt', group: 'WOOD', label: 'Tilt shifts lighting', def: 1, isBool: true },
    { key: 'wood_sheen_anim', group: 'WOOD', label: 'Animate sheen', def: 1, isBool: true },
    { key: 'wood_sheen', group: 'WOOD', label: 'Sheen intensity', def: 0.15, min: 0.0, max: 0.5, step: 0.01 },
    { key: 'wood_vignette', group: 'WOOD', label: 'Edge shadows', def: 0.7, min: 0.0, max: 1.0, step: 0.05 },
    
    { key: 'winner_bg_enabled', group: 'WINNER', label: 'Winner claims background', def: 1, isBool: true, resetsRound: true },
    { key: 'winner_flood', group: 'WINNER', label: 'Winner floods out', def: 1, isBool: true },
    { key: 'wood_flood_ripple', group: 'WINNER', label: 'Flood ripple intensity', def: 0.2, min: 0, max: 1, step: 0.05 },
    { key: 'flood_grain', group: 'WINNER', label: 'Flood shows underlying grain', def: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'flood_feather', group: 'WINNER', label: 'Flood edge softness', def: 15, min: 0, max: 300, step: 5, unit: 'px' },
    { key: 'flood_ms', group: 'WINNER', label: 'Flood duration', def: 500, min: 100, max: 2000, step: 50, unit: 'ms' },
    { key: 'winner_grow', group: 'WINNER', label: 'Winner grows', def: 1, isBool: true },
    { key: 'winner_grow_ms', group: 'WINNER', label: 'Winner grow time', def: 400, min: 50, max: 1500, step: 50, unit: 'ms' },
    { key: 'winner_fade_ms', group: 'WINNER', label: 'Losers fade time', def: 300, min: 0, max: 1000, step: 50, unit: 'ms' },

    { key: 'fx_shockwave', group: 'WINNER', label: 'Shockwave effect', def: 0, isBool: true },
    { key: 'fx_particles', group: 'WINNER', label: 'Particle count', def: 40, min: 0, max: 150, step: 5 },

    { key: 'sound_enabled', group: 'AUDIO', label: 'Sound effects', def: 1, isBool: true },
    { key: 'sound_volume', group: 'AUDIO', label: 'Volume', def: 1, min: 0, max: 1, step: 0.05 },
    { key: 'sound_style', group: 'AUDIO', label: 'Pop sound', def: 0, min: 0, max: SOUND_NAMES.length - 1, step: 1, options: SOUND_NAMES },
    { key: 'haptic_tap', group: 'AUDIO', label: 'Haptic on tap', def: 1, isBool: true },
    { key: 'haptic_tick', group: 'AUDIO', label: 'Haptic on reveal', def: 1, isBool: true },
    { key: 'haptic_result', group: 'AUDIO', label: 'Haptic on final result', def: 1, isBool: true },

    { key: 'color_variety', group: 'COLORS', label: 'Color variety', def: 1, min: 0, max: 1, step: 0.05 },
    { key: 'saturation', group: 'COLORS', label: 'Color saturation', def: 0.85, min: 0.1, max: 1.0, step: 0.05 },
    { key: 'value_even', group: 'COLORS', label: 'Color brightness', def: 0.95, min: 0.1, max: 1.0, step: 0.05 },
    { key: 'random_hue', group: 'COLORS', label: 'Random background color', def: 1, isBool: true },
    { key: 'base_hue', group: 'COLORS', label: 'Fixed bg hue (if not random)', def: 210, min: 0, max: 360, step: 1, unit: '°' },
    { key: 'bg_saturation', group: 'COLORS', label: 'Background saturation', def: 0.15, min: 0, max: 1, step: 0.05 },
    { key: 'bg_value', group: 'COLORS', label: 'Background brightness', def: 0.12, min: 0, max: 1, step: 0.02 },

    { key: 'radius', group: 'APPEARANCE', label: 'Base finger size', def: 60, min: 30, max: 120, step: 2, unit: 'px' },
    { key: 'pulse_amount', group: 'APPEARANCE', label: 'Pulse size %', def: 0.05, min: 0, max: 0.3, step: 0.01 },
    { key: 'pulse_speed', group: 'APPEARANCE', label: 'Pulse speed', def: 8, min: 1, max: 20, step: 0.5 },
    { key: 'ring_enabled', group: 'APPEARANCE', label: 'Countdown ring', def: 1, isBool: true },
    { key: 'ring_offset', group: 'APPEARANCE', label: 'Ring distance', def: 12, min: 2, max: 40, step: 1, unit: 'px' },
    { key: 'ring_stroke', group: 'APPEARANCE', label: 'Ring thickness', def: 6, min: 1, max: 20, step: 1, unit: 'px' },
    { key: 'ring_opacity', group: 'APPEARANCE', label: 'Ring opacity', def: 0.8, min: 0.1, max: 1.0, step: 0.05 },
    { key: 'marker_enabled', group: 'APPEARANCE', label: 'Winner center marker', def: 1, isBool: true },
    { key: 'marker_radius', group: 'APPEARANCE', label: 'Marker ring size', def: 0.65, min: 0.2, max: 1.2, step: 0.05 },
    { key: 'marker_stroke', group: 'APPEARANCE', label: 'Marker thickness', def: 6, min: 0, max: 20, step: 1, unit: 'px' },
    { key: 'marker_dot', group: 'APPEARANCE', label: 'Marker dot size', def: 0.2, min: 0, max: 0.5, step: 0.05 },
    { key: 'disc_shadow', group: 'APPEARANCE', label: 'Disc shadow', def: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'hint_enabled', group: 'APPEARANCE', label: 'Show instructions', def: 1, isBool: true },
    { key: 'hint_size', group: 'APPEARANCE', label: 'Instruction text size', def: 18, min: 10, max: 40, step: 1, unit: 'px' },
    { key: 'hint_opacity', group: 'APPEARANCE', label: 'Instruction opacity', def: 0.4, min: 0.1, max: 1.0, step: 0.05 },

    { key: 'min_fingers', group: 'TIMING', label: 'Minimum fingers to start', def: 1, min: 1, max: 10, step: 1 },
    { key: 'countdown_ms', group: 'TIMING', label: 'Countdown time', def: 2000, min: 500, max: 5000, step: 100, unit: 'ms' },
    { key: 'reveal_gap_ms', group: 'TIMING', label: 'Order reveal gap', def: 600, min: 100, max: 2000, step: 50, unit: 'ms' },
    { key: 'order_pop_ms', group: 'TIMING', label: 'Order reveal pop time', def: 400, min: 50, max: 1000, step: 50, unit: 'ms' },
    { key: 'order_pop_amount', group: 'TIMING', label: 'Order pop extra size', def: 0.2, min: 0, max: 1.0, step: 0.05 },
    { key: 'order_revealed_scale', group: 'TIMING', label: 'Revealed item scale', def: 1.1, min: 0.5, max: 2.0, step: 0.05 },
    { key: 'order_text_scale', group: 'TIMING', label: 'Order text scale', def: 0.9, min: 0.3, max: 1.5, step: 0.05 },
    { key: 'order_pending_scale', group: 'TIMING', label: 'Unrevealed item scale', def: 0.7, min: 0.2, max: 1.0, step: 0.05 },
    { key: 'order_pending_alpha', group: 'TIMING', label: 'Unrevealed opacity', def: 0.3, min: 0, max: 1.0, step: 0.05 },

    { key: 'keep_awake', group: 'SYSTEM', label: 'Keep screen on', def: 1, isBool: true }
  ];

  var GROUPS = {
    WOOD: { title: 'Material & Lighting' },
    WINNER: { title: 'Winner Actions' },
    AUDIO: { title: 'Audio & Haptics' },
    COLORS: { title: 'Colors & Background' },
    APPEARANCE: { title: 'Appearance & Rings' },
    TIMING: { title: 'Timing & Order Mode' },
    SYSTEM: { title: 'System' }
  };


  // ── Surfaces & per-surface profiles ───────────────────────────────────────
  // Three surfaces (Color / Wood / Stone). Each keeps its OWN values for the
  // "surface" settings (materials, lighting, winner effects, colours, finger look);
  // audio, timing and instruction-text settings are shared by all surfaces.
  var SURFACES = ['COLOR', 'WOOD', 'STONE'];
  var DEFAULT_SURFACE = 'WOOD';
  var SURFACE_GROUPS = { WOOD: 1, WINNER: 1, COLORS: 1, APPEARANCE: 1 };

  // Built-in default tunings (exported from the app). Stone starts from the wood one.
  var DEFAULT_CODES = {
    WOOD:  'RA7R3EKDQYRBQ47XXYXSWBDPAAUSCHJGUIGQHKOIYYUMA',
    COLOR: 'QS7R3EKDQ4SBQ4AQXIQSGVKPGOUSFWQGUIGQHKOIYYUMUIB'
  };

  function isFlag(key) { return key === 'woodgrain_enabled' || key === 'rockgrain_enabled'; }

  // One-sentence explanation shown under each setting's name
  var HELP = {
    wood_type: 'The wood the tabletop is made of; finger discs automatically use other woods.',
    rock_type: 'The stone the tabletop is made of; finger discs automatically use other stones.',
    wood_tilt: 'Moves the shine and disc shadows as you tilt your phone.',
    wood_sheen_anim: 'Lets the shine drift slowly while fingers are down or a result is showing.',
    wood_sheen: 'How bright the glossy highlight on the table is.',
    wood_vignette: 'How dark the corners of the screen get.',
    winner_bg_enabled: 'The winner\'s colour or grain stays as the table for the next round.',
    winner_flood: 'The winner\'s colour or grain spreads across the whole screen when picked.',
    wood_flood_ripple: 'Adds a wobbling glow to the edge of the spreading flood.',
    flood_grain: 'Makes the flood edge run ahead on pale grain and lag on dark grain.',
    flood_feather: 'How soft and blurry the edge of the spreading flood is.',
    flood_ms: 'How long the flood takes to cover the screen.',
    winner_grow: 'The winning disc swells when it is picked.',
    winner_grow_ms: 'How long the winning disc takes to swell.',
    winner_fade_ms: 'How long losing discs take to fade out (0 removes them instantly).',
    fx_shockwave: 'Sends a glowing ring outward from the winner.',
    fx_particles: 'How many sparks burst from the winner (0 for none).',
    sound_enabled: 'Turns all sounds on or off.',
    sound_volume: 'Master volume for every sound.',
    sound_style: 'The sound played when a finger lands or lifts (tap \u25B6 to preview).',
    haptic_tap: 'Short vibration when a finger lands (Android only).',
    haptic_tick: 'Short vibration as each number is revealed (Android only).',
    haptic_result: 'Longer vibration pattern when the final result appears (Android only).',
    color_variety: 'How wide the mix of pale, vivid and deep colours is (0 = all alike in tone).',
    saturation: 'How vivid the finger colours are overall.',
    value_even: 'How light or dark the finger colours are overall.',
    random_hue: 'Picks a new random background colour each round (ignored after a win while "Winner claims background" is on).',
    base_hue: 'The background colour to use when random background colour is off.',
    bg_saturation: 'How colourful the background is.',
    bg_value: 'How bright the background is.',
    radius: 'The size of each finger disc.',
    pulse_amount: 'How much the discs breathe in and out.',
    pulse_speed: 'How fast the discs breathe.',
    ring_enabled: 'Shows a ring around each finger that fills as the countdown runs.',
    ring_offset: 'The gap between a disc and its countdown ring.',
    ring_stroke: 'How thick the countdown ring is.',
    ring_opacity: 'How see-through the countdown ring is.',
    marker_enabled: 'Draws a ring and dot on the winning disc.',
    marker_radius: 'Size of the winner marker ring relative to the disc.',
    marker_stroke: 'Thickness of the winner marker ring.',
    marker_dot: 'Size of the dot in the middle of the winner marker.',
    disc_shadow: 'How dark the shadow under each disc is.',
    hint_enabled: 'Shows the "put a finger on the screen" instructions when the screen is empty.',
    hint_size: 'Text size of the instructions.',
    hint_opacity: 'How faint or bold the instructions are.',
    min_fingers: 'How many fingers must be down before the countdown starts.',
    countdown_ms: 'How long everyone must hold still before the result.',
    reveal_gap_ms: 'The pause between each number being revealed.',
    order_pop_ms: 'How long a newly revealed disc takes to settle from its pop.',
    order_pop_amount: 'How much extra a disc swells at the moment its number appears.',
    order_revealed_scale: 'Size of discs once their number is shown.',
    order_text_scale: 'Size of the number relative to its disc.',
    order_pending_scale: 'Size of discs still waiting for their number.',
    order_pending_alpha: 'How faded discs are while waiting for their number.',
    keep_awake: 'Stops the screen from dimming or locking while the app is open.'
  };

  // Which surfaces show which rows (everything else shows everywhere)
  SETTINGS_SCHEMA.forEach(function (s) {
    if (isFlag(s.key)) s.hidden = true;                       // replaced by the Surface selector
    else if (s.key === 'wood_type') s.modes = ['WOOD'];
    else if (s.key === 'rock_type') s.modes = ['STONE'];
    else if (/^(wood_tilt|wood_sheen_anim|wood_sheen|wood_vignette|wood_flood_ripple|flood_grain)$/.test(s.key)) s.modes = ['WOOD', 'STONE'];
    else if (s.key === 'disc_shadow') s.modes = ['WOOD', 'STONE'];   // flat colour circles have no shadow
    else if (s.group === 'COLORS' || /^marker_/.test(s.key)) s.modes = ['COLOR'];
    s.perSurface = !isFlag(s.key) && !!SURFACE_GROUPS[s.group] && s.key.indexOf('hint_') !== 0;
    s.help = HELP[s.key] || '';
    // Rows that only matter in one game mode are hidden in the other
    if (s.group === 'WINNER') s.game = 'FIRST';
    else if (/^(order_|reveal_)/.test(s.key)) s.game = 'ORDER';
  });

  var SURFACE_KEYS = SETTINGS_SCHEMA.filter(function (s) { return s.perSurface; }).map(function (s) { return s.key; });

  function schemaDef(key) {
    for (var i = 0; i < SETTINGS_SCHEMA.length; i++) if (SETTINGS_SCHEMA[i].key === key) return SETTINGS_SCHEMA[i].def;
    return 0;
  }

  var state = {};
  var profiles = {};     // surface -> { key: value } for SURFACE_KEYS
  var listeners = [];

  function modeOf(st) {
    return st.woodgrain_enabled ? 'WOOD' : st.rockgrain_enabled ? 'STONE' : 'COLOR';
  }
  function currentMode() { return modeOf(state); }

  function setFlags(mode) {
    state.woodgrain_enabled = mode === 'WOOD' ? 1 : 0;
    state.rockgrain_enabled = mode === 'STONE' ? 1 : 0;
  }

  function pickSurface() {
    var p = {};
    SURFACE_KEYS.forEach(function (k) { p[k] = get(k); });
    return p;
  }

  function defaultProfile(mode) {
    var r = decode(DEFAULT_CODES[mode === 'COLOR' ? 'COLOR' : 'WOOD']);
    var p = {};
    SURFACE_KEYS.forEach(function (k) {
      p[k] = (r.ok && r.data[k] !== undefined) ? r.data[k] : schemaDef(k);
    });
    // The winner marker ring belongs to the flat colour look only
    if (mode !== 'COLOR') p.marker_enabled = 0;
    return p;
  }

  function applyProfile(mode) {
    var def = defaultProfile(mode);
    var p = profiles[mode] || {};
    SURFACE_KEYS.forEach(function (k) { state[k] = p[k] !== undefined ? p[k] : def[k]; });
    profiles[mode] = pickSurface();
  }

  function notify(key, value) { listeners.forEach(function (cb) { cb(key, value); }); }

  function load() {
    var v = store.get('sortire_settings_v');
    var s = store.get('sortire_settings_json');
    var p = store.get('sortire_profiles_json');
    if (v === SETTINGS_VERSION && s) {
      try {
        var parsed = JSON.parse(s);
        SETTINGS_SCHEMA.forEach(function (schema) {
          state[schema.key] = parsed[schema.key] !== undefined ? parsed[schema.key] : schema.def;
        });
        profiles = p ? JSON.parse(p) : {};
        if (state.woodgrain_enabled && state.rockgrain_enabled) state.rockgrain_enabled = 0;
        profiles[currentMode()] = pickSurface();
        return;
      } catch (e) {}
    }
    resetAll();
  }

  // Slider drags fire many changes a second, so single changes are saved after a
  // short pause; structural changes (surface, codes, reset) are written at once.
  var saveTimer = 0;
  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    profiles[currentMode()] = pickSurface();
    store.set('sortire_settings_v', SETTINGS_VERSION);
    store.set('sortire_settings_json', JSON.stringify(state));
    store.set('sortire_profiles_json', JSON.stringify(profiles));
  }
  function save(now) {
    if (now) flush();
    else if (!saveTimer) saveTimer = setTimeout(flush, 250);
  }

  // Everything back to defaults; the current surface stays selected
  function resetAll() {
    var mode = (state.woodgrain_enabled !== undefined) ? currentMode() : DEFAULT_SURFACE;
    SETTINGS_SCHEMA.forEach(function (s) { state[s.key] = s.def; });
    profiles = {};
    SURFACES.forEach(function (m) { profiles[m] = defaultProfile(m); });
    setFlags(mode);
    applyProfile(mode);
    save(true);
    notify('all', null);
  }

  // Switch surface: park the current surface's values, load the new surface's own
  function setMode(mode) {
    if (SURFACES.indexOf(mode) < 0) return;
    if (currentMode() === mode) return;
    profiles[currentMode()] = pickSurface();
    setFlags(mode);
    applyProfile(mode);
    save(true);
    notify('all', null);
  }

  function get(key) {
    if (state[key] !== undefined) return state[key];
    return schemaDef(key);
  }

  function bool(key) { return get(key) !== 0; }

  function set(key, value) {
    state[key] = value;
    save();
    notify(key, value);
  }

  function format(schema, val) {
    if (schema.options) return schema.options[Math.round(val)];
    var out = Number.isInteger(schema.step) ? Math.round(val).toString() : val.toFixed(2);
    return schema.unit ? out + schema.unit : out;
  }

  // ── Codes ─────────────────────────────────────────────────────────────────
  // A code describes ONE surface's tuning. Shared settings (audio, timing, hints)
  // are written as defaults, so the same tuning always gives the same code and
  // applying a code never touches your sound or timing.
  var CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32

  // Compression scheme mapping names to bounds. Max ranges must fit the exact values below.
  var CODE_FIELDS = [
    ['woodgrain_enabled', 0, 1, 1],
    ['rockgrain_enabled', 0, 1, 1],
    ['wood_type', 0, 11, 1],
    ['rock_type', 0, 11, 1], // Fixed to allow 0-11
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
    ['min_fingers', 1, 10, 1],
    ['countdown_ms', 500, 5000, 100],
    ['reveal_gap_ms', 100, 2000, 50],
    ['order_pop_ms', 50, 1000, 50],
    ['order_pop_amount', 0, 1.0, 0.05],
    ['order_revealed_scale', 0.5, 2.0, 0.05],
    ['order_text_scale', 0.3, 1.5, 0.05],
    ['order_pending_scale', 0.2, 1.0, 0.05],
    ['order_pending_alpha', 0, 1.0, 0.05],
    // Append new fields BELOW this line, never above (older codes must keep decoding)
    ['disc_shadow', 0, 1, 0.05],
    ['color_variety', 0, 1, 0.05]
  ];
  // Note: 'hue_step' and 'value_odd' are no longer settings (finger colours now come from a
  // 100-colour palette) but must stay in this list so older codes keep decoding.


  function encode() {
    var valList = [];
    CODE_FIELDS.forEach(function (f) {
      var k = f[0], min = f[1], max = f[2], step = f[3];
      var raw = (SURFACE_KEYS.indexOf(k) >= 0 || isFlag(k)) ? get(k) : schemaDef(k);
      var val = Math.max(min, Math.min(max, raw));
      valList.push(Math.round((val - min) / step));
    });

    var bits = [];
    CODE_FIELDS.forEach(function (f, i) {
      var maxSteps = Math.round((f[2] - f[1]) / f[3]);
      var neededBits = Math.max(1, Math.ceil(Math.log2(maxSteps + 1)));
      var v = valList[i];
      for (var b = 0; b < neededBits; b++) bits.push((v >> b) & 1);
    });

    var str = '';
    for (var i = 0; i < bits.length; i += 5) {
      var chunk = 0;
      for (var j = 0; j < 5; j++) {
        if (i + j < bits.length && bits[i + j]) chunk |= (1 << j);
      }
      str += CODE_CHARS[chunk];
    }
    return str;
  }

  function decode(str) {
    str = String(str);
    // Letters A-Z, digits 2-7, and the spaces / dashes used for readability
    if (/[^A-Za-z2-7\s-]/.test(str)) return { ok: false, error: 'That doesn\'t look like a settings code.' };
    str = str.replace(/[^A-Z2-7]/gi, '').toUpperCase();
    if (str.length < 10) return { ok: false, error: 'That code looks too short or damaged.' };
    var bits = [];
    for (var i = 0; i < str.length; i++) {
      var ci = CODE_CHARS.indexOf(str[i]);
      if (ci < 0) return { ok: false, error: 'Invalid character' };
      for (var j = 0; j < 5; j++) bits.push((ci >> j) & 1);
    }

    var idx = 0;
    var result = {};
    for (var k = 0; k < CODE_FIELDS.length; k++) {
      var f = CODE_FIELDS[k];
      var key = f[0], min = f[1], max = f[2], step = f[3];
      var maxSteps = Math.round((max - min) / step);
      var neededBits = Math.max(1, Math.ceil(Math.log2(maxSteps + 1)));
      if (idx + neededBits > bits.length) break;   // field not in this (older) code: caller uses its default

      var v = 0;
      for (var b = 0; b < neededBits; b++) {
        if (idx < bits.length && bits[idx]) v |= (1 << b);
        idx++;
      }
      if (v > maxSteps) v = maxSteps;
      result[key] = Math.round((min + v * step) * 1e6) / 1e6;
    }
    return { ok: true, data: result };
  }

  function modeOfCode(str) {
    var r = decode(str);
    return r.ok ? modeOf(r.data) : null;
  }

  // Apply a tuning: switches to the code's surface and replaces only that surface's values
  function applyCode(str) {
    var r = decode(str);
    if (!r.ok) return r;
    profiles[currentMode()] = pickSurface();
    var mode = modeOf(r.data);
    setFlags(mode);
    SURFACE_KEYS.forEach(function (k) {
      state[k] = r.data[k] !== undefined ? r.data[k] : schemaDef(k);   // field missing in an older code: use its default
    });
    save(true);
    notify('all', null);
    return { ok: true };
  }

  // ── Saved tunings (each belongs to one surface) ───────────────────────────
  function allSaved() {
    try {
      return JSON.parse(store.get('sortire_saved_tunings')) || [];
    } catch (e) { return []; }
  }
  function writeSaved(l) { store.set('sortire_saved_tunings', JSON.stringify(l)); }

  function listSaved(mode) {
    return allSaved().map(function (x) {
      x.mode = x.mode || modeOfCode(x.code);
      return x;
    }).filter(function (x) { return !mode || x.mode === mode; });
  }

  function saveCode(name, code) {
    var l = allSaved();
    l.push({ id: Date.now().toString(), name: name, code: code, mode: modeOfCode(code) });
    writeSaved(l);
    return { ok: true };
  }

  function deleteSaved(id) {
    writeSaved(allSaved().filter(function (x) { return x.id !== id; }));
  }

  function renameSaved(id, name) {
    var l = allSaved();
    var f = l.filter(function (x) { return x.id === id; })[0];
    if (f) { f.name = name; writeSaved(l); }
  }

  load();

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });

  window.Settings = {
    SCHEMA: SETTINGS_SCHEMA,
    GROUPS: GROUPS,
    SURFACES: SURFACES,
    get: get,
    bool: bool,
    set: set,
    resetAll: resetAll,
    getMode: currentMode,
    setMode: setMode,
    format: format,
    currentCode: encode,
    dump: encode,
    decode: decode,
    modeOfCode: modeOfCode,
    applyCode: applyCode,
    listSaved: listSaved,
    saveCode: saveCode,
    deleteSaved: deleteSaved,
    renameSaved: renameSaved,
    flush: flush,
    addChangeListener: function (cb) { listeners.push(cb); }
  };
})();
