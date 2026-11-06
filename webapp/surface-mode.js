/**
 * surface-mode.js: Surface mode selector state & router for Sortire.
 *
 * Exposes SurfaceMode:
 *   - MODES: { WOOD: 'WOOD', STONE: 'STONE', COLOR: 'COLOR' }
 *   - getActiveMode() -> returns current active mode string
 *   - setActiveMode(mode) -> sets active mode and updates settings presets
 */
(function (root) {
  'use strict';

  var MODES = {
    WOOD: 'WOOD',
    STONE: 'STONE',
    COLOR: 'COLOR'
  };

  function getActiveMode() {
    if (Settings.bool('woodgrain_enabled')) return MODES.WOOD;
    if (Settings.bool('rockgrain_enabled')) return MODES.STONE;
    return MODES.COLOR;
  }

  function setActiveMode(mode) {
    if (mode === MODES.WOOD) {
      Settings.set('woodgrain_enabled', 1);
      Settings.set('rockgrain_enabled', 0);
      Settings.applyPreset('woodgrain');
    } else if (mode === MODES.STONE) {
      Settings.set('woodgrain_enabled', 0);
      Settings.set('rockgrain_enabled', 1);
      Settings.applyPreset('stone');
    } else {
      Settings.set('woodgrain_enabled', 0);
      Settings.set('rockgrain_enabled', 0);
      Settings.applyPreset('colors');
    }
  }

  root.SurfaceMode = {
    MODES: MODES,
    getActiveMode: getActiveMode,
    setActiveMode: setActiveMode
  };

})(typeof window !== 'undefined' ? window : this);
