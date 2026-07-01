// ── systems/RunnerSystem.js ── (M5 — captured-prize trade runners)
// The payoff of the capture pipeline. A prize you TOW to one of your owned ports
// (BoardingSystem fires EV.PRIZE_DELIVERED) becomes an AI RUNNER: it repairs at
// the port, then sails an automatic trade circuit of 2-4 ports, banking gold at
// each stop, and loops home again — passive income from your captured fleet.
//
// Runners are player-owned but unarmed; they can be SUNK en route — any hostile
// cannonball that lands on one hurts it (Combat.updateCannonballs hook), and a
// sunk runner emits EV.SHIP_SUNK and is removed.
//
// State slice: scene.runners = [ runnerObj ]. RunnerSystem fully owns their
// movement, trade logic, vulnerability and rendering — runners are NOT in
// scene.ships, so AI.js / GameScene.drawShip never need to know they exist.
const RunnerSystem = {
  init(scene){
    scene.runners = scene.runners || [];
    if (this._wired) return; this._wired = true;      // subscribe once per page load
    scene.events.on(EV.PRIZE_DELIVERED, e => this.onDelivered(scene, e.port, e.ship));
  },

  // a towed prize reached an owned port → commission a runner from it
  onDelivered(scene, port, ship){
    if (!port) return;
    const tier = (ship && typeof ship.tier === 'number') ? ship.tier : STARTER_TIER;   // numeric ShipTiers tier
    const r = {
      id: 'runner_' + (RunnerSystem._n = (RunnerSystem._n || 0) + 1),
      faction: 'runner', owner: 'player', isRunner: true,
      x: port.x, y: port.y, heading: 0, vel: 0, sailState: 2, wake: [],
      tier: tier, crew: 0, alive: true, lastHitAt: -999,
      home: port, route: this._pickRoute(scene, port),
      leg: 0, phase: 'repair', timer: RUNNER_REPAIR_S, earned: 0,
    };
    if (typeof ShipTiers !== 'undefined') ShipTiers.apply(scene, r, true);
    else { r.maxHull = 130; r.hull = 130; }
    r.hull = Math.max(1, Math.round(r.maxHull * 0.4));   // a battered prize repairs up from low hull
    scene.runners.push(r);
    scene.flashPopup(port.x, port.y - 44, 'RUNNER COMMISSIONED', 0x6ED0E0);
  },

  // pick 2-4 destination ports (prefer ports other than home; fall back to home)
  _pickRoute(scene, home){
    const pool = scene.navyPorts.filter(p => p !== home);
    if (!pool.length) return [home];
    const n = RUNNER_STOPS_MIN + Math.floor(scene.eprng() * (RUNNER_STOPS_MAX - RUNNER_STOPS_MIN + 1));
    const route = [];
    for (let i = 0; i < n; i++) route.push(pool[Math.floor(scene.eprng() * pool.length)]);
    return route;
  },

  update(scene, dt, dts){
    const rs = scene.runners; if (!rs || !rs.length) return;
    for (let i = rs.length - 1; i >= 0; i--){
      const r = rs[i];
      if (!r.alive || r.hull <= 0){ this._sink(scene, r, i); continue; }

      if (r.phase === 'repair'){
        r.hull = Math.min(r.maxHull, r.hull + (r.maxHull / RUNNER_REPAIR_S) * dts);
        r.timer -= dts;
        if (r.timer <= 0){ r.phase = 'run'; r.leg = 0; r.hull = r.maxHull; }
        continue;
      }

      if (r.phase === 'dwell'){
        r.timer -= dts;
        if (r.timer <= 0){
          if (typeof BankSystem !== 'undefined') BankSystem.credit(scene, RUNNER_GOLD_PER_STOP);
          else scene.player.bank = (scene.player.bank || 0) + RUNNER_GOLD_PER_STOP;
          r.earned += RUNNER_GOLD_PER_STOP;
          scene.flashPopup(r.x, r.y - 24, '+' + RUNNER_GOLD_PER_STOP + 'g RUNNER', 0xF0C840);
          r.leg++;
          r.phase = (r.leg < r.route.length) ? 'run' : 'return';
        }
        continue;
      }

      // 'run' (heading to the next route port) or 'return' (heading home)
      const target = (r.phase === 'return') ? r.home : r.route[r.leg];
      if (!target){ r.phase = 'return'; continue; }
      if (Math.hypot(target.x - r.x, target.y - r.y) < RUNNER_ARRIVE_RANGE){
        if (r.phase === 'return'){ r.phase = 'run'; r.leg = 0; r.route = this._pickRoute(scene, r.home); }  // loop a fresh circuit
        else { r.phase = 'dwell'; r.timer = RUNNER_DWELL_S; r.vel = 0; }
        continue;
      }
      this._sail(scene, r, target, dt, dts);
    }
  },

  // steer a runner toward a target port, reusing the AI steering + sail integration
  _sail(scene, r, target, dt, dts){
    let th = angleTo(r, target);
    th = Steering.avoidLand(scene, r, th);
    th = Steering.avoidIrons(scene, r, th);
    const diff = angleDiff(r.heading, th);
    const tr = calcTurnDegS(r.vel) * 0.7 * dts;
    r.heading = (r.heading + Math.sign(diff) * Math.min(Math.abs(diff), tr) + 360) % 360;
    r.sailState = 2;
    const wa = windOff(r.heading, WindSystem.dirAt(scene, r.x, r.y));
    const cruise = RUNNER_SPEED / (P.maxSpeed || 2);                 // runner cruises a bit under player top speed
    const tspd = calcTargetSpeed(wa) * SAIL_MULTIPLIERS[r.sailState] * cruise;
    r.vel += (tspd - r.vel) * Math.min(0.012 * dt, 1);
    Collision.moveShip(scene, r, dt);
    scene.pushWake(r);
  },

  _sink(scene, r, i){
    scene.runners.splice(i, 1);
    scene.flashPopup(r.x, r.y - 20, 'RUNNER SUNK', 0xE0503A);
    scene.events.emit(EV.SHIP_SUNK, { ship: r, by: r._lastBy || 'enemy' });
  },

  // a hostile cannonball landed on a runner? (called from Combat.updateCannonballs;
  // the player's own shots are excluded by the caller so you can't sink your fleet)
  tryHit(scene, ball){
    const rs = scene.runners; if (!rs || !rs.length) return false;
    for (const r of rs){
      if (!r.alive) continue;
      if (Math.hypot(ball.x - r.x, ball.y - r.y) < 24){
        r.hull -= P.damage; r.lastHitAt = scene.time.now / 1000; r._lastBy = ball.ownerFaction;
        scene.flashPopup(r.x, r.y, '-' + P.damage, 0xE0503A);
        if (r.hull <= 0) r.alive = false;            // cleaned up on the next update tick
        return true;
      }
    }
    return false;
  },

  draw(scene, g){
    const rs = scene.runners; if (!rs || !rs.length) return;
    for (const r of rs){
      const target = (r.phase === 'return') ? r.home : r.route[r.leg];
      if (target && (r.phase === 'run' || r.phase === 'return')){ g.lineStyle(1, 0x6ED0E0, 0.22); g.lineBetween(r.x, r.y, target.x, target.y); }
      // faint player-owned (cyan) hull
      g.save(); g.translateCanvas(r.x, r.y); g.rotateCanvas(r.heading * RAD);
      g.fillStyle(0x2B6A78, 0.92); g.fillEllipse(0, 0, 18, 36);
      g.fillStyle(0x6ED0E0, 0.92); g.fillEllipse(0, 2, 11, 26);
      if (r.sailState > 0){ g.fillStyle(0xCFE8F5, 0.85); g.fillRect(-8, -3, 16, 14); }
      g.restore();
      g.fillStyle(0x6ED0E0, 1); g.fillCircle(r.x, r.y, 2.2);     // reads as one of yours
      if (r.hull < r.maxHull){ const w = 22, pct = Math.max(0, r.hull / r.maxHull);
        g.fillStyle(0x000000, 0.5); g.fillRect(r.x - w/2, r.y - 30, w, 3);
        g.fillStyle(r.phase === 'repair' ? 0xE0A040 : (pct < 0.35 ? 0xE0503A : 0x6ED0E0), 1); g.fillRect(r.x - w/2, r.y - 30, w * pct, 3); }
    }
  },
};
