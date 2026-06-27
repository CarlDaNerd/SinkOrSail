// ── systems/DefenseSystem.js ── (M8)
// Port cannon towers. Dormant until the player is "hostile near a defended
// port" — i.e. flying pirate colors / WANTED, or raiding ships docked there —
// then towers within range fire on the player. Towers reuse the cannonball pool
// (faction 'navy' so they don't friendly-fire the navy and DO hit the player).
//
// No own scene slice; reads port.towers (set by PortEconomy.assignType).
const DefenseSystem = {
  init(scene){ /* nothing to set up; towers live on ports */ },

  update(scene, dt, dts){
    const pl = scene.player; if (pl.hull <= 0) return;
    const wanted = scene.navyHostile();
    const pirate = scene.flag === 'pirate';
    const provoking = wanted || pirate;          // (raiding-docked-ships also counts; that path sets it too)
    if (!provoking) return;

    for (const port of scene.navyPorts){
      if (port.owner === 'player') continue;        // your own port's towers won't target you
      if (!port.towers || !port.towers.length) continue;
      const pd = Math.hypot(pl.x - port.x, pl.y - port.y);
      if (pd > TOWER_RANGE + 120) continue;       // player not near this port
      let fired = false;
      for (const t of port.towers){
        if (t.cd > 0){ t.cd -= dts; continue; }
        const d = Math.hypot(pl.x - t.x, pl.y - t.y);
        if (d > TOWER_RANGE || d < 1) continue;
        const ang = Math.atan2(pl.y - t.y, pl.x - t.x);
        scene.cannonballs.push(Cannonball.create(t.x, t.y, Math.cos(ang) * TOWER_BALL_SPEED, Math.sin(ang) * TOWER_BALL_SPEED, 'tower_' + port.id, 'navy'));
        t.cd = TOWER_COOLDOWN_S; fired = true;
      }
      if (fired) scene.events.emit(EV.PORT_DEFENSE_TRIGGERED, { port });
    }
  },

  // optional overlay: show tower positions + range when active
  draw(scene, g){
    if (!(scene.navyHostile() || scene.flag === 'pirate')) return;
    const pl = scene.player;
    for (const port of scene.navyPorts){
      if (!port.towers) continue;
      if (Math.hypot(pl.x - port.x, pl.y - port.y) > TOWER_RANGE + 120) continue;
      for (const t of port.towers){ g.lineStyle(2, 0xE0503A, 0.6); g.strokeCircle(t.x, t.y, 7); g.lineStyle(1, 0xE0503A, 0.12); g.strokeCircle(t.x, t.y, TOWER_RANGE); }
    }
  },
};
