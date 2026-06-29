// ── systems/HireSystem.js ── (M6 — hired privateer escorts)
// Hire privateers (gold, at a port) to protect your runners and yourself. You
// get PRIVATEER_HIRE_SLOTS escort spots. An escort patrols near you, and when a
// pirate threatens you or one of your runners it closes in and shells it.
//
// Escorts are player-owned and live in their OWN slice (scene.hire.hired), NOT in
// scene.ships — so AI.js / drawShip never touch them. HireSystem owns their
// movement, targeting, firing and rendering. They fire by direct (hitscan)
// damage with a tracer, which keeps cannonball friendly-fire away from the player
// and the player's own runners.
const HireSystem = {
  init(scene){
    scene.hire = scene.hire || { slots: PRIVATEER_HIRE_SLOTS, hired: [] };
  },

  // called from the dock menu (a hire key while docked)
  hireAtDock(scene){
    const h = scene.hire, pl = scene.player;
    if (h.hired.length >= h.slots){ scene.flashPopup(pl.x, pl.y, 'HIRE SLOTS FULL', 0xE0503A); return; }
    if (typeof BankSystem === 'undefined' || !BankSystem.spend(scene, PRIVATEER_HIRE_COST)){ scene.flashPopup(pl.x, pl.y, 'NO GOLD', 0xE0503A); return; }
    const port = scene.dockPort || null;
    const ax = port ? port.x : pl.x, ay = port ? port.y : pl.y;
    const e = {
      id: 'escort_' + (HireSystem._n = (HireSystem._n || 0) + 1),
      faction: 'privateer', owner: 'player', isEscort: true,
      x: ax + (scene.eprng() - 0.5) * 120, y: ay + (scene.eprng() - 0.5) * 120,
      heading: 0, vel: 0, sailState: 2, wake: [], tier: 3,         // Brig-class escort
      alive: true, fireCd: 0, tracer: null,
    };
    if (typeof ShipTiers !== 'undefined') ShipTiers.apply(scene, e, true);
    else { e.maxHull = 200; e.hull = 200; }
    e.crew = 0;
    h.hired.push(e);
    scene.flashPopup(pl.x, pl.y - 24, 'PRIVATEER HIRED (' + h.hired.length + '/' + h.slots + ')', 0x46863C);
  },

  // a short dock-menu line: "Hire privateer  2/3  - 1500g"
  hireLabel(scene){
    const h = scene.hire || { slots: PRIVATEER_HIRE_SLOTS, hired: [] };
    if (h.hired.length >= h.slots) return 'Escorts full  ' + h.hired.length + '/' + h.slots;
    return 'Hire privateer  ' + h.hired.length + '/' + h.slots + '  - ' + PRIVATEER_HIRE_COST + 'g';
  },

  // pick the pirate an escort should engage: nearest, but strongly preferring one
  // menacing a runner, then one menacing the player
  _pickTarget(scene, e){
    let best = null, bestScore = ESCORT_ENGAGE_RANGE;
    for (const s of scene.ships){
      if (s.faction !== 'pirate' || !s.alive) continue;
      const dd = dist(e, s);
      if (dd > ESCORT_ENGAGE_RANGE * 1.4) continue;
      let nearRunner = false;
      if (scene.runners) for (const r of scene.runners){ if (r.alive && dist(s, r) < 460){ nearRunner = true; break; } }
      const nearPlayer = dist(s, scene.player) < 520;
      const score = dd - (nearRunner ? 600 : 0) - (nearPlayer ? 200 : 0);
      if (score < bestScore){ bestScore = score; best = s; }
    }
    return best;
  },

  update(scene, dt, dts){
    const h = scene.hire; if (!h || !h.hired.length) return;
    for (const e of h.hired){
      if (e.fireCd > 0) e.fireCd -= dts;
      if (e.tracer){ e.tracer.life -= dts; if (e.tracer.life <= 0) e.tracer = null; }

      const target = this._pickTarget(scene, e);
      let th, desiredSpeed = ESCORT_SPEED;
      if (target){
        const td = dist(e, target);
        th = angleTo(e, target);
        if (td < ESCORT_ATTACK_RANGE && e.fireCd <= 0){
          // direct shot (hitscan) so we never friendly-fire the player or runners
          target.hull -= ESCORT_DAMAGE; target.hostileToPlayer = true; e.fireCd = ESCORT_FIRE_COOLDOWN_S;
          e.tracer = { tx: target.x, ty: target.y, life: 0.12 };
          if (target.hull <= 0){
            target.alive = false;
            if (typeof Combat !== 'undefined') Combat.spawnLoot(scene, target);
            scene.events.emit(EV.SHIP_SUNK, { ship: target, by: 'player' });   // your escort's kill
          }
        }
      } else {
        // no threat → orbit a guard anchor (nearest owned port, else the player)
        const anchor = this._anchor(scene, e);
        const ang = scene.time.now / 1000 * 0.5 + (e._phase || (e._phase = scene.eprng() * TAU));
        const px = anchor.x + Math.cos(ang) * ESCORT_PATROL_RADIUS, py = anchor.y + Math.sin(ang) * ESCORT_PATROL_RADIUS;
        th = angleTo(e, { x: px, y: py });
        if (dist(e, { x: px, y: py }) < 60) desiredSpeed = ESCORT_SPEED * 0.4;
      }
      this._move(scene, e, th, desiredSpeed, dt, dts);
    }
  },

  _anchor(scene, e){
    let best = null, bd = Infinity;
    for (const p of (scene.ownedPorts || [])){ const d = dist(e, p); if (d < bd){ bd = d; best = p; } }
    return best || scene.player;
  },

  _move(scene, e, th, desiredSpeed, dt, dts){
    th = Steering.avoidLand(scene, e, th);
    th = Steering.avoidIrons(th);
    const diff = angleDiff(e.heading, th);
    const tr = calcTurnDegS(e.vel) * 0.7 * dts;
    e.heading = (e.heading + Math.sign(diff) * Math.min(Math.abs(diff), tr) + 360) % 360;
    e.sailState = 2;
    const wa = windOff(e.heading, P.windFrom);
    const cruise = desiredSpeed / (P.maxSpeed || 2);
    const tspd = calcTargetSpeed(wa) * SAIL_MULTIPLIERS[e.sailState] * cruise;
    e.vel += (tspd - e.vel) * Math.min(0.012 * dt, 1);
    Collision.moveShip(scene, e, dt);
    scene.pushWake(e);
  },

  draw(scene, g){
    const h = scene.hire; if (!h || !h.hired.length) return;
    for (const e of h.hired){
      if (e.tracer){ g.lineStyle(2, 0xBFE0A0, 0.8); g.lineBetween(e.x, e.y, e.tracer.tx, e.tracer.ty); }
      g.save(); g.translateCanvas(e.x, e.y); g.rotateCanvas(e.heading * RAD);
      g.fillStyle(0x2B5A2B, 0.95); g.fillEllipse(0, 0, 18, 36);
      g.fillStyle(0x46863C, 0.95); g.fillEllipse(0, 2, 11, 26);
      if (e.sailState > 0){ g.fillStyle(0xD4E4C0, 0.85); g.fillRect(-8, -3, 16, 14); }
      g.restore();
      g.fillStyle(0x8FE07A, 1); g.fillCircle(e.x, e.y, 2.4);                   // friendly marker
      if (e.hull < e.maxHull){ const w = 22, pct = Math.max(0, e.hull / e.maxHull);
        g.fillStyle(0x000000, 0.5); g.fillRect(e.x - w/2, e.y - 30, w, 3);
        g.fillStyle(0x46863C, 1); g.fillRect(e.x - w/2, e.y - 30, w * pct, 3); }
    }
  },
};
