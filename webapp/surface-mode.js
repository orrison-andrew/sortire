/**
 * surface-mode.js: Surface mode selector state & router for Sortire.
 * The two settings woodgrain_enabled / rockgrain_enabled are the stored state;
 * this module is the ONLY place that interprets them.
 *
 * Exposes SurfaceMode:
 *   - MODES: { WOOD, STONE, COLOR }
 *   - getActiveMode() -> 'WOOD' | 'STONE' | 'COLOR'
 *   - setActiveMode(mode) -> sets the flags (mutually exclusive) and applies the mode preset
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

  function setActiveMode(mode) {
    if (typeof Settings === 'undefined') return;
    Settings.set('woodgrain_enabled', mode === MODES.WOOD ? 1 : 0);
    Settings.set('rockgrain_enabled', mode === MODES.STONE ? 1 : 0);
    Settings.applyPreset(mode === MODES.WOOD ? 'woodgrain' : mode === MODES.STONE ? 'stone' : 'colors');
  }

  root.SurfaceMode = { MODES: MODES, getActiveMode: getActiveMode, setActiveMode: setActiveMode };
})(typeof window !== 'undefined' ? window : this);
