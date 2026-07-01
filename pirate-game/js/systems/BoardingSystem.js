// ── systems/BoardingSystem.js ──
// Capture an enemy ship instead of sinking it. Rules (per design):
//   - You must OWN a captured port first (capture is gated behind a home).
//   - Target must be stripped to <=CAPTURE_HULL_THRESHOLD_PCT hull and in range.
//   - Tier rule: you can solo-capture a target whose tier is at most one above
//     yours AND only if you have the crew CAPACITY to man both ships:
//     minCrew(you) + minCrew(target) <= maxCrew(you). Bigger jumps are blocked
//     until multi-ship fleets exist. (Enemy ships are untiered on this build, so
//     they read as tier 1 — small prizes.)
//   - Capture is GUARANTEED once you qualify; enemies are crewless, so the prize
//     is an EMPTY hull. You TOW it to one of your ports, where it's delivered
//     (the PRIZE_DELIVERED / runners hook).
//
// State: scene.boarding = { active, target, elapsed }.  scene.tows = [ ship, ... ]
// Driven by the shared B key in GameScene (port-capture is tried first).
const BoardingSystem = {
  init(scene){
    scene.boarding = { active: false, target: null, elapsed: 0 };
    scene.tows = scene.tows || [];
  },

  isPinned(scene){ return scene.boarding && scene.boarding.active; },

  ownsAPort(scene){ return (scene.ownedPorts && scene.ownedPorts.length > 0); },

  // can the player solo-capture this target, given tiers + crew capacity?
  canCapture(scene, target){
    const pl = scene.player;
    if (typeof ShipTiers === 'undefined') return true;
    const myT = pl.tier || 1, tgtT = target.tier || 1;          // enemies are untiered → tier 1
    if (tgtT > myT + 1) return false;                           // too big to solo (needs a fleet)
    return (ShipTiers.get(myT).minCrew + ShipTiers.get(tgtT).minCrew) <= ShipTiers.get(myT).maxCrew;
  },

  // nearest target that is alive, stripped, in range
  eligibleTarget(scene){
    const pl = scene.player; let best = null, bd = CAPTURE_RANGE;
    for (const s of scene.ships){
      if (!s.alive || s.beingTowed) continue;
      if (s.hull > s.maxHull * CAPTURE_HULL_THRESHOLD_PCT / 100) continue;
      const d = Math.hypot(s.x - pl.x, s.y - pl.y);
      if (d < bd){ bd = d; best = s; }
    }
    return best;
  },

  // attempt to start a capture; returns true if it consumed the press
  tryBoard(scene){
    const b = scene.boarding, pl = scene.player;
    if (b.active) return true;
    if (!this.ownsAPort(scene)){ scene.flashPopup(pl.x, pl.y, 'NEED A CAPTURED PORT FIRST', 0xE0503A); return true; }
    const t = this.eligibleTarget(scene);
    if (!t) return false;
    if (!this.canCapture(scene, t)){
      const tooBig = (t.tier || 1) > (pl.tier || 1) + 1;
      scene.flashPopup(pl.x, pl.y, "CAN'T CAPTURE — " + (tooBig ? 'NEEDS A FLEET' : 'NOT ENOUGH CREW CAPACITY'), 0xE0503A); return true;
    }
    b.active = true; b.target = t; b.elapsed = 0; pl.vel = 0;
    scene.flashPopup(pl.x, pl.y - 24, 'BOARDING…', 0xF0C840);
    return true;
  },

  update(scene, dt, dts){
    const b = scene.boarding, pl = scene.player;
    if (pl.hull <= 0){ if (b.active){ b.active = false; b.target = null; } this._updateTows(scene, dt); return; }

    if (b.active){
      pl.vel = 0;                                   // pinned during boarding
      if (!b.target || !b.target.alive || Math.hypot(b.target.x - pl.x, b.target.y - pl.y) > CAPTURE_RANGE * 1.6){
        b.active = false; b.target = null; this._updateTows(scene, dt); return;
      }
      b.elapsed += dts;
      if (b.elapsed >= BOARD_DURATION_S){ this._capture(scene, b.target); b.active = false; b.target = null; }
    }
    this._updateTows(scene, dt);
  },

  // success: take any cargo, pull the prize out of the active fleet into the tow set
  _capture(scene, target){
    const pl = scene.player;
    // any cargo aboard transfers to you (enemies don't carry cargo yet → usually a no-op)
    if (target.cargo && typeof Cargo !== 'undefined' && pl.hold){
      const took = Cargo.add(pl.hold, target.cargo.commodity, target.cargo.qty);
      const gl = (typeof COMMODITY_INFO !== 'undefined') ? COMMODITY_INFO[target.cargo.commodity] : null;
      if (took > 0) scene.flashPopup(pl.x, pl.y - 36, '+' + took + ' ' + (gl ? gl.glyph : '?'), gl ? gl.color : 0xF0C840);
      target.cargo = null;
    }
    // remove it from the active fleet so AI / combat / collisions ignore it; it
    // now lives purely in scene.tows as an empty hull trailing the player
    const idx = scene.ships.indexOf(target); if (idx !== -1) scene.ships.splice(idx, 1);
    if (typeof Docks !== 'undefined') Docks.releaseAnywhere(scene, target);   // free any berth it held
    target.beingTowed = true; target.crew = 0; target.faction = 'prize'; target.state = 'towed';
    scene.tows.push(target);
    scene.flashPopup(pl.x, pl.y - 24, 'CAPTURED — TOW TO YOUR PORT', 0x6ED0E0);
    scene.events.emit(EV.SHIP_CAPTURED, { ship: target });
  },

  // towed prizes trail the player at reduced speed; delivered when near an owned port
  _updateTows(scene, dt){
    if (!scene.tows || !scene.tows.length) return;
    const pl = scene.player;
    for (let i = scene.tows.length - 1; i >= 0; i--){
      const s = scene.tows[i];
      // follow a point behind the player, capped to tow speed
      const tx = pl.x - Math.sin(pl.heading * RAD) * 46, ty = pl.y + Math.cos(pl.heading * RAD) * 46;
      const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
      const towCap = (P.maxSpeed || 2) * CAPTURE_TOW_SPEED_FRAC;
      if (d > 1){ const step = Math.min(d, towCap * dt); s.x += (dx/d)*step; s.y += (dy/d)*step; s.heading = pl.heading; }
      // delivered? near one of the player's ports
      let delivered = null;
      for (const port of (scene.ownedPorts || [])){ if (Math.hypot(s.x - port.x, s.y - port.y) < PRIZE_DELIVER_RANGE){ delivered = port; break; } }
      if (delivered){
        s.beingTowed = false; s.alive = false;          // leaves the towed/world set
        scene.tows.splice(i, 1);
        scene.flashPopup(delivered.x, delivered.y - 30, 'PRIZE DELIVERED', 0x6ED0E0);
        scene.events.emit(EV.PRIZE_DELIVERED, { ship: s, port: delivered });   // runners hook here
      }
    }
  },

  // progress bar + tow lines (world space)
  draw(scene, g){
    const b = scene.boarding, pl = scene.player;
    if (b && b.active){
      const p = Math.min(1, b.elapsed / BOARD_DURATION_S);
      g.fillStyle(0x000000, 0.5); g.fillRect(pl.x - 16, pl.y - 30, 32, 4);
      g.fillStyle(0xF0C840, 1); g.fillRect(pl.x - 16, pl.y - 30, 32 * p, 4);
      if (b.target){ g.lineStyle(2, 0xF0C840, 0.7); g.lineBetween(pl.x, pl.y, b.target.x, b.target.y); }
    }
    for (const s of (scene.tows || [])){
      g.lineStyle(2, 0x6ED0E0, 0.5); g.lineBetween(pl.x, pl.y, s.x, s.y);   // tow rope; the prize hull itself is drawn by GameScene.drawShip
    }
  },
};
