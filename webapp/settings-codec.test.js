// Run: node tools/settings-codec.test.js [path-to-webapp-folder]
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
var dir = process.argv[2] || path.join(__dirname, '..', 'webapp');
var src = fs.readFileSync(path.join(dir, 'settings.js'), 'utf8');

function fresh(storage) {
  storage = storage || {};
  var win = {
    localStorage: { getItem: function (k) { return k in storage ? storage[k] : null; }, setItem: function (k, v) { storage[k] = String(v); } },
    WoodGrain: { LABELS: new Array(12).fill('w') }, RockTexture: { LABELS: new Array(12).fill('r') },
    SoundManager: { STYLE_NAMES: new Array(10).fill('s') }
  };
  win.window = win;
  vm.runInNewContext(src, win);
  win.Settings._storage = storage;
  return win.Settings;
}

var n = 0;
function test(name, fn) { fn(); n++; console.log('ok  ' + name); }

test('built-in default codes match codes.txt', function () {
  var lines = fs.readFileSync(path.join(dir, 'codes.txt'), 'utf8').split('\n').filter(function (l) { return l && l[0] !== '#'; });
  assert.strictEqual(lines.length, 3);
  lines.forEach(function (l) {
    var S = fresh(), surface = S.decode(l).surface;
    S.setMode(surface);
    S.resetAll();
    assert.strictEqual(S.currentCode(), l, 'default for ' + surface);
  });
});

test('schema and CODE_FIELDS agree', function () {
  var S = fresh(), fields = {};
  S.CODE_FIELDS.forEach(function (f) { fields[f[0]] = f; });
  S.SCHEMA.forEach(function (sc) {
    if (sc.shared) { var f0 = fields[sc.key]; if (f0) assert.ok(sc.def >= f0[1] && sc.def <= f0[2], sc.key + ' default fits its code field'); return; }
    var f = fields[sc.key];
    assert.ok(f, sc.key + ' is in CODE_FIELDS');
    assert.ok(sc.min >= f[1] && sc.max <= f[2] && sc.step === f[3], sc.key + ' range matches its code field');
  });
});

test('random tunings round-trip on every surface', function () {
  ['COLOR', 'WOOD', 'STONE'].forEach(function (surface) {
    for (var i = 0; i < 25; i++) {
      var a = fresh(); a.setMode(surface); a.randomize();
      var code = a.currentCode(), b = fresh();
      assert.ok(b.applyCode(code).ok);
      assert.strictEqual(b.getMode(), surface);
      assert.strictEqual(b.currentCode(), code);
      a.SCHEMA.forEach(function (sc) { if (!sc.shared && !sc.hidden) assert.strictEqual(b.get(sc.key), a.get(sc.key), sc.key); });
    }
  });
});

test('older, shorter code still works (missing fields use defaults)', function () {
  var S = fresh(), code = S.currentCode(), old = code.slice(0, 45);
  var r = S.decode(old);
  assert.ok(r.ok);
  assert.strictEqual(r.data.disc_shadow, 0.5);
  assert.strictEqual(r.data.color_variety, 1);
  assert.strictEqual(r.data.wood_type, 4);
});

test('golden code decodes the same way forever', function () {
  var r = fresh().decode('RA7R3EKDQYRBQ4AQXIQSWBDPAAUSCHJGUIGQHKOIYYUMUIB');
  assert.strictEqual(r.surface, 'WOOD');
  assert.strictEqual(r.data.wood_type, 4);
  assert.strictEqual(r.data.wood_sheen, 0.15);
  assert.strictEqual(r.data.flood_feather, 15);
  assert.strictEqual(r.data.radius, 60);
  assert.strictEqual(r.data.disc_shadow, 0.5);
  assert.strictEqual(r.data.color_variety, 1);
});

test('bad codes are rejected with a message', function () {
  var S = fresh();
  ['', 'ABC', 'hello!', '0123456789ABC', 'A'.repeat(80), 'AAAAAAAAAAAAAAAAAAA'.replace(/A/g, 'B')].forEach(function (c) {
    var r = S.decode(c);
    if (c === 'BBBBBBBBBBBBBBBBBBB') { assert.ok(r.ok); return; }   // short but valid: older code
    assert.ok(!r.ok && r.error, JSON.stringify(c));
  });
  assert.ok(fresh().decode(fresh().currentCode().replace(/(.{4})/g, '$1 ')).ok, 'spaces are ignored');
});

test('each surface keeps its own settings; shared ones are shared', function () {
  var S = fresh();               // WOOD
  S.set('wood_sheen', 0.4); S.set('countdown_ms', 3000);
  S.setMode('STONE'); assert.strictEqual(S.get('wood_sheen'), 0.15);
  S.set('wood_sheen', 0.05);
  S.setMode('COLOR'); assert.strictEqual(S.get('pulse_amount'), 0.03);
  S.setMode('WOOD'); assert.strictEqual(S.get('wood_sheen'), 0.4);
  S.setMode('STONE'); assert.strictEqual(S.get('wood_sheen'), 0.05);
  assert.strictEqual(S.get('countdown_ms'), 3000);
});

test('settings survive a reload', function () {
  var S = fresh(); S.setMode('STONE'); S.set('rock_type', 7); S.setMode('WOOD'); S.set('wood_type', 2);
  var T = fresh(S._storage);
  assert.strictEqual(T.getMode(), 'WOOD'); assert.strictEqual(T.get('wood_type'), 2);
  T.setMode('STONE'); assert.strictEqual(T.get('rock_type'), 7);
});

test('old flat settings (both flags on) load as wood', function () {
  var S = fresh({ sortire_settings_v: '11', sortire_settings_json: JSON.stringify({ woodgrain_enabled: 1, rockgrain_enabled: 1, wood_type: 3 }) });
  assert.strictEqual(S.getMode(), 'WOOD'); assert.strictEqual(S.get('wood_type'), 3); assert.strictEqual(S.get('rockgrain_enabled'), 0);
});

test('saved tunings: per surface, rename, delete, bad code', function () {
  var S = fresh();
  assert.ok(S.saveCode('Mine', S.currentCode()).ok);
  assert.ok(!S.saveCode('x', 'nope!').ok);
  assert.strictEqual(S.listSaved('WOOD').length, 1); assert.strictEqual(S.listSaved('STONE').length, 0);
  var id = S.listSaved('WOOD')[0].id;
  S.renameSaved(id, 'Renamed'); assert.strictEqual(S.listSaved('WOOD')[0].name, 'Renamed');
  S.renameSaved(id, '  '); assert.strictEqual(S.listSaved('WOOD')[0].name, 'Renamed');
  S.deleteSaved(id); assert.strictEqual(S.listSaved('WOOD').length, 0);
});

test('applying a code from another surface switches surface, keeps shared settings', function () {
  var A = fresh(); A.setMode('COLOR'); A.randomize(); var code = A.currentCode();
  var B = fresh(); B.set('countdown_ms', 4000);
  assert.ok(B.applyCode(code).ok); assert.strictEqual(B.getMode(), 'COLOR'); assert.strictEqual(B.get('countdown_ms'), 4000);
});

console.log('\n' + n + ' tests passed');
