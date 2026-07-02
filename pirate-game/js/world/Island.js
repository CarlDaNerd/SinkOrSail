// ── world/Island.js ──
// Terrain rendering. Each chunk bakes into per-layer Graphics at fixed global
// depths. Because the depths are global, every chunk's beach renders together,
// then every jungle, then every core — so overlapping islands (even across chunk
// boundaries) merge into one glob per layer instead of stacked sprites.
//
// THREE land size-bands render bottom-to-top so big land never paints over small:
//   mainland (1.30–1.38) · big islands = medium/large (1.44–1.50) · small islands
//   (1.56–1.62). Shallows sit lowest (1.0), reef rocks highest (1.9).
//
// Layer bands (beach/jungle/core) are a FIXED width per landmass (`is.bw`,
// ~20–60px) rather than a fraction of the island radius, so a tiny island and a
// massive mainland get the same-looking sand/jungle rims (§ user tweak).
const Island = {
  // shallow halo around land — fixed outset (opaque uniform shallow colour)
  drawShallowRings(g, lands){
    for (const is of lands) for (const e of is.ells){ g.fillStyle(SHALLOW_COLOR, 1); g.fillEllipse(e.cx, e.cy, (e.rx + SHALLOW_BAND)*2, (e.ry + SHALLOW_BAND)*2); }
  },
  drawBeach(g, lands){
    for (const is of lands) for (const e of is.ells){ g.fillStyle(0xC8905A, 1); g.fillEllipse(e.cx, e.cy, e.rx*2, e.ry*2); }
  },
  drawJungle(g, lands){
    for (const is of lands){ const bw = is.bw; for (const e of is.ells){ const jx = e.rx - bw, jy = e.ry - bw; if (jx > 3 && jy > 3){ g.fillStyle(0x3D6E25, 1); g.fillEllipse(e.cx, e.cy, jx*2, jy*2); } } }
  },
  drawCore(g, lands){
    for (const is of lands){ const bw = is.bw; for (const e of is.ells){ const dx = e.rx - 2*bw, dy = e.ry - 2*bw; if (dx > 3 && dy > 3){ g.fillStyle(0x2B5018, 1); g.fillEllipse(e.cx, e.cy, dx*2, dy*2); } } }
  },
  // biome shallows (zones lightening the water around groups) — same opaque colour
  drawBiomeShallows(g, shallows){
    for (const s of shallows){ g.fillStyle(SHALLOW_COLOR, 1); g.fillEllipse(s.cx, s.cy, s.rx*2, s.ry*2); }
  },
  drawReefBands(g, reefs){
    for (const reef of reefs){
      const ux = Math.cos(reef.angle), uy = Math.sin(reef.angle);
      g.fillStyle(SHALLOW_COLOR, 1);
      for (let k = -2; k <= 2; k++){ const fx = reef.cx + ux*(k/2)*reef.len, fy = reef.cy + uy*(k/2)*reef.len; g.fillEllipse(fx, fy, reef.wid*3.4, reef.wid*3.4); }
    }
  },
  drawReefRocks(g, reefs){
    for (const reef of reefs) for (const rock of reef.rocks){ g.fillStyle(0x5A4A3A, 0.9); g.fillEllipse(rock.cx, rock.cy, rock.rx*2, rock.ry*2); }
  },

  // Bake one chunk into per-layer graphics at fixed global depths. The three land
  // SIZE bands stack bottom-to-top — mainland (1.3x) < big islands / medium+large
  // (1.4x) < small islands (1.5x) — so larger land never paints over smaller land,
  // deterministically and across chunk boundaries. Reef rocks sit above all land
  // (1.9). Same-type layers share a depth so overlaps merge into one glob.
  // Returned as an array for unload.
  bakeChunk(scene, chunk){
    const mk = (depth) => scene.add.graphics().setDepth(depth);
    const mainLands  = chunk.lands.filter(l => l.mainland);
    const bigLands   = chunk.lands.filter(l => l.big && !l.mainland);   // medium + large islands
    const smallLands = chunk.lands.filter(l => !l.big && !l.mainland);  // small + tiny islands
    const gShallow = mk(1.0);
    const gMBeach = mk(1.30), gMJungle = mk(1.34), gMCore = mk(1.38);   // mainland (lowest)
    const gBBeach = mk(1.44), gBJungle = mk(1.47), gBCore = mk(1.50);   // big islands (middle)
    const gIBeach = mk(1.56), gIJungle = mk(1.59), gICore = mk(1.62);   // small islands (top)
    const gRocks  = mk(1.90);                                           // reef rocks (above all land)
    this.drawBiomeShallows(gShallow, chunk.shallows);
    this.drawReefBands(gShallow, chunk.reefs);
    this.drawShallowRings(gShallow, chunk.lands);
    this.drawBeach(gMBeach, mainLands);  this.drawJungle(gMJungle, mainLands);  this.drawCore(gMCore, mainLands);
    this.drawBeach(gBBeach, bigLands);   this.drawJungle(gBJungle, bigLands);   this.drawCore(gBCore, bigLands);
    this.drawBeach(gIBeach, smallLands); this.drawJungle(gIJungle, smallLands); this.drawCore(gICore, smallLands);
    this.drawReefRocks(gRocks, chunk.reefs);
    return [gShallow, gMBeach, gMJungle, gMCore, gBBeach, gBJungle, gBCore, gIBeach, gIJungle, gICore, gRocks];
  },

  // port markers: type-coloured dot + ring + faint dock-radius ring (above land).
  // Each port type has its own colour (PORT_TYPES[type].color); Trading Hubs read
  // a touch bigger since they're the regional anchor.
  drawPortMarkers(scene){
    if (!scene._portGfx) scene._portGfx = scene.add.graphics().setDepth(2);
    const pg = scene._portGfx; pg.clear();
    for (const np of scene.navyPorts){
      const col = (PORT_TYPES[np.type] && PORT_TYPES[np.type].color) || 0x8AC8E0;
      const r = (np.type === 'TradingHub') ? 11 : 8;
      pg.lineStyle(1, 0x2A9EAE, 0.16); pg.strokeCircle(np.x, np.y, DOCK_RADIUS);
      pg.fillStyle(col, 0.95); pg.fillCircle(np.x, np.y, r);
      pg.lineStyle(2, col, 0.55); pg.strokeCircle(np.x, np.y, r + 7);
      // MD2: visible quay — a pier plank spanning the berths, plus a pad per slot
      // (teal = open, amber = occupied). PLACEHOLDER art, flat-fill V2 style.
      if (np.docks && np.docks.length){
        const q = np.docks, qy = np.y + q[0].dy;
        const x0 = np.x + q[0].dx - 14, x1 = np.x + q[q.length - 1].dx + 14;
        pg.lineStyle(5, 0x6B4A2A, 0.9);  pg.lineBetween(x0, qy - 10, x1, qy - 10);   // pier plank
        pg.lineStyle(2, 0x4A3018, 0.9);
        for (const d of q){                                          // pilings under each pad
          const bx = np.x + d.dx, by = np.y + d.dy;
          pg.lineBetween(bx, qy - 10, bx, by - 5);
          pg.fillStyle(d.occupantId ? 0xE0A040 : 0x2A9EAE, 0.9); pg.fillRect(bx - 5, by - 5, 10, 10);
          pg.lineStyle(1, 0x0E1820, 0.6); pg.strokeRect(bx - 5, by - 5, 10, 10);
          pg.lineStyle(2, 0x4A3018, 0.9);
        }
        // PF1: a derelict hull for sale sits at the end of the quay — grey hull + mast stub
        if (np.derelict){
          const q2 = q[q.length - 1], hx = np.x + q2.dx + 16, hy = np.y + q2.dy;
          pg.fillStyle(0x707A84, 0.95);
          pg.fillTriangle(hx - 7, hy - 3, hx + 9, hy, hx - 7, hy + 3);
          pg.lineStyle(1.5, 0x9AA4AE, 0.9); pg.lineBetween(hx, hy, hx, hy - 7);
        }
      }
    }
  },
};
