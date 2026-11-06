/*
 * rockgrain-gl.js: GPU River Pebble & Stone texture generator matching WoodGrain architecture.
 *
 *   RockGrainGL.TYPES / ROCK_TYPES
 *   RockGrainGL.generate(rockType, size, seed)            -> <canvas> (GPU master texture)
 *   RockGrainGL.getDiscCanvas(diameter, rockType, seed, shade) -> <canvas> (shaded pebble puck)
 *   RockGrainGL.createBackground(container)              -> live table layer
 *       .draw({ species, seed, vignette, sheen, time, tiltX, tiltY })
 *   RockGrainGL.getTypeKey(i) / getRandomType() / getBaseColor(rockType)
 */
(function (root) {
  'use strict';

  var TYPES = {
    riverPebble: {
      label: 'River Pebble',
      colorA: [150, 165, 175],
      colorB: [85, 95, 105],
      colorC: [210, 215, 220],
      scale: 3.5,
      roughness: 0.04,
      graininess: 0.05,
      speckle: 0.4,
      mottling: 0.6
    },
    amberPebble: {
      label: 'Polished Amber',
      colorA: [240, 145, 25],
      colorB: [180, 85, 12],
      colorC: [255, 200, 70],
      scale: 2.8,
      roughness: 0.02,
      graininess: 0.02,
      speckle: 0.2,
      mottling: 0.8
    },
    granitePebble: {
      label: 'Speckled Granite',
      colorA: [215, 210, 205],
      colorB: [60, 55, 52],
      colorC: [175, 120, 110],
      scale: 4.2,
      roughness: 0.06,
      graininess: 0.08,
      speckle: 0.9,
      mottling: 0.5
    },
    slatePebble: {
      label: 'Blue Slate',
      colorA: [75, 95, 115],
      colorB: [40, 55, 70],
      colorC: [125, 150, 170],
      scale: 3.0,
      roughness: 0.03,
      graininess: 0.04,
      speckle: 0.3,
      mottling: 0.7
    },
    basaltPebble: {
      label: 'Dark Basalt',
      colorA: [45, 48, 52],
      colorB: [20, 22, 25],
      colorC: [90, 95, 100],
      scale: 3.2,
      roughness: 0.05,
      graininess: 0.12,
      speckle: 0.4,
      mottling: 0.5
    }
  };

  var ROCK_TYPES = ['riverPebble', 'amberPebble', 'granitePebble', 'slatePebble', 'basaltPebble'];
  var DISC_SIZE = 1024;
  var BG_SIZE   = 2048;

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
    if (typeof console !== 'undefined') console.warn('RockGrainGL: ' + msg, (e && e.message) || e || '');
  }

  var VERT = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';
  var QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

  function getGL(canvas, attrs) {
    var gl = null;
    try { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); } catch (e) {}
    return gl;
  }

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
  // Master Texture Generator Shader (Full screen, no puck cropping)
  // ═════════════════════════════════════════════════════════════════════════
  var GEN_FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    '',
    'uniform float uSize;',
    'uniform int   uType;',
    'uniform vec3  uColorA, uColorB, uColorC;',
    'uniform float uScale, uRoughness, uGraininess, uSpeckle, uMottling;',
    'uniform vec2  uOffA, uOffB;',
    '',
    'float hash(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    '',
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
    'float voronoi(vec2 p, vec2 off) {',
    '  p += off;',
    '  vec2 n = floor(p);',
    '  vec2 f = fract(p);',
    '  float md = 8.0;',
    '  for (int j = -1; j <= 1; j++) {',
    '    for (int i = -1; i <= 1; i++) {',
    '      vec2 g = vec2(float(i), float(j));',
    '      vec2 o = vec2(hash(n + g), hash(n + g + 17.3));',
    '      vec2 r = g + o - f;',
    '      float d = dot(r, r);',
    '      if (d < md) md = d;',
    '    }',
    '  }',
    '  return sqrt(md);',
    '}',
    '',
    'float fbm(vec2 p, vec2 off, int oct) {',
    '  float s = 0.0, amp = 0.5, tot = 0.0;',
    '  for (int i = 0; i < 4; i++) {',
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
    '  vec2 p = uv * uScale;',
    '  vec3 col = uColorA;',
    '',
    '  if (uType == 0) { // River Pebble',
    '    float n1 = fbm(p * 2.5, uOffA, 3);',
    '    float n2 = fbm(p * 6.0, uOffB, 3);',
    '    col = mix(uColorA, uColorB, smoothstep(0.2, 0.8, n1));',
    '    col = mix(col, uColorC, n2 * 0.4 * uMottling);',
    '    float v = voronoi(p * 14.0, uOffA);',
    '    col = mix(col, uColorB * 0.7, (1.0 - v) * uSpeckle * 0.4);',
    '  }',
    '  else if (uType == 1) { // Polished Amber',
    '    float cloud = fbm(p * 2.0, uOffA, 4);',
    '    float deep = fbm(p * 4.5 + vec2(1.7, 2.3), uOffB, 3);',
    '    col = mix(uColorA, uColorB, cloud);',
    '    col = mix(col, uColorC, deep * 0.65 * uMottling);',
    '  }',
    '  else if (uType == 2) { // Speckled Granite',
    '    float v1 = voronoi(p * 18.0, uOffA);',
    '    float v2 = voronoi(p * 34.0, uOffB);',
    '    float f = fbm(p * 5.0, uOffA, 3);',
    '    col = mix(uColorA, uColorB, smoothstep(0.25, 0.65, v1));',
    '    col = mix(col, uColorC, smoothstep(0.35, 0.8, v2 * (f + 0.3)));',
    '  }',
    '  else if (uType == 3) { // Slate',
    '    float layer = fbm(vec2(p.x * 10.0, p.y * 1.5), uOffA, 3);',
    '    float noise = vnoise(p * 4.0, uOffB);',
    '    col = mix(uColorA, uColorB, layer * 0.7 + noise * 0.3);',
    '    col = mix(col, uColorC, vnoise(p * 8.0, uOffA) * 0.3);',
    '  }',
    '  else if (uType == 4) { // Basalt',
    '    float mottling = fbm(p * 3.5, uOffA, 3);',
    '    float grain = hash(floor(gl_FragCoord.xy * 1.5)) * uGraininess;',
    '    col = mix(uColorA, uColorB, mottling);',
    '    col = mix(col, uColorC, grain);',
    '  }',
    '',
    '  float micro = (hash(gl_FragCoord.xy) - 0.5) * uRoughness;',
    '  col = clamp(col + vec3(micro), 0.0, 1.0);',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  var GEN_UNIFORMS = ['uSize', 'uType', 'uColorA', 'uColorB', 'uColorC', 'uScale', 'uRoughness', 'uGraininess', 'uSpeckle', 'uMottling', 'uOffA', 'uOffB'];

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
      if (!gl) throw new Error('WebGL unavailable');
      if (!hasHighp(gl)) throw new Error('GPU lacks high precision float');
      var P = buildProgram(gl, VERT, GEN_FRAG, GEN_UNIFORMS, ['aPos']);
      gl.useProgram(P.prog);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gen = { gl: gl, canvas: canvas, P: P };
      return gen;
    } catch (e) {
      genFailed = true;
      warn('GPU generator unavailable', e);
      return null;
    }
  }

  function generateGL(typeName, size, seed) {
    var g = initGen();
    if (!g) return null;
    var gl = g.gl, loc = g.P.loc;
    try {
      var t = TYPES[typeName] || TYPES.riverPebble;
      var cA = rgb01(t.colorA), cB = rgb01(t.colorB), cC = rgb01(t.colorC);

      g.canvas.width = g.canvas.height = size;
      gl.viewport(0, 0, size, size);
      gl.useProgram(g.P.prog);

      gl.uniform1f(loc.uSize, size);
      gl.uniform1i(loc.uType, ROCK_TYPES.indexOf(typeName) >= 0 ? ROCK_TYPES.indexOf(typeName) : 0);
      gl.uniform3f(loc.uColorA, cA[0], cA[1], cA[2]);
      gl.uniform3f(loc.uColorB, cB[0], cB[1], cB[2]);
      gl.uniform3f(loc.uColorC, cC[0], cC[1], cC[2]);
      gl.uniform1f(loc.uScale, t.scale);
      gl.uniform1f(loc.uRoughness, t.roughness);
      gl.uniform1f(loc.uGraininess, t.graininess);
      gl.uniform1f(loc.uSpeckle, t.speckle);
      gl.uniform1f(loc.uMottling, t.mottling);
      gl.uniform2f(loc.uOffA, (seed * 17) % 100 + 1.3, (seed * 31) % 100 + 2.4);
      gl.uniform2f(loc.uOffB, (seed * 43) % 100 + 3.7, (seed * 71) % 100 + 4.1);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      var out = document.createElement('canvas');
      out.width = out.height = size;
      out.getContext('2d').drawImage(g.canvas, 0, 0);
      return out;
    } catch (e) {
      warn('texture gen failed', e);
      return null;
    }
  }

  function flatTexture(typeName, size) {
    var t = TYPES[typeName] || TYPES.riverPebble;
    var c = document.createElement('canvas');
    c.width = c.height = Math.min(size, 256);
    var ctx = c.getContext('2d');
    var gr = ctx.createLinearGradient(0, 0, 0, c.height);
    gr.addColorStop(0, 'rgb(' + t.colorA.join(',') + ')');
    gr.addColorStop(1, 'rgb(' + t.colorB.join(',') + ')');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function generate(name, size, seed) {
    name = TYPES[name] ? name : 'riverPebble';
    size = size || 1024;
    seed = seed || 1;
    return generateGL(name, size, seed) || flatTexture(name, size);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Texture Caches
  // ═════════════════════════════════════════════════════════════════════════
  var discTexCache = {};
  function getDiscTexture(typeName) {
    if (!discTexCache[typeName]) discTexCache[typeName] = generate(typeName, DISC_SIZE, 42);
    return discTexCache[typeName];
  }

  var bgTexCache = {};
  function getMasterTexture(typeName, seed) {
    typeName = TYPES[typeName] ? typeName : 'riverPebble';
    seed = (seed || 42) | 0;
    var key = typeName + '_' + seed;
    if (!bgTexCache[key]) {
      bgTexCache[key] = generate(typeName, BG_SIZE, seed);
    }
    return bgTexCache[key];
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Organic River Pebble Puck Mask & Shading (Canvas 2D Clipping & Gloss)
  // ═════════════════════════════════════════════════════════════════════════
  function drawPebbleShading(ctx, r, diameter) {
    var TAU = Math.PI * 2;
    // Edge 3D dome shadow
    var edgeGrad = ctx.createRadialGradient(r, r, r * 0.5, r, r, r);
    edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, diameter, diameter);

    // Curved polished specular highlight
    var hx = r * 0.72, hy = r * 0.72;
    var specGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.65);
    specGrad.addColorStop(0, 'rgba(255,255,255,0.42)');
    specGrad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specGrad;
    ctx.fillRect(0, 0, diameter, diameter);

    // Clean pebble rim definition
    ctx.lineWidth = r * 0.04;
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.stroke();
  }

  var discCache = {};

  function getDiscCanvas(diameter, typeName, seed, shadeShift) {
    diameter   = Math.max(32, diameter | 0);
    typeName   = TYPES[typeName] ? typeName : 'riverPebble';
    seed       = (seed || 1) | 0;
    shadeShift = shadeShift || 0;

    var cacheKey = typeName + '_' + diameter + '_' + seed + '_' + shadeShift.toFixed(2);
    if (discCache[cacheKey]) return discCache[cacheKey];

    var tex  = getDiscTexture(typeName);
    var rand = mulberry32(seed * 3571 + diameter);
    var TAU  = Math.PI * 2;

    var c   = document.createElement('canvas');
    c.width = c.height = diameter;
    var ctx = c.getContext('2d');
    var r   = diameter / 2;

    // Organic river pebble path (smooth organic non-square outline)
    ctx.save();
    ctx.beginPath();
    var points = 24;
    for (var i = 0; i < points; i++) {
      var angle = (i / points) * TAU;
      var deform = Math.sin(angle * 2 + seed) * 0.06 + Math.cos(angle * 3 + seed * 1.7) * 0.03;
      var pr = r * (0.92 + deform);
      var px = r + Math.cos(angle) * pr;
      var py = r + Math.sin(angle) * pr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.clip(); // STRICT 2D MASK CLIPPING - NO SQUARE BORDERS OR STACKING ARTIFACTS!

    // Draw textured stone interior
    ctx.translate(r, r);
    ctx.rotate(rand() * TAU);
    var sw = tex.width * 0.55;
    var ox = rand() * (tex.width - sw);
    var oy = rand() * (tex.height - sw);
    ctx.drawImage(tex, ox, oy, sw, sw, -r, -r, 2 * r, 2 * r);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    for (var j = 0; j < points; j++) {
      var a = (j / points) * TAU;
      var d = Math.sin(a * 2 + seed) * 0.06 + Math.cos(a * 3 + seed * 1.7) * 0.03;
      var rad = r * (0.92 + d);
      var x = r + Math.cos(a) * rad;
      var y = r + Math.sin(a) * rad;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.clip();

    if (shadeShift !== 0) {
      ctx.fillStyle = shadeShift < 0
        ? 'rgba(0,0,0,' + Math.min(0.6, -shadeShift).toFixed(3) + ')'
        : 'rgba(255,255,255,' + Math.min(0.6, shadeShift).toFixed(3) + ')';
      ctx.fillRect(0, 0, diameter, diameter);
    }

    drawPebbleShading(ctx, r, diameter);
    ctx.restore();

    discCache[cacheKey] = c;
    return c;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Live Stone Table Layer (WebGL Shader matching WoodGrain.createBackground)
  // ═════════════════════════════════════════════════════════════════════════
  var BG_FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform sampler2D uTex;',
    'uniform vec2 uRes, uOrigin, uDraw, uTilt;',
    'uniform float uTime, uSheen, uVig;',
    '',
    'void main() {',
    '  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);',
    '  vec2 tc = (p - uOrigin) / uDraw;',
    '  vec3 col = texture2D(uTex, tc).rgb;',
    '',
    '  // Soft stone polished sheen following tilt',
    '  float lum = dot(col, vec3(0.299, 0.587, 0.114));',
    '  vec2 q2 = p / uRes;',
    '  vec2 c = vec2(0.5 + uTilt.x * 0.35 + 0.08 * sin(uTime * 0.6), 0.38 + uTilt.y * 0.25 + 0.05 * cos(uTime * 0.4));',
    '  vec2 dq = (q2 - c) * vec2(1.0, uRes.y / uRes.x);',
    '  float g = exp(-dot(dq, dq) / 0.10);',
    '  col += g * uSheen * 0.25 * (0.6 + 0.8 * lum) * vec3(1.0, 0.98, 0.92);',
    '',
    '  // Vignette',
    '  vec2 pc = p - uRes * 0.5;',
    '  float r0 = min(uRes.x, uRes.y) * 0.3;',
    '  float r1 = max(uRes.x, uRes.y) * 0.75;',
    '  float vv = clamp((length(pc) - r0) / (r1 - r0), 0.0, 1.0);',
    '  col *= 1.0 - uVig * vv;',
    '',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  var BG_UNIFORMS = ['uTex', 'uRes', 'uOrigin', 'uDraw', 'uTilt', 'uTime', 'uSheen', 'uVig'];

  function createBackground(container) {
    var cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;';
    container.innerHTML = '';
    container.appendChild(cv);

    var L = { onRestore: null, available: true };
    var gl = null, P = null, buf = null, tex = null, texKey = '', tw = 1, th = 1;
    var failed = false, lost = false;

    function build() {
      gl = getGL(cv, { alpha: false, antialias: false });
      if (!gl) throw new Error('WebGL unavailable');
      if (!hasHighp(gl)) throw new Error('GPU lacks high precision float');
      P = buildProgram(gl, VERT, BG_FRAG, BG_UNIFORMS, ['aPos']);
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
      tex = null;
      texKey = '';
    }

    try {
      build();
    } catch (e) {
      failed = true;
      L.available = false;
      warn('table layer unavailable', e);
    }

    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; }, false);
    cv.addEventListener('webglcontextrestored', function () {
      try { build(); lost = false; if (L.onRestore) L.onRestore(); }
      catch (e) { failed = true; L.available = false; }
    }, false);

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

        var typeName = TYPES[s.species] ? s.species : 'riverPebble';
        var seed = (s.seed || 42) | 0;
        var key = typeName + '_' + seed;

        gl.useProgram(P.prog);
        if (key !== texKey || !tex) {
          if (tex) gl.deleteTexture(tex);
          var m = makeTexture(getMasterTexture(typeName, seed));
          tex = m.t; tw = m.w; th = m.h; texKey = key;
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(P.loc.uTex, 0);

        var scale = Math.max(pw / tw, ph / th);
        var dw = tw * scale, dh = th * scale;
        gl.uniform2f(P.loc.uRes, pw, ph);
        gl.uniform2f(P.loc.uOrigin, (pw - dw) / 2, (ph - dh) / 2);
        gl.uniform2f(P.loc.uDraw, dw, dh);
        gl.uniform2f(P.loc.uTilt, s.tiltX || 0, s.tiltY || 0);
        gl.uniform1f(P.loc.uTime, s.time || 0);
        gl.uniform1f(P.loc.uSheen, s.sheen || 0.4);
        gl.uniform1f(P.loc.uVig, s.vignette || 0.28);

        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return true;
      } catch (e) {
        failed = true;
        L.available = false;
        warn('rock table draw failed', e);
        return false;
      }
    };
    return L;
  }

  function getTypeKey(index) {
    index = Math.max(0, Math.min(ROCK_TYPES.length - 1, index | 0));
    return ROCK_TYPES[index];
  }

  function getBaseColor(name) {
    var t = TYPES[name] || TYPES.riverPebble;
    return {
      r: Math.round((t.colorA[0] + t.colorB[0]) / 2),
      g: Math.round((t.colorA[1] + t.colorB[1]) / 2),
      b: Math.round((t.colorA[2] + t.colorB[2]) / 2)
    };
  }

  function getRandomType() {
    return ROCK_TYPES[Math.floor(Math.random() * ROCK_TYPES.length)];
  }

  root.RockGrainGL = {
    TYPES: TYPES,
    ROCK_TYPES: ROCK_TYPES,
    mulberry32: mulberry32,
    generate: generate,
    getDiscCanvas: getDiscCanvas,
    createBackground: createBackground,
    getTypeKey: getTypeKey,
    getBaseColor: getBaseColor,
    getRandomType: getRandomType
  };

})(typeof window !== 'undefined' ? window : this);
