// ── ui/MiniMap.js ──
// Top-right corner minimap (200×150). Player-centred radar showing a FIXED
// MINIMAP_RANGE radius around the ship (screen-size independent). Mainland
// footprints, island dots, ports, on-screen ships, the visible-viewport box, and
// YOU as a heading arrow. Drawn into a masked graphics (HUD owns the mask) so
// nothing spills past the edges; the tan border is drawn separately, unmasked,
// by the HUD.
function drawMiniMap(g, gs, pl){
  g.clear();
  const mw = MINIMAP_W, mh = MINIMAP_H, mx = GAME_W - mw - 12, my = 12;
  const cxp = mx + mw/2, cyp = my + mh/2;
  g.fillStyle(0x0E1820, 0.92); g.fillRect(mx, my, mw, mh);
  const scale = mw/(2*MINIMAP_RANGE);                  // fixed range maps across the minimap (not screen-relative)
  const halfWx = MINIMAP_RANGE, halfWy = (mh/2)/scale;
  // radius-aware: keep a lobe whose CIRCLE overlaps the window (not just its centre),
  // so islands at the edge draw cleanly (clipped by the mask) instead of popping in whole
  const inWin = (wx, wy, r) => Math.abs(wx - pl.x) <= halfWx + (r || 0) && Math.abs(wy - pl.y) <= halfWy + (r || 0);
  const w2x = wx => cxp + (wx - pl.x)*scale, w2y = wy => cyp + (wy - pl.y)*scale;

  // draw every lobe so medium/large/stripe islands show their real footprint;
  // big land (mainland + medium/large) reads a touch darker than small islands
  for (const is of gs.islands){
    g.fillStyle((is.mainland || is.big) ? 0x3D6E25 : 0x4C8A30, 0.95);
    for (const e of is.ells) if (inWin(e.cx, e.cy, e.rx)) g.fillCircle(w2x(e.cx), w2y(e.cy), Math.max(1, e.rx*scale));
  }
  for (const p of gs.navyPorts) if (inWin(p.x, p.y)){ g.fillStyle((PORT_TYPES[p.type] && PORT_TYPES[p.type].color) || 0x8AC8E0, 1); g.fillCircle(w2x(p.x), w2y(p.y), 2.8); }
  // ships: only those inside the on-screen (camera) view, so the minimap mirrors
  // what you can actually see — no tracking ships beyond the visible area
  const view = gs.cameras.main.worldView;
  for (const s of gs.ships){ if (!s.alive || !view.contains(s.x, s.y)) continue; const c = { merchant:0xD0AA70, pirate:0xE0503A, navy:0x6AB0D8, privateer:0x6AC060 }[s.faction]; g.fillStyle(c, 1); g.fillCircle(w2x(s.x), w2y(s.y), 1.8); }
  // on-screen viewport box = the actual visible world rect (accounts for zoom)
  g.lineStyle(1, 0xD4C890, 0.4); g.strokeRect(w2x(view.x), w2y(view.y), view.width*scale, view.height*scale);
  // YOU — a triangle pointing in your heading
  const hx = Math.sin(pl.heading*RAD), hy = -Math.cos(pl.heading*RAD), rx = -hy, ry = hx, sz = 6.5;
  g.fillStyle(0x88BBFF, 1);
  g.fillTriangle(cxp + hx*sz, cyp + hy*sz,
                 cxp - hx*sz*0.55 + rx*sz*0.55, cyp - hy*sz*0.55 + ry*sz*0.55,
                 cxp - hx*sz*0.55 - rx*sz*0.55, cyp - hy*sz*0.55 - ry*sz*0.55);
}
