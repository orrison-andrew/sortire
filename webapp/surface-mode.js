/**
 * surface-mode.js: Surface mode selector state & router for Sortire.
 * The two settings woodgrain_enabled / rockgrain_enabled are the stored state;
 * this module is the ONLY place that interprets them.
 *
 * Exposes SurfaceMode:
 *   - MODES: { WOOD, STONE, COLOR }
 *   - getActiveMode() -> 'WOOD' | 'STONE' | 'COLOR'
 *   - setActiveMode(mode) -> Settings.setMode: flags (mutually exclusive) + that surface's own settings
 */
(function (root) {
  'use strict';

  var MODES = { WOOD: 'WOOD', STONE: 'STONE', COLOR: 'COLOR' };

  function getActiveMode() {
    if (typeof Settings !== 'undefined') {
      if (Settings.bool('woodgrain_enabled')) return MODES.WOOD;
      if (Settings.bool('rockgrain_enabled')) return MODES.STONE;
    }
    return MODES.COLOR;
  }

  // Switching surface also swaps in that surface's own saved settings
  function setActiveMode(mode) {
    if (typeof Settings === 'undefined') return;
    Settings.setMode(mode);
  }

  root.SurfaceMode = { MODES: MODES, getActiveMode: getActiveMode, setActiveMode: setActiveMode };
})(typeof window !== 'undefined' ? window : this);
