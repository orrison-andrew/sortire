/**
 * material-set.js: Turns "a list of materials + a texture generator" into the full
 * set of things the app needs. WoodGrain and RockTexture are both built with this,
 * so they expose exactly the same API.
 *
 *   MaterialSet.create({
 *     keys:     ['maple', ...]                    ordered; index = setting value
 *     labels:   { maple: 'Maple', ... }
 *     colors:   function (key) -> { light:[r,g,b], dark:[r,g,b] }
 *     generate: function (key, size, seed) -> <canvas> | null   (GPU generator)
 *   })
 *
 * Returned API:
 *   KEYS, LABELS (ordered array), hasKey(k), getKey(i), getRandomKey()
 *   getColors(k)            -> { light, dark }
 *   generate(k, size, seed) -> <canvas> (never null: falls back to a flat gradient)
 *   master(k, seed)         -> table-size texture (small LRU)
 *   getDiscCanvas(diameter, k, seed, shade) -> shaded puck <canvas> (LRU)
 *   createBackground(container) -> TableLayer
 */
(function (root) {
  'use strict';

  var DISC_SIZE = 1024;   // shared per-material atlas that disc faces crop from
  var BG_SIZE = 2048;     // table texture

  function create(def) {
    var keys = def.keys;

    function hasKey(k) { return keys.indexOf(k) !== -1; }

    function getKey(i) {
      i = Math.max(0, Math.min(keys.length - 1, Math.round(i) | 0));
      return keys[i];
    }

    function getColors(k) { return def.colors(hasKey(k) ? k : keys[0]); }

    function generate(k, size, seed) {
      k = hasKey(k) ? k : keys[0];
      size = size || 1024;
      seed = seed || 1;
      var c = def.generate(k, size, seed);
      if (c) return c;
      var col = getColors(k);
      return GLUtil.flatTexture(col.light, col.dark, size);
    }

    // Table textures: 2048^2 RGBA is about 16 MB each, so keep only a few
    var masterCache = GLUtil.lru(3, function (c) { if (c) c.width = c.height = 0; });
    function master(k, seed) {
      k = hasKey(k) ? k : keys[0];
      seed = (seed || 42) | 0;
      var id = k + '_' + seed;
      return masterCache.get(id) || masterCache.set(id, generate(k, BG_SIZE, seed));
    }

    // Disc atlas: ONE texture per material; every disc crops from it
    var atlasCache = {};
    function atlas(k) {
      if (!atlasCache[k]) atlasCache[k] = generate(k, DISC_SIZE, 42);
      return atlasCache[k];
    }

    // Finger discs stay referenced by live fingers, so evicted ones are not freed
    var discCache = GLUtil.lru(64);
    function getDiscCanvas(diameter, k, seed, shade) {
      k = hasKey(k) ? k : keys[0];
      diameter = Math.max(32, diameter | 0);
      shade = shade || 0;
      var id = k + '_' + diameter + '_' + (seed | 0) + '_' + shade.toFixed(2);
      return discCache.get(id) || discCache.set(id, Disc.render(atlas(k), diameter, seed, shade));
    }

    var api = {
      KEYS: keys,
      LABELS: keys.map(function (k) { return def.labels[k]; }),
      hasKey: hasKey,
      getKey: getKey,
      getRandomKey: function () { return keys[Math.floor(Math.random() * keys.length)]; },
      getColors: getColors,
      generate: generate,
      master: master,
      getDiscCanvas: getDiscCanvas
    };
    api.createBackground = function (container) { return TableLayer.create(container, api); };
    return api;
  }

  root.MaterialSet = { create: create };
})(typeof window !== 'undefined' ? window : this);
