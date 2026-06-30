// ── systems/CollisionSystem.js ──
// Hull-shaped island collision (3-point centerline sample), slide-along-coast
// response, and soft ship-vs-ship separation (handoff §7). Also owns the core
// ellipse query checkIsland(), shared by Visibility and Steering.
const Collision = {
  // point-vs-island ellipse test (radius pads each ellipse). Returns a surface
  // normal on hit so callers can resolve along/into shore.
  checkIsland(scene, x, y, radius){
    for (const is of scene.islands) for (const e of is.ells){
      const nx = (x - e.cx)/(e.rx + radius), ny = (y - e.cy)/(e.ry + radius);
      if (nx*nx + ny*ny < 1){ const a = Math.atan2(y - e.cy, x - e.cx); return { hit:true, nx:Math.cos(a), ny:Math.sin(a) }; }
    }
    return { hit:false };
  },

  // is (x,y) over a reef rock? (reefs damage but don't block — not in scene.islands)
  checkReef(scene, x, y){
    if (!scene.reefs) return false;
    for (const reef of scene.reefs) for (const rock of reef.rocks){
      const nx = (x - rock.cx)/rock.rx, ny = (y - rock.cy)/rock.ry;
      if (nx*nx + ny*ny < 1) return true;
    }
    return false;
  },

  // samples stern, mid, bow along the hull's long axis, each a beam-radius
  // circle. Lets a ship thread a gap when pointed through it, while a hull
  // sideways-on to a reef still needs full clearance.
  checkIslandHull(scene, s){
    const sin = Math.sin(s.heading*RAD), cos = Math.cos(s.heading*RAD);
    for (const off of [-HULL_LEN*0.7, 0, HULL_LEN*0.7]){
      const px = s.x + sin*off, py = s.y - cos*off;
      const c = this.checkIsland(scene, px, py, HULL_BEAM);
      if (c.hit) return c;
    }
    return { hit:false };
  },

  // step the ship by its heading propulsion PLUS its collision drift (s.push). On
  // hitting shore, slide: the propulsion speed becomes the along-shore part (head-on
  // → ~0, grazing → near full), and the drift loses its into-shore part. A true
  // head-on corner is a dead stop. Never teleport-back.
  moveShip(scene, s, dt){
    if (!s.push) s.push = { x:0, y:0 };
    const k = Math.pow(PUSH_DECAY, dt);                         // decay the drift (frame-rate independent)
    s.push.x *= k; s.push.y *= k;
    if (Math.abs(s.push.x) < 0.002) s.push.x = 0;
    if (Math.abs(s.push.y) < 0.002) s.push.y = 0;

    const hx = Math.sin(s.heading*RAD)*s.vel, hy = -Math.cos(s.heading*RAD)*s.vel;   // heading velocity
    const vx = hx + s.push.x, vy = hy + s.push.y;               // total velocity = propulsion + drift
    const ox = s.x, oy = s.y;
    s.x = Phaser.Math.Clamp(s.x + vx*dt, -WORLD_CAP, WORLD_CAP);
    s.y = Phaser.Math.Clamp(s.y + vy*dt, -WORLD_CAP, WORLD_CAP);
    const col = this.checkIslandHull(scene, s);
    if (!col.hit) return;                                       // clear — move committed

    // land impact damage: a fast crunch into the shore hurts (grazes below collMin are free)
    const into = -(vx*col.nx + vy*col.ny);
    if (into > P.collMin) this._collisionDamage(scene, s, (into - P.collMin)*P.collScale*P.collLand, null);

    // slide: drop the into-shore component of the TOTAL motion, keep tangential
    const dot = vx*col.nx + vy*col.ny;
    const tvx = vx - dot*col.nx, tvy = vy - dot*col.ny;
    // place at the tangential spot, then step OUT along the (re-evaluated) shore
    // normal to clear any residual penetration — so a near-parallel graze keeps
    // sliding instead of sticking when removing the velocity alone isn't enough
    let nx = ox + tvx*dt, ny = oy + tvy*dt, clear = false;
    for (let step = 0; step < 8; step++){
      s.x = Phaser.Math.Clamp(nx, -WORLD_CAP, WORLD_CAP);
      s.y = Phaser.Math.Clamp(ny, -WORLD_CAP, WORLD_CAP);
      const c2 = this.checkIslandHull(scene, s);
      if (!c2.hit){ clear = true; break; }
      nx += c2.nx*3; ny += c2.ny*3;                             // nudge out along the current normal
    }
    if (clear){
      const hdot = hx*col.nx + hy*col.ny;                       // propulsion into the shore
      s.vel = Math.hypot(hx - hdot*col.nx, hy - hdot*col.ny);   // keep only along-shore propulsion
      const pdot = s.push.x*col.nx + s.push.y*col.ny;           // drift slides along too
      s.push.x -= pdot*col.nx; s.push.y -= pdot*col.ny;
      return;
    }
    // truly wedged (head-on into a corner): dead stop, nudged off the rock
    s.x = ox; s.y = oy;
    if (this.checkIslandHull(scene, s).hit){
      s.x = Phaser.Math.Clamp(ox + col.nx*2, -WORLD_CAP, WORLD_CAP);
      s.y = Phaser.Math.Clamp(oy + col.ny*2, -WORLD_CAP, WORLD_CAP);
    }
    s.vel = 0; s.push.x = 0; s.push.y = 0;
  },

  // ship-vs-ship: separate the overlap and SHOVE via the drift vector, weighted by
  // mass (maxHull) — a heavy ship pushes a light one hard and barely slows; ramming
  // a bigger hull bounces you. The lighter ship always yields more. Never push onto land.
  resolveShipCollisions(scene){
    const all = [];
    if (scene.player.hull > 0) all.push(scene.player);
    for (const s of scene.ships) if (s.alive) all.push(s);
    const min = HULL_BEAM*2.4;                                  // hulls touch beam-to-beam
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++){
      const a = all[i], b = all[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d <= 0 || d >= min) continue;
      const ux = dx/d, uy = dy/d, overlap = min - d;
      const ma = a.maxHull || 100, mb = b.maxHull || 100, sum = ma + mb;
      const fa = mb/sum, fb = ma/sum;                           // each ship's yield share (lighter yields more)
      if (!a.push) a.push = { x:0, y:0 }; if (!b.push) b.push = { x:0, y:0 };
      // positional un-overlap (mass-weighted), reverted if it would beach a hull
      const aOld = { x:a.x, y:a.y }; a.x -= ux*overlap*fa; a.y -= uy*overlap*fa; if (this.checkIslandHull(scene, a).hit){ a.x = aOld.x; a.y = aOld.y; }
      const bOld = { x:b.x, y:b.y }; b.x += ux*overlap*fb; b.y += uy*overlap*fb; if (this.checkIslandHull(scene, b).hit){ b.x = bOld.x; b.y = bOld.y; }
      // momentum shove along the contact normal, only while the hulls are closing
      const avx = Math.sin(a.heading*RAD)*a.vel + a.push.x, avy = -Math.cos(a.heading*RAD)*a.vel + a.push.y;
      const bvx = Math.sin(b.heading*RAD)*b.vel + b.push.x, bvy = -Math.cos(b.heading*RAD)*b.vel + b.push.y;
      const closing = (avx - bvx)*ux + (avy - bvy)*uy;          // >0 = approaching
      if (closing > 0){
        const imp = closing*PUSH_TRANSFER;
        a.push.x -= ux*imp*fa; a.push.y -= uy*imp*fa;           // rammer recoils (more vs a heavier target)
        b.push.x += ux*imp*fb; b.push.y += uy*imp*fb;           // target shoved (more from a heavier rammer)
        // ram damage on a hard enough crunch: same size = base; the lower-tier hull takes more
        const over = closing - P.collMin;
        if (over > 0){
          const base = over*P.collScale, ta = a.tier || 1, tb = b.tier || 1;
          this._collisionDamage(scene, a, base*Math.pow(P.collTier, tb - ta), b);
          this._collisionDamage(scene, b, base*Math.pow(P.collTier, ta - tb), a);
        }
      }
    }
  },

  // apply collision/ram damage to a hull, with an anti-grind cooldown. `by` is the
  // other ship (or null for land). Ramming a non-pirate as the player is a crime
  // (→ WANTED) when DEBUG.ramWanted; a kill is credited to the rammer.
  _collisionDamage(scene, ship, dmg, by){
    if (dmg <= 0 || ship.hull <= 0) return;
    const now = scene.time.now/1000;
    if (ship._ramAt && now - ship._ramAt < COLLISION_DMG_COOLDOWN) return;
    ship._ramAt = now;
    ship.hull -= dmg; ship.lastHitAt = now;
    scene.flashPopup(ship.x, ship.y, '-' + Math.round(dmg), 0xE0A040);
    const byTag = (by === scene.player) ? 'player' : (by ? (by.faction || 'ship') : 'collision');
    if (DEBUG.ramWanted && by === scene.player && ship.faction && ship.faction !== 'pirate' && typeof FactionSystem !== 'undefined'){
      FactionSystem.reportCrime(scene, ship.x, ship.y);
    }
    if (typeof EV !== 'undefined') scene.events.emit(EV.SHIP_HIT, { ship, by: byTag, amount: dmg });
    if (ship.hull <= 0 && ship !== scene.player && ship.alive !== false){
      ship.alive = false;
      if (typeof Combat !== 'undefined') Combat.spawnLoot(scene, ship);
      if (typeof EV !== 'undefined') scene.events.emit(EV.SHIP_SUNK, { ship, by: byTag });
    }
  },
};
