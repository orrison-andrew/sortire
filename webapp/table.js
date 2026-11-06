/**
 * table.js: Unified Table Surface & Arena rendering manager.
 * Draws table surface (Wood, Stone, or Solid Color) and manages full-screen flood expansion.
 *
 * Exposes TableManager:
 *   - init(containerEl)
 *   - draw(state)
 */
(function (root) {
  'use strict';

  var woodBg = null;
  var rockBg = null;
  var container = null;

  function init(containerEl) {
    container = containerEl;
    if (containerEl && typeof WoodGrain !== 'undefined') {
      woodBg = WoodGrain.createBackground(containerEl);
    }
    if (containerEl && typeof RockGrainGL !== 'undefined') {
      rockBg = RockGrainGL.createBackground(containerEl);
    }
  }

  function draw(s) {
    var mode = SurfaceMode.getActiveMode();
    if (!container) return;

    if (mode === SurfaceMode.MODES.WOOD && woodBg) {
      container.style.display = 'block';
      woodBg.draw({
        species: s.species,
        seed: s.seed,
        table: s.table,
        flood: s.flood,
        time: s.time,
        tiltX: s.tiltX,
        tiltY: s.tiltY,
        sheen: s.sheen,
        vignette: s.vignette
      });
    } else if (mode === SurfaceMode.MODES.STONE && rockBg) {
      container.style.display = 'block';
      rockBg.draw({
        species: s.rockType || 'riverPebble',
        seed: s.seed,
        flood: s.flood,
        time: s.time,
        tiltX: s.tiltX,
        tiltY: s.tiltY,
        sheen: s.sheen,
        vignette: s.vignette
      });
    } else {
      container.style.display = 'none';
    }
  }

  root.TableManager = {
    init: init,
    draw: draw
  };

})(typeof window !== 'undefined' ? window : this);
