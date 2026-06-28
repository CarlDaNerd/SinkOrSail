// ── systems/Combat.js ──
// Broadsides, cannonballs, hit detection, loot (handoff §10). One unified fire
// path for player and AI. No same-faction friendly fire.
const Combat = {
  // side: 'port' (heading-90) | 'star' (heading+90)
  fire(scene, ship, side){
    const cd = ship.faction === 'player' ? P.cooldown : P.cooldown*1.8;     // ENEMY_COOLDOWN_MULT
    if (ship.faction === 'player'){ if ((ship.ammo <= 0 && !DEBUG.infAmmo) || ship.fire[side] > 0) return; }
    else { if (ship.fire > 0) return; }
    const fa = (ship.heading + (side === 'port' ? -90 : 90) + 360)%360;
    const n = (ship.faction === 'player' && ship.broadsideBalls) ? ship.broadsideBalls : P.balls;
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
  },

  // AI passes a side sign; map it to 'port'/'star' through the unified path
  fireEnemy(scene, ship, sideSign){ this.fire(scene, ship, sideSign > 0 ? 'star' : 'port'); },

  // Bow/stern chaser — SINGLE ball along the keel axis, own cooldown per chaser.
  // which = 'bow' (fires along +heading) | 'stern' (fires along heading+180).
  // Gated by the ship's tier flags; no-op if the tier lacks that chaser.
  // Player-only this pass (AI hook = TODO).
  fireChaser(scene, ship, which){
    if (ship.faction !== 'player') return;                       // TODO: AI chasers
    if (typeof ShipTiers === 'undefined' || !ShipTiers.has(ship, which)) return;
    if (!ship.fire) return;
    if ((ship.ammo <= 0 && !DEBUG.infAmmo) || ship.fire[which] > 0) return;
    const fa = (ship.heading + (which === 'stern' ? 180 : 0) + 360)%360;   // along keel
    scene.cannonballs.push(Cannonball.create(
      ship.x + Math.sin(fa*RAD)*20, ship.y - Math.cos(fa*RAD)*20,
      Math.sin(fa*RAD)*P.cannonSpeed, -Math.cos(fa*RAD)*P.cannonSpeed,    // PLACEHOLDER reuse broadside speed
      ship.id, ship.faction));
    if (!DEBUG.infAmmo) ship.ammo = Math.max(0, ship.ammo - 1);
    ship.fire[which] = ShipTiers.cooldown(which);                 // distinct bow vs stern cooldown
    scene.player.lastFiredAt = scene.time.now/1000;              // flag combat-lock window
  },

  onHit(scene, ball, target){
    target.hull -= P.damage;
    scene.events.emit(EV.SHIP_HIT, { ship: target, by: ball.ownerFaction, amount: P.damage });
    if (ball.ownerFaction === 'player'){
      target.hostileToPlayer = true;
      if (target.faction === 'privateer') target.hitsByPlayer++;
      if (target.faction !== 'pirate') FactionSystem.reportCrime(scene, target.x, target.y); // pirate-hunting is lawful
    }
    if (target.hull <= 0){ target.alive = false; this.spawnLoot(scene, target); scene.events.emit(EV.SHIP_SUNK, { ship: target, by: ball.ownerFaction }); }
  },

  spawnLoot(scene, s){ scene.loot.push(Loot.create(s.x, s.y, Loot.valueFor(s.faction))); },

  updateCannonballs(scene, dt){
    const cb = scene.cannonballs;
    for (let i = cb.length - 1; i >= 0; i--){
      const b = cb[i]; b.x += b.vx*dt; b.y += b.vy*dt; b.age += dt/60;
      if (b.age > P.cannonLife){ cb.splice(i, 1); continue; }
      if (Collision.checkIsland(scene, b.x, b.y, 4).hit){ cb.splice(i, 1); continue; }  // land blocks shots
      let hit = false;
      // hits player?
      if (b.ownerFaction !== 'player' && scene.player.hull > 0 && Math.hypot(b.x - scene.player.x, b.y - scene.player.y) < 24){
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
          if (Math.hypot(b.x - s.x, b.y - s.y) < 24){ this.onHit(scene, b, s); hit = true; break; }
        }
      }
      if (hit) cb.splice(i, 1);
    }
  },

  updateLoot(scene, dts){
    for (let i = scene.loot.length - 1; i >= 0; i--){
      const l = scene.loot[i]; l.age += dts;
      if (l.age > l.life){ scene.loot.splice(i, 1); continue; }
      if (scene.player.hull > 0 && Math.hypot(l.x - scene.player.x, l.y - scene.player.y) < 36){  // LOOT_COLLECT_RADIUS
        scene.player.gold += l.value; scene.player.ammo = Math.min(scene.player.maxAmmo, scene.player.ammo + 6);
        scene.flashPopup(l.x, l.y, '+' + l.value + 'g', 0xF0C840);
        scene.loot.splice(i, 1);
      }
    }
  },
};
