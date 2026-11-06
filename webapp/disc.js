/**
 * disc.js: Renders a shaded round puck from any material texture (wood or stone).
 *
 *   Disc.render(atlas, diameter, seed, shadeShift) -> <canvas>
 *
 * The face is a random rotated crop (55% window) of the material atlas. Edge
 * darkening, rim and bevel are baked in. The glossy highlight is NOT: app.js
 * draws the drop shadow live so it can follow the device tilt.
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;

  function drawShading(ctx, r, diameter) {
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

    ctx.lineWidth = r * 0.05;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(r, r, r - ctx.lineWidth / 2, 0, TAU);
    ctx.stroke();

    ctx.lineWidth = r * 0.03;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(r, r, r * 0.93, 0, TAU);
    ctx.stroke();
  }

  /**
   * @param {HTMLCanvasElement} atlas  material texture to crop from
   * @param {number} diameter          physical px
   * @param {number} seed              per-disc: crop origin and rotation only
   * @param {number} [shadeShift]      -0.25..+0.25 darkens/lightens the face
   */
  function render(atlas, diameter, seed, shadeShift) {
    diameter = Math.max(32, diameter | 0);
    shadeShift = shadeShift || 0;

    var rand = GLUtil.mulberry32((seed | 0) * 3571 + diameter);
    var c = document.createElement('canvas');
    c.width = c.height = diameter;
    var ctx = c.getContext('2d');
    var r = diameter / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r, 0, TAU);
    ctx.clip();
    ctx.translate(r, r);
    ctx.rotate(rand() * TAU);
    var sw = atlas.width * 0.55;
    var ox = rand() * (atlas.width - sw);
    var oy = rand() * (atlas.height - sw);
    ctx.drawImage(atlas, ox, oy, sw, sw, -r, -r, 2 * r, 2 * r);
    ctx.restore();

    if (shadeShift !== 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r, 0, TAU);
      ctx.clip();
      ctx.fillStyle = shadeShift < 0
        ? 'rgba(0,0,0,' + Math.min(0.6, -shadeShift).toFixed(3) + ')'
        : 'rgba(255,255,255,' + Math.min(0.6, shadeShift).toFixed(3) + ')';
      ctx.fillRect(0, 0, diameter, diameter);
      ctx.restore();
    }

    drawShading(ctx, r, diameter);
    return c;
  }

  root.Disc = { render: render };
})(typeof window !== 'undefined' ? window : this);
