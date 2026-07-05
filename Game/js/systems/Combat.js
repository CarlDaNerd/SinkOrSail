// ── systems/Combat.js ──
// Broadsides, cannonballs, hit detection, loot (handoff §10). One unified fire
// path for player and AI. No same-faction friendly fire.
const Combat = {
  // side: 'port' (heading-90) | 'star' (heading+90)
  fire(scene, ship, side){
    // player reload is shortened by extra crew (crewReloadMult < 1); enemies use the flat mult
    const crewCd = (ship.faction === 'player' && typeof crewReloadMult !== 'undefined') ? crewReloadMult(ship) : 1;
    const cd = ship.faction === 'player' ? P.cooldown*crewCd : P.cooldown*1.8;     // ENEMY_COOLDOWN_MULT
    if (ship.faction === 'player'){ if ((ship.ammo <= 0 && !DEBUG.infAmmo) || ship.fire[side] > 0) return; }
    else { if (ship.fire > 0) return; }
    const fa = (ship.heading + (side === 'port' ? -90 : 90) + 360)%360;
    // player broadside scales with ship tier; understaffed crews fire fewer balls
    const n = (ship.faction === 'player')
      ? ((typeof ShipTiers !== 'undefined') ? ShipTiers.cannonsUsable(ship) : (ship.broadsideBalls || P.balls))
      : P.balls;
    const half = (n - 1)/2;
    for (let b = 0; b < n; b++){
      const ang = fa + (b - half)*P.spread;
      scene.cannonballs.push(Cannonball.create(
        ship.x + Math.sin(fa*RAD)*20, ship.y - Math.cos(fa*RAD)*20,
        Math.sin(ang*RAD)*P.cannonSpeed, -Math.cos(ang*RAD)*P.cannonSpeed,
        ship.id, ship.faction));
    }
    if (ship.faction === 'player'){
      if (!DEBUG.infAmmo) ship.ammo = Math.max(0, ship.ammo - n);
      ship.fire[side] = cd;
      scene.player.lastFiredAt = scene.time.now/1000;          // for the flag combat-lock window
    } else ship.fire = cd;
    this._flash(scene, ship, fa);                              // MB2-5: one flash per volley per side
  },

  // AI passes a side sign; map it to 'port'/'star' through the unified path
  fireEnemy(scene, ship, sideSign){ this.fire(scene, ship, sideSign > 0 ? 'star' : 'port'); },

  // Bow/stern chaser — a SINGLE ball along the keel axis with its own per-chaser
  // cooldown. which = 'bow' (fires forward) | 'stern' (fires aft). Gated by the
  // ship's tier flags; a no-op if the tier doesn't mount that chaser. Player-only
  // for now (AI chasers are a TODO).
  fireChaser(scene, ship, which){
    if (ship.faction !== 'player') return;
    if (typeof ShipTiers === 'undefined' || !ShipTiers.has(ship, which)) return;
    if (!ship.fire) return;
    if ((ship.ammo <= 0 && !DEBUG.infAmmo) || ship.fire[which] > 0) return;
    const fa = (ship.heading + (which === 'stern' ? 180 : 0) + 360)%360;   // along the keel
    scene.cannonballs.push(Cannonball.create(
      ship.x + Math.sin(fa*RAD)*20, ship.y - Math.cos(fa*RAD)*20,
      Math.sin(fa*RAD)*P.cannonSpeed, -Math.cos(fa*RAD)*P.cannonSpeed,
      ship.id, ship.faction));
    if (!DEBUG.infAmmo) ship.ammo = Math.max(0, ship.ammo - 1);
    ship.fire[which] = ShipTiers.cooldown(which);                 // distinct bow vs stern cooldown
    scene.player.lastFiredAt = scene.time.now/1000;               // flag combat-lock window
    this._flash(scene, ship, fa);                                 // MB2-5
  },

  // ── MB2-5 muzzle flash ── every cannon shot (player + AI — this file is the
  // unified fire path) records a short-lived flash. The record keeps the SHIP
  // reference + fire angle; GameScene.draw() computes the muzzle point from the
  // ship's CURRENT position each frame so the flash stays glued to a moving hull.
  _flash(scene, ship, fa){
    if (!scene.muzzleFlashes) scene.muzzleFlashes = [];
    scene.muzzleFlashes.push({ ship, fa, t0: scene.time.now/1000 });
  },

  onHit(scene, ball, target){
    target.hull -= P.damage;
    target.lastHitAt = scene.time.now/1000;                 // MW-15: damage-flash timestamp
    // CQ: stamp first provocation — AI holds fire for RETURN_FIRE_DELAY_S after it
    if (ball.ownerFaction === 'player' && !target.hostileToPlayer) target.provokedAt = scene.time.now/1000;
    // CD1: crew can die in combat (gameplay PRNG → deterministic battles). Player
    // included — losses bite via the existing understaffed reload/speed math.
    if ((target.crew || 0) > 0 && scene.eprng() < CREW_DEATH_CHANCE){
      const lost = Math.min(CREW_DEATH_MAX_PER_HIT, target.crew);
      target.crew -= lost;
      if (target === scene.player) scene.flashPopup(target.x, target.y - 44, '☠ ' + lost + ' CREW LOST', 0xE0503A);
    }
    scene.events.emit(EV.SHIP_HIT, { ship: target, by: ball.ownerFaction, amount: P.damage });
    if (ball.ownerFaction === 'player'){
      target.hostileToPlayer = true;
      if (target.faction === 'privateer') target.hitsByPlayer++;
      if (target.faction !== 'pirate') FactionSystem.reportCrime(scene, target.x, target.y); // pirate-hunting is lawful
    }
    if (target.hull <= 0){ target.alive = false; if (typeof Docks !== 'undefined') Docks.releaseAnywhere(scene, target); this.spawnLoot(scene, target); scene.events.emit(EV.SHIP_SUNK, { ship: target, by: ball.ownerFaction }); }   // MD2: a sunk ship frees its berth
  },

  spawnLoot(scene, s){ scene.loot.push(Loot.create(s.x, s.y, Loot.valueFor(s.faction))); },

  updateCannonballs(scene, dt){
    const cb = scene.cannonballs;
    for (let i = cb.length - 1; i >= 0; i--){
      const b = cb[i]; b.x += b.vx*dt; b.y += b.vy*dt; b.age += dt/60;
      // player cannon-type upgrade extends range (= projectile lifetime)
      const life = (b.ownerFaction === 'player' && typeof UpgradeSystem !== 'undefined') ? P.cannonLife * UpgradeSystem.rangeMult(scene) : P.cannonLife;
      if (b.age > life){ cb.splice(i, 1); continue; }
      // player shells can damage an un-owned port (capture mechanic) — checked
      // before the land block so a coastal port marker is still hittable
      if (b.ownerFaction === 'player' && typeof PortCaptureSystem !== 'undefined' && scene.navyPorts){
        let portHit = false;
        for (const port of (scene.nearbyPorts || scene.navyPorts)){   // OPT-B2: player shells only fly near the player
          if (port.owner === 'player') continue;
          if (((b.x - port.x)**2 + (b.y - port.y)**2) < PORT_HIT_RADIUS*PORT_HIT_RADIUS){ PortCaptureSystem.damagePort(scene, port); portHit = true; break; }   // M1
        }
        if (portHit){ cb.splice(i, 1); continue; }
      }
      if (Collision.checkIsland(scene, b.x, b.y, 4).hit){ cb.splice(i, 1); continue; }  // land blocks shots
      let hit = false;
      // hits player?
      if (b.ownerFaction !== 'player' && scene.player.hull > 0 && ((b.x - scene.player.x)**2 + (b.y - scene.player.y)**2) < 24*24){   // M1
        scene.player.hull = Math.max(0, scene.player.hull - P.damage);
        scene.player.lastHitAt = scene.time.now/1000;
        scene.flashPopup(scene.player.x, scene.player.y, '-' + P.damage, 0xE0503A);
        hit = true;
      }
      // hits a ship?
      if (!hit){
        for (const s of scene.ships){
          if (!s.alive || s.id === b.owner) continue;
          if (b.ownerFaction === s.faction) continue;          // no friendly fire within same faction
          if (((b.x - s.x)**2 + (b.y - s.y)**2) < 24*24){ this.onHit(scene, b, s); hit = true; break; }   // M1
        }
      }
      // hostile shells can sink the player's trade runners (your own shots excluded)
      if (!hit && b.ownerFaction !== 'player' && typeof RunnerSystem !== 'undefined' && RunnerSystem.tryHit(scene, b)) hit = true;
      if (hit) cb.splice(i, 1);
    }
  },

  updateLoot(scene, dts){
    for (let i = scene.loot.length - 1; i >= 0; i--){
      const l = scene.loot[i]; l.age += dts;
      if (l.age > l.life){ scene.loot.splice(i, 1); continue; }
      if (scene.player.hull > 0 && ((l.x - scene.player.x)**2 + (l.y - scene.player.y)**2) < 36*36){  // LOOT_COLLECT_RADIUS (M1: squared)
        scene.player.gold += l.value; scene.player.ammo = Math.min(scene.player.maxAmmo, scene.player.ammo + 6);
        scene.flashPopup(l.x, l.y, '+' + l.value + 'g', 0xF0C840);
        scene.loot.splice(i, 1);
      }
    }
  },
};
