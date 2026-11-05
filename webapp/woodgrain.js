/*
 * woodgrain.js: Procedural pixel-based woodgrain renderer for Sortire PWA.
 * Uses seeded PRNG + FBM value-noise — the same proven algorithm as woodgrain-new.js,
 * now with two texture tiers to stay crisp at 3× DPR (460 PPI devices):
 *
 *   • Disc textures  — 1024 × 1024, one shared atlas per species (fast, re-used)
 *   • BG textures    — 2048 × 2048, per species+seed (generated once, cached)
 *
 * API:
 *   WoodGrain.generate(species, size, seed, isMuted)  → <canvas>
 *   WoodGrain.getMasterTexture(species, seed, muted)   → 2048 px <canvas> (bg use)
 *   WoodGrain.getDiscCanvas(diameter, species, seed, shadeShift) → <canvas>
 *   WoodGrain.getDiscOverlay(diameter) → <canvas> (shading only, transparent)
 *   WoodGrain.renderBackground(el, species, seed, isMuted)
 *   WoodGrain.getSpeciesKey(index)
 *   WoodGrain.getRandomSpecies()
 *   WoodGrain.SPECIES / WoodGrain.SPECIES_KEYS / WoodGrain.mulberry32
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
    purpleheart: { label: 'Purpleheart', light: [134,  72, 122], dark: [ 60,  27,  58], rings: 5,  tilt: 0.45, sharp: 2.0, contrast: 0.45, fiber: 0.22, pores: 0,   rays: 0,    warp: 0.12, tone: 0.06 }
  };

  var SPECIES_KEYS = ['maple', 'whiteOak', 'redOak', 'walnut', 'ebony', 'purpleheart'];

  // Texture resolution tiers:
  //   DISC_SIZE : shared per-species atlas for disc crops (1024 is plenty for any disc ≤700 px)
  //   BG_SIZE   : background texture; must exceed physical_px / dpr at peak DPR (3×)
  //               2622 × 1206 physical / 3 dpr = 874 × 402 logical — 2048 tex covers it without upscale
  var DISC_SIZE = 1024;
  var BG_SIZE   = 2048;

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

  // ── 2D Value Noise (smooth, 0..1) ─────────────────────────────────────────
  function makeNoise(seed) {
    var r = mulberry32(seed), p = [], P = new Uint8Array(512), V = new Float32Array(256), i;
    for (i = 0; i < 256; i++) { p[i] = i; V[i] = r(); }
    for (i = 255; i > 0; i--) { var j = (r() * (i + 1)) | 0, t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 512; i++) P[i] = p[i & 255];
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var X = xi & 255, Y = yi & 255;
      var a = V[P[P[X] + Y]], b = V[P[P[X + 1] + Y]], c = V[P[P[X] + Y + 1]], d = V[P[P[X + 1] + Y + 1]];
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  // Fractal Brownian Motion — blends multiple octaves of noise.
  function fbm(n, x, y, oct) {
    var s = 0, amp = 0.5, freq = 1, tot = 0;
    for (var i = 0; i < oct; i++) { s += amp * n(x * freq, y * freq); tot += amp; freq *= 2; amp *= 0.5; }
    return s / tot;
  }

  // ── Core Texture Generator ────────────────────────────────────────────────
  /**
   * Renders a size×size canvas of realistic pixel woodgrain.
   * @param {string}  name     Species key ('walnut', 'maple', …)
   * @param {number}  size     Canvas edge in px (1024 for discs, 2048 for backgrounds)
   * @param {number}  seed     Integer — controls pith position and ring phase
   * @param {boolean} isMuted  Darken slightly for the winner-background overlay
   * @returns {HTMLCanvasElement}
   */
  function generateCPU(name, size, seed, isMuted) {
    size = size || 1024;
    seed = seed || 1;
    var sp = SPECIES[name] || SPECIES.walnut;
    var r  = mulberry32(seed * 7919 + name.length * 131);
    var nA = makeNoise(seed * 3 + 1);
    var nB = makeNoise(seed * 3 + 2);
    var nC = makeNoise(seed * 3 + 3);

    // Pith position relative to board — drives "cathedral" vs flat-straight grain.
    var cx = r() < 0.55 ? 0.15 + r() * 0.7 : (r() < 0.5 ? -0.4 - r() * 0.6 : 1.4 + r() * 0.6);
    var v0 = 0.2 + r() * 0.6;

    var img = new ImageData(size, size);
    var D = img.data;
    var L = sp.light, K = sp.dark;

    for (var y = 0; y < size; y++) {
      var v = y / size;
      for (var x = 0; x < size; x++) {
        var u = x / size;

        // ── Growth rings: distance from pith, warped by low-frequency FBM ──
        var d  = Math.hypot(u - cx, (v - v0) * sp.tilt) + (fbm(nA, u * 2.5, v * 1.2, 3) - 0.5) * sp.warp;
        var tk = d * sp.rings;
        var k  = Math.floor(tk);
        var f  = tk - k;
        // Earlywood is pale and gradual; latewood is dark and abrupt.
        var w  = Math.pow(f, sp.sharp) * (0.75 + 0.5 * nB(k * 1.7 + 0.3, 7.7));

        // ── Fine fibers: squashed across grain, stretched along it ──
        var fib = fbm(nB, u * 160, v * 7, 2) - 0.5;
        var m   = 0.35 + (w - 0.4) * sp.contrast * 1.6 + fib * sp.fiber * 2;
        m = m < 0 ? 0 : m > 1 ? 1 : m;

        // Broad tonal variation across the board
        var tone = 1 + (fbm(nC, u * 1.6, v * 1.2, 3) - 0.5) * sp.tone * 2;

        var R = (L[0] + (K[0] - L[0]) * m) * tone;
        var G = (L[1] + (K[1] - L[1]) * m) * tone;
        var B = (L[2] + (K[2] - L[2]) * m) * tone;

        // ── Pores: short dark dashes in earlywood (oak species) ──
        if (sp.pores) {
          var pr = nC(u * 200, v * 14);
          if (pr > 0.78) {
            var q = 1 - 0.55 * ((pr - 0.78) / 0.22) * sp.pores * (1 - f * 0.6);
            R *= q; G *= q; B *= q;
          }
        }
        // ── Medullary ray flecks: short light dashes across grain (oak) ──
        if (sp.rays) {
          var ry = nA(u * 8, v * 110);
          if (ry > 0.82) {
            var s = ((ry - 0.82) / 0.18) * sp.rays * 40;
            R += s; G += s; B += s;
          }
        }

        var idx = (y * size + x) * 4;
        D[idx]     = R;   // Uint8ClampedArray clamps automatically
        D[idx + 1] = G;
        D[idx + 2] = B;
        D[idx + 3] = 255;
      }
    }

    // Apply muted overlay for winner-background variant (baked in, no extra pass)
    if (isMuted) {
      for (var i = 0; i < D.length; i += 4) {
        D[i]     = D[i]     * 0.72 | 0;
        D[i + 1] = D[i + 1] * 0.70 | 0;
        D[i + 2] = D[i + 2] * 0.74 | 0;
      }
    }

    var c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  // ── Generator switch ──────────────────────────────────────────────────────
  // 'gl'  : WebGL fragment-shader generator from woodgrain-gl.js (milliseconds).
  // 'cpu' : the original per-pixel JavaScript generator above (seconds at 2048 px).
  // 'gl' silently falls back to 'cpu' if woodgrain-gl.js is missing or WebGL fails.
  var engine = 'gl';

  function generate(name, size, seed, isMuted) {
    if (engine === 'gl' && root.WoodGrainGL) {
      var c = root.WoodGrainGL.generate(name, size, seed, isMuted);
      if (c) return c;
    }
    return generateCPU(name, size, seed, isMuted);
  }

  function setEngine(e) {
    e = (e === 'cpu') ? 'cpu' : 'gl';
    if (e === engine) return;
    engine = e;
    // Textures from the other generator must not be reused
    var k;
    for (k in bgTexCache) { bgTexCache[k].width = bgTexCache[k].height = 0; }
    bgTexCache = {}; bgTexOrder = [];
    discTexCache = {}; discCache = {};
  }

  function getEngine() { return engine; }

  // ── Disc Texture Cache (1024 px, one shared atlas per species) ────────────
  // All discs of the same species crop from this ONE shared texture.
  // This avoids generating a full texture per finger touch (the previous bug).
  var discTexCache = {};

  function getDiscTexture(speciesKey) {
    if (!discTexCache[speciesKey]) {
      // Seed 42 for every species disc atlas — the per-disc seed controls crop/rotation only.
      discTexCache[speciesKey] = generate(speciesKey, DISC_SIZE, 42);
    }
    return discTexCache[speciesKey];
  }

  // ── Background Texture Cache (2048 px, per species+seed+muted) ───────────
  // 2048 × 2048 ensures the texture is never upscaled at 3× DPR (460 PPI).
  //
  // Physical screen at 3× DPR: 2622 × 1206 px
  // We cover-fit the texture: longer axis = 2622 px → scale = 2622/2048 = 1.28× upscale
  // Shorter axis = 1206 px → scale = 1206/2048 = 0.59× — both are within comfortable range.
  // Canvas bicubic interpolation makes 1.28× nearly invisible at 460 PPI.
  var bgTexCache = {};
  var bgTexOrder = [];            // keys, oldest first
  var BG_CACHE_MAX = 4;           // 2048² RGBA ≈ 16 MB each — cap so memory can't grow forever

  /**
   * Returns (and caches) a 2048 px master texture for backgrounds.
   * The texture is always the full-brightness version; the muted winner-bg look
   * is applied at draw time by renderBackground, so the flood and the following
   * round's background share one texture instead of generating it twice.
   * @param {string}  speciesKey
   * @param {number}  seed        Controls pith/ring layout variety between sessions
   */
  function getMasterTexture(speciesKey, seed) {
    speciesKey = speciesKey || 'walnut';
    seed = (seed || 42) | 0;
    var key = speciesKey + '_' + seed;
    if (bgTexCache[key]) {
      // refresh recency
      var i = bgTexOrder.indexOf(key);
      if (i !== -1) bgTexOrder.splice(i, 1);
      bgTexOrder.push(key);
      return bgTexCache[key];
    }
    bgTexCache[key] = generate(speciesKey, BG_SIZE, seed, false);
    bgTexOrder.push(key);
    while (bgTexOrder.length > BG_CACHE_MAX) {
      var old = bgTexOrder.shift();
      var oc = bgTexCache[old];
      if (oc) { oc.width = oc.height = 0; }   // release the bitmap memory
      delete bgTexCache[old];
    }
    return bgTexCache[key];
  }

  // ── Disc shading layer (edge darkening, highlight, rim, bevel) ────────────
  // Shared by getDiscCanvas (drawn over the wood face) and getDiscOverlay (drawn
  // over an arbitrary face, e.g. the winner's window into the flood texture).
  function drawShading(ctx, r, diameter) {
    var TAU = Math.PI * 2;
    // Edge shading (radial darkening toward rim — 3-D depth cue) ────
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

    // Specular highlight (top-left lit, bottom-right shadowed) ───────
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r, 0, TAU);
    ctx.clip();
    var specGrad = ctx.createLinearGradient(0, 0, diameter, diameter);
    specGrad.addColorStop(0,   'rgba(255,255,255,0.22)');
    specGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
    specGrad.addColorStop(1,   'rgba(0,0,0,0.18)');
    ctx.fillStyle = specGrad;
    ctx.fillRect(0, 0, diameter, diameter);
    ctx.restore();

    // Rim stroke ─────────────────────────────────────────────────────
    ctx.lineWidth   = r * 0.05;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(r, r, r - ctx.lineWidth / 2, 0, TAU);
    ctx.stroke();

    // Bevel highlight ────────────────────────────────────────────────
    ctx.lineWidth   = r * 0.03;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(r, r, r * 0.93, 0, TAU);
    ctx.stroke();
  }

  var overlayCache = {};

  /**
   * Transparent canvas holding only the disc shading (no wood face, no shadow).
   * Used to put the same 3-D look on top of a face drawn from another texture.
   */
  function getDiscOverlay(diameter) {
    diameter = Math.max(32, diameter | 0);
    if (overlayCache[diameter]) return overlayCache[diameter];
    var c = document.createElement('canvas');
    c.width = c.height = diameter;
    drawShading(c.getContext('2d'), diameter / 2, diameter);
    overlayCache[diameter] = c;
    return c;
  }

  // ── Disc Renderer ──────────────────────────────────────────────────────────
  var discCache = {};

  /**
   * Pre-renders a wooden disc canvas.
   * Crops a randomly rotated patch from the shared 1024 px species atlas and
   * composites edge shading / specular highlight / bevel on top.
   *
   * @param {number} diameter   Physical px size (pass baseRadius × 2 × dpr × 1.5 from app.js)
   * @param {string} species    Species key
   * @param {number} seed       Per-disc seed — controls crop origin and rotation only
   * @param {number} [shadeShift]  –0.25..+0.25 darkens/lightens the face
   * @returns {HTMLCanvasElement}
   */
  function getDiscCanvas(diameter, species, seed, shadeShift) {
    diameter   = Math.max(32, diameter | 0);
    species    = species    || 'walnut';
    seed       = (seed || 1) | 0;
    shadeShift = shadeShift || 0;

    var cacheKey = species + '_' + diameter + '_' + seed + '_' + shadeShift.toFixed(2);
    if (discCache[cacheKey]) return discCache[cacheKey];

    // Shared 1024 px atlas — never generated more than once per species.
    var tex  = getDiscTexture(species);
    // Per-disc PRNG drives crop origin + rotation (independent of texture generation).
    var rand = mulberry32(seed * 3571 + diameter);
    var TAU  = Math.PI * 2;

    var c   = document.createElement('canvas');
    c.width = c.height = diameter;
    var ctx = c.getContext('2d');
    var r   = diameter / 2;

    // NOTE: no drop shadow is baked in here. The disc fills the whole canvas, so any
    // shadow drawn into it gets clipped at the canvas edge and shows up as a faint
    // square around the disc. app.js draws the shadow live on the main canvas instead.

    // ── 1. Wood face: random crop + rotation from shared species atlas ────
    // Crop a 55% window (560 px of 1024) so we can randomise the patch origin
    // while keeping plenty of grain detail even after downscaling to the disc.
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r, 0, TAU);
    ctx.clip();
    ctx.translate(r, r);
    ctx.rotate(rand() * TAU);
    var sw = tex.width * 0.55;                     // 563 px crop from 1024 px atlas
    var ox = rand() * (tex.width  - sw);
    var oy = rand() * (tex.height - sw);
    ctx.drawImage(tex, ox, oy, sw, sw, -r, -r, 2 * r, 2 * r);
    ctx.restore();

    // ── 2. Optional shade shift (per-disc darkness/lightness variance) ────
    if (shadeShift !== 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r, 0, TAU);
      ctx.clip();
      if (shadeShift < 0) {
        ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.6, -shadeShift).toFixed(3) + ')';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.6, shadeShift).toFixed(3) + ')';
      }
      ctx.fillRect(0, 0, diameter, diameter);
      ctx.restore();
    }

    // ── 3. Edge shading, specular highlight, rim and bevel ────────────────
    drawShading(ctx, r, diameter);

    discCache[cacheKey] = c;
    return c;
  }

  // ── Species recolour ──────────────────────────────────────────────────────
  // Every texture pixel lies (roughly) on the line from the species' earlywood colour
  // to its latewood colour. Project each pixel onto that line to get its position m
  // (0 = light, 1 = dark), then re-colour it along the TARGET species' line. Grain is
  // preserved; colour and brightness become the target wood's. The pixel's broad tonal
  // variation (brightness relative to the line) is kept via the k ratio.
  function recolor(ctx, pw, ph, fromKey, toKey) {
    var A = SPECIES[fromKey] || SPECIES.walnut, B = SPECIES[toKey];
    if (!B || A === B) return;
    var img = ctx.getImageData(0, 0, pw, ph), D = img.data;
    var Lr = A.light[0], Lg = A.light[1], Lb = A.light[2];
    var dr = A.dark[0] - Lr, dg = A.dark[1] - Lg, db = A.dark[2] - Lb;
    var denom = (dr * dr + dg * dg + db * db) || 1;
    var Br = B.light[0], Bg = B.light[1], Bb = B.light[2];
    var er = B.dark[0] - Br, eg = B.dark[1] - Bg, eb = B.dark[2] - Bb;
    for (var i = 0; i < D.length; i += 4) {
      var r = D[i], g = D[i + 1], b = D[i + 2];
      var m = ((r - Lr) * dr + (g - Lg) * dg + (b - Lb) * db) / denom;
      m = m < 0 ? 0 : m > 1 ? 1 : m;
      var ta = (Lr + dr * m) + (Lg + dg * m) + (Lb + db * m);
      var k = ta > 0 ? (r + g + b) / ta : 1;
      k = k < 0.8 ? 0.8 : k > 1.25 ? 1.25 : k;
      D[i]     = (Br + er * m) * k;   // Uint8ClampedArray clamps automatically
      D[i + 1] = (Bg + eg * m) * k;
      D[i + 2] = (Bb + eb * m) * k;
    }
    ctx.putImageData(img, 0, 0);
  }

  // ── Background Renderer ───────────────────────────────────────────────────
  /**
   * Renders the woodgrain tabletop background into a container div.
   * Uses a 2048 px texture with cover-fit scaling (like background-size: cover)
   * so the full physical canvas is filled without upscaling artefacts at 3× DPR.
   *
   * At 460 PPI / 3× DPR (physical 2622 × 1206):
   *   - Texture: 2048 × 2048
   *   - Long edge scale: 2622 / 2048 = 1.28× — microscopic softening at 460 PPI
   *   - Short edge scale: 1206 / 2048 = 0.59× — sharp downscale
   *
   * @param {Element} container   #wood-bg or #wood-bg-winner div
   * @param {string}  speciesKey
   * @param {number}  seed
   * @param {boolean} isMuted
   * @param {string} [recolorTo]  Species key to recolour the wood to, keeping the grain
   */
  function renderBackground(container, speciesKey, seed, isMuted, recolorTo) {
    if (!container) return;
    speciesKey = speciesKey || 'walnut';
    seed = (seed || 42) | 0;

    // Reuse or create a <canvas> inside the container
    var cvs = container.querySelector('canvas');
    if (!cvs) {
      cvs = document.createElement('canvas');
      cvs.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;';
      container.innerHTML = '';
      container.appendChild(cvs);
    }

    var dpr = window.devicePixelRatio || 1;
    var w   = container.offsetWidth  || window.innerWidth;
    var h   = container.offsetHeight || window.innerHeight;
    var pw  = Math.round(w * dpr);    // physical pixels wide
    var ph  = Math.round(h * dpr);    // physical pixels tall

    cvs.width  = pw;
    cvs.height = ph;

    var ctx = cvs.getContext('2d');
    // imageSmoothingQuality 'high' enables bicubic filtering — matters for the
    // 1.28× upscale on the long axis at 3× DPR.
    ctx.imageSmoothingEnabled  = true;
    ctx.imageSmoothingQuality  = 'high';

    var tex = getMasterTexture(speciesKey, seed);

    // ── Cover-fit: scale texture uniformly so it fills the physical canvas ──
    // This matches CSS `background-size: cover` behaviour.  One axis will be
    // exactly filled; the other is cropped (centred) if the texture is taller.
    var scaleX = pw / tex.width;
    var scaleY = ph / tex.height;
    var scale  = Math.max(scaleX, scaleY);
    var dw     = tex.width  * scale;
    var dh     = tex.height * scale;
    var dx     = (pw - dw) / 2;
    var dy     = (ph - dh) / 2;

    ctx.drawImage(tex, dx, dy, dw, dh);

    // Muted variant (previous-winner background): same factors the old baked-in
    // version used (0.72 / 0.70 / 0.74), applied as a multiply overlay.
    if (isMuted) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(184,179,189)';
      ctx.fillRect(0, 0, pw, ph);
      ctx.restore();
    }

    // Recolour to another species (keeps this texture's grain, takes the target's
    // colour AND brightness).
    if (recolorTo && recolorTo !== speciesKey) recolor(ctx, pw, ph, speciesKey, recolorTo);

    // ── Vignette: subtle radial darkening toward the edges (table-depth cue) ─
    var vig = ctx.createRadialGradient(
      pw / 2, ph / 2, Math.min(pw, ph) * 0.3,
      pw / 2, ph / 2, Math.max(pw, ph) * 0.75
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, pw, ph);
  }

  // ── Utility Helpers ───────────────────────────────────────────────────────
  function getSpeciesKey(index) {
    index = Math.max(0, Math.min(SPECIES_KEYS.length - 1, index | 0));
    return SPECIES_KEYS[index];
  }

  // Base colour of a species: midpoint of its earlywood and latewood colours.
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

  // ── Public API ────────────────────────────────────────────────────────────
  root.WoodGrain = {
    SPECIES:          SPECIES,
    SPECIES_KEYS:     SPECIES_KEYS,
    mulberry32:       mulberry32,
    generate:         generate,
    setEngine:        setEngine,
    getEngine:        getEngine,
    getMasterTexture: getMasterTexture,
    getDiscCanvas:    getDiscCanvas,
    getDiscOverlay:   getDiscOverlay,
    renderBackground: renderBackground,
    getSpeciesKey:    getSpeciesKey,
    getBaseColor:     getBaseColor,
    getRandomSpecies: getRandomSpecies
  };

})(typeof window !== 'undefined' ? window : this);
