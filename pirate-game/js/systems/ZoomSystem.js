// ── systems/ZoomSystem.js ── (M7)
// Camera zoom. Auto-zooms in during battle (fired or fired upon within the
// combat-lock window — reuses FlagSystem.inCombat). Out of battle the player
// controls a manual zoom with the mouse wheel; manual input is ignored while in
// battle. The applied zoom lerps toward its target so transitions are smooth.
//
// State slice: scene.zoom = { manual, current, target }.
const ZoomSystem = {
  init(scene){
    scene.zoom = { manual: ZOOM_MANUAL_DEFAULT, current: ZOOM_MANUAL_DEFAULT, target: ZOOM_MANUAL_DEFAULT };
    scene.cameras.main.setZoom(ZOOM_MANUAL_DEFAULT);
    // mouse wheel adjusts manual zoom, but only out of battle
    scene.input.on('wheel', (pointer, over, dx, dy) => {
      if (scene.mapOpen) return;                     // map owns the wheel when open (Carl's chart)
      if (scene.inCombat()) return;                   // locked during battle
      const step = dy > 0 ? -ZOOM_WHEEL_STEP : ZOOM_WHEEL_STEP;
      scene.zoom.manual = Phaser.Math.Clamp(scene.zoom.manual + step, ZOOM_MANUAL_MIN, ZOOM_MANUAL_MAX);
    });
  },

  update(scene, dt, dts){
    const z = scene.zoom;
    z.target = scene.inCombat() ? ZOOM_BATTLE_LEVEL : z.manual;
    // frame-rate-independent lerp toward target
    const k = 1 - Math.pow(1 - ZOOM_LERP, dts * 60);
    z.current += (z.target - z.current) * k;
    scene.cameras.main.setZoom(z.current);
  },
};
