/**
 * settings.js: Manages all adjustable parameters, defaults, and the shareable base64 format for Sortire.
 */
(function () {
  'use strict';

  var SETTINGS_VERSION = '8';

  // Schema defines the UI groups, sliders, and encoding bounds for the shareable format.
  var SETTINGS_SCHEMA = [
    { key: 'woodgrain_enabled', group: 'WOOD', label: 'Use woodgrain surface', def: 1, isBool: true, resetsRound: true },
    { key: 'rockgrain_enabled', group: 'WOOD', label: 'Use stone surface', def: 1, isBool: true, resetsRound: true },
    { key: 'wood_type', group: 'WOOD', label: 'Wood material', def: 4, min: 0, max: 11, step: 1, options: ['Golden Oak', 'Rich Walnut', 'Dark Ebony', 'Cherry', 'Weathered Cedar', 'Maple', 'Purpleheart', 'Zebrawood', 'Mahogany', 'Ash', 'Teak', 'Bamboo'], resetsRound: true },
    { key: 'rock_type', group: 'WOOD', label: 'Stone material', def: 0, min: 0, max: 11, step: 1, options: ['Blue Slate', 'River Pebble', 'Warm Terracotta', 'Speckled Granite', 'Dark Basalt', 'Obsidian Glass', 'Rose Quartz', 'Lapis Lazuli', 'Jadeite', 'Tiger\'s Eye', 'Desert Sandstone', 'Amethyst'], resetsRound: true },
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
    { key: 'sound_style', group: 'AUDIO', label: 'Pop sound', def: 0, min: 0, max: 3, step: 1, options: ['Wood block', 'Bubble', 'Tick', 'Snap'] },
    { key: 'haptic_tap', group: 'AUDIO', label: 'Haptic on tap', def: 1, isBool: true },
    { key: 'haptic_tick', group: 'AUDIO', label: 'Haptic on reveal', def: 1, isBool: true },
    { key: 'haptic_result', group: 'AUDIO', label: 'Haptic on final result', def: 1, isBool: true },

    { key: 'hue_step', group: 'COLORS', label: 'Hue jump per finger', def: 137.5, min: 10, max: 180, step: 0.5, unit: '°' },
    { key: 'saturation', group: 'COLORS', label: 'Finger saturation', def: 0.85, min: 0.1, max: 1.0, step: 0.05 },
    { key: 'value_even', group: 'COLORS', label: 'Brightness (even)', def: 0.95, min: 0.1, max: 1.0, step: 0.05 },
    { key: 'value_odd', group: 'COLORS', label: 'Brightness (odd)', def: 0.85, min: 0.1, max: 1.0, step: 0.05 },
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
    { key: 'hint_enabled', group: 'APPEARANCE', label: 'Show instructions', def: 1, isBool: true },
    { key: 'hint_size', group: 'APPEARANCE', label: 'Instruction text size', def: 18, min: 10, max: 40, step: 1, unit: 'px' },
    { key: 'hint_opacity', group: 'APPEARANCE', label: 'Instruction opacity', def: 0.4, min: 0.1, max: 1.0, step: 0.05 },

    { key: 'min_fingers', group: 'TIMING', label: 'Minimum fingers to start', def: 2, min: 2, max: 10, step: 1 },
    { key: 'countdown_ms', group: 'TIMING', label: 'Countdown time', def: 2000, min: 500, max: 5000, step: 100, unit: 'ms' },
    { key: 'reveal_gap_ms', group: 'TIMING', label: 'Order reveal gap', def: 600, min: 100, max: 2000, step: 50, unit: 'ms' },
    { key: 'order_pop_ms', group: 'TIMING', label: 'Order reveal pop time', def: 400, min: 50, max: 1000, step: 50, unit: 'ms' },
    { key: 'order_pop_amount', group: 'TIMING', label: 'Order pop extra size', def: 0.2, min: 0, max: 1.0, step: 0.05 },
    { key: 'order_revealed_scale', group: 'TIMING', label: 'Revealed item scale', def: 1.1, min: 0.5, max: 2.0, step: 0.05 },
    { key: 'order_text_scale', group: 'TIMING', label: 'Order text scale', def: 0.9, min: 0.3, max: 1.5, step: 0.05 },
    { key: 'order_pending_scale', group: 'TIMING', label: 'Unrevealed item scale', def: 0.7, min: 0.2, max: 1.0, step: 0.05 },
    { key: 'order_pending_alpha', group: 'TIMING', label: 'Unrevealed opacity', def: 0.3, min: 0, max: 1.0, step: 0.05 }
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

  var state = {};
  var listeners = [];

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
    ['min_fingers', 2, 10, 1],
    ['countdown_ms', 500, 5000, 100],
    ['reveal_gap_ms', 100, 2000, 50],
    ['order_pop_ms', 50, 1000, 50],
    ['order_pop_amount', 0, 1.0, 0.05],
    ['order_revealed_scale', 0.5, 2.0, 0.05],
    ['order_text_scale', 0.3, 1.5, 0.05],
    ['order_pending_scale', 0.2, 1.0, 0.05],
    ['order_pending_alpha', 0, 1.0, 0.05]
  ];

  function load() {
    var v = localStorage.getItem('sortire_settings_v');
    var s = localStorage.getItem('sortire_settings_json');
    if (v === SETTINGS_VERSION && s) {
      try {
        var parsed = JSON.parse(s);
        SETTINGS_SCHEMA.forEach(function (schema) {
          state[schema.key] = parsed[schema.key] !== undefined ? parsed[schema.key] : schema.def;
        });
        return;
      } catch (e) {}
    }
    resetAll();
  }

  function save() {
    localStorage.setItem('sortire_settings_v', SETTINGS_VERSION);
    localStorage.setItem('sortire_settings_json', JSON.stringify(state));
  }

  function resetAll() {
    SETTINGS_SCHEMA.forEach(function (s) { state[s.key] = s.def; });
    save();
  }

  function get(key) {
    if (state[key] !== undefined) return state[key];
    for (var i = 0; i < SETTINGS_SCHEMA.length; i++) {
      if (SETTINGS_SCHEMA[i].key === key) return SETTINGS_SCHEMA[i].def;
    }
    return 0;
  }

  function bool(key) { return get(key) !== 0; }

  function set(key, value) {
    state[key] = value;
    save();
    listeners.forEach(function (cb) { cb(key, value); });
  }

  function format(schema, val) {
    if (schema.options) return schema.options[Math.round(val)];
    var out = Number.isInteger(schema.step) ? Math.round(val).toString() : val.toFixed(2);
    return schema.unit ? out + schema.unit : out;
  }

  var CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32

  function encode() {
    var valList = [];
    CODE_FIELDS.forEach(function (f) {
      var k = f[0], min = f[1], max = f[2], step = f[3];
      var val = Math.max(min, Math.min(max, get(k)));
      valList.push(Math.round((val - min) / step));
    });
    
    var bits = [];
    CODE_FIELDS.forEach(function (f, i) {
      var maxSteps = Math.round((f[2] - f[1]) / f[3]);
      var neededBits = Math.max(1, Math.ceil(Math.log2(maxSteps + 1)));
      var v = valList[i];
      for (var b = 0; b < neededBits; b++) {
        bits.push((v >> b) & 1);
      }
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
    str = str.replace(/[^A-Z2-7]/gi, '').toUpperCase();
    var bits = [];
    for (var i = 0; i < str.length; i++) {
      var idx = CODE_CHARS.indexOf(str[i]);
      if (idx < 0) return { ok: false, error: 'Invalid character' };
      for (var j = 0; j < 5; j++) bits.push((idx >> j) & 1);
    }

    var idx = 0;
    var result = {};
    for (var k = 0; k < CODE_FIELDS.length; k++) {
      var f = CODE_FIELDS[k];
      var key = f[0], min = f[1], max = f[2], step = f[3];
      var maxSteps = Math.round((max - min) / step);
      var neededBits = Math.max(1, Math.ceil(Math.log2(maxSteps + 1)));
      
      var v = 0;
      for (var b = 0; b < neededBits; b++) {
        if (idx < bits.length && bits[idx]) v |= (1 << b);
        idx++;
      }
      if (v > maxSteps) v = maxSteps;
      result[key] = min + v * step;
    }
    return { ok: true, data: result };
  }

  function applyCode(str) {
    var r = decode(str);
    if (!r.ok) return r;
    var st = r.data;
    SETTINGS_SCHEMA.forEach(function (s) {
      if (st[s.key] !== undefined) state[s.key] = st[s.key];
    });
    save();
    listeners.forEach(function (cb) { cb('all', null); });
    return { ok: true };
  }

  function dumpJson() { return JSON.stringify(state, null, 2); }
  function importJson(txt) {
    try {
      var st = JSON.parse(txt);
      SETTINGS_SCHEMA.forEach(function (s) {
        if (st[s.key] !== undefined) state[s.key] = st[s.key];
      });
      save();
      listeners.forEach(function (cb) { cb('all', null); });
      return true;
    } catch(e) { return false; }
  }

  function listSaved() {
    try {
      return JSON.parse(localStorage.getItem('sortire_saved_tunings')) || [];
    } catch(e) { return []; }
  }

  function saveCode(name, code) {
    var l = listSaved();
    l.push({ id: Date.now().toString(), name: name, code: code });
    localStorage.setItem('sortire_saved_tunings', JSON.stringify(l));
    return { ok: true };
  }

  function deleteSaved(id) {
    var l = listSaved().filter(function(x) { return x.id !== id; });
    localStorage.setItem('sortire_saved_tunings', JSON.stringify(l));
  }
  
  function renameSaved(id, name) {
    var l = listSaved();
    var f = l.find(function(x) { return x.id === id; });
    if (f) { f.name = name; localStorage.setItem('sortire_saved_tunings', JSON.stringify(l)); }
  }

  load();

  window.Settings = {
    SCHEMA: SETTINGS_SCHEMA,
    GROUPS: GROUPS,
    get: get,
    bool: bool,
    set: set,
    resetAll: resetAll,
    format: format,
    currentCode: encode,
    decode: decode,
    applyCode: applyCode,
    dumpJson: dumpJson,
    importJson: importJson,
    listSaved: listSaved,
    saveCode: saveCode,
    deleteSaved: deleteSaved,
    renameSaved: renameSaved,
    addChangeListener: function (cb) { listeners.push(cb); }
  };
})();
