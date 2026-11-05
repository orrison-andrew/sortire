/*
 * woodgrain-gl.js: GPU woodgrain generator for Sortire.
 *
 * Same look as the CPU generator in woodgrain.js (growth rings warped by FBM noise,
 * fine fibers, oak pores and ray flecks, broad tonal drift), but computed in a
 * WebGL fragment shader, so a 2048 px texture takes milliseconds instead of seconds.
 *
 * Exposes WoodGrainGL.generate(name, size, seed, isMuted) -> <canvas> (a normal 2D
 * canvas, safe to cache) or null if WebGL is unavailable / fails. woodgrain.js then
 * falls back to the CPU generator automatically.
 *
 * Switch: Settings → Appearance → "GPU woodgrain". To remove this implementation
 * entirely, delete this file and its <script> tag; nothing else depends on it.
 *
 * Note: the shader uses a float hash instead of the CPU version's permutation table,
 * so a given seed gives the same layout (pith position, ring count) but not
 * pixel-identical fibers.
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
    'uniform vec3  uLight, uDark, uMute;',
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
    '  gl_FragColor = vec4(clamp(col * uMute, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  var state = null;     // { gl, canvas, prog, loc, maxSize } once initialised
  var failed = false;   // permanently unavailable (no WebGL / shader error)

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

  function init() {
    if (state) return state;
    if (failed) return null;
    try {
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      var gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true }) ||
               canvas.getContext('experimental-webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error('WebGL not available');

      var prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('program link failed: ' + gl.getProgramInfoLog(prog));
      }
      gl.useProgram(prog);

      // Full-screen quad
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var aPos = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      var names = ['uSize', 'uLight', 'uDark', 'uMute', 'uRings', 'uTilt', 'uSharp', 'uContrast',
                   'uFiber', 'uPores', 'uRays', 'uWarp', 'uTone', 'uCx', 'uV0', 'uOffA', 'uOffB', 'uOffC'];
      var loc = {};
      names.forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });

      var dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      var maxSize = Math.min(dims ? dims[0] : 2048, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 2048);

      state = { gl: gl, canvas: canvas, loc: loc, maxSize: maxSize };
      return state;
    } catch (e) {
      failed = true;
      if (typeof console !== 'undefined') console.warn('WoodGrainGL disabled, using CPU generator:', e.message || e);
      return null;
    }
  }

  // Integer-valued noise lattice offset, so each seed/channel gets its own pattern
  function offsetFrom(rng) {
    return [Math.floor(rng() * 900) + 7, Math.floor(rng() * 900) + 7];
  }

  function generate(name, size, seed, isMuted) {
    var WG = root.WoodGrain;
    if (!WG) return null;
    size = size || 1024;
    seed = seed || 1;

    var st = init();
    if (!st || size > st.maxSize) return null;
    var gl = st.gl, loc = st.loc;
    if (gl.isContextLost && gl.isContextLost()) return null;

    try {
      var sp = WG.SPECIES[name] || WG.SPECIES.walnut;

      // Pith position: identical rule to the CPU generator, so layouts match
      var r = WG.mulberry32(seed * 7919 + name.length * 131);
      var cx = r() < 0.55 ? 0.15 + r() * 0.7 : (r() < 0.5 ? -0.4 - r() * 0.6 : 1.4 + r() * 0.6);
      var v0 = 0.2 + r() * 0.6;

      var nr = WG.mulberry32(seed * 3 + 11);
      var offA = offsetFrom(nr), offB = offsetFrom(nr), offC = offsetFrom(nr);

      st.canvas.width = st.canvas.height = size;
      gl.viewport(0, 0, size, size);

      gl.uniform1f(loc.uSize, size);
      gl.uniform3f(loc.uLight, sp.light[0] / 255, sp.light[1] / 255, sp.light[2] / 255);
      gl.uniform3f(loc.uDark,  sp.dark[0] / 255,  sp.dark[1] / 255,  sp.dark[2] / 255);
      if (isMuted) gl.uniform3f(loc.uMute, 0.72, 0.70, 0.74); else gl.uniform3f(loc.uMute, 1, 1, 1);
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
      gl.uniform2f(loc.uOffA, offA[0], offA[1]);
      gl.uniform2f(loc.uOffB, offB[0], offB[1]);
      gl.uniform2f(loc.uOffC, offC[0], offC[1]);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Copy into a plain 2D canvas: cacheable, readable (getImageData), and immune
      // to GL context loss.
      var out = document.createElement('canvas');
      out.width = out.height = size;
      out.getContext('2d').drawImage(st.canvas, 0, 0);
      return out;
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('WoodGrainGL.generate failed, using CPU generator:', e.message || e);
      return null;
    }
  }

  root.WoodGrainGL = { generate: generate };

})(typeof window !== 'undefined' ? window : this);
