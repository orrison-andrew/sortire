/**
 * effects.js: Winner effects layer (transparent WebGL canvas above the arena).
 *
 *   Effects.create(canvas) -> layer
 *       layer.trigger(x, y, { color, shock, particles, colA, colB })
 *       layer.draw(now) / layer.stop() / layer.isActive() / layer.onRestore
 *
 * A shockwave ring (full-screen quad) and a particle burst (GL points).
 */
(function (root) {
  'use strict';

  // Shockwave ring (full-screen quad) and a particle burst (GL points).
  var FX_FRAG = [
    GLUtil.PRECISION,
    'uniform vec2 uResPx, uC;',
    'uniform float uDpr, uT, uShock;',
    'uniform vec3 uColor;',
    'void main() {',
    '  vec2 p = vec2(gl_FragCoord.x, uResPx.y - gl_FragCoord.y) / uDpr;',
    '  float d = length(p - uC);',
    '  float a = 0.0;',
    '  if (uShock > 0.5 && uT < 1.2) {',
    '    float fade = max(0.0, 1.0 - uT / 1.2);',
    '    float R1 = 60.0 + 700.0 * (1.0 - exp(-uT * 4.0));',
    '    float w1 = 3.0 + 5.0 * uT;',
    '    float q1 = abs(d - R1) / w1;',
    '    a += (0.8 / (1.0 + q1 * q1 * q1)) * fade;',
    '    float uT2 = max(0.0, uT - 0.1);',
    '    float R2 = 60.0 + 650.0 * (1.0 - exp(-uT2 * 3.5));',
    '    float w2 = 8.0 + 12.0 * uT2;',
    '    float q2 = abs(d - R2) / w2;',
    '    a += (0.3 / (1.0 + q2 * q2)) * fade;',
    '    if (R1 > 0.0) {',
    '      a += exp(-d * d / (R1 * R1 * 0.5)) * 0.15 * fade;',
    '    }',
    '  }',
    '  a = clamp(a, 0.0, 1.0);',
    '  vec3 c = mix(uColor, vec3(1.0), 0.5);',
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
    GLUtil.PRECISION,
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
      gl = GLUtil.getGL(cv, { alpha: true, premultipliedAlpha: true, antialias: false });
      if (!gl) throw new Error('WebGL not available');
      if (!GLUtil.hasHighp(gl)) throw new Error('GPU lacks high-precision floats');
      Q = GLUtil.buildProgram(gl, GLUtil.VERT, FX_FRAG, ['uResPx', 'uC', 'uDpr', 'uT', 'uShock', 'uColor'], ['aPos']);
      PR = GLUtil.buildProgram(gl, PART_VERT, PART_FRAG, ['uC', 'uRes', 'uT', 'uDpr', 'uColA', 'uColB'], ['aP']);
      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, GLUtil.QUAD, gl.STATIC_DRAW);
      pBuf = gl.createBuffer();
      st.n = 0;       // particle buffer contents are gone after a rebuild
    }

    try {
      build();
    } catch (e) {
      failed = true;
      L.available = false;
      GLUtil.warn('effects layer unavailable (effects disabled).', e);
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
        GLUtil.warn('effects draw failed', e);
        return false;
      }
    };

    return L;
  }

  root.Effects = { create: createEffects };
})(typeof window !== 'undefined' ? window : this);
