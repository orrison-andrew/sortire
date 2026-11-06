/**
 * rocktexture.js: Stone types data and the stone texture shader (replaces rockgrain-gl.js).
 * Everything generic (GL plumbing, caches, discs, table layer) lives in
 * gl-util.js, material-set.js, disc.js and table-layer.js.
 *
 *   RockTexture.TYPES / ROCK_TYPES        raw stone data
 *   RockTexture.<MaterialSet API>         KEYS, LABELS, getKey, getColors,
 *                                         getDiscCanvas, createBackground, ...
 */
(function (root) {
  'use strict';

  // colorA/colorB = base blend, colorC = speckle colour, scale = feature size,
  // roughness = per-pixel grit, speckle = amount of flecks, foliation = layered banding
  var TYPES = {
    blueSlate: {
      label: 'Blue Slate',
      colorA: [65, 72, 78], colorB: [35, 38, 42], colorC: [105, 115, 122],
      scale: 2.2, roughness: 0.025, speckle: 0.3, foliation: 0.45
    },
    riverPebble: {
      label: 'River Pebble',
      colorA: [155, 168, 175], colorB: [90, 102, 112], colorC: [215, 220, 225],
      scale: 3.2, roughness: 0.04, speckle: 0.4, foliation: 0.0
    },
    warmTerracotta: {
      label: 'Warm Terracotta',
      colorA: [215, 135, 75], colorB: [155, 80, 40], colorC: [245, 185, 120],
      scale: 2.8, roughness: 0.03, speckle: 0.2, foliation: 0.05
    },
    speckledGranite: {
      label: 'Speckled Granite',
      colorA: [210, 205, 200], colorB: [55, 52, 50], colorC: [40, 35, 35],
      scale: 4.5, roughness: 0.06, speckle: 1.2, foliation: 0.0
    },
    darkBasalt: {
      label: 'Dark Basalt',
      colorA: [50, 53, 56], colorB: [22, 24, 27], colorC: [95, 100, 105],
      scale: 3.2, roughness: 0.05, speckle: 0.4, foliation: 0.2
    },
    obsidianGlass: {
      label: 'Obsidian Glass',
      colorA: [25, 22, 30], colorB: [10, 8, 12], colorC: [60, 55, 75],
      scale: 1.5, roughness: 0.005, speckle: 0.1, foliation: 0.3
    },
    roseQuartz: {
      label: 'Rose Quartz',
      colorA: [245, 210, 220], colorB: [220, 175, 190], colorC: [255, 250, 255],
      scale: 2.5, roughness: 0.02, speckle: 0.5, foliation: 0.0
    },
    lapisLazuli: {
      label: 'Lapis Lazuli',
      colorA: [30, 60, 140], colorB: [15, 30, 80], colorC: [210, 180, 70],
      scale: 3.0, roughness: 0.03, speckle: 0.8, foliation: 0.1
    },
    jadeite: {
      label: 'Jadeite',
      colorA: [100, 180, 130], colorB: [50, 120, 70], colorC: [160, 220, 180],
      scale: 2.8, roughness: 0.015, speckle: 0.4, foliation: 0.15
    },
    tigersEye: {
      label: 'Tiger\'s Eye',
      colorA: [180, 110, 20], colorB: [80, 40, 5], colorC: [240, 180, 60],
      scale: 2.0, roughness: 0.01, speckle: 0.5, foliation: 0.95
    },
    desertSandstone: {
      label: 'Desert Sandstone',
      colorA: [210, 120, 80], colorB: [160, 70, 40], colorC: [240, 180, 130],
      scale: 2.2, roughness: 0.05, speckle: 0.3, foliation: 0.75
    },
    amethyst: {
      label: 'Amethyst',
      colorA: [130, 80, 180], colorB: [70, 30, 100], colorC: [210, 170, 240],
      scale: 3.5, roughness: 0.07, speckle: 0.6, foliation: 0.1
    }
  };

  var ROCK_TYPES = [
    'blueSlate', 'riverPebble', 'warmTerracotta', 'speckledGranite', 'darkBasalt',
    'obsidianGlass', 'roseQuartz', 'lapisLazuli', 'jadeite', 'tigersEye',
    'desertSandstone', 'amethyst'
  ];

  // Simplex-noise FBM base with optional layered foliation (slate / tiger's eye banding)
  var GEN_FRAG = [
    'uniform vec3 uColorA, uColorB, uColorC;',
    'uniform float uScale, uRoughness, uSpeckle, uFoliation;',
    'uniform vec2 uOffA, uOffB, uSize;',
    '',
    'vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }',
    'float snoise(vec2 v) {',
    '  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);',
    '  vec2 i  = floor(v + dot(v, C.yy));',
    '  vec2 x0 = v -   i + dot(i, C.xx);',
    '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
    '  vec4 x12 = x0.xyxy + C.xxzz;',
    '  x12.xy -= i1;',
    '  i = mod289(i);',
    '  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));',
    '  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);',
    '  m = m*m; m = m*m;',
    '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
    '  vec3 h = abs(x) - 0.5;',
    '  vec3 ox = floor(x + 0.5);',
    '  vec3 a0 = x - ox;',
    '  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);',
    '  vec3 g; g.x  = a0.x  * x0.x  + h.x  * x0.y;',
    '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
    '  return 130.0 * dot(m, g);',
    '}',
    'float fbm(vec2 p, vec2 off) {',
    '  p += off;',
    '  float f = 0.0, amp = 0.5;',
    '  for (int i = 0; i < 4; i++) { f += amp * snoise(p); p *= 2.0; amp *= 0.5; }',
    '  return f * 0.5 + 0.5;',
    '}',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    '',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / uSize;',
    '  vec2 p = uv * uScale;',
    '',
    '  float slateGrain = 0.0;',
    '  if (uFoliation > 0.01) {',
    '    vec2 sp = vec2(p.x * 0.5, p.y * (14.0 + uFoliation * 10.0));',
    '    slateGrain = (fbm(sp, uOffA) - 0.5) * uFoliation * 1.5;',
    '  }',
    '',
    '  float n1 = fbm(p * 1.8 + vec2(0.0, slateGrain * 0.2), uOffA);',
    '  float n2 = fbm(p * 3.5 + vec2(slateGrain * 0.1, 0.0), uOffB);',
    '',
    '  vec3 col = mix(uColorA, uColorB, smoothstep(0.2, 0.8, n1 + slateGrain * 0.3));',
    '',
    '  float specks = smoothstep(0.6, 0.9, n2);',
    '  col = mix(col, uColorC, clamp((specks + n2 * 0.3) * uSpeckle, 0.0, 1.0));',
    '',
    '  float micro = (hash(gl_FragCoord.xy) - 0.5) * uRoughness;',
    '  gl_FragColor = vec4(clamp(col + vec3(micro), 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  var GEN_UNIFORMS = ['uColorA', 'uColorB', 'uColorC', 'uScale', 'uRoughness', 'uSpeckle',
                      'uFoliation', 'uOffA', 'uOffB', 'uSize'];

  var generator = GLUtil.createGenerator(GEN_FRAG, GEN_UNIFORMS, 'RockTexture');

  function generate(key, size, seed) {
    var t = TYPES[key];
    var rng = GLUtil.mulberry32(seed);
    var oA = [rng() * 1000, rng() * 1000], oB = [rng() * 1000, rng() * 1000];
    var a = GLUtil.rgb01(t.colorA), b = GLUtil.rgb01(t.colorB), c = GLUtil.rgb01(t.colorC);

    return generator.render(size, function (gl, loc) {
      gl.uniform2f(loc.uSize, size, size);
      gl.uniform3f(loc.uColorA, a[0], a[1], a[2]);
      gl.uniform3f(loc.uColorB, b[0], b[1], b[2]);
      gl.uniform3f(loc.uColorC, c[0], c[1], c[2]);
      gl.uniform1f(loc.uScale, t.scale);
      gl.uniform1f(loc.uRoughness, t.roughness);
      gl.uniform1f(loc.uSpeckle, t.speckle);
      gl.uniform1f(loc.uFoliation, t.foliation);
      gl.uniform2f(loc.uOffA, oA[0], oA[1]);
      gl.uniform2f(loc.uOffB, oB[0], oB[1]);
    });
  }

  var labels = {};
  ROCK_TYPES.forEach(function (k) { labels[k] = TYPES[k].label; });

  var set = MaterialSet.create({
    keys: ROCK_TYPES,
    labels: labels,
    colors: function (k) { return { light: TYPES[k].colorA, dark: TYPES[k].colorB }; },
    generate: generate
  });

  set.TYPES = TYPES;
  set.ROCK_TYPES = ROCK_TYPES;
  root.RockTexture = set;
})(typeof window !== 'undefined' ? window : this);
