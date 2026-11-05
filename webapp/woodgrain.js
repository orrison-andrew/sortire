/*
 * woodgrain.js: GPU woodgrain for Sortire (WebGL, no CPU fallback generator).
 *
 *   WoodGrain.SPECIES / SPECIES_KEYS
 *   WoodGrain.generate(species, size, seed)            -> <canvas>  (GPU-rendered texture)
 *   WoodGrain.getDiscCanvas(diameter, species, seed, shade) -> <canvas> (shaded puck)
 *   WoodGrain.createBackground(container)              -> live table layer
 *       .draw({ species, seed, table, flood, time, tiltX, tiltY, sheen, vignette })
 *   WoodGrain.createEffects(canvas)                    -> winner effects layer
 *       .trigger(x, y, opts) / .draw(now) / .stop() / .isActive()
 *   WoodGrain.getSpeciesKey(i) / getRandomSpecies() / getBaseColor(species)
 *
 * If WebGL (or high-precision float) is unavailable, textures fall back to a flat
 * light-to-dark gradient and the live layers switch themselves off.
 */
(function (root) {
  'use strict';

  // ── Species Presets ───────────────────────────────────────────────────────
  // light/dark = earlywood/latewood RGB, rings = growth ring frequency,
  // tilt < 1 stretches ring ellipses along grain, contrast = ring visibility,
  // fiber = fine cross-grain streaks, pores = open-grain dashes (oak),
  // rays = medullary ray flecks (oak), warp = FBM distortion strength.
  var SPECIES = {
    maple:       { label: 'Maple',       light: [236, 212, 170], dark: [204, 168, 116], rings: 14, tilt: 0.40, sharp: 2.2, contrast: 0.35, fiber: 0.10, pores: 0,   rays: 0,    warp: 0.10, tone: 0.04 },
    whiteOak:    { label: 'White oak',   light: [208, 183, 141], dark: [148, 116,  78], rings: 9,  tilt: 0.35, sharp: 2.6, contrast: 0.75, fiber: 0.12, pores: 0.5, rays: 0.25, warp: 0.18, tone: 0.08 },
    redOak:      { label: 'Red oak',     light: [208, 152, 114], dark: [142,  84,  58], rings: 8,  tilt: 0.35, sharp: 2.6, contrast: 0.80, fiber: 0.12, pores: 0.6, rays: 0.20, warp: 0.18, tone: 0.08 },
    walnut:      { label: 'Walnut',      light: [112,  78,  56], dark: [ 46,  29,  20], rings: 7,  tilt: 0.40, sharp: 2.4, contrast: 0.85, fiber: 0.16, pores: 0.2, rays: 0,    warp: 0.25, tone: 0.10 },
    ebony:       { label: 'Ebony',       light: [ 66,  54,  45], dark: [ 13,  10,   9], rings: 5,  tilt: 0.45, sharp: 2.0, contrast: 0.45, fiber: 0.40, pores: 0,   rays: 0,    warp: 0.30, tone: 0.10 },
    purpleheart: { label: 'Purpleheart', light: [134,  72, 122], dark: [ 60,  27,  58], rings: 5,  tilt: 0.45, sharp: 2.0, contrast: 0.45, fiber: 0.22, pores: 0,   rays: 0,    warp: 0.12, tone: 0.06 },
    cherry:      { label: 'Cherry',      light: [196, 118,  84], dark: [140,  66,  42], rings: 8,  tilt: 0.38, sharp: 2.4, contrast: 0.55, fiber: 0.12, pores: 0,   rays: 0,    warp: 0.16, tone: 0.07 },
    pine:        { label: 'Pine',        light: [238, 212, 160], dark: [190, 140,  80], rings: 10, tilt: 0.30, sharp: 2.0, contrast: 0.60, fiber: 0.14, pores: 0,   rays: 0,    warp: 0.22, tone: 0.06 },
    mahogany:    { label: 'Mahogany',    light: [150,  80,  56], dark: [ 84,  38,  26], rings: 4,  tilt: 0.50, sharp: 1.8, contrast: 0.35, fiber: 0.30, pores: 0.15, rays: 0,   warp: 0.12, tone: 0.08 },
    padauk:      { label: 'Padauk',      light: [210,  86,  40], dark: [140,  40,  22], rings: 4,  tilt: 0.45, sharp: 2.0, contrast: 0.40, fiber: 0.20, pores: 0,   rays: 0,    warp: 0.10, tone: 0.06 },
    zebrawood:   { label: 'Zebrawood',   light: [224, 196, 150], dark: [ 58,  40,  28], rings: 16, tilt: 0.15, sharp: 3.0, contrast: 1.00, fiber: 0.08, pores: 0,   rays: 0,    warp: 0.10, tone: 0.05 },
    yellowheart: { label: 'Yellowheart', light: [236, 214,  96], dark: [190, 160,  50], rings: 5,  tilt: 0.42, sharp: 2.0, contrast: 0.40, fiber: 0.16, pores: 0,   rays: 0,    warp: 0.12, tone: 0.05 }
  };

  var SPECIES_KEYS = ['maple', 'whiteOak', 'redOak', 'walnut', 'ebony', 'purpleheart',
                      'cherry', 'pine', 'mahogany', 'padauk', 'zebrawood', 'yellowheart'];

  var DISC_SIZE = 1024;   // shared per-species atlas that disc faces crop from
  var BG_SIZE   = 2048;   // table texture

  // ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────
  function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function warn(msg, e) {
    if (typeof console !== 'undefined') console.warn('WoodGrain: ' + msg, (e && e.message) || e || '');
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  WebGL helpers
  // ═════════════════════════════════════════════════════════════════════════
  var VERT = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';
  var QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);   // triangle strip

  function getGL(canvas, attrs) {
    var gl = null;
    try { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); } catch (e) {}
    return gl;
  }

  // The shaders need 23-bit float precision (noise lattice, projection maths).
  // A few old Android GPUs only offer medium precision and would render garbage, so
  // treat those as unsupported instead of showing broken output.
  function hasHighp(gl) {
    var f = gl.getShaderPrecisionFormat && gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    return !!(f && f.precision >= 23);
  }

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('shader compile failed: ' + log);
    }
    return sh;
  }

  function buildProgram(gl, vsSrc, fsSrc, uniforms, attribs) {
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
    (attribs || []).forEach(function (n, i) { gl.bindAttribLocation(prog, i, n); });
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('program link failed: ' + gl.getProgramInfoLog(prog));
    }
    var loc = {};
    uniforms.forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
    return { prog: prog, loc: loc };
  }

  function rgb01(arr) { return [arr[0] / 255, arr[1] / 255, arr[2] / 255]; }

  // ═════════════════════════════════════════════════════════════════════════
  //  Texture generator (offscreen WebGL → plain 2D canvas)
  // ═════════════════════════════════════════════════════════════════════════
  // Rings warped by FBM noise, fine fibers, oak pores and ray flecks, broad tone drift.
  var GEN_FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    '',
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

  var gen = null;
  var genFailed = false;

  function initGen() {
    if (gen && gen.gl && !gen.gl.isContextLost()) return gen;
    gen = null;
    if (genFailed) return null;
    try {
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      var gl = getGL(canvas, { antialias: false, alpha: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error('WebGL not available');
      if (!hasHighp(gl)) throw new Error('GPU lacks high-precision floats');
      var P = buildProgram(gl, VERT, GEN_FRAG, GEN_UNIFORMS, ['aPos']);
      gl.useProgram(P.prog);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      var dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      var maxSize = Math.min(dims ? dims[0] : 2048, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 2048);
      // A lost context is rebuilt on the next generate() call
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); gen = null; }, false);
      gen = { gl: gl, canvas: canvas, P: P, maxSize: maxSize };
      return gen;
    } catch (e) {
      genFailed = true;
      warn('GPU generator unavailable, using flat colour textures.', e);
      return null;
    }
  }

  function offsetFrom(rng) {
    return [Math.floor(rng() * 900) + 7, Math.floor(rng() * 900) + 7];
  }

  function generateGL(name, size, seed) {
    var g = initGen();
    if (!g || size > g.maxSize) return null;
    var gl = g.gl, loc = g.P.loc;
    try {
      var sp = SPECIES[name] || SPECIES.walnut;

      // Pith position from the seed; same seed → same layout
      var r = mulberry32(seed * 7919 + name.length * 131);
      var cx = r() < 0.55 ? 0.15 + r() * 0.7 : (r() < 0.5 ? -0.4 - r() * 0.6 : 1.4 + r() * 0.6);
      var v0 = 0.2 + r() * 0.6;
      var nr = mulberry32(seed * 3 + 11);
      var oA = offsetFrom(nr), oB = offsetFrom(nr), oC = offsetFrom(nr);

      g.canvas.width = g.canvas.height = size;
      gl.viewport(0, 0, size, size);
      gl.useProgram(g.P.prog);
      var l = rgb01(sp.light), d = rgb01(sp.dark);
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
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Copy to a normal 2D canvas: cacheable, drawImage-able, immune to context loss
      var out = document.createElement('canvas');
      out.width = out.height = size;
      out.getContext('2d').drawImage(g.canvas, 0, 0);
      return out;
    } catch (e) {
      warn('texture generation failed', e);
      return null;
    }
  }

  // Last-resort texture when WebGL is unavailable: vertical light→dark gradient
  function flatTexture(name, size) {
    var sp = SPECIES[name] || SPECIES.walnut;
    var c = document.createElement('canvas');
    c.width = c.height = Math.min(size, 256);
    var x = c.getContext('2d');
    var gr = x.createLinearGradient(0, 0, 0, c.height);
    gr.addColorStop(0, 'rgb(' + sp.light.join(',') + ')');
    gr.addColorStop(1, 'rgb(' + sp.dark.join(',') + ')');
    x.fillStyle = gr;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function generate(name, size, seed) {
    name = SPECIES[name] ? name : 'walnut';
    size = size || 1024;
    seed = seed || 1;
    return generateGL(name, size, seed) || flatTexture(name, size);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Texture caches
  // ═════════════════════════════════════════════════════════════════════════
  // Disc atlas: ONE texture per species; every disc crops from it
  var discTexCache = {};
  function getDiscTexture(speciesKey) {
    if (!discTexCache[speciesKey]) discTexCache[speciesKey] = generate(speciesKey, DISC_SIZE, 42);
    return discTexCache[speciesKey];
  }

  // Table texture: small LRU (2048² RGBA ≈ 16 MB each)
  var bgTexCache = {};
  var bgTexOrder = [];
  var BG_CACHE_MAX = 3;
  function getMasterTexture(speciesKey, seed) {
    speciesKey = SPECIES[speciesKey] ? speciesKey : 'walnut';
    seed = (seed || 42) | 0;
    var key = speciesKey + '_' + seed;
    var i = bgTexOrder.indexOf(key);
    if (i !== -1) {
      bgTexOrder.splice(i, 1);
      bgTexOrder.push(key);
      return bgTexCache[key];
    }
    bgTexCache[key] = generate(speciesKey, BG_SIZE, seed);
    bgTexOrder.push(key);
    while (bgTexOrder.length > BG_CACHE_MAX) {
      var old = bgTexOrder.shift();
      if (bgTexCache[old]) bgTexCache[old].width = bgTexCache[old].height = 0;
      delete bgTexCache[old];
    }
    return bgTexCache[key];
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Wooden disc (2D canvas puck)
  // ═════════════════════════════════════════════════════════════════════════
  // Edge darkening, rim and bevel are baked in. The glossy highlight is NOT: app.js
  // draws it live so it can follow the device tilt.
  function drawShading(ctx, r, diameter) {
    var TAU = Math.PI * 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r, 0, TAU);
    ctx.clip();
    var edgeGrad = ctx.createRadialGradient(r, r, r * 0.55, r, r, r);
    edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, diameter, diameter);
    ctx.restore();

    ctx.lineWidth   = r * 0.05;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(r, r, r - ctx.lineWidth / 2, 0, TAU);
    ctx.stroke();

    ctx.lineWidth   = r * 0.03;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(r, r, r * 0.93, 0, TAU);
    ctx.stroke();
  }

  var discCache = {};

  /**
   * @param {number} diameter   Physical px (baseRadius × 2 × dpr × 1.5)
   * @param {string} species
   * @param {number} seed       Per-disc: crop origin and rotation only
   * @param {number} [shadeShift]  -0.25..+0.25 darkens/lightens the face
   */
  function getDiscCanvas(diameter, species, seed, shadeShift) {
    diameter   = Math.max(32, diameter | 0);
    species    = SPECIES[species] ? species : 'walnut';
    seed       = (seed || 1) | 0;
    shadeShift = shadeShift || 0;

    var cacheKey = species + '_' + diameter + '_' + seed + '_' + shadeShift.toFixed(2);
    if (discCache[cacheKey]) return discCache[cacheKey];

    var tex  = getDiscTexture(species);
    var rand = mulberry32(seed * 3571 + diameter);
    var TAU  = Math.PI * 2;

    var c   = document.createElement('canvas');
    c.width = c.height = diameter;
    var ctx = c.getContext('2d');
    var r   = diameter / 2;

    // Wood face: random rotated crop (55% window) of the species atlas
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r, 0, TAU);
    ctx.clip();
    ctx.translate(r, r);
    ctx.rotate(rand() * TAU);
    var sw = tex.width * 0.55;
    var ox = rand() * (tex.width  - sw);
    var oy = rand() * (tex.height - sw);
    ctx.drawImage(tex, ox, oy, sw, sw, -r, -r, 2 * r, 2 * r);
    ctx.restore();

    if (shadeShift !== 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r, 0, TAU);
      ctx.clip();
      ctx.fillStyle = shadeShift < 0
        ? 'rgba(0,0,0,' + Math.min(0.6, -shadeShift).toFixed(3) + ')'
        : 'rgba(255,255,255,' + Math.min(0.6, shadeShift).toFixed(3) + ')';
      ctx.fillRect(0, 0, diameter, diameter);
      ctx.restore();
    }

    drawShading(ctx, r, diameter);
    discCache[cacheKey] = c;
    return c;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Live table layer (WebGL canvas inside a container element)
  // ═════════════════════════════════════════════════════════════════════════
  // One shader draws the whole table every frame:
  //   - the cached grain texture, cover-fitted to the screen
  //   - recolour of that grain to another species (colour AND brightness)
  //   - the winner flood: a feathered, rippling circle that reveals the WINNER'S OWN
  //     grain (a second texture: its species and its own seed, so the rings and pith
  //     land somewhere else). The front bends along that grain's growth rings.
  //     (Without a flood seed it falls back to recolouring the table grain.)
  //   - varnish sheen that follows tilt / drifts slowly
  //   - vignette
  var BG_FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform sampler2D uTex, uTex2;',
    'uniform vec2 uRes, uOrigin, uDraw, uFloodC, uTilt;',
    'uniform vec3 uSrcL, uSrcD, uTabL, uTabD, uFlL, uFlD;',
    'uniform float uTabOn, uFloodOn, uFloodTex, uFloodR, uFloodF, uRipple, uGrain, uTime, uSheen, uVig;',
    '',
    '// Re-colour a pixel of species S to species T, keeping the grain',
    'vec3 recolor(vec3 c, vec3 sL, vec3 sD, vec3 tL, vec3 tD) {',
    '  vec3 d = sD - sL;',
    '  float m = clamp(dot(c - sL, d) / max(dot(d, d), 0.00001), 0.0, 1.0);',
    '  vec3 a = sL + d * m;',
    '  float k = clamp((c.r + c.g + c.b) / max(a.r + a.g + a.b, 0.0001), 0.8, 1.25);',
    '  return (tL + (tD - tL) * m) * k;',
    '}',
    '',
    'void main() {',
    '  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);',
    '  vec2 tc = (p - uOrigin) / uDraw;',
    '  vec3 tex = texture2D(uTex, tc).rgb;',
    '  vec3 col = tex;',
    '  if (uTabOn > 0.5) col = recolor(tex, uSrcL, uSrcD, uTabL, uTabD);',
    '',
    '  if (uFloodOn > 0.5) {',
    '    vec2 dv = p - uFloodC;',
    '    float dist = length(dv);',
    '    float ang = atan(dv.y, dv.x + 0.0001);',
    '    float f = max(uFloodF, 1.0);',
    '    vec3 fl;',
    '    float gEdge = 0.0;',
    '    if (uFloodTex > 0.5) {',
    '      // The winner brings its own grain. Sampling a blurred mip gives ring-scale',
    '      // brightness (not fibre noise): the front runs ahead on pale earlywood and',
    '      // lags on dark latewood, so it follows the rings.',
    '      fl = texture2D(uTex2, tc).rgb;',
    '      float gLum = dot(texture2D(uTex2, tc, 4.0).rgb, vec3(0.299, 0.587, 0.114));',
    '      gEdge = (gLum - 0.5) * uGrain * f * 2.4;',
    '    } else {',
    '      fl = recolor(tex, uSrcL, uSrcD, uFlL, uFlD);',
    '    }',
    '    float edge = uFloodR + gEdge + uRipple * 0.25 * f * sin(ang * 9.0 + uTime * 5.0);',
    '    float mask = 1.0 - smoothstep(edge - f, edge, dist);',
    '    col = mix(col, fl, mask);',
    '    float q = (dist - (edge - f * 0.5)) / max(f * 0.6, 1.0);',
    '    col += exp(-q * q) * uRipple * 0.12;',
    '  }',
    '',
    '  // Varnish sheen: soft highlight that follows tilt, brighter where grain is pale',
    '  float lum = dot(col, vec3(0.299, 0.587, 0.114));',   // col, so the sheen follows the winner's grain inside the flood
    '  vec2 q2 = p / uRes;',
    '  vec2 c = vec2(0.5 + uTilt.x * 0.40 + 0.10 * sin(uTime * 0.7), 0.35 + uTilt.y * 0.30 + 0.06 * cos(uTime * 0.5));',
    '  vec2 dq = (q2 - c) * vec2(1.0, uRes.y / uRes.x);',
    '  float g = exp(-dot(dq, dq) / 0.08);',
    '  float sy = (q2.y - c.y) * 3.0;',
    '  float streak = exp(-sy * sy) * 0.35;',
    '  col += (g * 0.7 + streak * g) * uSheen * 0.35 * (0.55 + 0.9 * lum) * vec3(1.0, 0.97, 0.90);',
    '',
    '  vec2 pc = p - uRes * 0.5;',
    '  float r0 = min(uRes.x, uRes.y) * 0.3;',
    '  float r1 = max(uRes.x, uRes.y) * 0.75;',
    '  float vv = clamp((length(pc) - r0) / (r1 - r0), 0.0, 1.0);',
    '  col *= 1.0 - uVig * vv;',
    '',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  var BG_UNIFORMS = ['uTex', 'uTex2', 'uRes', 'uOrigin', 'uDraw', 'uSrcL', 'uSrcD', 'uTabL', 'uTabD', 'uTabOn',
                     'uFlL', 'uFlD', 'uFloodOn', 'uFloodTex', 'uFloodC', 'uFloodR', 'uFloodF', 'uRipple', 'uGrain',
                     'uTime', 'uTilt', 'uSheen', 'uVig'];

  /**
   * draw(state):
   *   species, seed   table grain
   *   table           species key to recolour the table to, or null (natural)
   *   flood           in CSS px, or null:
   *                   { x, y, r, feather, ripple,
   *                     species, seed,   the winner's own grain (preferred), or
   *                     target,          just a species to recolour the table grain to
   *                     grain }          0..1 how strongly the front follows the new grain's rings
   *                   Pass r large enough to cover the screen at the end:
   *                   far + feather * (1.3 + 1.25 * grain).
   *   time            seconds (sheen drift, edge ripple)
   *   tiltX, tiltY    -1..1
   *   sheen, vignette 0..1
   * Returns false if the GPU layer is unavailable.
   */
  function createBackground(container) {
    var cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;';
    container.innerHTML = '';
    container.appendChild(cv);

    var L = { onRestore: null, available: true };
    var gl = null, P = null, buf = null, tex = null, texKey = '', tw = 1, th = 1;
    var tex2 = null, tex2Key = '', tw2 = 1, th2 = 1;      // the winner's grain
    var failed = false, lost = false;

    function build() {
      gl = getGL(cv, { alpha: false, antialias: false });
      if (!gl) throw new Error('WebGL not available');
      if (!hasHighp(gl)) throw new Error('GPU lacks high-precision floats');
      P = buildProgram(gl, VERT, BG_FRAG, BG_UNIFORMS, ['aPos']);
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
      tex = null;
      texKey = '';
      tex2 = null;
      tex2Key = '';
    }

    try {
      build();
    } catch (e) {
      failed = true;
      L.available = false;
      warn('table layer unavailable, using flat background.', e);
      container.style.background = 'rgb(' + SPECIES.walnut.dark.join(',') + ')';
    }

    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; }, false);
    cv.addEventListener('webglcontextrestored', function () {
      try { build(); lost = false; if (L.onRestore) L.onRestore(); }
      catch (e) { failed = true; L.available = false; warn('could not restore table layer', e); }
    }, false);

    // Upload a canvas as a new texture. Returns { t, w, h }.
    function makeTexture(src) {
      gl.activeTexture(gl.TEXTURE0);
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      var w = src.width, h = src.height;
      var pot = (w & (w - 1)) === 0 && (h & (h - 1)) === 0;
      if (pot) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, pot ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return { t: t, w: w, h: h };
    }

    L.draw = function (s) {
      if (failed || lost || !gl || gl.isContextLost()) return false;
      try {
        var dpr = window.devicePixelRatio || 1;
        var w = container.offsetWidth || window.innerWidth;
        var h = container.offsetHeight || window.innerHeight;
        var pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
        if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
        gl.viewport(0, 0, pw, ph);

        var species = SPECIES[s.species] ? s.species : 'walnut';
        var key = species + '_' + ((s.seed || 42) | 0);
        gl.useProgram(P.prog);
        if (key !== texKey || !tex) {
          if (tex2 && key === tex2Key) {
            // The winner's grain is becoming the table: swap, no regeneration or re-upload
            var t0 = tex, w0 = tw, h0 = th, k0 = texKey;
            tex = tex2; tw = tw2; th = th2; texKey = tex2Key;
            tex2 = t0; tw2 = w0; th2 = h0; tex2Key = k0;
          } else {
            if (tex) gl.deleteTexture(tex);
            var m = makeTexture(getMasterTexture(species, s.seed));
            tex = m.t; tw = m.w; th = m.h; texKey = key;
          }
        }

        // The winner's own grain (second texture), generated on the GPU the first time it is needed
        var fl = s.flood;
        var own = !!(fl && fl.species && SPECIES[fl.species] && fl.seed !== undefined);
        if (own) {
          var fkey = fl.species + '_' + (fl.seed | 0);
          if (fkey !== tex2Key || !tex2) {
            if (tex2) gl.deleteTexture(tex2);
            var m2 = makeTexture(getMasterTexture(fl.species, fl.seed));
            tex2 = m2.t; tw2 = m2.w; th2 = m2.h; tex2Key = fkey;
          }
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(P.loc.uTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, (own && tex2) ? tex2 : tex);   // never leave the unit empty
        gl.uniform1i(P.loc.uTex2, 1);
        gl.activeTexture(gl.TEXTURE0);

        // Cover-fit the texture to the screen
        var scale = Math.max(pw / tw, ph / th);
        var dw = tw * scale, dh = th * scale;
        gl.uniform2f(P.loc.uRes, pw, ph);
        gl.uniform2f(P.loc.uOrigin, (pw - dw) / 2, (ph - dh) / 2);
        gl.uniform2f(P.loc.uDraw, dw, dh);

        var src = SPECIES[species], c;
        c = rgb01(src.light); gl.uniform3f(P.loc.uSrcL, c[0], c[1], c[2]);
        c = rgb01(src.dark);  gl.uniform3f(P.loc.uSrcD, c[0], c[1], c[2]);

        var tab = SPECIES[s.table];
        gl.uniform1f(P.loc.uTabOn, tab ? 1 : 0);
        c = rgb01((tab || src).light); gl.uniform3f(P.loc.uTabL, c[0], c[1], c[2]);
        c = rgb01((tab || src).dark);  gl.uniform3f(P.loc.uTabD, c[0], c[1], c[2]);

        var ft = fl && SPECIES[fl.species || fl.target];
        gl.uniform1f(P.loc.uFloodOn, ft ? 1 : 0);
        gl.uniform1f(P.loc.uFloodTex, own ? 1 : 0);
        gl.uniform1f(P.loc.uGrain, own ? Math.max(0, Math.min(1, fl.grain || 0)) : 0);
        c = rgb01((ft || src).light); gl.uniform3f(P.loc.uFlL, c[0], c[1], c[2]);
        c = rgb01((ft || src).dark);  gl.uniform3f(P.loc.uFlD, c[0], c[1], c[2]);
        gl.uniform2f(P.loc.uFloodC, ft ? fl.x * dpr : 0, ft ? fl.y * dpr : 0);
        gl.uniform1f(P.loc.uFloodR, ft ? fl.r * dpr : 0);
        gl.uniform1f(P.loc.uFloodF, ft ? Math.max(1, (fl.feather || 0) * dpr) : 1);
        gl.uniform1f(P.loc.uRipple, ft ? (fl.ripple || 0) : 0);

        gl.uniform1f(P.loc.uTime, s.time || 0);
        gl.uniform2f(P.loc.uTilt, s.tiltX || 0, s.tiltY || 0);
        gl.uniform1f(P.loc.uSheen, s.sheen || 0);
        gl.uniform1f(P.loc.uVig, s.vignette || 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return true;
      } catch (e) {
        failed = true;
        L.available = false;
        warn('table layer draw failed', e);
        return false;
      }
    };

    return L;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Winner effects layer (transparent WebGL canvas above the arena)
  // ═════════════════════════════════════════════════════════════════════════
  // Shockwave ring (full-screen quad) and a particle burst (GL points).
  var FX_FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform vec2 uResPx, uC;',
    'uniform float uDpr, uT, uShock;',
    'uniform vec3 uColor;',
    'void main() {',
    '  vec2 p = vec2(gl_FragCoord.x, uResPx.y - gl_FragCoord.y) / uDpr;',
    '  float d = length(p - uC);',
    '  float a = 0.0;',
    '  if (uShock > 0.5 && uT < 0.9) {',
    '    float R = 40.0 + 520.0 * (1.0 - exp(-uT * 3.2));',
    '    float w = 14.0 + 26.0 * uT;',
    '    float q = (d - R) / w;',
    '    a += exp(-q * q) * (1.0 - uT / 0.9) * 0.6;',
    '  }',
    '  a = clamp(a, 0.0, 1.0);',
    '  vec3 c = mix(uColor, vec3(1.0), 0.3);',
    '  gl_FragColor = vec4(c * a, a);',
    '}'
  ].join('\n');

  var PART_VERT = [
    'attribute vec4 aP;',            // x angle, y speed, z size, w colour mix
    'uniform vec2 uC, uRes;',        // burst centre / viewport, CSS px
    'uniform float uT, uDpr;',
    'uniform vec3 uColA, uColB;',
    'varying vec4 vCol;',
    'void main() {',
    '  vec2 dir = vec2(cos(aP.x), sin(aP.x));',
    '  float k = 3.0;',
    '  vec2 pos = uC + dir * aP.y * (1.0 - exp(-k * uT)) / k + vec2(0.0, 220.0 * uT * uT);',
    '  float life = clamp(1.0 - uT / 1.5, 0.0, 1.0);',
    '  gl_Position = vec4(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0, 0.0, 1.0);',
    '  gl_PointSize = aP.z * uDpr * (0.4 + 0.6 * life);',
    '  vCol = vec4(mix(uColA, uColB, aP.w) * life, life);',
    '}'
  ].join('\n');

  var PART_FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec4 vCol;',
    'void main() {',
    '  float d = length(gl_PointCoord - vec2(0.5));',
    '  float m = 1.0 - smoothstep(0.35, 0.5, d);',
    '  gl_FragColor = vCol * m;',
    '}'
  ].join('\n');

  var FX_DURATION = 1.8;   // seconds

  function createEffects(cv) {
    var L = { onRestore: null, available: true };
    var gl = null, Q = null, PR = null, quadBuf = null, pBuf = null;
    var failed = false, lost = false;
    var st = { active: false, t0: 0, x: 0, y: 0, color: [1, 1, 1], shock: true,
               n: 0, colA: [1, 1, 1], colB: [1, 1, 1] };

    function build() {
      gl = getGL(cv, { alpha: true, premultipliedAlpha: true, antialias: false });
      if (!gl) throw new Error('WebGL not available');
      if (!hasHighp(gl)) throw new Error('GPU lacks high-precision floats');
      Q = buildProgram(gl, VERT, FX_FRAG, ['uResPx', 'uC', 'uDpr', 'uT', 'uShock', 'uColor'], ['aPos']);
      PR = buildProgram(gl, PART_VERT, PART_FRAG, ['uC', 'uRes', 'uT', 'uDpr', 'uColA', 'uColB'], ['aP']);
      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
      pBuf = gl.createBuffer();
      st.n = 0;       // particle buffer contents are gone after a rebuild
    }

    try {
      build();
    } catch (e) {
      failed = true;
      L.available = false;
      warn('effects layer unavailable (effects disabled).', e);
    }

    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; st.active = false; }, false);
    cv.addEventListener('webglcontextrestored', function () {
      try { build(); lost = false; if (L.onRestore) L.onRestore(); }
      catch (e) { failed = true; L.available = false; }
    }, false);

    function clear() {
      if (failed || lost || !gl || gl.isContextLost()) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    function toArr(c, fallback) {
      return c ? [c.r / 255, c.g / 255, c.b / 255] : fallback;
    }

    /**
     * opts: color {r,g,b} for the ring, shock (bool), particles (count),
     *       colA / colB {r,g,b} particle colours
     */
    L.trigger = function (x, y, opts) {
      if (failed || lost || !gl || gl.isContextLost()) return;
      opts = opts || {};
      st.active = true;
      st.t0 = performance.now();
      st.x = x; st.y = y;
      st.color = toArr(opts.color, [1, 1, 1]);
      st.shock = !!opts.shock;
      st.colA = toArr(opts.colA, st.color);
      st.colB = toArr(opts.colB, st.color);

      var n = Math.max(0, Math.min(400, (opts.particles | 0)));
      st.n = n;
      if (n > 0) {
        var arr = new Float32Array(n * 4);
        for (var i = 0; i < n; i++) {
          arr[i * 4]     = Math.random() * Math.PI * 2;    // angle
          arr[i * 4 + 1] = 120 + Math.random() * 320;      // speed, px/s
          arr[i * 4 + 2] = 3 + Math.random() * 6;          // size, px
          arr[i * 4 + 3] = Math.random();                  // colour mix
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, pBuf);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
      }
    };

    L.isActive = function () { return st.active && !failed && !lost; };

    L.stop = function () {
      if (!st.active) return;
      st.active = false;
      clear();
    };

    // Returns true while the effect is still running (caller keeps animating)
    L.draw = function (now) {
      if (failed || lost || !gl || gl.isContextLost() || !st.active) return false;
      try {
        var dpr = window.devicePixelRatio || 1;
        var w = window.innerWidth, h = window.innerHeight;
        var pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
        if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
        gl.viewport(0, 0, pw, ph);
        clear();

        var t = Math.max(0, (now - st.t0) / 1000);
        if (t >= FX_DURATION) { st.active = false; return false; }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        if (st.shock) {
          gl.useProgram(Q.prog);
          gl.uniform2f(Q.loc.uResPx, pw, ph);
          gl.uniform2f(Q.loc.uC, st.x, st.y);
          gl.uniform1f(Q.loc.uDpr, dpr);
          gl.uniform1f(Q.loc.uT, t);
          gl.uniform1f(Q.loc.uShock, st.shock ? 1 : 0);
          gl.uniform3f(Q.loc.uColor, st.color[0], st.color[1], st.color[2]);
          gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        if (st.n > 0) {
          gl.useProgram(PR.prog);
          gl.uniform2f(PR.loc.uC, st.x, st.y);
          gl.uniform2f(PR.loc.uRes, w, h);
          gl.uniform1f(PR.loc.uT, t);
          gl.uniform1f(PR.loc.uDpr, dpr);
          gl.uniform3f(PR.loc.uColA, st.colA[0], st.colA[1], st.colA[2]);
          gl.uniform3f(PR.loc.uColB, st.colB[0], st.colB[1], st.colB[2]);
          gl.bindBuffer(gl.ARRAY_BUFFER, pBuf);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.POINTS, 0, st.n);
        }
        gl.disable(gl.BLEND);
        return true;
      } catch (e) {
        failed = true;
        L.available = false;
        warn('effects draw failed', e);
        return false;
      }
    };

    return L;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Utility helpers
  // ═════════════════════════════════════════════════════════════════════════
  function getSpeciesKey(index) {
    index = Math.max(0, Math.min(SPECIES_KEYS.length - 1, index | 0));
    return SPECIES_KEYS[index];
  }

  // Base colour of a species: midpoint of its earlywood and latewood colours
  function getBaseColor(name) {
    var sp = SPECIES[name] || SPECIES.walnut;
    return {
      r: Math.round((sp.light[0] + sp.dark[0]) / 2),
      g: Math.round((sp.light[1] + sp.dark[1]) / 2),
      b: Math.round((sp.light[2] + sp.dark[2]) / 2)
    };
  }

  function getRandomSpecies() {
    return SPECIES_KEYS[Math.floor(Math.random() * SPECIES_KEYS.length)];
  }

  root.WoodGrain = {
    SPECIES:          SPECIES,
    SPECIES_KEYS:     SPECIES_KEYS,
    mulberry32:       mulberry32,
    generate:         generate,
    getDiscCanvas:    getDiscCanvas,
    createBackground: createBackground,
    createEffects:    createEffects,
    getSpeciesKey:    getSpeciesKey,
    getBaseColor:     getBaseColor,
    getRandomSpecies: getRandomSpecies
  };

})(typeof window !== 'undefined' ? window : this);
