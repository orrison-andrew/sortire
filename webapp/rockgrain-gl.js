/**
 * rockgrain-gl.js: Procedural 2D GLSL shaders for generating varying rock/stone textures.
 */
(function () {
  'use strict';

  var canvas = document.createElement('canvas');
  var gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, alpha: false, antialias: true }) || 
           canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true, alpha: false });

  if (!gl) {
    console.warn('WebGL not supported, falling back to basic rendering for stone');
    window.RockGrainGL = null;
    return;
  }

  var VERTS = [
    'attribute vec2 aPos;',
    'void main() { gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var UTILS = [
    'precision highp float;',
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
    '  for(int i=0; i<4; i++) { f += amp * snoise(p); p *= 2.0; amp *= 0.5; }',
    '  return f * 0.5 + 0.5;',
    '}',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }'
  ].join('\n');

  var GEN_FRAG = [
    UTILS,
    'uniform vec3 uColorA;',
    'uniform vec3 uColorB;',
    'uniform vec3 uColorC;',
    'uniform float uScale;',
    'uniform float uRoughness;',
    'uniform float uSpeckle;',
    'uniform float uFoliation;',
    'uniform vec2 uOffA;',
    'uniform vec2 uOffB;',
    'uniform vec2 uSize;',
    'uniform float uColorShift;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / uSize;',
    '  vec2 p = uv * uScale;',
    '  ',
    '  float slateGrain = 0.0;',
    '  if (uFoliation > 0.01) {',
    '    vec2 sp = vec2(p.x * 0.5, p.y * (14.0 + uFoliation * 10.0));',
    '    float f1 = fbm(sp, uOffA);',
    '    slateGrain = (f1 - 0.5) * uFoliation * 1.5;',
    '  }',
    '  ',
    '  float n1 = fbm(p * 1.8 + vec2(0.0, slateGrain * 0.2), uOffA);',
    '  float n2 = fbm(p * 3.5 + vec2(slateGrain * 0.1, 0.0), uOffB);',
    '  ',
    '  vec3 col = mix(uColorA, uColorB, smoothstep(0.2, 0.8, n1 + slateGrain * 0.3));',
    '  ',
    '  float specks = smoothstep(0.6, 0.9, n2);',
    '  col = mix(col, uColorC, clamp((specks + n2 * 0.3) * uSpeckle, 0.0, 1.0));',
    '  ',
    '  float micro = (hash(gl_FragCoord.xy) - 0.5) * uRoughness;',
    '  col = clamp(col + vec3(micro), 0.0, 1.0);',
    '  col = clamp(col * uColorShift, 0.0, 1.0);',
    '  ',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var BG_FRAG = [
    UTILS,
    'uniform sampler2D uTex;',
    'uniform vec2 uSize;',
    'uniform float uTime;',
    'uniform vec2 uTilt;',
    'uniform float uSheen;',
    'uniform float uVignette;',
    'uniform vec2 uFloodCenter;',
    'uniform float uFloodR;',
    'uniform float uFloodFeather;',
    'uniform float uFloodRipple;',
    'uniform float uFloodGrainEdge;',
    'uniform vec3 uBaseColorA;',
    'uniform vec3 uBaseColorB;',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / uSize;',
    '  vec3 col = texture2D(uTex, uv).rgb;',
    '  ',
    '  if (uFloodR > 0.0) {',
    '    float d = distance(gl_FragCoord.xy, uFloodCenter);',
    '    float edge = uFloodR - d;',
    '    ',
    '    if (edge < 0.0) discard;',
    '    ',
    '    float alpha = 1.0;',
    '    if (uFloodFeather > 0.0 && edge < uFloodFeather) {',
    '      alpha = smoothstep(0.0, uFloodFeather, edge);',
    '    }',
    '    ',
    '    if (uFloodGrainEdge > 0.0 && edge < uFloodFeather) {',
    '      float g = fbm(uv * 10.0, vec2(0.0));',
    '      float baseLum = dot(col, vec3(0.299, 0.587, 0.114));',
    '      alpha = mix(alpha, smoothstep(0.0, 1.0, alpha + (g - 0.5) * uFloodGrainEdge + (baseLum - 0.5) * uFloodGrainEdge), alpha);',
    '    }',
    '    ',
    '    if (uFloodRipple > 0.0 && edge > 0.0 && edge < uFloodFeather * 2.0) {',
    '      float r = sin(edge * 0.15 - uTime * 5.0) * uFloodRipple * smoothstep(0.0, uFloodFeather, uFloodFeather - abs(edge - uFloodFeather));',
    '      col += vec3(r);',
    '    }',
    '    ',
    '    if (alpha <= 0.0) discard;',
    '    if (alpha < 1.0) {',
    '      gl_FragColor = vec4(col, alpha);',
    '      return;',
    '    }',
    '  }',
    '  ',
    '  if (uSheen > 0.0) {',
    '    vec3 lightVec = normalize(vec3(-0.55 + uTilt.x * 0.8, -0.65 + uTilt.y * 0.8, 1.2));',
    '    vec3 normal = normalize(vec3((uv.x - 0.5)*0.2, (uv.y - 0.5)*0.2, 1.0));',
    '    float spec = pow(max(dot(reflect(-lightVec, normal), vec3(0.0,0.0,1.0)), 0.0), 30.0);',
    '    col += vec3(spec * uSheen);',
    '  }',
    '  ',
    '  if (uVignette > 0.0) {',
    '    float dist = distance(uv, vec2(0.5));',
    '    float v = smoothstep(0.3, 1.0, dist);',
    '    col = mix(col, col * 0.3, v * uVignette);',
    '  }',
    '  ',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compileShader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function createProgram(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compileShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    return p;
  }

  var genProg = createProgram(VERTS, GEN_FRAG);
  var bgProg = createProgram(VERTS, BG_FRAG);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

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

  function seedRandom(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function setVec3(prog, name, arr) {
    gl.uniform3f(gl.getUniformLocation(prog, name), arr[0]/255, arr[1]/255, arr[2]/255);
  }

  function flatTexture(w, h, rgb) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
    x.fillRect(0, 0, w, h);
    return c;
  }

  function generateGL(w, h, rockType, seed, shift) {
    var src = TYPES[rockType] || TYPES.blueSlate;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.useProgram(genProg);

    var rng = seedRandom(seed);
    var oAx = rng() * 1000, oAy = rng() * 1000;
    var oBx = rng() * 1000, oBy = rng() * 1000;

    gl.uniform2f(gl.getUniformLocation(genProg, 'uSize'), w, h);
    setVec3(genProg, 'uColorA', src.colorA);
    setVec3(genProg, 'uColorB', src.colorB);
    setVec3(genProg, 'uColorC', src.colorC);
    gl.uniform1f(gl.getUniformLocation(genProg, 'uScale'), src.scale);
    gl.uniform1f(gl.getUniformLocation(genProg, 'uRoughness'), src.roughness);
    gl.uniform1f(gl.getUniformLocation(genProg, 'uSpeckle'), src.speckle);
    gl.uniform1f(gl.getUniformLocation(genProg, 'uFoliation'), src.foliation);
    gl.uniform2f(gl.getUniformLocation(genProg, 'uOffA'), oAx, oAy);
    gl.uniform2f(gl.getUniformLocation(genProg, 'uOffB'), oBx, oBy);
    gl.uniform1f(gl.getUniformLocation(genProg, 'uColorShift'), 1.0 + (shift || 0));

    var aPos = gl.getAttribLocation(genProg, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    return canvas;
  }

  function createBackground(w, h, rockType, seed) {
    var src = TYPES[rockType] || TYPES.blueSlate;
    var shift = (seed % 100) / 100 * 0.1 - 0.05;
    
    var baseCanvas = generateGL(w, h, rockType, seed, shift);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, baseCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    return { tex: tex, type: src };
  }

  var bgTexCache = {};

  function getCachedBackground(w, h, rockType, seed) {
    var key = w + 'x' + h + '_' + rockType + '_' + seed;
    if (bgTexCache[key]) return bgTexCache[key];
    bgTexCache[key] = createBackground(w, h, rockType, seed);
    return bgTexCache[key];
  }

  function drawFlood(opts) {
    var w = opts.width, h = opts.height;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);

    var bgObj = getCachedBackground(w, h, opts.rockType, opts.seed);

    gl.useProgram(bgProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bgObj.tex);
    gl.uniform1i(gl.getUniformLocation(bgProg, 'uTex'), 0);

    gl.uniform2f(gl.getUniformLocation(bgProg, 'uSize'), w, h);
    gl.uniform1f(gl.getUniformLocation(bgProg, 'uTime'), opts.time || 0);
    gl.uniform2f(gl.getUniformLocation(bgProg, 'uTilt'), opts.tiltX || 0, opts.tiltY || 0);
    gl.uniform1f(gl.getUniformLocation(bgProg, 'uSheen'), opts.sheen || 0.15);
    gl.uniform1f(gl.getUniformLocation(bgProg, 'uVignette'), opts.vignette || 0.7);

    setVec3(bgProg, 'uBaseColorA', bgObj.type.colorA);
    setVec3(bgProg, 'uBaseColorB', bgObj.type.colorB);

    if (opts.flood) {
      var dpr = window.devicePixelRatio || 1;
      gl.uniform2f(gl.getUniformLocation(bgProg, 'uFloodCenter'), opts.flood.x * dpr, h - opts.flood.y * dpr);
      gl.uniform1f(gl.getUniformLocation(bgProg, 'uFloodR'), opts.flood.r * dpr);
      gl.uniform1f(gl.getUniformLocation(bgProg, 'uFloodFeather'), opts.flood.feather * dpr);
      gl.uniform1f(gl.getUniformLocation(bgProg, 'uFloodRipple'), opts.flood.ripple || 0);
      gl.uniform1f(gl.getUniformLocation(bgProg, 'uFloodGrainEdge'), opts.flood.grain || 0);
    } else {
      gl.uniform1f(gl.getUniformLocation(bgProg, 'uFloodR'), 0.0);
    }

    var aPos = gl.getAttribLocation(bgProg, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    return canvas;
  }

  function getDiscCanvas(d, rockType, seed, shift) {
    var c = generateGL(d, d, rockType, seed, shift);
    var out = document.createElement('canvas');
    out.width = d; out.height = d;
    var ctx = out.getContext('2d');
    ctx.beginPath();
    ctx.arc(d/2, d/2, d/2, 0, Math.PI*2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(c, 0, 0);
    return out;
  }

  window.RockGrainGL = {
    ROCK_TYPES: ROCK_TYPES,
    TYPES: TYPES,
    getTypeKey: function(idx) { return ROCK_TYPES[idx % ROCK_TYPES.length]; },
    drawFlood: drawFlood,
    getDiscCanvas: getDiscCanvas
  };
})();
