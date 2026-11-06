/**
 * table-layer.js: Live GPU table surface, shared by every material (wood, stone).
 *
 *   TableLayer.create(container, materials) -> layer
 *       materials: { hasKey(key), master(key, seed) -> <canvas> }
 *       layer.draw(state) -> true if drawn, false if the GPU layer is unavailable
 *       layer.available, layer.onRestore
 *
 * One shader draws the whole table every frame:
 *   - the cached grain texture, cover-fitted to the screen
 *   - the winner flood: a feathered, rippling circle that reveals the WINNER'S OWN
 *     grain (a second texture: its material and its own seed). The front bends
 *     along that grain's growth rings / banding.
 *   - varnish sheen that follows tilt / drifts slowly
 *   - vignette
 *
 * draw(state):
 *   material, seed   table grain
 *   flood            in CSS px, or null:
 *                    { x, y, r, feather, ripple, grain, material, seed }
 *                    r must reach far + feather * (1.1 + 1.25 * grain + 0.3 * ripple)
 *                    to cover the whole screen at the end.
 *   time             seconds (sheen drift, edge ripple)
 *   tiltX, tiltY     -1..1
 *   sheen, vignette  0..1
 */
(function (root) {
  'use strict';

  var FRAG = GLUtil.PRECISION + '\n' + [
    'uniform sampler2D uTex, uTex2;',
    'uniform vec2 uRes, uOrigin, uDraw, uFloodC, uTilt;',
    'uniform float uFloodOn, uFloodR, uFloodF, uRipple, uGrain, uTime, uSheen, uVig;',
    '',
    'void main() {',
    '  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);',
    '  vec2 tc = (p - uOrigin) / uDraw;',
    '  vec3 col = texture2D(uTex, tc).rgb;',
    '',
    '  if (uFloodOn > 0.5) {',
    '    vec2 dv = p - uFloodC;',
    '    float dist = length(dv);',
    '    float ang = atan(dv.y, dv.x + 0.0001);',
    '    float f = max(uFloodF, 1.0);',
    '    // The winner brings its own grain. A blurred mip gives ring-scale brightness',
    '    // (not fibre noise): the front runs ahead on pale areas and lags on dark ones.',
    '    vec3 fl = texture2D(uTex2, tc).rgb;',
    '    float gLum = dot(texture2D(uTex2, tc, 4.0).rgb, vec3(0.299, 0.587, 0.114));',
    '    float gEdge = (gLum - 0.5) * uGrain * f * 2.4;',
    '    float edge = uFloodR + gEdge + uRipple * 0.25 * f * sin(ang * 9.0 + uTime * 5.0);',
    '    float mask = 1.0 - smoothstep(edge - f, edge, dist);',
    '    col = mix(col, fl, mask);',
    '    float q = (dist - (edge - f * 0.5)) / max(f * 0.6, 1.0);',
    '    col += exp(-q * q) * uRipple * 0.12;',
    '  }',
    '',
    '  // Varnish sheen: soft highlight that follows tilt, brighter where the grain is pale',
    '  float lum = dot(col, vec3(0.299, 0.587, 0.114));',
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

  var UNIFORMS = ['uTex', 'uTex2', 'uRes', 'uOrigin', 'uDraw', 'uFloodOn', 'uFloodC', 'uFloodR',
                  'uFloodF', 'uRipple', 'uGrain', 'uTime', 'uTilt', 'uSheen', 'uVig'];

  function create(container, materials) {
    var cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;';
    container.innerHTML = '';
    container.appendChild(cv);

    var L = { onRestore: null, available: true };
    var gl = null, P = null, buf = null;
    var tex = null, texKey = '', tw = 1, th = 1;          // the table grain
    var tex2 = null, tex2Key = '', tw2 = 1, th2 = 1;      // the winner's grain
    var failed = false, lost = false;

    function build() {
      gl = GLUtil.getGL(cv, { alpha: false, antialias: false });
      if (!gl) throw new Error('WebGL not available');
      if (!GLUtil.hasHighp(gl)) throw new Error('GPU lacks high-precision floats');
      P = GLUtil.buildProgram(gl, GLUtil.VERT, FRAG, UNIFORMS, ['aPos']);
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, GLUtil.QUAD, gl.STATIC_DRAW);
      tex = null; texKey = '';
      tex2 = null; tex2Key = '';
    }

    try {
      build();
    } catch (e) {
      failed = true;
      L.available = false;
      GLUtil.warn('table layer unavailable, using flat background.', e);
    }

    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; }, false);
    cv.addEventListener('webglcontextrestored', function () {
      try { build(); lost = false; if (L.onRestore) L.onRestore(); }
      catch (e) { failed = true; L.available = false; GLUtil.warn('could not restore table layer', e); }
    }, false);

    L.draw = function (s) {
      if (failed || lost || !gl || gl.isContextLost()) return false;
      try {
        var dpr = window.devicePixelRatio || 1;
        var w = container.offsetWidth || window.innerWidth;
        var h = container.offsetHeight || window.innerHeight;
        var pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
        if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
        gl.viewport(0, 0, pw, ph);
        gl.useProgram(P.prog);

        var seed = (s.seed || 42) | 0;
        var key = s.material + '_' + seed;
        if (key !== texKey || !tex) {
          if (tex2 && key === tex2Key) {
            // The winner's grain is becoming the table: swap, no regeneration or re-upload
            var t0 = tex, w0 = tw, h0 = th, k0 = texKey;
            tex = tex2; tw = tw2; th = th2; texKey = tex2Key;
            tex2 = t0; tw2 = w0; th2 = h0; tex2Key = k0;
          } else {
            if (tex) gl.deleteTexture(tex);
            var m = GLUtil.makeTexture(gl, materials.master(s.material, seed));
            tex = m.t; tw = m.w; th = m.h; texKey = key;
          }
        }

        // The winner's own grain (second texture), generated the first time it is needed
        var fl = s.flood;
        var own = !!(fl && materials.hasKey(fl.material));
        if (own) {
          var fkey = fl.material + '_' + (fl.seed | 0);
          if (fkey !== tex2Key || !tex2) {
            if (tex2) gl.deleteTexture(tex2);
            var m2 = GLUtil.makeTexture(gl, materials.master(fl.material, fl.seed));
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

        gl.uniform1f(P.loc.uFloodOn, own ? 1 : 0);
        gl.uniform1f(P.loc.uGrain, own ? Math.max(0, Math.min(1, fl.grain || 0)) : 0);
        gl.uniform2f(P.loc.uFloodC, own ? fl.x * dpr : 0, own ? fl.y * dpr : 0);
        gl.uniform1f(P.loc.uFloodR, own ? fl.r * dpr : 0);
        gl.uniform1f(P.loc.uFloodF, own ? Math.max(1, (fl.feather || 0) * dpr) : 1);
        gl.uniform1f(P.loc.uRipple, own ? (fl.ripple || 0) : 0);

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
        GLUtil.warn('table layer draw failed', e);
        return false;
      }
    };

    return L;
  }

  root.TableLayer = { create: create };
})(typeof window !== 'undefined' ? window : this);
