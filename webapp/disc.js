/**
 * disc.js: Renders a shaded puck from any material texture (wood or stone).
 *
 *   Disc.render(atlas, diameter, seed, shadeShift, opts) -> <canvas>
 *       opts.pebble: true -> irregular, seeded pebble outline instead of a circle
 *
 * The face is a random rotated crop (55% window) of the material atlas. Edge
 * darkening, rim and bevel are baked in. The area outside the outline is fully
 * transparent, so app.js can cast the drop shadow from the canvas itself and it
 * follows whatever shape the puck has. The glossy highlight is NOT baked in.
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;

  // Seeded pebble outline: a squashed, rotated ellipse with lumps from a few low
  // harmonics. Same seed -> same pebble. Scaled to the SAME AREA as a nominal disc of
  // radius r (so pebbles read as the same size as other discs), then limited so it
  // fits inside the padded canvas of half-size rc.
  function pebblePath(r, rc, rand) {
    var N = 72;
    var squash = 0.62 + rand() * 0.28;           // minor / major axis: 0.62 .. 0.90
    var rot = rand() * TAU;
    var harmonics = [];
    for (var k = 2; k <= 5; k++) {
      harmonics.push({ k: k, amp: (0.16 / (k - 1)) * (0.35 + rand() * 0.65), ph: rand() * TAU });
    }
    var pts = [], maxD = 0, area = 0, i;
    for (i = 0; i < N; i++) {
      var th = i / N * TAU;
      var rad = 1;
      for (var h = 0; h < harmonics.length; h++) rad += harmonics[h].amp * Math.cos(harmonics[h].k * th + harmonics[h].ph);
      var x = Math.cos(th) * rad, y = Math.sin(th) * rad * squash;
      var px = x * Math.cos(rot) - y * Math.sin(rot);
      var py = x * Math.sin(rot) + y * Math.cos(rot);
      pts.push([px, py]);
      maxD = Math.max(maxD, Math.hypot(px, py));
    }
    for (i = 0; i < N; i++) {
      var a0 = pts[i], a1 = pts[(i + 1) % N];
      area += a0[0] * a1[1] - a1[0] * a0[1];
    }
    var meanR = Math.sqrt(Math.abs(area) / 2 / Math.PI);
    var s = (r * 0.97) / meanR;
    s = Math.min(s, (rc * 0.96 - 1) / maxD);      // keep the rim stroke inside the canvas
    pts = pts.map(function (p) { return [rc + p[0] * s, rc + p[1] * s]; });

    return function trace(ctx) {
      ctx.beginPath();
      var last = pts[N - 1], first = pts[0];
      ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
      for (var j = 0; j < N; j++) {
        var p = pts[j], q = pts[(j + 1) % N];
        ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      }
      ctx.closePath();
    };
  }

  function circlePath(r) {
    return function trace(ctx) {
      ctx.beginPath();
      ctx.arc(r, r, r, 0, TAU);
      ctx.closePath();
    };
  }

  function drawShading(ctx, r, diameter, trace, pebble) {
    // Edge darkening
    ctx.save();
    trace(ctx);
    ctx.clip();
    if (pebble) {
      // Follows the outline: stacked strokes fade in toward the rim
      ctx.lineJoin = 'round';
      [0.36, 0.26, 0.16, 0.08].forEach(function (w) {
        ctx.lineWidth = r * w;
        ctx.strokeStyle = 'rgba(0,0,0,0.10)';
        trace(ctx);
        ctx.stroke();
      });
    } else {
      var edgeGrad = ctx.createRadialGradient(r, r, r * 0.55, r, r, r);
      edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
      edgeGrad.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = edgeGrad;
      ctx.fillRect(0, 0, diameter, diameter);
    }
    ctx.restore();

    // Dark rim
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.05;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    if (pebble) {
      trace(ctx);
    } else {
      ctx.beginPath();
      ctx.arc(r, r, r - ctx.lineWidth / 2, 0, TAU);
    }
    ctx.stroke();

    // Light inner bevel
    ctx.save();
    ctx.translate(r, r);
    ctx.scale(0.93, 0.93);
    ctx.translate(-r, -r);
    ctx.lineWidth = r * 0.03 / 0.93;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    if (pebble) {
      trace(ctx);
    } else {
      ctx.beginPath();
      ctx.arc(r, r, r, 0, TAU);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * @param {HTMLCanvasElement} atlas  material texture to crop from
   * @param {number} diameter          physical px
   * @param {number} seed              per-disc: crop origin, rotation and pebble shape
   * @param {number} [shadeShift]      -0.25..+0.25 darkens/lightens the face
   * @param {{pebble:boolean}} [opts]
   */
  function render(atlas, diameter, seed, shadeShift, opts) {
    diameter = Math.max(32, diameter | 0);
    shadeShift = shadeShift || 0;
    var pebble = !!(opts && opts.pebble);

    var rand = GLUtil.mulberry32((seed | 0) * 3571 + diameter);
    // Pebbles get a padded canvas (elongated outlines stick out past the nominal
    // circle). c.drawScale tells the caller how much bigger than `diameter` it is.
    var size = pebble ? Math.round(diameter * 1.3) : diameter;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    c.drawScale = size / diameter;
    var ctx = c.getContext('2d');
    var r = size / 2;                              // half the canvas

    // Separate stream so the texture crop is identical whether or not the shape is a pebble
    var trace = pebble ? pebblePath(diameter / 2, r, GLUtil.mulberry32((seed | 0) * 911 + diameter + 7)) : circlePath(r);

    ctx.save();
    trace(ctx);
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
      trace(ctx);
      ctx.clip();
      ctx.fillStyle = shadeShift < 0
        ? 'rgba(0,0,0,' + Math.min(0.6, -shadeShift).toFixed(3) + ')'
        : 'rgba(255,255,255,' + Math.min(0.6, shadeShift).toFixed(3) + ')';
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
    }

    drawShading(ctx, r, size, trace, pebble);
    return c;
  }

  root.Disc = { render: render };
})(typeof window !== 'undefined' ? window : this);
