// ── systems/ZoomSystem.js ── (M7)
// Camera zoom. Auto-zooms IN during battle (fired or fired upon within the
// combat-lock window — reuses scene.inCombat) and smoothly lerps back out of
// battle. Out of combat it settles on the player's manual scroll zoom
// (scene.viewZoom, set by the mouse wheel), which can zoom OUT to ZOOM_MIN —
// far enough to show the minimap's sight but no further (corners stay inside
// the sight circle). Battle zoom (ZOOM_BATTLE_LEVEL) overrides while fighting.
//
// Always on (the pause-menu "Weather" toggle no longer affects zoom — zoom is a
// core camera behaviour). State slice: scene.zoom = { current, target }.
const ZoomSystem = {
  init(scene){
    scene.zoom = { current: ZOOM_DEFAULT, target: ZOOM_DEFAULT };
    scene.cameras.main.setZoom(ZOOM_DEFAULT);
  },

  update(scene, dt, dts){
    const z = scene.zoom;
    // battle always zooms IN; otherwise lerp to the player's manual scroll-zoom (viewZoom)
    z.target = scene.inCombat() ? ZOOM_BATTLE_LEVEL : (scene.viewZoom || ZOOM_DEFAULT);
    const k = 1 - Math.pow(1 - ZOOM_LERP, dts * 60);     // frame-rate-independent lerp toward target
    z.current += (z.target - z.current) * k;
    scene.cameras.main.setZoom(z.current);
  },
};
