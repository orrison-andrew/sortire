/**
 * table.js: Table surface manager for Sortire.
 * Picks the material set for the active surface mode (wood / stone) and draws it
 * into the #wood-bg container. Each GPU layer is created lazily the first time
 * its mode is used, so unused surfaces cost no WebGL context.
 *
 * Exposes TableManager:
 *   - init(containerEl)
 *   - draw(state) -> true if a GPU surface was drawn, false otherwise
 *       state: { material, seed, flood, time, tiltX, tiltY, sheen, vignette }
 *   - hide()      -> hides the surface (flat colour mode)
 */
(function (root) {
  'use strict';

  var container = null;
  var layers = {};   // mode -> { el, layer }

  function materialsFor(mode) {
    if (mode === SurfaceMode.MODES.WOOD) return root.WoodGrain;
    if (mode === SurfaceMode.MODES.STONE) return root.RockTexture;
    return null;
  }

  function init(containerEl) {
    container = containerEl || null;
    layers = {};
    if (container) container.innerHTML = '';
  }

  function getLayer(mode) {
    if (layers[mode]) return layers[mode];
    var set = materialsFor(mode);
    if (!set) return null;
    var el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:none;';
    container.appendChild(el);
    layers[mode] = { el: el, layer: set.createBackground(el) };
    return layers[mode];
  }

  function setDisplay(el, v) { if (el.style.display !== v) el.style.display = v; }

  function hide() {
    if (!container) return;
    setDisplay(container, 'none');
    for (var m in layers) setDisplay(layers[m].el, 'none');
  }

  function draw(s) {
    if (!container) return false;
    var mode = SurfaceMode.getActiveMode();
    var entry = (mode === SurfaceMode.MODES.COLOR) ? null : getLayer(mode);
    if (!entry || !entry.layer.available) { hide(); return false; }

    setDisplay(container, 'block');
    for (var m in layers) setDisplay(layers[m].el, (m === mode) ? 'block' : 'none');

    var ok = entry.layer.draw({
      material: s.material,
      seed: s.seed || 42,
      flood: s.flood || null,
      time: s.time || 0,
      tiltX: s.tiltX || 0,
      tiltY: s.tiltY || 0,
      sheen: s.sheen !== undefined ? s.sheen : 0.4,
      vignette: s.vignette !== undefined ? s.vignette : 0.28
    });
    if (!ok) hide();
    return ok;
  }

  root.TableManager = { init: init, draw: draw, hide: hide };
})(typeof window !== 'undefined' ? window : this);
