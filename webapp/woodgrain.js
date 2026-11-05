/**
 * woodgrain.js: Procedural wood grain generator & wooden puck renderer for Sortire PWA.
 * Mirrors WoodgrainEngine.kt and woodgrain-new.js with zero dependencies.
 */
(function (root) {
  'use strict';

  var SPECIES = {
    maple: {
      label: 'Maple',
      light: [236, 212, 170],
      dark: [204, 168, 116],
      rings: 14,
      tilt: 0.40,
      sharp: 2.2,
      contrast: 0.35,
      fiber: 0.10,
      pores: 0,
      rays: 0,
      warp: 0.10,
      tone: 0.04
    },
    whiteOak: {
      label: 'White Oak',
      light: [208, 183, 141],
      dark: [148, 116, 78],
      rings: 9,
      tilt: 0.35,
      sharp: 2.6,
      contrast: 0.75,
      fiber: 0.12,
      pores: 0.5,
      rays: 0.25,
      warp: 0.18,
      tone: 0.08
    },
    redOak: {
      label: 'Red Oak',
      light: [208, 152, 114],
      dark: [142, 84, 58],
      rings: 8,
      tilt: 0.35,
      sharp: 2.6,
      contrast: 0.80,
      fiber: 0.12,
      pores: 0.6,
      rays: 0.20,
      warp: 0.18,
      tone: 0.08
    },
    walnut: {
      label: 'Walnut',
      light: [112, 78, 56],
      dark: [46, 29, 20],
      rings: 7,
      tilt: 0.40,
      sharp: 2.4,
      contrast: 0.85,
      fiber: 0.16,
      pores: 0.2,
      rays: 0,
      warp: 0.25,
      tone: 0.10
    },
    ebony: {
      label: 'Ebony',
      light: [66, 54, 45],
      dark: [13, 10, 9],
      rings: 5,
      tilt: 0.45,
      sharp: 2.0,
      contrast: 0.45,
      fiber: 0.40,
      pores: 0,
      rays: 0,
      warp: 0.30,
      tone: 0.10
    },
    purpleheart: {
      label: 'Purpleheart',
      light: [134, 72, 122],
      dark: [60, 27, 58],
      rings: 5,
      tilt: 0.45,
      sharp: 2.0,
      contrast: 0.45,
      fiber: 0.22,
      pores: 0,
      rays: 0,
      warp: 0.12,
      tone: 0.06
    }
  };

  var SPECIES_KEYS = ['maple', 'whiteOak', 'redOak', 'walnut', 'ebony', 'purpleheart'];
  var masterTextureCache = {};
  var discCache = {};

  // Seeded PRNG (mulberry32)
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 2D value noise
  function makeNoise(seed) {
    var r = rng(seed), p = [], P = new Uint8Array(512), V = new Float32Array(256), i;
    for (i = 0; i < 256; i++) { p[i] = i; V[i] = r(); }
    for (i = 255; i > 0; i--) { var j = (r() * (i + 1)) | 0, t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 512; i++) P[i] = p[i & 255];
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
      var a = V[P[P[X] + Y]], b = V[P[P[X + 1] + Y]], c = V[P[P[X] + Y + 1]], d = V[P[P[X + 1] + Y + 1]];
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  function fbm(n, x, y, oct) {
    var s = 0, a = 0.5, f = 1, tot = 0;
    for (var i = 0; i < oct; i++) { s += a * n(x * f, y * f); tot += a; f *= 2; a *= 0.5; }
    return s / tot;
  }

  // Generates master wood grain texture
  function generate(name, size, seed) {
    size = size || 512;
    seed = seed || 42;
    var sp = SPECIES[name] || SPECIES.walnut;
    var r = rng(seed * 7919 + name.length * 131);
    var nA = makeNoise(seed * 3 + 1), nB = makeNoise(seed * 3 + 2), nC = makeNoise(seed * 3 + 3);

    var cx = r() < 0.55 ? 0.15 + r() * 0.7 : (r() < 0.5 ? -0.4 - r() * 0.6 : 1.4 + r() * 0.6);
    var v0 = 0.2 + r() * 0.6;

    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(size, size);
    var D = img.data, L = sp.light, K = sp.dark;

    for (var y = 0; y < size; y++) {
      var v = y / size;
      for (var x = 0; x < size; x++) {
        var u = x / size;

        var d = Math.hypot(u - cx, (v - v0) * sp.tilt) + (fbm(nA, u * 2.5, v * 1.2, 3) - 0.5) * sp.warp;
        var t = d * sp.rings, k = Math.floor(t), f = t - k;
        var w = Math.pow(f, sp.sharp) * (0.75 + 0.5 * nB(k * 1.7 + 0.3, 7.7));

        var fib = fbm(nB, u * 160, v * 7, 2) - 0.5;
        var m = 0.35 + (w - 0.4) * sp.contrast * 1.6 + fib * sp.fiber * 2;
        m = m < 0 ? 0 : m > 1 ? 1 : m;
        var tone = 1 + (fbm(nC, u * 1.6, v * 1.2, 3) - 0.5) * sp.tone * 2;

        var R = (L[0] + (K[0] - L[0]) * m) * tone;
        var G = (L[1] + (K[1] - L[1]) * m) * tone;
        var B = (L[2] + (K[2] - L[2]) * m) * tone;

        if (sp.pores) {
          var pr = nC(u * 200, v * 14);
          if (pr > 0.78) {
            var q = 1 - 0.55 * ((pr - 0.78) / 0.22) * sp.pores * (1 - f * 0.6);
            R *= q; G *= q; B *= q;
          }
        }
        if (sp.rays) {
          var ry = nA(u * 8, v * 110);
          if (ry > 0.82) {
            var s = ((ry - 0.82) / 0.18) * sp.rays * 40;
            R += s; G += s; B += s;
          }
        }

        var i = (y * size + x) * 4;
        D[i] = Math.min(255, Math.max(0, R | 0));
        D[i + 1] = Math.min(255, Math.max(0, G | 0));
        D[i + 2] = Math.min(255, Math.max(0, B | 0));
        D[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function getMasterTexture(name, size) {
    name = name || 'walnut';
    size = size || 512;
    var key = name + '_' + size;
    if (!masterTextureCache[key]) {
      masterTextureCache[key] = generate(name, size, 42);
    }
    return masterTextureCache[key];
  }

  // Pre-renders a disc into an offscreen canvas with shadows, bevels and rim highlights
  function getDiscCanvas(diameter, speciesName, seed, shadeShift) {
    diameter = Math.max(16, diameter | 0);
    speciesName = speciesName || 'walnut';
    seed = seed || 1;
    shadeShift = shadeShift || 0;

    var cacheKey = speciesName + '_' + diameter + '_' + seed + '_' + shadeShift.toFixed(2);
    if (discCache[cacheKey]) {
      return discCache[cacheKey];
    }

    var tex = getMasterTexture(speciesName);
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = diameter;
    var ctx = canvas.getContext('2d');
    var r = diameter / 2;
    var rand = rng(seed);
    var TAU = Math.PI * 2;

    // Wood face clipped to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r, 0, TAU);
    ctx.clip();

    ctx.translate(r, r);
    ctx.rotate(rand() * TAU);
    var sw = tex.width * 0.5;
    var sx = rand() * (tex.width - sw);
    var sy = rand() * (tex.height - sw);
    ctx.drawImage(tex, sx, sy, sw, sw, -r, -r, diameter, diameter);
    ctx.restore();

    // Shade shift (darken or lighten wood tone)
    if (shadeShift !== 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r, 0, TAU);
      ctx.clip();
      if (shadeShift < 0) {
        var alphaDark = Math.min(0.65, -shadeShift);
        ctx.fillStyle = 'rgba(0,0,0,' + alphaDark + ')';
      } else {
        var alphaLight = Math.min(0.65, shadeShift);
        ctx.fillStyle = 'rgba(255,255,255,' + alphaLight + ')';
      }
      ctx.fillRect(0, 0, diameter, diameter);
      ctx.restore();
    }

    // Radial edge curvature shading (darkens outer edge)
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r, 0, TAU);
    ctx.clip();
    var edgeGrad = ctx.createRadialGradient(r, r, r * 0.55, r, r, r);
    edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(1, 'rgba(0,0,0,0.40)');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, diameter, diameter);

    // Top-left highlight & bottom-right shade
    var hiGrad = ctx.createLinearGradient(0, 0, diameter, diameter);
    hiGrad.addColorStop(0, 'rgba(255,255,255,0.22)');
    hiGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
    hiGrad.addColorStop(1, 'rgba(0,0,0,0.20)');
    ctx.fillStyle = hiGrad;
    ctx.fillRect(0, 0, diameter, diameter);
    ctx.restore();

    // Dark rim border
    var rimWidth = Math.max(1.5, r * 0.05);
    ctx.lineWidth = rimWidth;
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.arc(r, r, r - rimWidth / 2, 0, TAU);
    ctx.stroke();

    // Bevel highlight
    var bevelWidth = Math.max(1, r * 0.03);
    ctx.lineWidth = bevelWidth;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(r, r, r * 0.93, 0, TAU);
    ctx.stroke();

    discCache[cacheKey] = canvas;
    return canvas;
  }

  function getSpeciesKey(index) {
    index = Math.max(0, Math.min(SPECIES_KEYS.length - 1, index | 0));
    return SPECIES_KEYS[index];
  }

  function getRandomSpecies() {
    var idx = Math.floor(Math.random() * SPECIES_KEYS.length);
    return SPECIES_KEYS[idx];
  }

  root.WoodGrain = {
    SPECIES: SPECIES,
    SPECIES_KEYS: SPECIES_KEYS,
    generate: generate,
    getMasterTexture: getMasterTexture,
    getDiscCanvas: getDiscCanvas,
    getSpeciesKey: getSpeciesKey,
    getRandomSpecies: getRandomSpecies,
    rng: rng
  };
})(typeof window !== 'undefined' ? window : this);
