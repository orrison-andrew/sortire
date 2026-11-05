/**
 * settings.js: Manages live-tunable settings for Sortire PWA.
 * Mirrors Settings.kt and SettingsPanel.kt from the Android app.
 */
(function (root) {
  'use strict';

  var GROUPS = {
    MODE: { title: 'Game Mode' },
    WOOD: { title: 'Woodgrain' },
    WINNER: { title: 'Winner Options' },
    AUDIO: { title: 'Audio & Feedback' },
    COLORS: { title: 'Color Controls' },
    APPEARANCE: { title: 'Appearance & Themes' },
    TIMING: { title: 'Countdown Ring & Timing' },
    SYSTEM: { title: 'System & Feedback' }
  };

  var SETTINGS_SCHEMA = [
    // Winner Options
    { key: 'woodgrain_enabled', group: 'WOOD', label: 'Enable woodgrain style', def: 1, isBool: true, resetsRound: true },
    { key: 'wood_type', group: 'WOOD', label: 'Wood species', def: 3, min: 0, max: 11, step: 1, options: ['Maple', 'White Oak', 'Red Oak', 'Walnut', 'Ebony', 'Purpleheart', 'Cherry', 'Pine', 'Mahogany', 'Padauk', 'Zebrawood', 'Yellowheart'], resetsRound: true },
    { key: 'wood_vignette', group: 'WOOD', label: 'Table vignette', def: 0.28, min: 0, max: 0.6, step: 0.02 },
    { key: 'wood_sheen', group: 'WOOD', label: 'Varnish sheen', def: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'wood_sheen_anim', group: 'WOOD', label: 'Animate sheen and edge ripple', def: 1, isBool: true },
    { key: 'wood_tilt', group: 'WOOD', label: 'Tilt-driven lighting', def: 1, isBool: true },
    { key: 'disc_gloss', group: 'WOOD', label: 'Disc gloss', def: 0.8, min: 0, max: 1, step: 0.05 },
    { key: 'wood_flood_ripple', group: 'WOOD', label: 'Flood edge ripple', def: 0.4, min: 0, max: 1, step: 0.05 },
    { key: 'winner_flood', group: 'WINNER', label: 'Winner floods the screen', def: 1, isBool: true },
    { key: 'marker_enabled', group: 'WINNER', label: 'Show winner marker ring', def: 0, isBool: true },
    { key: 'winner_fade_ms', group: 'WINNER', label: 'Losers fade-out time', def: 300, min: 0, max: 1500, step: 50, unit: 'ms' },
    { key: 'winner_grow_ms', group: 'WINNER', label: 'Winner grow time', def: 1100, min: 0, max: 2000, step: 50, unit: 'ms' },
    { key: 'marker_radius', group: 'WINNER', label: 'Marker ring size', def: 1.3, min: 1, max: 2, step: 0.05, unit: '×' },
    { key: 'marker_stroke', group: 'WINNER', label: 'Marker ring thickness', def: 8, min: 0, max: 20, step: 1, unit: 'dp' },
    { key: 'marker_dot', group: 'WINNER', label: 'Marker center dot size', def: 0.45, min: 0, max: 1, step: 0.05, unit: '×' },
    { key: 'flood_feather', group: 'WINNER', label: 'Flood edge softness', def: 60, min: 0, max: 200, step: 5, unit: 'dp' },
    { key: 'fx_shockwave', group: 'WINNER', label: 'Winner shockwave ring', def: 1, isBool: true },
    { key: 'fx_glow', group: 'WINNER', label: 'Winner glow', def: 1, isBool: true },
    { key: 'fx_particles', group: 'WINNER', label: 'Winner particle burst (0 = off)', def: 80, min: 0, max: 200, step: 10 },

    // Audio & Feedback
    { key: 'sound_enabled', group: 'AUDIO', label: 'Enable sound effects', def: 1, isBool: true },
    { key: 'sound_style', group: 'AUDIO', label: 'Pop sound style', def: 0, min: 0, max: 9, step: 1, options: ['Pop', 'Bubble', 'Blip', 'Laser', 'Snap', 'Beep', 'Thud', 'Ping', 'Boing', 'Click'] },

    // Color Controls
    { key: 'winner_bg_enabled', group: 'COLORS', label: 'Background from last winner', def: 1, isBool: true, resetsRound: false },
    { key: 'random_hue', group: 'COLORS', label: 'Random background hue each round', def: 0, isBool: true, resetsRound: true },
    { key: 'base_hue', group: 'COLORS', label: 'Background hue', def: 260, min: 0, max: 360, step: 5, unit: '°', resetsRound: true },
    { key: 'bg_saturation', group: 'COLORS', label: 'Background saturation', def: 0.45, min: 0, max: 1, step: 0.02, resetsRound: true },
    { key: 'bg_value', group: 'COLORS', label: 'Background brightness', def: 0.14, min: 0, max: 1, step: 0.02, resetsRound: true },
    { key: 'saturation', group: 'COLORS', label: 'Circle saturation', def: 0.78, min: 0, max: 1, step: 0.02, resetsRound: true },
    { key: 'hue_step', group: 'COLORS', label: 'Hue step between fingers', def: 137.5, min: 0, max: 360, step: 0.5, unit: '°', resetsRound: true },
    { key: 'value_even', group: 'COLORS', label: 'Brightness (1st, 3rd… finger)', def: 1, min: 0, max: 1, step: 0.02, resetsRound: true },
    { key: 'value_odd', group: 'COLORS', label: 'Brightness (2nd, 4th… finger)', def: 1, min: 0, max: 1, step: 0.02, resetsRound: true },

    // Appearance & Themes
    { key: 'radius', group: 'APPEARANCE', label: 'Circle radius', def: 60, min: 20, max: 120, step: 2, unit: 'dp' },
    { key: 'pulse_amount', group: 'APPEARANCE', label: 'Pulse amount', def: 0, min: 0, max: 0.3, step: 0.01 },
    { key: 'pulse_speed', group: 'APPEARANCE', label: 'Pulse speed', def: 0, min: 0, max: 20, step: 0.5 },

    // Countdown Ring & Timing
    { key: 'countdown_ms', group: 'TIMING', label: 'Countdown before choosing', def: 2000, min: 500, max: 6000, step: 100, unit: 'ms' },
    { key: 'min_fingers', group: 'TIMING', label: 'Minimum fingers', def: 1, min: 1, max: 5, step: 1, unit: '', resetsRound: true },
    { key: 'reveal_gap_ms', group: 'TIMING', label: 'Order: gap between numbers', def: 450, min: 100, max: 1500, step: 50, unit: 'ms' },
    { key: 'ring_enabled', group: 'TIMING', label: 'Show countdown ring', def: 1, isBool: true },
    { key: 'ring_offset', group: 'TIMING', label: 'Ring distance from circle', def: 14, min: 0, max: 40, step: 1, unit: 'dp' },
    { key: 'ring_stroke', group: 'TIMING', label: 'Ring thickness', def: 6, min: 1, max: 20, step: 1, unit: 'dp' },
    { key: 'ring_opacity', group: 'TIMING', label: 'Ring opacity', def: 0.9, min: 0, max: 1, step: 0.05 },

    // Order All Result Tuning
    { key: 'order_revealed_scale', group: 'TIMING', label: 'Revealed circle size', def: 1.1, min: 0.5, max: 2, step: 0.05, unit: '×' },
    { key: 'order_pop_amount', group: 'TIMING', label: 'Pop-in overshoot', def: 0.3, min: 0, max: 1, step: 0.05, unit: '×' },
    { key: 'order_pop_ms', group: 'TIMING', label: 'Pop-in time', def: 250, min: 0, max: 1000, step: 25, unit: 'ms' },
    { key: 'order_pending_scale', group: 'TIMING', label: 'Not-yet-revealed size', def: 0.8, min: 0, max: 1.5, step: 0.05, unit: '×' },
    { key: 'order_pending_alpha', group: 'TIMING', label: 'Not-yet-revealed opacity', def: 0.35, min: 0, max: 1, step: 0.05 },
    { key: 'order_text_scale', group: 'TIMING', label: 'Number size', def: 0.95, min: 0.3, max: 2, step: 0.05, unit: '×' },

    // System & Feedback
    { key: 'haptic_tap', group: 'SYSTEM', label: 'Buzz on finger down', def: 1, isBool: true },
    { key: 'haptic_tick', group: 'SYSTEM', label: 'Buzz on each number reveal', def: 1, isBool: true },
    { key: 'haptic_result', group: 'SYSTEM', label: 'Buzz on final result', def: 1, isBool: true },
    { key: 'hint_enabled', group: 'SYSTEM', label: 'Show hint text', def: 1, isBool: true },
    { key: 'hint_size', group: 'SYSTEM', label: 'Hint text size', def: 22, min: 12, max: 40, step: 1, unit: 'dp' },
    { key: 'hint_opacity', group: 'SYSTEM', label: 'Hint text opacity', def: 0.7, min: 0, max: 1, step: 0.05 }
  ];

  // Two complete base configurations. Toggling "Enable woodgrain style" switches
  // between them (see applyPreset). The schema defaults above equal PRESETS.woodgrain.
  var PRESETS = {
    woodgrain: {
      winner_flood: 1,
      marker_enabled: 0,
      winner_fade_ms: 300,
      winner_grow_ms: 1100,
      marker_radius: 1.3,
      marker_stroke: 8,
      marker_dot: 0.45,
      sound_enabled: 1,
      sound_style: 0,
      winner_bg_enabled: 1,
      woodgrain_enabled: 1,
      random_hue: 0,
      base_hue: 260,
      bg_saturation: 0.45,
      bg_value: 0.14,
      saturation: 0.78,
      hue_step: 137.5,
      value_even: 1,
      value_odd: 1,
      wood_type: 3,
      radius: 60,
      pulse_amount: 0,
      pulse_speed: 0,
      countdown_ms: 2000,
      min_fingers: 1,
      reveal_gap_ms: 450,
      ring_enabled: 1,
      ring_offset: 14,
      ring_stroke: 6,
      ring_opacity: 0.9,
      order_revealed_scale: 1.1,
      order_pop_amount: 0.3,
      order_pop_ms: 250,
      order_pending_scale: 0.8,
      order_pending_alpha: 0.35,
      order_text_scale: 0.95,
      haptic_tap: 1,
      haptic_tick: 1,
      haptic_result: 1,
      hint_enabled: 1,
      hint_size: 22,
      hint_opacity: 0.7
    },
    colors: {
      winner_flood: 1,
      marker_enabled: 1,
      winner_fade_ms: 300,
      winner_grow_ms: 1100,
      marker_radius: 1.3,
      marker_stroke: 8,
      marker_dot: 0.45,
      sound_enabled: 1,
      sound_style: 0,
      winner_bg_enabled: 1,
      woodgrain_enabled: 0,
      random_hue: 0,
      base_hue: 260,
      bg_saturation: 0.45,
      bg_value: 0.14,
      saturation: 0.78,
      hue_step: 137.5,
      value_even: 1,
      value_odd: 1,
      wood_type: 3,
      radius: 60,
      pulse_amount: 0.11,
      pulse_speed: 3.5,
      countdown_ms: 2000,
      min_fingers: 1,
      reveal_gap_ms: 450,
      ring_enabled: 1,
      ring_offset: 14,
      ring_stroke: 6,
      ring_opacity: 0.9,
      order_revealed_scale: 1.1,
      order_pop_amount: 0.3,
      order_pop_ms: 250,
      order_pending_scale: 0.8,
      order_pending_alpha: 0.35,
      order_text_scale: 0.95,
      haptic_tap: 1,
      haptic_tick: 1,
      haptic_result: 1,
      hint_enabled: 1,
      hint_size: 22,
      hint_opacity: 0.7
    }
  };

  // Bump when defaults change so devices with older saved values pick up the new ones once.
  var SETTINGS_VERSION = '2';

  var values = {};
  var listeners = [];

  function init() {
    try {
      if (localStorage.getItem('sortire_settings_version') !== SETTINGS_VERSION) {
        SETTINGS_SCHEMA.forEach(function (s) { localStorage.removeItem('sortire_' + s.key); });
        localStorage.setItem('sortire_settings_version', SETTINGS_VERSION);
      }
    } catch (e) {}
    SETTINGS_SCHEMA.forEach(function (s) {
      var saved = localStorage.getItem('sortire_' + s.key);
      if (saved !== null) {
        var num = parseFloat(saved);
        values[s.key] = isNaN(num) ? s.def : num;
      } else {
        values[s.key] = s.def;
      }
    });
  }

  function get(key) {
    if (values[key] === undefined) {
      var s = SETTINGS_SCHEMA.find(function (item) { return item.key === key; });
      return s ? s.def : 0;
    }
    return values[key];
  }

  function bool(key) {
    return get(key) >= 0.5;
  }

  function set(key, val) {
    values[key] = val;
    localStorage.setItem('sortire_' + key, val.toString());
    var s = SETTINGS_SCHEMA.find(function (item) { return item.key === key; });
    listeners.forEach(function (fn) { fn(s); });
  }

  function resetAll() {
    SETTINGS_SCHEMA.forEach(function (s) {
      values[s.key] = s.def;
      localStorage.removeItem('sortire_' + s.key);
    });
    listeners.forEach(function (fn) { fn(null); });
  }

  function applyPreset(name) {
    var p = PRESETS[name];
    if (!p) return;
    SETTINGS_SCHEMA.forEach(function (s) {
      if (p[s.key] !== undefined) {
        values[s.key] = p[s.key];
        localStorage.setItem('sortire_' + s.key, String(p[s.key]));
      }
    });
    listeners.forEach(function (fn) { fn(null); });
  }

  function addChangeListener(fn) {
    listeners.push(fn);
  }

  function format(s, v) {
    if (s.options) {
      var idx = Math.round(v);
      return s.options[idx] || s.options[0];
    }
    if (s.isBool) return v >= 0.5 ? 'On' : 'Off';
    var decimals = s.step >= 1 ? 0 : s.step >= 0.1 ? 1 : 2;
    var str = v.toFixed(decimals);
    return s.unit ? str + ' ' + s.unit : str;
  }

  function dump() {
    var out = [];
    var lastGroup = null;
    SETTINGS_SCHEMA.forEach(function (s) {
      if (s.group !== lastGroup) {
        lastGroup = s.group;
        out.push('\n# ' + GROUPS[s.group].title);
      }
      out.push(s.key + ' = ' + format(s, get(s.key)));
    });
    return out.join('\n').trim();
  }

  function dumpJson() {
    var obj = {};
    SETTINGS_SCHEMA.forEach(function (s) {
      obj[s.key] = get(s.key);
    });
    return JSON.stringify(obj, null, 2);
  }

  function importJson(jsonStr) {
    try {
      var data = JSON.parse(jsonStr);
      SETTINGS_SCHEMA.forEach(function (s) {
        if (data[s.key] !== undefined) {
          var val = parseFloat(data[s.key]);
          if (!isNaN(val)) {
            set(s.key, val);
          }
        }
      });
      listeners.forEach(function (fn) { fn(null); });
      return true;
    } catch (e) {
      return false;
    }
  }

  init();

  root.Settings = {
    GROUPS: GROUPS,
    SCHEMA: SETTINGS_SCHEMA,
    get: get,
    bool: bool,
    set: set,
    resetAll: resetAll,
    PRESETS: PRESETS,
    applyPreset: applyPreset,
    format: format,
    dump: dump,
    dumpJson: dumpJson,
    importJson: importJson,
    addChangeListener: addChangeListener
  };
})(typeof window !== 'undefined' ? window : this);
