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

  // step the ship; on collision remove the into-shore component and keep the
  // along-shore component (graze past), never teleport-back.
  moveShip(scene, s, dt){
    const stepX = Math.sin(s.heading*RAD)*s.vel*dt;
    const stepY = -Math.cos(s.heading*RAD)*s.vel*dt;
    const ox = s.x, oy = s.y;
    s.x = Phaser.Math.Clamp(s.x + stepX, -WORLD_CAP, WORLD_CAP);
    s.y = Phaser.Math.Clamp(s.y + stepY, -WORLD_CAP, WORLD_CAP);
    const col = this.checkIslandHull(scene, s);
    if (!col.hit) return;                                       // clear — move committed
    const dot = stepX*col.nx + stepY*col.ny;                    // into-shore component
    const sx = stepX - dot*col.nx, sy = stepY - dot*col.ny;     // along-shore (tangential)
    s.x = Phaser.Math.Clamp(ox + sx, -WORLD_CAP, WORLD_CAP);
    s.y = Phaser.Math.Clamp(oy + sy, -WORLD_CAP, WORLD_CAP);
    if (!this.checkIslandHull(scene, s).hit){ s.vel *= 0.94; return; }   // grazed past, minor loss
    s.x = ox; s.y = oy;                                         // still stuck: revert + nudge out
    if (this.checkIslandHull(scene, s).hit){
      s.x = Phaser.Math.Clamp(ox + col.nx*2, -WORLD_CAP, WORLD_CAP);
      s.y = Phaser.Math.Clamp(oy + col.ny*2, -WORLD_CAP, WORLD_CAP);
    }
    s.vel *= 0.5;
  },

  // soft separation so ships can't occupy the same pixel; never push onto land
  resolveShipCollisions(scene){
    const all = [];
    if (scene.player.hull > 0) all.push(scene.player);
    for (const s of scene.ships) if (s.alive) all.push(s);
    const min = HULL_BEAM*2.4;                                  // hulls touch beam-to-beam
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++){
      const a = all[i], b = all[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < min){
        const overlap = (min - d)/2, ux = dx/d, uy = dy/d;
        const aOld = { x:a.x, y:a.y }; a.x -= ux*overlap; a.y -= uy*overlap; if (this.checkIslandHull(scene, a).hit){ a.x = aOld.x; a.y = aOld.y; }
        const bOld = { x:b.x, y:b.y }; b.x += ux*overlap; b.y += uy*overlap; if (this.checkIslandHull(scene, b).hit){ b.x = bOld.x; b.y = bOld.y; }
        a.vel *= 0.92; b.vel *= 0.92;
      }
    }
  },
};
