/**
 * settings.js: Manages live-tunable settings for Sortire PWA.
 * Mirrors Settings.kt and SettingsPanel.kt from the Android app.
 *
 * Also owns "settings codes": a compact hex string that captures every setting so a
 * tuning can be shared, saved and restored. See the CODE FORMAT section below.
 */
(function (root) {
  'use strict';

  var GROUPS = {
    MODE: { title: 'Game Mode' },
    WOOD: { title: 'Woodgrain & Stone' },
    WINNER: { title: 'Winner Options' },
    AUDIO: { title: 'Audio & Feedback' },
    COLORS: { title: 'Color Controls' },
    APPEARANCE: { title: 'Appearance & Themes' },
    TIMING: { title: 'Countdown Ring & Timing' },
    SYSTEM: { title: 'System & Feedback' }
  };

  // Schema defaults are the PLAIN look: flat colours, no pulse, no marker, no winner
  // effects. PRESETS.colors below is built from these.
  var SETTINGS_SCHEMA = [
    // Woodgrain & Stone
    { key: 'woodgrain_enabled', group: 'WOOD', label: 'Enable woodgrain style', def: 0, isBool: true, resetsRound: true },
    { key: 'wood_type', group: 'WOOD', label: 'Wood species', def: 3, min: 0, max: 11, step: 1, options: ['Maple', 'White Oak', 'Red Oak', 'Walnut', 'Ebony', 'Purpleheart', 'Cherry', 'Pine', 'Mahogany', 'Padauk', 'Zebrawood', 'Yellowheart'], resetsRound: true },
    { key: 'rockgrain_enabled', group: 'WOOD', label: 'Enable stone style', def: 0, isBool: true, resetsRound: true },
    { key: 'rock_type', group: 'WOOD', label: 'Stone material', def: 0, min: 0, max: 4, step: 1, options: ['Granite', 'Marble', 'Slate', 'Sandstone', 'Obsidian'], resetsRound: true },
    { key: 'wood_vignette', group: 'WOOD', label: 'Table vignette', def: 0.28, min: 0, max: 0.6, step: 0.02 },
    { key: 'wood_sheen', group: 'WOOD', label: 'Varnish sheen', def: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'wood_sheen_anim', group: 'WOOD', label: 'Animate sheen and edge ripple', def: 1, isBool: true },
    { key: 'wood_tilt', group: 'WOOD', label: 'Tilt-driven lighting', def: 1, isBool: true },
    { key: 'disc_gloss', group: 'WOOD', label: 'Disc gloss', def: 0.8, min: 0, max: 1, step: 0.05 },
    { key: 'wood_flood_ripple', group: 'WOOD', label: 'Flood edge ripple', def: 0.4, min: 0, max: 1, step: 0.05 },
    { key: 'flood_grain', group: 'WOOD', label: 'Flood edge follows new grain', def: 0.6, min: 0, max: 1, step: 0.05 },

    // Winner Options
    { key: 'winner_flood', group: 'WINNER', label: 'Winner floods the screen', def: 1, isBool: true },
    { key: 'marker_enabled', group: 'WINNER', label: 'Show winner marker ring', def: 0, isBool: true },
    { key: 'winner_fade_ms', group: 'WINNER', label: 'Losers fade-out time', def: 300, min: 0, max: 1500, step: 50, unit: 'ms' },
    { key: 'winner_grow', group: 'WINNER', label: 'Winner grows', def: 1, isBool: true },
    { key: 'winner_grow_ms', group: 'WINNER', label: 'Winner grow time', def: 1100, min: 0, max: 2000, step: 50, unit: 'ms' },
    { key: 'marker_radius', group: 'WINNER', label: 'Marker ring size', def: 1.3, min: 1, max: 2, step: 0.05, unit: '×' },
    { key: 'marker_stroke', group: 'WINNER', label: 'Marker ring thickness', def: 8, min: 0, max: 20, step: 1, unit: 'dp' },
    { key: 'marker_dot', group: 'WINNER', label: 'Marker center dot size', def: 0.45, min: 0, max: 1, step: 0.05, unit: '×' },
    { key: 'flood_ms', group: 'WINNER', label: 'Flood spread time', def: 1100, min: 0, max: 3000, step: 50, unit: 'ms' },
    { key: 'flood_feather', group: 'WINNER', label: 'Flood edge softness', def: 60, min: 0, max: 200, step: 5, unit: 'dp' },
    { key: 'fx_shockwave', group: 'WINNER', label: 'Winner shockwave ring', def: 0, isBool: true },
    { key: 'fx_particles', group: 'WINNER', label: 'Winner particle burst (0 = off)', def: 0, min: 0, max: 200, step: 10 },

    // Audio & Feedback
    { key: 'sound_enabled', group: 'AUDIO', label: 'Enable sound effects', def: 1, isBool: true },
    { key: 'sound_style', group: 'AUDIO', label: 'Pop sound style', def: 0, min: 0, max: 9, step: 1, options: ['Pop', 'Bubble', 'Blip', 'Laser', 'Snap', 'Beep', 'Thud', 'Ping', 'Boing', 'Click'] },

    // Color Controls
    { key: 'winner_bg_enabled', group: 'COLORS', label: 'Background from last winner', def: 1, isBool: true, resetsRound: false },
    { key: 'random_hue', group: 'COLORS', label: 'Random background hue each round', def: 0, isBool: true, resetsRound: true },
    { key: 'base_hue', group: 'COLORS', label: 'Background hue', def: 260, min: 0, max: 360, step: 5, unit: '°', resetsRound: true },
    { key: 'bg_saturation', group: 'COLORS', label: 'Background saturation', def: 0.45, min: 0, max: 1, step: 0.05, resetsRound: true },
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

  var PLAIN = {};
  SETTINGS_SCHEMA.forEach(function (s) { PLAIN[s.key] = s.def; });

  function presetFrom(overrides) {
    var p = {};
    Object.keys(PLAIN).forEach(function (k) { p[k] = PLAIN[k]; });
    Object.keys(overrides).forEach(function (k) { p[k] = overrides[k]; });
    return p;
  }

  var PRESETS = {
    colors: presetFrom({}),
    woodgrain: presetFrom({
      woodgrain_enabled: 1,
      wood_sheen_anim: 0,
      disc_gloss: 0.35,
      wood_flood_ripple: 0.2,
      winner_grow: 0,
      fx_shockwave: 1,
      fx_particles: 0
    }),
    stone: presetFrom({
      rockgrain_enabled: 1,
      wood_sheen_anim: 0,
      disc_gloss: 0.35,
      wood_flood_ripple: 0.2,
      winner_grow: 0,
      fx_shockwave: 1,
      fx_particles: 0
    })
  };

  var SETTINGS_VERSION = '5';

  var values = {};
  var listeners = [];

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function schemaFor(key) {
    for (var i = 0; i < SETTINGS_SCHEMA.length; i++) {
      if (SETTINGS_SCHEMA[i].key === key) return SETTINGS_SCHEMA[i];
    }
    return null;
  }

  function init() {
    if (lsGet('sortire_settings_version') !== SETTINGS_VERSION) {
      SETTINGS_SCHEMA.forEach(function (s) { lsDel('sortire_' + s.key); });
      lsSet('sortire_settings_version', SETTINGS_VERSION);
    }
    SETTINGS_SCHEMA.forEach(function (s) {
      var saved = lsGet('sortire_' + s.key);
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
      var s = schemaFor(key);
      return s ? s.def : 0;
    }
    return values[key];
  }

  function bool(key) {
    return get(key) >= 0.5;
  }

  function notify(s) {
    listeners.forEach(function (fn) { fn(s); });
  }

  function set(key, val) {
    values[key] = val;
    lsSet('sortire_' + key, val.toString());
    notify(schemaFor(key));
  }

  function resetAll() {
    SETTINGS_SCHEMA.forEach(function (s) {
      values[s.key] = s.def;
      lsDel('sortire_' + s.key);
    });
    notify(null);
  }

  function applyPreset(name) {
    var p = PRESETS[name];
    if (!p) return;
    SETTINGS_SCHEMA.forEach(function (s) {
      if (p[s.key] !== undefined) {
        values[s.key] = p[s.key];
        lsSet('sortire_' + s.key, String(p[s.key]));
      }
    });
    notify(null);
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
            values[s.key] = val;
            lsSet('sortire_' + s.key, String(val));
          }
        }
      });
      notify(null);
      return true;
    } catch (e) {
      return false;
    }
  }

  var CODE_FORMAT = 1;

  var CODE_FIELDS = [
    ['woodgrain_enabled', 0, 1, 1],
    ['wood_type', 0, 11, 1],
    ['wood_vignette', 0, 0.6, 0.02],
    ['wood_sheen', 0, 1, 0.05],
    ['wood_sheen_anim', 0, 1, 1],
    ['wood_tilt', 0, 1, 1],
    ['disc_gloss', 0, 1, 0.05],
    ['wood_flood_ripple', 0, 1, 0.05],
    ['winner_flood', 0, 1, 1],
    ['marker_enabled', 0, 1, 1],
    ['winner_fade_ms', 0, 1500, 50],
    ['winner_grow_ms', 0, 2000, 50],
    ['marker_radius', 1, 2, 0.05],
    ['marker_stroke', 0, 20, 1],
    ['marker_dot', 0, 1, 0.05],
    ['flood_feather', 0, 200, 5],
    ['fx_shockwave', 0, 1, 1],
    ['fx_particles', 0, 200, 10],
    ['sound_enabled', 0, 1, 1],
    ['sound_style', 0, 9, 1],
    ['winner_bg_enabled', 0, 1, 1],
    ['random_hue', 0, 1, 1],
    ['base_hue', 0, 360, 5],
    ['bg_saturation', 0, 1, 0.05],
    ['bg_value', 0, 1, 0.02],
    ['saturation', 0, 1, 0.02],
    ['hue_step', 0, 360, 0.5],
    ['value_even', 0, 1, 0.02],
    ['value_odd', 0, 1, 0.02],
    ['radius', 20, 120, 2],
    ['pulse_amount', 0, 0.3, 0.01],
    ['pulse_speed', 0, 20, 0.5],
    ['countdown_ms', 500, 6000, 100],
    ['min_fingers', 1, 5, 1],
    ['reveal_gap_ms', 100, 1500, 50],
    ['ring_enabled', 0, 1, 1],
    ['ring_offset', 0, 40, 1],
    ['ring_stroke', 1, 20, 1],
    ['ring_opacity', 0, 1, 0.05],
    ['order_revealed_scale', 0.5, 2, 0.05],
    ['order_pop_amount', 0, 1, 0.05],
    ['order_pop_ms', 0, 1000, 25],
    ['order_pending_scale', 0, 1.5, 0.05],
    ['order_pending_alpha', 0, 1, 0.05],
    ['order_text_scale', 0.3, 2, 0.05],
    ['haptic_tap', 0, 1, 1],
    ['haptic_tick', 0, 1, 1],
    ['haptic_result', 0, 1, 1],
    ['hint_enabled', 0, 1, 1],
    ['hint_size', 12, 40, 1],
    ['hint_opacity', 0, 1, 0.05],
    ['winner_grow', 0, 1, 1],
    ['flood_ms', 0, 3000, 50],
    ['flood_grain', 0, 1, 0.05],
    ['rockgrain_enabled', 0, 1, 1],
    ['rock_type', 0, 4, 1]
  ];

  function fieldCount(f) { return Math.round((f[2] - f[1]) / f[3]); }

  function fieldBits(f) {
    var n = fieldCount(f), b = 1;
    while ((1 << b) < n + 1) b++;
    return b;
  }

  function crc8(bytes) {
    var c = 0;
    for (var i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (var j = 0; j < 8; j++) {
        c = (c & 0x80) ? (((c << 1) ^ 0x07) & 0xFF) : ((c << 1) & 0xFF);
      }
    }
    return c;
  }

  function toHex(bytes) {
    return bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('').toUpperCase();
  }

  function encode(getter) {
    getter = getter || get;
    var bytes = [CODE_FORMAT, CODE_FIELDS.length];
    var acc = 0, nacc = 0;
    CODE_FIELDS.forEach(function (f) {
      var n = fieldCount(f), bits = fieldBits(f);
      var q = Math.round((getter(f[0]) - f[1]) / f[3]);
      q = Math.max(0, Math.min(n, isNaN(q) ? 0 : q));
      for (var i = bits - 1; i >= 0; i--) {
        acc = (acc << 1) | ((q >> i) & 1);
        if (++nacc === 8) { bytes.push(acc); acc = 0; nacc = 0; }
      }
    });
    if (nacc > 0) bytes.push((acc << (8 - nacc)) & 0xFF);
    bytes.push(crc8(bytes));
    return toHex(bytes);
  }

  function decode(str) {
    var h = String(str == null ? '' : str).replace(/[\s\-_:]/g, '');
    if (!h) return { ok: false, error: 'Nothing to import' };
    if (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2) return { ok: false, error: 'That is not a settings code' };

    var bytes = [];
    for (var i = 0; i < h.length; i += 2) bytes.push(parseInt(h.substr(i, 2), 16));
    if (bytes.length < 4) return { ok: false, error: 'Code is too short' };

    var crc = bytes.pop();
    if (crc8(bytes) !== crc) return { ok: false, error: 'Code looks damaged (checksum mismatch)' };
    if (bytes[0] === 0) return { ok: false, error: 'Unknown code format' };
    if (bytes[0] > CODE_FORMAT) return { ok: false, error: 'Made by a newer version of Sortire. Update the app and try again.' };

    var count = bytes[1];
    var use = Math.min(count, CODE_FIELDS.length);
    var totalBits = bytes.length * 8;
    var pos = 16;
    var out = {};
    for (var k = 0; k < use; k++) {
      var f = CODE_FIELDS[k], bits = fieldBits(f), n = fieldCount(f);
      if (pos + bits > totalBits) return { ok: false, error: 'Code is incomplete' };
      var q = 0;
      for (var b = 0; b < bits; b++, pos++) {
        q = (q << 1) | ((bytes[pos >> 3] >> (7 - (pos & 7))) & 1);
      }
      if (q > n) q = n;
      out[f[0]] = parseFloat((f[1] + q * f[3]).toFixed(4));
    }
    return { ok: true, values: out, count: count, newer: count > CODE_FIELDS.length, missing: CODE_FIELDS.length - use };
  }

  function currentCode() { return encode(get); }

  function applyCode(str) {
    var d = decode(str);
    if (!d.ok) return d;
    SETTINGS_SCHEMA.forEach(function (s) {
      var v = d.values[s.key] !== undefined ? d.values[s.key] : s.def;
      values[s.key] = v;
      lsSet('sortire_' + s.key, String(v));
    });
    notify(null);
    return d;
  }

  function defaultCode() { return encode(function (k) { var s = schemaFor(k); return s ? s.def : 0; }); }

  function checkCodeFields() {
    var seen = {};
    CODE_FIELDS.forEach(function (f) { seen[f[0]] = f; });
    SETTINGS_SCHEMA.forEach(function (s) {
      var f = seen[s.key];
      var lo = s.isBool ? 0 : s.min, hi = s.isBool ? 1 : s.max, st = s.isBool ? 1 : s.step;
      if (!f) { console.warn('Settings: "' + s.key + '" is missing from CODE_FIELDS (append it at the end).'); return; }
      var onGrid = Math.abs(((st / f[3]) - Math.round(st / f[3]))) < 1e-9;
      if (lo < f[1] || hi > f[2] || !onGrid) {
        console.warn('Settings: range of "' + s.key + '" no longer fits its code field. Add a NEW CODE_FIELDS entry instead of editing the old one.');
      }
    });
  }

  var SAVED_KEY = 'sortire_saved_codes';

  function listSaved() {
    try {
      var arr = JSON.parse(lsGet(SAVED_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function writeSaved(arr) { lsSet(SAVED_KEY, JSON.stringify(arr)); }

  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function saveCode(name, code) {
    code = String(code || '').replace(/[\s\-_:]/g, '').toUpperCase();
    var d = decode(code);
    if (!d.ok) return d;
    var arr = listSaved();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].code === code) return { ok: false, error: 'Already saved as "' + arr[i].name + '"', existing: arr[i] };
    }
    var entry = { id: newId(), name: (String(name || '').trim() || 'Untitled').slice(0, 40), code: code, ts: Date.now() };
    arr.push(entry);
    writeSaved(arr);
    return { ok: true, entry: entry };
  }

  function renameSaved(id, name) {
    var arr = listSaved();
    arr.forEach(function (e) { if (e.id === id) e.name = (String(name || '').trim() || e.name).slice(0, 40); });
    writeSaved(arr);
  }

  function deleteSaved(id) {
    writeSaved(listSaved().filter(function (e) { return e.id !== id; }));
  }

  init();
  checkCodeFields();

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
    addChangeListener: addChangeListener,
    CODE_FORMAT: CODE_FORMAT,
    CODE_FIELDS: CODE_FIELDS,
    encode: encode,
    decode: decode,
    currentCode: currentCode,
    defaultCode: defaultCode,
    applyCode: applyCode,
    listSaved: listSaved,
    saveCode: saveCode,
    renameSaved: renameSaved,
    deleteSaved: deleteSaved
  };
})(typeof window !== 'undefined' ? window : this);
