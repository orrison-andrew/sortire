/**
 * gl-util.js: Shared WebGL / PRNG / cache helpers for Sortire.
 * Everything GL-related that more than one module needs lives here.
 *
 *   GLUtil.mulberry32(seed)                  -> seeded random function
 *   GLUtil.warn(msg, err)
 *   GLUtil.VERT / QUAD / PRECISION           shared shader snippets + full-screen quad
 *   GLUtil.getGL(canvas, attrs)              -> context or null
 *   GLUtil.hasHighp(gl)                      -> true if fragment shaders have highp floats
 *   GLUtil.buildProgram(gl, vs, fs, uniforms, attribs) -> { prog, loc }
 *   GLUtil.rgb01([r,g,b])                    -> [0..1, 0..1, 0..1]
 *   GLUtil.makeTexture(gl, canvas)           -> { t, w, h }
 *   GLUtil.flatTexture(light, dark, size)    -> <canvas> gradient (no-WebGL fallback)
 *   GLUtil.createGenerator(frag, uniforms, label) -> { render(size, setUniforms) -> <canvas>|null }
 *   GLUtil.lru(max, dispose)                 -> { get, set }
 */
(function (root) {
  'use strict';

  var VERT = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';
  var QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);   // triangle strip

  // Prepended to every fragment shader. The shaders need real highp floats.
  var PRECISION = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif'
  ].join('\n');

  function warn(msg, e) {
    if (typeof console !== 'undefined') console.warn('Sortire: ' + msg, (e && e.message) || e || '');
  }

  // Seeded PRNG (mulberry32): same seed, same sequence
  function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function getGL(canvas, attrs) {
    var gl = null;
    try { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); } catch (e) {}
    return gl;
  }

  // A few old Android GPUs only offer medium precision and would render garbage,
  // so those are treated as "no WebGL" instead of showing broken output.
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

  // Upload a canvas as a texture on unit 0 (mipmapped when power-of-two)
  function makeTexture(gl, src) {
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

  // Last-resort texture when WebGL is unavailable: vertical light -> dark gradient
  function flatTexture(light, dark, size) {
    var c = document.createElement('canvas');
    c.width = c.height = Math.min(size, 256);
    var x = c.getContext('2d');
    var gr = x.createLinearGradient(0, 0, 0, c.height);
    gr.addColorStop(0, 'rgb(' + light.join(',') + ')');
    gr.addColorStop(1, 'rgb(' + dark.join(',') + ')');
    x.fillStyle = gr;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /**
   * Offscreen GPU texture generator. One hidden WebGL canvas renders a fragment
   * shader into a square, then copies the result to a plain 2D canvas (cacheable,
   * drawImage-able, immune to context loss).
   *
   * frag      fragment shader body (PRECISION is prepended here)
   * uniforms  uniform names to look up
   * render(size, setUniforms): setUniforms(gl, loc) sets every uniform, including
   *           the size. Returns a 2D canvas, or null if the GPU can't do it.
   */
  function createGenerator(frag, uniforms, label) {
    var gen = null;
    var failed = false;

    function init() {
      if (gen && gen.gl && !gen.gl.isContextLost()) return gen;
      gen = null;
      if (failed) return null;
      try {
        var canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        var gl = getGL(canvas, { antialias: false, alpha: false, preserveDrawingBuffer: true });
        if (!gl) throw new Error('WebGL not available');
        if (!hasHighp(gl)) throw new Error('GPU lacks high-precision floats');
        var P = buildProgram(gl, VERT, PRECISION + '\n' + frag, uniforms, ['aPos']);
        gl.useProgram(P.prog);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        var dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
        var maxSize = Math.min(dims ? dims[0] : 2048, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 2048);
        // A lost context is rebuilt on the next render() call
        canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); gen = null; }, false);
        gen = { gl: gl, canvas: canvas, P: P, maxSize: maxSize };
        return gen;
      } catch (e) {
        failed = true;
        warn((label || 'texture') + ' GPU generator unavailable, using flat colour textures.', e);
        return null;
      }
    }

    function render(size, setUniforms) {
      var g = init();
      if (!g || size > g.maxSize) return null;
      var gl = g.gl;
      try {
        g.canvas.width = g.canvas.height = size;
        gl.viewport(0, 0, size, size);
        gl.useProgram(g.P.prog);
        setUniforms(gl, g.P.loc);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        var out = document.createElement('canvas');
        out.width = out.height = size;
        out.getContext('2d').drawImage(g.canvas, 0, 0);
        return out;
      } catch (e) {
        warn((label || 'texture') + ' generation failed', e);
        return null;
      }
    }

    return { render: render };
  }

  // Tiny LRU cache. dispose(value) is called on eviction.
  function lru(max, dispose) {
    var map = {};
    var order = [];
    return {
      get: function (key) {
        if (!(key in map)) return undefined;
        order.splice(order.indexOf(key), 1);
        order.push(key);
        return map[key];
      },
      set: function (key, value) {
        if (key in map) order.splice(order.indexOf(key), 1);
        map[key] = value;
        order.push(key);
        while (order.length > max) {
          var old = order.shift();
          if (dispose) dispose(map[old]);
          delete map[old];
        }
        return value;
      }
    };
  }

  root.GLUtil = {
    VERT: VERT,
    QUAD: QUAD,
    PRECISION: PRECISION,
    warn: warn,
    mulberry32: mulberry32,
    getGL: getGL,
    hasHighp: hasHighp,
    buildProgram: buildProgram,
    rgb01: rgb01,
    makeTexture: makeTexture,
    flatTexture: flatTexture,
    createGenerator: createGenerator,
    lru: lru
  };
})(typeof window !== 'undefined' ? window : this);
