/**
 * Settings code tests. Run from the repo root:   node tools/settings-codec.test.js
 *
 * The GOLDEN codes below were produced by released versions of the format. They must
 * keep decoding to exactly these values forever. If one of these fails, you broke
 * old codes: undo the change to CODE_FIELDS (it is append-only) instead of editing
 * the golden values.
 */
var assert = require('assert');
var path = require('path');

// Minimal in-memory localStorage so settings.js can run under node
var store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
var warnings = [];
var realWarn = console.warn;
console.warn = function (m) { warnings.push(m); };

var S = require(path.join(__dirname, '..', 'webapp', 'settings.js')).Settings;
var passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

// ── Golden codes (format 1). The 52-field ones predate the "Winner grows" switch. ──────────────────────────────────────
var GOLDEN = [
  {
    name: 'plain defaults',
    code: '01341B95C11196321260084D123CE89E5928000F079C5930C540E6FA9CF1',
    expect: { woodgrain_enabled: 0, wood_type: 3, radius: 60, countdown_ms: 2000, hue_step: 137.5,
              fx_particles: 0, pulse_amount: 0, ring_opacity: 0.9, hint_opacity: 0.7, hint_size: 22,
              bg_saturation: 0.45, bg_value: 0.14, saturation: 0.78, order_text_scale: 0.95 }
  }
  ,
  {
    name: 'woodgrain defaults',
    code: '01349B949C9180321266084D123CE89E5928000F079C5930C540E6FA9C5C',
    expect: { woodgrain_enabled: 1, wood_type: 3, wood_sheen_anim: 0, disc_gloss: 0.35, wood_flood_ripple: 0.2,
              winner_flood: 1, winner_grow_ms: 0, fx_shockwave: 1, fx_glow: 1, fx_particles: 0 }
  },
  {
    name: 'plain defaults (53 fields, with winner_grow)',
    code: '01351B95C11196321260084D123CE89E5928000F079C5930C540E6FA9D4C',
    expect: { woodgrain_enabled: 0, winner_grow: 1, winner_grow_ms: 1100, radius: 60 }
  },
  {
    name: 'woodgrain defaults (53 fields, with winner_grow)',
    code: '01359B949C9196321266084D123CE89E5928000F079C5930C540E6FA9CD8',
    expect: { woodgrain_enabled: 1, winner_grow: 0, winner_grow_ms: 1100, disc_gloss: 0.35,
              wood_flood_ripple: 0.2, wood_sheen_anim: 0, fx_particles: 0, fx_shockwave: 1, fx_glow: 1 }
  },
  {
    name: 'plain defaults (55 fields, with flood_ms / flood_grain)',
    code: '01371B95C11196321260084D123CE89E5928000F079C5930C540E6FA9D598002',
    expect: { woodgrain_enabled: 0, winner_grow: 1, flood_ms: 1100, flood_grain: 0.6 }
  },
  {
    name: 'woodgrain defaults (55 fields, with flood_ms / flood_grain)',
    code: '01379B949C9196321266084D123CE89E5928000F079C5930C540E6FA9C5980B7',
    expect: { woodgrain_enabled: 1, winner_grow: 0, flood_ms: 1100, flood_grain: 0.6, disc_gloss: 0.35 }
  }
];

console.log('Settings codec');

test('every schema setting has a code field', function () {
  assert.deepStrictEqual(warnings, [], warnings.join('\n'));
});

test('golden codes still decode to the same values', function () {
  GOLDEN.forEach(function (g) {
    var d = S.decode(g.code);
    assert.ok(d.ok, g.name + ': ' + d.error);
    Object.keys(g.expect).forEach(function (k) {
      assert.strictEqual(d.values[k], g.expect[k], g.name + ': ' + k);
    });
  });
});

test('defaults round-trip', function () {
  S.resetAll();
  var d = S.decode(S.currentCode());
  assert.ok(d.ok);
  S.SCHEMA.forEach(function (s) { assert.strictEqual(d.values[s.key], s.def, s.key); });
  assert.strictEqual(S.currentCode(), S.defaultCode());
});

test('both presets round-trip', function () {
  ['woodgrain', 'colors'].forEach(function (name) {
    S.resetAll(); S.applyPreset(name);
    var before = {};
    S.SCHEMA.forEach(function (s) { before[s.key] = S.get(s.key); });
    var code = S.currentCode();
    S.resetAll();
    assert.ok(S.applyCode(code).ok);
    S.SCHEMA.forEach(function (s) { assert.strictEqual(S.get(s.key), before[s.key], name + ' ' + s.key); });
  });
});

test('woodgrain preset gives the woodgrain default code', function () {
  S.resetAll(); S.applyPreset('woodgrain');
  assert.strictEqual(S.currentCode(), '01379B949C9196321266084D123CE89E5928000F079C5930C540E6FA9C5980B7');
});

test('a 53-field wood code (before flood_ms / flood_grain) applies with those at their defaults', function () {
  S.resetAll();
  var d = S.applyCode('01359B949C9196321266084D123CE89E5928000F079C5930C540E6FA9CD8');
  assert.ok(d.ok, d.error);
  assert.strictEqual(d.missing, 2);
  assert.strictEqual(S.get('flood_ms'), 1100);
  assert.strictEqual(S.get('flood_grain'), 0.6);
  assert.strictEqual(S.get('winner_grow'), 0);
  assert.strictEqual(S.get('disc_gloss'), 0.35);
});

test('the original 52-field wood code still gives the same wood look', function () {
  // That code predates the grow switch: grow time 0 meant off. Applying it must match
  // the current wood preset except for how "no grow" is expressed.
  var OLD = '01349B949C9180321266084D123CE89E5928000F079C5930C540E6FA9C5C';
  S.resetAll(); S.applyPreset('woodgrain');
  var preset = {};
  S.SCHEMA.forEach(function (s) { preset[s.key] = S.get(s.key); });
  S.resetAll();
  assert.ok(S.applyCode(OLD).ok);
  S.SCHEMA.forEach(function (s) {
    if (s.key === 'winner_grow' || s.key === 'winner_grow_ms') return;
    assert.strictEqual(S.get(s.key), preset[s.key], s.key);
  });
  var effective = function (grow, ms) { return grow ? ms : 0; };
  assert.strictEqual(effective(S.get('winner_grow'), S.get('winner_grow_ms')),
                     effective(preset.winner_grow, preset.winner_grow_ms));
});

test('switching wood -> colors restores the plain defaults (incl. winner grow)', function () {
  S.resetAll(); S.applyPreset('woodgrain');
  assert.strictEqual(S.get('winner_grow'), 0);
  S.applyPreset('colors');
  assert.strictEqual(S.currentCode(), S.defaultCode());
  assert.strictEqual(S.get('winner_grow'), 1);
  assert.strictEqual(S.get('winner_grow_ms'), 1100);
});

test('random on-grid values round-trip', function () {
  for (var n = 0; n < 200; n++) {
    var want = {};
    S.SCHEMA.forEach(function (s) {
      var lo = s.isBool ? 0 : s.min, hi = s.isBool ? 1 : s.max, st = s.isBool ? 1 : s.step;
      var steps = Math.round((hi - lo) / st);
      want[s.key] = parseFloat((lo + Math.floor(Math.random() * (steps + 1)) * st).toFixed(4));
    });
    var d = S.decode(S.encode(function (k) { return want[k]; }));
    assert.ok(d.ok);
    S.SCHEMA.forEach(function (s) { assert.strictEqual(d.values[s.key], want[s.key], s.key); });
  }
});

test('out-of-range values are clamped, not corrupted', function () {
  var d = S.decode(S.encode(function (k) { return k === 'radius' ? 9999 : (k === 'hint_size' ? -5 : S.get(k)); }));
  assert.strictEqual(d.values.radius, 120);
  assert.strictEqual(d.values.hint_size, 12);
});

// Independent packer: builds a code with only the first `count` fields, like an older app would
function packFirst(count, extraFieldBits) {
  var f = S.CODE_FIELDS, bytes = [1, count], acc = 0, nacc = 0;
  function bit(b) { acc = (acc << 1) | b; if (++nacc === 8) { bytes.push(acc); acc = 0; nacc = 0; } }
  for (var i = 0; i < Math.min(count, f.length); i++) {
    var n = Math.round((f[i][2] - f[i][1]) / f[i][3]), bits = 1;
    while ((1 << bits) < n + 1) bits++;
    var q = Math.round((S.get(f[i][0]) - f[i][1]) / f[i][3]);
    for (var b = bits - 1; b >= 0; b--) bit((q >> b) & 1);
  }
  for (var e = 0; e < (extraFieldBits || 0); e++) bit(1);
  if (nacc) bytes.push((acc << (8 - nacc)) & 0xFF);
  var c = 0;
  bytes.forEach(function (x) { c ^= x; for (var j = 0; j < 8; j++) c = (c & 0x80) ? (((c << 1) ^ 7) & 0xFF) : ((c << 1) & 0xFF); });
  bytes.push(c);
  return bytes.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('').toUpperCase();
}

test('an older, shorter code applies and fills the rest with defaults', function () {
  S.resetAll(); S.applyPreset('woodgrain'); S.set('radius', 80);
  var old = packFirst(30);
  S.resetAll();
  var d = S.applyCode(old);
  assert.ok(d.ok, d.error);
  assert.strictEqual(d.missing, S.CODE_FIELDS.length - 30);
  assert.strictEqual(d.newer, false);
  var last = S.CODE_FIELDS[S.CODE_FIELDS.length - 1][0];
  assert.strictEqual(S.get(last), S.SCHEMA.filter(function (s) { return s.key === last; })[0].def);
});

test('a newer, longer code still decodes (extra fields ignored)', function () {
  S.resetAll();
  var d = S.decode(packFirst(S.CODE_FIELDS.length + 3, 20));
  assert.ok(d.ok, d.error);
  assert.strictEqual(d.newer, true);
});

test('typed codes tolerate spaces, dashes and lowercase', function () {
  var code = S.defaultCode();
  var messy = code.toLowerCase().replace(/(.{4})/g, '$1 - ');
  assert.ok(S.decode(messy).ok);
});

test('damaged and nonsense codes are rejected', function () {
  var code = S.defaultCode();
  var flipped = code.slice(0, 20) + (code[20] === '0' ? '1' : '0') + code.slice(21);
  assert.strictEqual(S.decode(flipped).ok, false);
  assert.strictEqual(S.decode(code.slice(0, -2)).ok, false);
  assert.strictEqual(S.decode('hello world').ok, false);
  assert.strictEqual(S.decode('').ok, false);
  assert.strictEqual(S.decode('{"radius": 60}').ok, false);
});

test('saved codes: save, duplicate, rename, delete', function () {
  store = {};
  var a = S.saveCode('  My wood  ', S.defaultCode());
  assert.ok(a.ok);
  assert.strictEqual(a.entry.name, 'My wood');
  assert.strictEqual(S.saveCode('again', S.defaultCode()).ok, false);
  assert.strictEqual(S.saveCode('bad', 'XYZ').ok, false);
  S.renameSaved(a.entry.id, 'Renamed');
  assert.strictEqual(S.listSaved()[0].name, 'Renamed');
  S.deleteSaved(a.entry.id);
  assert.strictEqual(S.listSaved().length, 0);
});

console.warn = realWarn;
console.log(passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
