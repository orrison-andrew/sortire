/*
 * woodgrain.js: Wood species data and the wood texture shader.
 * Everything generic (GL plumbing, caches, discs, table layer) lives in
 * gl-util.js, material-set.js, disc.js and table-layer.js.
 *
 *   WoodGrain.SPECIES / SPECIES_KEYS      raw species data
 *   WoodGrain.<MaterialSet API>           KEYS, LABELS, getKey, getColors,
 *                                         getDiscCanvas, createBackground, ...
 */
(function (root) {
  'use strict';

  // light/dark = earlywood/latewood RGB, rings = growth ring frequency,
  // tilt < 1 stretches ring ellipses along grain, contrast = ring visibility,
  // fiber = fine cross-grain streaks, pores = open-grain dashes (oak),
  // rays = medullary ray flecks (oak), warp = FBM distortion strength.
  var SPECIES = {
    maple:       { label: 'Maple',       light: [236, 212, 170], dark: [204, 168, 116], rings: 14, tilt: 0.40, sharp: 2.2, contrast: 0.35, fiber: 0.10, pores: 0,    rays: 0,    warp: 0.10, tone: 0.04 },
    whiteOak:    { label: 'White oak',   light: [208, 183, 141], dark: [148, 116,  78], rings: 9,  tilt: 0.35, sharp: 2.6, contrast: 0.75, fiber: 0.12, pores: 0.5,  rays: 0.25, warp: 0.18, tone: 0.08 },
    redOak:      { label: 'Red oak',     light: [208, 152, 114], dark: [142,  84,  58], rings: 8,  tilt: 0.35, sharp: 2.6, contrast: 0.80, fiber: 0.12, pores: 0.6,  rays: 0.20, warp: 0.18, tone: 0.08 },
    walnut:      { label: 'Walnut',      light: [112,  78,  56], dark: [ 46,  29,  20], rings: 7,  tilt: 0.40, sharp: 2.4, contrast: 0.85, fiber: 0.16, pores: 0.2,  rays: 0,    warp: 0.25, tone: 0.10 },
    ebony:       { label: 'Ebony',       light: [ 66,  54,  45], dark: [ 13,  10,   9], rings: 5,  tilt: 0.45, sharp: 2.0, contrast: 0.45, fiber: 0.40, pores: 0,    rays: 0,    warp: 0.30, tone: 0.10 },
    purpleheart: { label: 'Purpleheart', light: [134,  72, 122], dark: [ 60,  27,  58], rings: 5,  tilt: 0.45, sharp: 2.0, contrast: 0.45, fiber: 0.22, pores: 0,    rays: 0,    warp: 0.12, tone: 0.06 },
    cherry:      { label: 'Cherry',      light: [196, 118,  84], dark: [140,  66,  42], rings: 8,  tilt: 0.38, sharp: 2.4, contrast: 0.55, fiber: 0.12, pores: 0,    rays: 0,    warp: 0.16, tone: 0.07 },
    pine:        { label: 'Pine',        light: [238, 212, 160], dark: [190, 140,  80], rings: 10, tilt: 0.30, sharp: 2.0, contrast: 0.60, fiber: 0.14, pores: 0,    rays: 0,    warp: 0.22, tone: 0.06 },
    mahogany:    { label: 'Mahogany',    light: [150,  80,  56], dark: [ 84,  38,  26], rings: 4,  tilt: 0.50, sharp: 1.8, contrast: 0.35, fiber: 0.30, pores: 0.15, rays: 0,    warp: 0.12, tone: 0.08 },
    padauk:      { label: 'Padauk',      light: [210,  86,  40], dark: [140,  40,  22], rings: 4,  tilt: 0.45, sharp: 2.0, contrast: 0.40, fiber: 0.20, pores: 0,    rays: 0,    warp: 0.10, tone: 0.06 },
    zebrawood:   { label: 'Zebrawood',   light: [224, 196, 150], dark: [ 58,  40,  28], rings: 16, tilt: 0.15, sharp: 3.0, contrast: 1.00, fiber: 0.08, pores: 0,    rays: 0,    warp: 0.10, tone: 0.05 },
    yellowheart: { label: 'Yellowheart', light: [236, 214,  96], dark: [190, 160,  50], rings: 5,  tilt: 0.42, sharp: 2.0, contrast: 0.40, fiber: 0.16, pores: 0,    rays: 0,    warp: 0.12, tone: 0.05 }
  };

  var SPECIES_KEYS = ['maple', 'whiteOak', 'redOak', 'walnut', 'ebony', 'purpleheart',
                      'cherry', 'pine', 'mahogany', 'padauk', 'zebrawood', 'yellowheart'];

  // Rings warped by FBM noise, fine fibers, oak pores and ray flecks, broad tone drift.
  var GEN_FRAG = [
    'uniform float uSize;',
    'uniform vec3  uLight, uDark;',
    'uniform float uRings, uTilt, uSharp, uContrast, uFiber, uPores, uRays, uWarp, uTone;',
    'uniform float uCx, uV0;',
    'uniform vec2  uOffA, uOffB, uOffC;',
    '',
    '// Float hash (no sine, no bit ops): stable across GPUs',
    'float hash(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    '',
    '// Smooth 2D value noise, 0..1',
    'float vnoise(vec2 p, vec2 off) {',
    '  p += off;',
    '  vec2 i = floor(p);',
    '  vec2 f = p - i;',
    '  float a = hash(i);',
    '  float b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0));',
    '  float d = hash(i + vec2(1.0, 1.0));',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;',
    '}',
    '',
    '// Fractal Brownian motion',
    'float fbm(vec2 p, vec2 off, int oct) {',
    '  float s = 0.0, amp = 0.5, tot = 0.0;',
    '  for (int i = 0; i < 3; i++) {',
    '    if (i >= oct) break;',
    '    s += amp * vnoise(p, off);',
    '    tot += amp;',
    '    p *= 2.0;',
    '    amp *= 0.5;',
    '  }',
    '  return s / tot;',
    '}',
    '',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / uSize;',
    '  float u = uv.x;',
    '  float v = 1.0 - uv.y;',
    '',
    '  // Growth rings: distance from the pith, warped by low-frequency FBM',
    '  float d = length(vec2(u - uCx, (v - uV0) * uTilt))',
    '          + (fbm(vec2(u * 2.5, v * 1.2), uOffA, 3) - 0.5) * uWarp;',
    '  float tk = d * uRings;',
    '  float k = floor(tk);',
    '  float f = tk - k;',
    '  // Earlywood is pale and gradual; latewood is dark and abrupt',
    '  float w = pow(max(f, 0.0001), uSharp) * (0.75 + 0.5 * vnoise(vec2(k * 1.7 + 0.3, 7.7), uOffB));',
    '',
    '  // Fine fibers: squashed across the grain, stretched along it',
    '  float fib = fbm(vec2(u * 160.0, v * 7.0), uOffB, 2) - 0.5;',
    '  float m = 0.35 + (w - 0.4) * uContrast * 1.6 + fib * uFiber * 2.0;',
    '  m = clamp(m, 0.0, 1.0);',
    '',
    '  // Broad tonal variation across the board',
    '  float tone = 1.0 + (fbm(vec2(u * 1.6, v * 1.2), uOffC, 3) - 0.5) * uTone * 2.0;',
    '  vec3 col = mix(uLight, uDark, m) * tone;',
    '',
    '  // Pores: short dark dashes in earlywood (oak)',
    '  if (uPores > 0.0) {',
    '    float pr = vnoise(vec2(u * 200.0, v * 14.0), uOffC);',
    '    if (pr > 0.78) {',
    '      col *= 1.0 - 0.55 * ((pr - 0.78) / 0.22) * uPores * (1.0 - f * 0.6);',
    '    }',
    '  }',
    '  // Medullary ray flecks: short light dashes across the grain (oak)',
    '  if (uRays > 0.0) {',
    '    float ry = vnoise(vec2(u * 8.0, v * 110.0), uOffA);',
    '    if (ry > 0.82) {',
    '      col += ((ry - 0.82) / 0.18) * uRays * 40.0 / 255.0;',
    '    }',
    '  }',
    '',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  var GEN_UNIFORMS = ['uSize', 'uLight', 'uDark', 'uRings', 'uTilt', 'uSharp', 'uContrast',
                      'uFiber', 'uPores', 'uRays', 'uWarp', 'uTone', 'uCx', 'uV0', 'uOffA', 'uOffB', 'uOffC'];

  var generator = GLUtil.createGenerator(GEN_FRAG, GEN_UNIFORMS, 'WoodGrain');

  function offsetFrom(rng) {
    return [Math.floor(rng() * 900) + 7, Math.floor(rng() * 900) + 7];
  }

  function generate(key, size, seed) {
    var sp = SPECIES[key];
    // Pith position from the seed; same seed -> same layout
    var r = GLUtil.mulberry32(seed * 7919 + key.length * 131);
    var cx = r() < 0.55 ? 0.15 + r() * 0.7 : (r() < 0.5 ? -0.4 - r() * 0.6 : 1.4 + r() * 0.6);
    var v0 = 0.2 + r() * 0.6;
    var nr = GLUtil.mulberry32(seed * 3 + 11);
    var oA = offsetFrom(nr), oB = offsetFrom(nr), oC = offsetFrom(nr);
    var l = GLUtil.rgb01(sp.light), d = GLUtil.rgb01(sp.dark);

    return generator.render(size, function (gl, loc) {
      gl.uniform1f(loc.uSize, size);
      gl.uniform3f(loc.uLight, l[0], l[1], l[2]);
      gl.uniform3f(loc.uDark, d[0], d[1], d[2]);
      gl.uniform1f(loc.uRings, sp.rings);
      gl.uniform1f(loc.uTilt, sp.tilt);
      gl.uniform1f(loc.uSharp, sp.sharp);
      gl.uniform1f(loc.uContrast, sp.contrast);
      gl.uniform1f(loc.uFiber, sp.fiber);
      gl.uniform1f(loc.uPores, sp.pores);
      gl.uniform1f(loc.uRays, sp.rays);
      gl.uniform1f(loc.uWarp, sp.warp);
      gl.uniform1f(loc.uTone, sp.tone);
      gl.uniform1f(loc.uCx, cx);
      gl.uniform1f(loc.uV0, v0);
      gl.uniform2f(loc.uOffA, oA[0], oA[1]);
      gl.uniform2f(loc.uOffB, oB[0], oB[1]);
      gl.uniform2f(loc.uOffC, oC[0], oC[1]);
    });
  }

  var labels = {};
  SPECIES_KEYS.forEach(function (k) { labels[k] = SPECIES[k].label; });

  var set = MaterialSet.create({
    keys: SPECIES_KEYS,
    labels: labels,
    colors: function (k) { return { light: SPECIES[k].light, dark: SPECIES[k].dark }; },
    generate: generate
  });

  set.SPECIES = SPECIES;
  set.SPECIES_KEYS = SPECIES_KEYS;
  root.WoodGrain = set;
})(typeof window !== 'undefined' ? window : this);
