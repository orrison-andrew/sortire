/**
 * Lightweight Procedural Woodgrain Canvas Generator
 * Optimized for startup generation & background/disc sampling.
 */

// Simple pseudo-random 2D Noise Implementation
function createNoise2D() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 256);
  const perm = new Uint8Array(512);
  const grad2 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  function dot(g, x, y) { return g[0] * x + g[1] * y; }
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }

  return function noise(x, y) {
    let X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    let u = fade(x), v = fade(y);
    let gi00 = perm[X + perm[Y]] % 8, gi01 = perm[X + perm[Y + 1]] % 8;
    let gi10 = perm[X + 1 + perm[Y]] % 8, gi11 = perm[X + 1 + perm[Y + 1]] % 8;
    let n00 = dot(grad2[gi00], x, y), n01 = dot(grad2[gi01], x, y - 1);
    let n10 = dot(grad2[gi10], x - 1, y), n11 = dot(grad2[gi11], x - 1, y - 1);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
  };
}

// Wood Palette Definitions
const WOOD_PALETTES = {
  maple:       { base: [238, 206, 159], grain: [195, 150, 98] },
  white_oak:   { base: [210, 185, 145], grain: [150, 120, 85] },
  red_oak:     { base: [198, 140, 105], grain: [140, 85, 55] },
  walnut:      { base: [92, 64, 47],    grain: [45, 28, 18] },
  ebony:       { base: [40, 36, 33],    grain: [15, 12, 10] },
  purpleheart: { base: [115, 50, 90],   grain: [65, 20, 50] }
};

/**
 * Renders a procedural woodgrain texture onto an HTML5 Canvas.
 * @param {HTMLCanvasElement} canvas Target canvas context target
 * @param {string} woodType Key from WOOD_PALETTES
 * @param {Object} options Configuration flags
 */
function generateWoodgrain(canvas, woodType = 'walnut', options = {}) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  const palette = WOOD_PALETTES[woodType] || WOOD_PALETTES.walnut;
  const noise2D = createNoise2D();

  const scale = options.scale || 0.015;
  const ringFrequency = options.ringFrequency || 30.0;
  const turbulence = options.turbulence || 0.25;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 1. Calculate base distance for concentric tree rings
      let nx = x * scale;
      let ny = y * scale;

      // 2. Apply domain warping via 2D noise for organic grain distortion
      let warp = noise2D(nx, ny) * turbulence;
      let dist = Math.sqrt(nx * nx + ny * ny) + warp;

      // 3. Generate repeating ring function with fine noise variation
      let ringVal = Math.sin(dist * ringFrequency) * 0.5 + 0.5;
      let fineDetail = noise2D(nx * 10, ny * 10) * 0.15;
      let grainFactor = Math.min(1, Math.max(0, ringVal + fineDetail));

      // 4. Interpolate between base wood color and dark grain color
      let r = Math.round(palette.base[0] + (palette.grain[0] - palette.base[0]) * grainFactor);
      let g = Math.round(palette.base[1] + (palette.grain[1] - palette.base[1]) * grainFactor);
      let b = Math.round(palette.base[2] + (palette.grain[2] - palette.base[2]) * grainFactor);

      let index = (y * width + x) * 4;
      data[index]     = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Clips a circular wooden disc tile from the base wood canvas at a random rotation.
 * @param {HTMLCanvasElement} sourceCanvas Master generated texture canvas
 * @param {number} size Radius/diameter size of the disc
 * @returns {HTMLCanvasElement} Offscreen canvas containing the cropped disc
 */
function extractWoodDisc(sourceCanvas, size = 64) {
  const discCanvas = document.createElement('canvas');
  discCanvas.width = size;
  discCanvas.height = size;
  const dCtx = discCanvas.getContext('2d');

  const randomAngle = Math.random() * Math.PI * 2;
  const sampleX = Math.random() * (sourceCanvas.width - size);
  const sampleY = Math.random() * (sourceCanvas.height - size);

  dCtx.save();
  // Create circular clip mask
  dCtx.beginPath();
  dCtx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  dCtx.closePath();
  dCtx.clip();

  // Draw rotated segment from source wood canvas
  dCtx.translate(size / 2, size / 2);
  dCtx.rotate(randomAngle);
  dCtx.drawImage(sourceCanvas, sampleX, sampleY, size, size, -size / 2, -size / 2, size, size);
  dCtx.restore();

  return discCanvas;
}
