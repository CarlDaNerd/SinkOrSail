// ── world/Island.js ──
// Terrain rendering, baked per CHUNK into one Graphics (drawn once on load,
// destroyed on unload). Draw order bottom→top: shallow patches → reef patches +
// rocks → land (4-layer: shallow ring → beach → jungle → dark core, §5).
const Island = {
  drawLands(g, lands){
    for (const is of lands) for (const e of is.ells){ g.fillStyle(0x2A9EAE, 0.45); g.fillEllipse(e.cx, e.cy, e.rx*2.35, e.ry*2.35); }
    for (const is of lands) for (const e of is.ells){ g.fillStyle(0xC8905A, 1);    g.fillEllipse(e.cx, e.cy, e.rx*2,    e.ry*2); }
    for (const is of lands){
      if (!is.multi && is.ells[0].rx < 36){ const e = is.ells[0]; g.fillStyle(0x685848, 1); g.fillEllipse(e.cx, e.cy, e.rx*1.1, e.ry*1.1); continue; } // rock cap for outcrops
      for (const e of is.ells){ g.fillStyle(0x3D6E25, 1); g.fillEllipse(e.cx, e.cy, e.rx*1.56, e.ry*1.56); }
    }
    for (const is of lands){
      if (!is.multi && is.ells[0].rx < 36) continue;
      for (const e of is.ells){ g.fillStyle(0x2B5018, 1); g.fillEllipse(e.cx, e.cy, e.rx, e.ry); }
    }
  },

  // soft "shallows" — faint teal patches that lighten the water around groups
  drawShallows(g, shallows){
    for (const s of shallows){ g.fillStyle(0x2A9EAE, 0.13); g.fillEllipse(s.cx, s.cy, s.rx*2, s.ry*2); }
  },

  // reefs: an elongated shallow band along the shore (faint teal circles laid
  // down the reef's axis) with dark, partly-submerged rocks on top
  drawReefs(g, reefs){
    for (const reef of reefs){
      const ux = Math.cos(reef.angle), uy = Math.sin(reef.angle);
      g.fillStyle(0x2A9EAE, 0.11);
      for (let k = -2; k <= 2; k++){ const fx = reef.cx + ux*(k/2)*reef.len, fy = reef.cy + uy*(k/2)*reef.len; g.fillEllipse(fx, fy, reef.wid*3.4, reef.wid*3.4); }
    }
    for (const reef of reefs) for (const rock of reef.rocks){ g.fillStyle(0x5A4A3A, 0.9); g.fillEllipse(rock.cx, rock.cy, rock.rx*2, rock.ry*2); }
  },

  // bake one chunk's terrain into a dedicated Graphics (returned so the chunk
  // manager can destroy it on unload)
  bakeChunk(scene, chunk){
    const g = scene.add.graphics().setDepth(1);
    this.drawShallows(g, chunk.shallows);
    this.drawReefs(g, chunk.reefs);
    this.drawLands(g, chunk.lands);
    return g;
  },

  // port markers: cyan dot + ring + faint dock-radius ring. Redrawn whenever the
  // port set changes.
  drawPortMarkers(scene){
    if (!scene._portGfx) scene._portGfx = scene.add.graphics().setDepth(2);
    const pg = scene._portGfx; pg.clear();
    for (const np of scene.navyPorts){
      pg.lineStyle(1, 0x2A9EAE, 0.16); pg.strokeCircle(np.x, np.y, DOCK_RADIUS);   // dockable area
      pg.fillStyle(0x8AC8E0, 0.9); pg.fillCircle(np.x, np.y, 9);
      pg.lineStyle(2, 0x2A9EAE, 0.4); pg.strokeCircle(np.x, np.y, 16);
    }
  },
};
