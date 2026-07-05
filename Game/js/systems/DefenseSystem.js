// ── systems/DefenseSystem.js ── (M8)
// Port cannon towers. Dormant until the player is "hostile near a defended
// port" — i.e. flying pirate colors / WANTED, or raiding ships docked there —
// then towers within range fire on the player. Towers reuse the cannonball pool
// (faction 'navy' so they don't friendly-fire the navy and DO hit the player).
//
// No own scene slice; reads port.towers (set by PortEconomy.assignType).
const DefenseSystem = {
  init(scene){ /* nothing to set up; towers live on ports */ },

  // I18-4: lazy tower placement — walk from the port toward the nearest island
  // ell's centre and take the first sampled point that tests as land (the old
  // random 70px ring dropped towers in the water on coastal ports). Jitter j
  // (deterministic, from the gen PRNG) fans multiple towers apart.
  _placeTowers(scene, port){
    let e0 = null, bd = Infinity;
    for (const is of (scene.islands || [])) for (const e of (is.ells || [])){
      const dd = Math.hypot(e.cx - port.x, e.cy - port.y);
      if (dd < bd){ bd = dd; e0 = e; }
    }
    if (!e0 || bd > 1200) return false;                       // island not loaded yet — retry later
    const base = Math.atan2(e0.cy - port.y, e0.cx - port.x);
    for (const tw of port.towers){
      if (tw.x !== null) continue;
      const a = base + (tw.j - 0.5) * 1.6;                    // fan ±0.8 rad around the landward line
      tw.x = port.x + Math.cos(a) * 70; tw.y = port.y + Math.sin(a) * 70;   // fallback: landward 70px
      for (const dist of [50, 70, 95, 120, 150]){
        const x = port.x + Math.cos(a) * dist, y = port.y + Math.sin(a) * dist;
        if (typeof Island !== 'undefined' && Island.landAt(scene, x, y)){ tw.x = x; tw.y = y; break; }
      }
    }
    if (typeof Island !== 'undefined' && Island.drawPortMarkers) Island.drawPortMarkers(scene);
    return true;
  },

  update(scene, dt, dts){
    const pl = scene.player; if (pl.hull <= 0) return;
    for (const port of (scene.nearbyPorts || scene.navyPorts)){   // OPT-B2 + I18-4: place pending towers (captures/shelling happen near the player)
      if (port.towers && port.towers.some(tw => tw.x === null)) this._placeTowers(scene, port);
    }
    const wanted = scene.navyHostile();
    const pirate = scene.flag === 'pirate';
    const t = scene.time.now / 1000;

    for (const port of (scene.nearbyPorts || scene.navyPorts)){   // OPT-B2: only near ports can range the player anyway
      if (port.owner === 'player') continue;        // your own port's towers won't target you
      if (!port.towers || !port.towers.length) continue;
      // a port fights back if you're WANTED / flying pirate colors, OR if it's being
      // raided right now — so shelling an isolated port (no navy witness) still wakes it
      const raided = port.lastHitAt != null && (t - port.lastHitAt) < TOWER_DEFEND_WINDOW_S;
      if (!(wanted || pirate || raided)) continue;
      const pd2 = (pl.x - port.x)**2 + (pl.y - port.y)**2;   // M1
      if (pd2 > (TOWER_RANGE + 120)*(TOWER_RANGE + 120)) continue;       // player not near this port
      let fired = false;
      for (const t of port.towers){
        if (t.x === null) continue;                           // I18-4: not placed yet
        if (t.cd > 0){ t.cd -= dts; continue; }
        const d2 = (pl.x - t.x)**2 + (pl.y - t.y)**2;   // M1
        if (d2 > TOWER_RANGE*TOWER_RANGE || d2 < 1) continue;
        const ang = Math.atan2(pl.y - t.y, pl.x - t.x);
        scene.cannonballs.push(Cannonball.create(t.x, t.y, Math.cos(ang) * TOWER_BALL_SPEED, Math.sin(ang) * TOWER_BALL_SPEED, 'tower_' + port.id, 'navy'));
        t.cd = TOWER_COOLDOWN_S; fired = true;
      }
      if (fired) scene.events.emit(EV.PORT_DEFENSE_TRIGGERED, { port });
    }
  },

  // optional overlay: show tower positions + range while a port is actively defending
  draw(scene, g){
    const now = scene.time.now / 1000, hostile = scene.navyHostile() || scene.flag === 'pirate', pl = scene.player;
    for (const port of (scene.nearbyPorts || scene.navyPorts)){   // OPT-B2
      if (port.owner === 'player' || !port.towers || !port.towers.length) continue;
      const raided = port.lastHitAt != null && (now - port.lastHitAt) < TOWER_DEFEND_WINDOW_S;
      if (!(hostile || raided)) continue;
      if (((pl.x - port.x)**2 + (pl.y - port.y)**2) > (TOWER_RANGE + 120)*(TOWER_RANGE + 120)) continue;   // M1
      for (const t of port.towers){ if (t.x === null) continue; g.lineStyle(2, 0xE0503A, 0.6); g.strokeCircle(t.x, t.y, 7); g.lineStyle(1, 0xE0503A, 0.12); g.strokeCircle(t.x, t.y, TOWER_RANGE); }   // I18-4
    }
  },
};
