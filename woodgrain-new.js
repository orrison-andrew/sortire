/*
 * woodgrain.js: procedural wood grain + wooden disc renderer. No dependencies.
 *
 *   const tex = WoodGrain.generate('walnut', 384, 42);   // -> <canvas> (square texture)
 *   WoodGrain.drawDisc(ctx, tex, x, y, radius, rand);     // wooden disc with drop shadow
 *
 * Generate each species ONCE (fixed seed) and reuse it: every disc takes a random crop of the
 * texture at a random rotation, so discs look different but you only pay generation cost once.
 */
(function (root) {
  'use strict';

  // Species presets. light/dark = earlywood/latewood colors, rings = growth rings across the board,
  // tilt < 1 stretches the ring ellipses along the grain, contrast = ring visibility,
  // fiber = fine streaks, pores = open-grain dashes (oak), rays = medullary ray flecks.
  var SPECIES = {
    maple:       { label: 'Maple',       light: [236, 212, 170], dark: [204, 168, 116], rings: 14, tilt: 0.40, sharp: 2.2, contrast: 0.35, fiber: 0.10, pores: 0,   rays: 0,    warp: 0.10, tone: 0.04 },
    whiteOak:    { label: 'White oak',   light: [208, 183, 141], dark: [148, 116,  78], rings: 9,  tilt: 0.35, sharp: 2.6, contrast: 0.75, fiber: 0.12, pores: 0.5, rays: 0.25, warp: 0.18, tone: 0.08 },
    redOak:      { label: 'Red oak',     light: [208, 152, 114], dark: [142,  84,  58], rings: 8,  tilt: 0.35, sharp: 2.6, contrast: 0.80, fiber: 0.12, pores: 0.6, rays: 0.20, warp: 0.18, tone: 0.08 },
    walnut:      { label: 'Walnut',      light: [112,  78,  56], dark: [ 46,  29,  20], rings: 7,  tilt: 0.40, sharp: 2.4, contrast: 0.85, fiber: 0.16, pores: 0.2, rays: 0,    warp: 0.25, tone: 0.10 },
    ebony:       { label: 'Ebony',       light: [ 66,  54,  45], dark: [ 13,  10,   9], rings: 5,  tilt: 0.45, sharp: 2.0, contrast: 0.45, fiber: 0.40, pores: 0,   rays: 0,    warp: 0.30, tone: 0.10 },
    purpleheart: { label: 'Purpleheart', light: [134,  72, 122], dark: [ 60,  27,  58], rings: 5,  tilt: 0.45, sharp: 2.0, contrast: 0.45, fiber: 0.22, pores: 0,   rays: 0,    warp: 0.12, tone: 0.06 }
  };

  // Seeded PRNG (mulberry32).
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 2D value noise (smooth, 0..1).
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

  // Returns a size x size canvas of wood. Grain runs top to bottom.
  function generate(name, size, seed) {
    size = size || 384; seed = seed || 1;
    var sp = SPECIES[name], r = rng(seed * 7919 + name.length * 131);
    var nA = makeNoise(seed * 3 + 1), nB = makeNoise(seed * 3 + 2), nC = makeNoise(seed * 3 + 3);

    // Where the tree's center (pith) sits relative to the board: inside = "cathedral" arches,
    // outside = gently curved straight grain.
    var cx = r() < 0.55 ? 0.15 + r() * 0.7 : (r() < 0.5 ? -0.4 - r() * 0.6 : 1.4 + r() * 0.6);
    var v0 = 0.2 + r() * 0.6;

    var img = new ImageData(size, size), D = img.data, L = sp.light, K = sp.dark;
    for (var y = 0; y < size; y++) {
      var v = y / size;
      for (var x = 0; x < size; x++) {
        var u = x / size;

        // Growth rings: distance from the pith, warped by low-frequency noise.
        var d = Math.hypot(u - cx, (v - v0) * sp.tilt) + (fbm(nA, u * 2.5, v * 1.2, 3) - 0.5) * sp.warp;
        var t = d * sp.rings, k = Math.floor(t), f = t - k;
        // Earlywood is pale and gradual, latewood is dark and ends abruptly; each ring varies a bit.
        var w = Math.pow(f, sp.sharp) * (0.75 + 0.5 * nB(k * 1.7 + 0.3, 7.7));

        // Fine fibers: noise squashed across the grain and stretched along it.
        var fib = fbm(nB, u * 160, v * 7, 2) - 0.5;
        var m = 0.35 + (w - 0.4) * sp.contrast * 1.6 + fib * sp.fiber * 2;
        m = m < 0 ? 0 : m > 1 ? 1 : m;
        var tone = 1 + (fbm(nC, u * 1.6, v * 1.2, 3) - 0.5) * sp.tone * 2;

        var R = (L[0] + (K[0] - L[0]) * m) * tone;
        var G = (L[1] + (K[1] - L[1]) * m) * tone;
        var B = (L[2] + (K[2] - L[2]) * m) * tone;

        // Pores: short dark dashes, mostly in earlywood (oak).
        if (sp.pores) {
          var pr = nC(u * 200, v * 14);
          if (pr > 0.78) {
            var q = 1 - 0.55 * ((pr - 0.78) / 0.22) * sp.pores * (1 - f * 0.6);
            R *= q; G *= q; B *= q;
          }
        }
        // Medullary ray flecks: short light dashes across the grain (oak).
        if (sp.rays) {
          var ry = nA(u * 8, v * 110);
          if (ry > 0.82) { var s = ((ry - 0.82) / 0.18) * sp.rays * 40; R += s; G += s; B += s; }
        }

        var i = (y * size + x) * 4;
        D[i] = R; D[i + 1] = G; D[i + 2] = B; D[i + 3] = 255;   // Uint8ClampedArray clamps
      }
    }
    var c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  // Draws a wooden disc at (cx, cy): drop shadow, random crop + rotation of the texture, soft
  // edge shading, a top-left highlight, and a thin rim.
  function drawDisc(ctx, tex, cx, cy, r, rand) {
    rand = rand || Math.random;
    var TAU = Math.PI * 2;

    ctx.save();                                   // drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = r * 0.35;
    ctx.shadowOffsetY = r * 0.12;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.save();                                   // wood face
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(rand() * TAU);
    var sw = tex.width * 0.5;
    ctx.drawImage(tex, rand() * (tex.width - sw), rand() * (tex.height - sw), sw, sw, -r, -r, 2 * r, 2 * r);
    ctx.restore();

    ctx.save();                                   // lighting (not rotated with the grain)
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
    ctx.translate(cx, cy);
    var e = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
    e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = e; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    var h = ctx.createLinearGradient(-r, -r, r, r);
    h.addColorStop(0, 'rgba(255,255,255,0.22)'); h.addColorStop(0.5, 'rgba(255,255,255,0)'); h.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = h; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();

    ctx.lineWidth = r * 0.05; ctx.strokeStyle = 'rgba(0,0,0,0.35)';        // rim
    ctx.beginPath(); ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, TAU); ctx.stroke();
    ctx.lineWidth = r * 0.03; ctx.strokeStyle = 'rgba(255,255,255,0.12)';   // bevel highlight
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.93, 0, TAU); ctx.stroke();
  }

  root.WoodGrain = { SPECIES: SPECIES, generate: generate, drawDisc: drawDisc, rng: rng };
})(typeof window !== 'undefined' ? window : this);
