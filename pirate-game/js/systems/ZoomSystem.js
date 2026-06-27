// ── systems/ZoomSystem.js ── (M7)
// Camera zoom. Auto-zooms IN during battle (fired or fired upon within the
// combat-lock window — reuses scene.inCombat) and smoothly lerps back to normal
// out of battle. There is NO scroll/manual zoom — the battle zoom is the only
// effect, and its level is ZOOM_BATTLE_LEVEL (edit in constants.js).
//
// Gated by scene.extrasOn (the pause-menu checkbox): when off, it just holds the
// default zoom. State slice: scene.zoom = { current, target }.
const ZoomSystem = {
  init(scene){
    scene.zoom = { current: ZOOM_DEFAULT, target: ZOOM_DEFAULT };
    scene.cameras.main.setZoom(ZOOM_DEFAULT);
  },

  update(scene, dt, dts){
    const z = scene.zoom;
    z.target = (scene.extrasOn && scene.inCombat()) ? ZOOM_BATTLE_LEVEL : ZOOM_DEFAULT;
    const k = 1 - Math.pow(1 - ZOOM_LERP, dts * 60);     // frame-rate-independent lerp toward target
    z.current += (z.target - z.current) * k;
    scene.cameras.main.setZoom(z.current);
  },
};
