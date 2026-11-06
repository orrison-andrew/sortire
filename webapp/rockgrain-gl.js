/*
 * rockgrain-gl.js: GPU Rock and Mineral procedural texture generator.
 *
 * Provides WebGL-accelerated rendering for procedurally textured rock materials
 * (Granite, Marble, Slate, Sandstone, Obsidian) and irregular rock-shaped puck geometries.
 *
 * Exposes RockGrainGL.generate(rockType, size, seed, isPuck) -> <canvas>
 *         RockGrainGL.getDiscCanvas(diameter, rockType, seed, shadeShift) -> <canvas>
 *         RockGrainGL.createBackground(container) -> live table layer
 *         RockGrainGL.TYPES / ROCK_TYPES / getRandomType() / getBaseColor()
 */
(function (root) {
  'use strict';

  var VERT = [
    'attribute vec2 aPos;',
    'void main() { gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    '',
    'uniform float uSize;',
    'uniform int   uRockType; // 0: Granite, 1: Marble, 2: Slate, 3: Sandstone, 4: Obsidian',
    'uniform vec3  uColorA, uColorB, uColorC;',
    'uniform float uScale, uVeinWarp, uRoughness, uGraininess, uVeinDensity;',
    'uniform vec2  uOffA, uOffB;',
    'uniform float uIsPuck; // 1.0 = mask shape into irregular rock shape, 0.0 = full texture',
    '',
    '// 2D Hash function',
    'float hash(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    '',
    '// 2D Value Noise',
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
    '// Cellular / Voronoi Noise for Granular Rock Grains',
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
    '// Fractal Brownian Motion',
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
    '// Irregular Rock Edge Shape Mask (Distance Field Deformed by Noise)',
    'float rockShapeMask(vec2 uv) {',
    '  vec2 p = uv - vec2(0.5);',
    '  float angle = atan(p.y, p.x);',
    '  float dist = length(p);',
    '  ',
    '  // Multi-frequency angular noise for natural mineral fractures & erosion',
    '  float lowFreq  = vnoise(vec2(cos(angle) * 1.5, sin(angle) * 1.5), uOffA) * 0.09;',
    '  float highFreq = vnoise(vec2(cos(angle * 5.0) * 2.0, sin(angle * 5.0) * 2.0), uOffB) * 0.03;',
    '  ',
    '  float rockRadius = 0.40 + lowFreq + highFreq;',
    '  float edgeSmooth = 0.015;',
    '  return 1.0 - smoothstep(rockRadius - edgeSmooth, rockRadius + edgeSmooth, dist);',
    '}',
    '',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / uSize;',
    '  float mask = 1.0;',
    '  if (uIsPuck > 0.5) {',
    '    mask = rockShapeMask(uv);',
    '    if (mask <= 0.0) discard;',
    '  }',
    '',
    '  vec3 col = uColorA;',
    '  vec2 p = uv * uScale;',
    '',
    '  if (uRockType == 0) {',
    '    // GRANITE: Multi-mineral crystalline flecks and speckles',
    '    float v1 = voronoi(p * 12.0, uOffA);',
    '    float v2 = voronoi(p * 24.0, uOffB);',
    '    float noise = fbm(p * 8.0, uOffA, 3);',
    '    col = mix(uColorA, uColorB, smoothstep(0.2, 0.7, v1));',
    '    col = mix(col, uColorC, smoothstep(0.3, 0.8, v2 * noise));',
    '  }',
    '  else if (uRockType == 1) {',
    '    // MARBLE: Domain-warped mineral veins',
    '    vec2 warp = vec2(',
    '      fbm(p * 2.0 + vec2(0.0, 0.0), uOffA, 3),',
    '      fbm(p * 2.0 + vec2(5.2, 1.3), uOffB, 3)',
    '    );',
    '    float vein = fbm(p * 3.0 + warp * uVeinWarp, uOffA, 4);',
    '    vein = sin(vein * 12.0 * uVeinDensity);',
    '    vein = smoothstep(0.1, 0.9, abs(vein));',
    '    col = mix(uColorC, mix(uColorA, uColorB, vein), smoothstep(0.0, 0.5, vein));',
    '  }',
    '  else if (uRockType == 2) {',
    '    // SLATE: Directional planar cleavage and fine foliation lines',
    '    float grain = fbm(vec2(p.x * 20.0, p.y * 1.5), uOffA, 3);',
    '    float cleave = vnoise(vec2(p.x * 2.0, p.y * 8.0), uOffB);',
    '    col = mix(uColorA, uColorB, grain * 0.8 + cleave * 0.2);',
    '  }',
    '  else if (uRockType == 3) {',
    '    // SANDSTONE: Sediment layers and fine sand graining',
    '    float sediment = sin((p.y + fbm(p * 1.5, uOffA, 3) * 0.4) * 15.0);',
    '    float sandGrains = hash(floor(gl_FragCoord.xy * 0.8));',
    '    col = mix(uColorA, uColorB, sediment * 0.5 + 0.5);',
    '    col = mix(col, uColorC, sandGrains * uGraininess);',
    '  }',
    '  else if (uRockType == 4) {',
    '    // OBSIDIAN: Dark glassy mineral structure with subtle flow bands',
    '    float flow = fbm(p * 4.0, uOffA, 3);',
    '    col = mix(uColorA, uColorB, flow);',
    '  }',
    '',
    '  // Add subtle micro-surface bump roughness across all rock types',
    '  float microBump = (hash(gl_FragCoord.xy) - 0.5) * uRoughness;',
    '  col = clamp(col + vec3(microBump), 0.0, 1.0);',
    '',
    '  gl_FragColor = vec4(col, mask);',
    '}'
  ].join('\n');

  var TYPES = {
    granite: {
      label: 'Granite',
      id: 0,
      scale: 1.5,
      colorA: [210, 205, 200], // Quartz light background
      colorB: [90, 85, 80],    // Dark Biotite
      colorC: [180, 120, 110], // Pinkish Feldspar
      roughness: 0.08,
      veinWarp: 0.0,
      veinDensity: 0.0,
      graininess: 0.1
    },
    marble: {
      label: 'Marble',
      id: 1,
      scale: 1.0,
      colorA: [245, 245, 248], // White calcite base
      colorB: [110, 120, 130], // Grey/blue vein
      colorC: [210, 215, 220], // Subtle tint
      roughness: 0.02,
      veinWarp: 1.8,
      veinDensity: 1.2,
      graininess: 0.02
    },
    slate: {
      label: 'Slate',
      id: 2,
      scale: 1.2,
      colorA: [55, 62, 68],   // Charcoal slate
      colorB: [85, 95, 102],  // Lighter foliation band
      colorC: [40, 45, 50],
      roughness: 0.05,
      veinWarp: 0.2,
      veinDensity: 0.5,
      graininess: 0.04
    },
    sandstone: {
      label: 'Sandstone',
      id: 3,
      scale: 1.4,
      colorA: [215, 170, 120], // Desert sand gold
      colorB: [175, 120, 80],  // Terracotta sediment
      colorC: [235, 195, 145],
      roughness: 0.12,
      veinWarp: 0.1,
      veinDensity: 0.8,
      graininess: 0.25
    },
    obsidian: {
      label: 'Obsidian',
      id: 4,
      scale: 0.8,
      colorA: [20, 22, 25],  // Pitch black mineral
      colorB: [55, 60, 68],  // Glass sheen flow band
      colorC: [10, 10, 12],
      roughness: 0.01,
      veinWarp: 0.5,
      veinDensity: 0.3,
      graininess: 0.01
    }
  };

  var ROCK_TYPES = ['granite', 'marble', 'slate', 'sandstone', 'obsidian'];

  var state = null;
  var failed = false;

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('RockGrainGL shader compile failed: ' + log);
    }
    return sh;
  }

  function init() {
    if (state && state.gl && !state.gl.isContextLost()) return state;
    state = null;
    if (failed) return null;
    try {
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      var gl = canvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer: true });
      if (!gl) throw new Error('WebGL unavailable');

      var prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('RockGrainGL link failed: ' + gl.getProgramInfoLog(prog));
      }
      gl.useProgram(prog);

      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var aPos = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      var names = [
        'uSize', 'uRockType', 'uColorA', 'uColorB', 'uColorC',
        'uScale', 'uVeinWarp', 'uRoughness', 'uGraininess', 'uVeinDensity',
        'uOffA', 'uOffB', 'uIsPuck'
      ];
      var loc = {};
      names.forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });

      state = { gl: gl, canvas: canvas, loc: loc, prog: prog };
      return state;
    } catch (e) {
      failed = true;
      if (typeof console !== 'undefined') console.warn('RockGrainGL fallback:', e.message);
      return null;
    }
  }

  function rgb01(arr) { return [arr[0] / 255, arr[1] / 255, arr[2] / 255]; }

  function generate(typeName, size, seed, isPuck) {
    size = size || 512;
    seed = seed || 1;
    isPuck = isPuck ? 1.0 : 0.0;

    var st = init();
    if (!st) return flatFallback(typeName, size);

    var gl = st.gl, loc = st.loc;
    var t = TYPES[typeName] || TYPES.granite;

    st.canvas.width = st.canvas.height = size;
    gl.viewport(0, 0, size, size);
    gl.useProgram(st.prog);

    var cA = rgb01(t.colorA), cB = rgb01(t.colorB), cC = rgb01(t.colorC);
    gl.uniform1f(loc.uSize, size);
    gl.uniform1i(loc.uRockType, t.id);
    gl.uniform3f(loc.uColorA, cA[0], cA[1], cA[2]);
    gl.uniform3f(loc.uColorB, cB[0], cB[1], cB[2]);
    gl.uniform3f(loc.uColorC, cC[0], cC[1], cC[2]);
    gl.uniform1f(loc.uScale, t.scale);
    gl.uniform1f(loc.uVeinWarp, t.veinWarp);
    gl.uniform1f(loc.uRoughness, t.roughness);
    gl.uniform1f(loc.uGraininess, t.graininess);
    gl.uniform1f(loc.uVeinDensity, t.veinDensity);
    gl.uniform2f(loc.uOffA, (seed * 17) % 100, (seed * 31) % 100);
    gl.uniform2f(loc.uOffB, (seed * 43) % 100, (seed * 71) % 100);
    gl.uniform1f(loc.uIsPuck, isPuck);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    var out = document.createElement('canvas');
    out.width = out.height = size;
    out.getContext('2d').drawImage(st.canvas, 0, 0);
    return out;
  }

  function flatFallback(typeName, size) {
    var t = TYPES[typeName] || TYPES.granite;
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

  var discCache = {};
  function getDiscCanvas(diameter, typeName, seed, shadeShift) {
    diameter = Math.max(32, diameter | 0);
    typeName = TYPES[typeName] ? typeName : 'granite';
    seed = (seed || 1) | 0;
    shadeShift = shadeShift || 0;

    var key = typeName + '_' + diameter + '_' + seed + '_' + shadeShift.toFixed(2);
    if (discCache[key]) return discCache[key];

    var tex = generate(typeName, diameter, seed, true);
    var c = document.createElement('canvas');
    c.width = c.height = diameter;
    var ctx = c.getContext('2d');

    ctx.drawImage(tex, 0, 0, diameter, diameter);

    if (shadeShift !== 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atan';
      ctx.fillStyle = shadeShift < 0
        ? 'rgba(0,0,0,' + Math.min(0.6, -shadeShift).toFixed(3) + ')'
        : 'rgba(255,255,255,' + Math.min(0.6, shadeShift).toFixed(3) + ')';
      ctx.fillRect(0, 0, diameter, diameter);
      ctx.restore();
    }

    discCache[key] = c;
    return c;
  }

  function createBackground(container) {
    var cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;';
    container.innerHTML = '';
    container.appendChild(cv);

    var L = { available: true };
    L.draw = function (s) {
      var w = container.offsetWidth || window.innerWidth;
      var h = container.offsetHeight || window.innerHeight;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      var ctx = cv.getContext('2d');
      var t = TYPES[s.species] || TYPES.granite;
      ctx.fillStyle = 'rgb(' + t.colorA.join(',') + ')';
      ctx.fillRect(0, 0, w, h);
      return true;
    };
    return L;
  }

  function getTypeKey(index) {
    index = Math.max(0, Math.min(ROCK_TYPES.length - 1, index | 0));
    return ROCK_TYPES[index];
  }

  function getBaseColor(name) {
    var t = TYPES[name] || TYPES.granite;
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
    generate: generate,
    getDiscCanvas: getDiscCanvas,
    createBackground: createBackground,
    getTypeKey: getTypeKey,
    getBaseColor: getBaseColor,
    getRandomType: getRandomType
  };

})(typeof window !== 'undefined' ? window : this);
