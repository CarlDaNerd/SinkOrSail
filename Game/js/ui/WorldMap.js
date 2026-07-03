// ── ui/WorldMap.js ──
// The big explorable map (M key): pan + zoom over what you've EXPLORED. As you
// sail, a MINIMAP_RANGE circle around the ship is revealed into FOG_CELL cells
// (gs.explored). Drawn in two layers: `g` holds the dark backdrop + revealed tint
// (unmasked); `landG` holds the land / ports / you and is clipped by a geometry
// MASK (`maskG`) filled with the revealed cells — so islands stop exactly at the
// fog boundary (no bleeding past it) and partial islands show only their revealed
// slice. Re-rendered only on pan/zoom or new reveals (mapDirty).
function drawWorldMap(g, landG, maskG, gs){
  g.clear(); landG.clear(); maskG.clear();
  g.fillStyle(0x0A1119, 1); g.fillRect(0, 0, GAME_W, GAME_H);          // dark backdrop = unexplored (unmasked)

  const s = gs.mapScale, cx = GAME_W/2, cy = GAME_H/2, fc = FOG_CELL;
  const w2x = wx => cx + (wx - gs.mapCenterX)*s, w2y = wy => cy + (wy - gs.mapCenterY)*s;
  const halfWx = (GAME_W/2)/s, halfWy = (GAME_H/2)/s;
  const minX = gs.mapCenterX - halfWx, maxX = gs.mapCenterX + halfWx;
  const minY = gs.mapCenterY - halfWy, maxY = gs.mapCenterY + halfWy;
  const inExplored = (wx, wy) => gs.explored.has(Math.floor(wx/fc) + ',' + Math.floor(wy/fc));

  // revealed-cell tint (g) + the SAME cells into the mask (maskG) which clips the land
  // layer; collect the chunks those cells touch so we only regenerate terrain you've seen
  const cellPx = fc*s, chunks = new Set();
  g.fillStyle(0x13283A, 1); maskG.fillStyle(0xffffff, 1);
  for (const key of gs.explored){
    const ci = key.indexOf(','); const fx = +key.slice(0, ci), fy = +key.slice(ci + 1);
    const wx = fx*fc, wy = fy*fc;
    if (wx > maxX || wx + fc < minX || wy > maxY || wy + fc < minY) continue;   // cull to view
    g.fillRect(w2x(wx), w2y(wy), cellPx + 1, cellPx + 1);
    maskG.fillRect(w2x(wx), w2y(wy), cellPx + 1, cellPx + 1);
    chunks.add(Math.floor(wx/CHUNK_SIZE) + ',' + Math.floor(wy/CHUNK_SIZE));
  }
  // land — drawn in FULL into the masked layer; the mask trims every lobe to the
  // revealed cells, so coastlines stop at the fog edge. Regenerate touched chunks only.
  for (const ck of chunks){
    const ci = ck.indexOf(','); const xk = +ck.slice(0, ci), yk = +ck.slice(ci + 1);
    const data = WorldGen.generateChunk(xk, yk);
    for (const land of data.lands){
      landG.fillStyle((land.mainland || land.big) ? 0x3D6E25 : 0x4C8A30, 1);
      for (const e of land.ells) landG.fillCircle(w2x(e.cx), w2y(e.cy), Math.max(0.7, e.rx*s));
    }
  }
  // ports — only those in revealed cells, coloured by type (masked layer)
  for (const p of gs.navyPorts){
    if (!inExplored(p.x, p.y)) continue;
    const col = (PORT_TYPES[p.type] && PORT_TYPES[p.type].color) || 0x8AC8E0;
    const px = w2x(p.x), py = w2y(p.y);
    landG.fillStyle(col, 1); landG.fillCircle(px, py, 4);
    // PF1: YOUR ports read at a glance — gold ring + pennant tick (doc VI)
    if (p.owner === 'player'){
      landG.lineStyle(2, 0xF0C840, 0.95); landG.strokeCircle(px, py, 8);
      landG.fillStyle(0xF0C840, 0.95); landG.fillTriangle(px, py - 14, px, py - 8, px + 6, py - 11);
      landG.lineStyle(1.5, 0xF0C840, 0.8); landG.lineBetween(px, py - 14, px, py - 8);
    } else { landG.lineStyle(1.5, 0x2A9EAE, 0.6); landG.strokeCircle(px, py, 8); }
    // PF1: what the port SELLS — a diamond beside the dot in the commodity's color
    const src = p.sourceCommodity;
    if (src && typeof COMMODITY_INFO !== 'undefined' && COMMODITY_INFO[src]){
      const cc = COMMODITY_INFO[src].color, dx = px + 9, dy = py + 6;
      landG.fillStyle(cc, 1); landG.fillTriangle(dx, dy - 4, dx + 4, dy, dx, dy + 4);
      landG.fillTriangle(dx, dy - 4, dx - 4, dy, dx, dy + 4);
    }
  }
  // PF1: live weather on the chart (doc VI) — drawn even outside revealed cells
  // (weather is radar, not cartography). Icons by type at the event's center.
  const wx = gs.weather;
  if (wx && wx.active && wx.data){
    const d = wx.data;
    if (wx.active === 'cyclone' && d.cx != null){
      const cx = w2x(d.cx), cy = w2y(d.cy);
      g.lineStyle(2, 0xE0503A, 0.9);
      for (let k = 0; k < 3; k++){ g.beginPath(); g.arc(cx, cy, 4 + k*3, k*2.1, k*2.1 + 4.2); g.strokePath(); }
    } else if (wx.active === 'storm' && d.cx != null){
      g.fillStyle(0x3A4A5C, 0.85); g.fillCircle(w2x(d.cx), w2y(d.cy), 7);
      g.lineStyle(2, 0xF0E060, 0.95); const sx = w2x(d.cx), sy = w2y(d.cy);
      g.lineBetween(sx - 2, sy - 3, sx + 1, sy); g.lineBetween(sx + 1, sy, sx - 1, sy + 4);
    } else if (wx.active === 'tsunami' && d.cx != null){
      g.lineStyle(1.5, 0x6ED0E0, 0.9);
      g.strokeCircle(w2x(d.cx), w2y(d.cy), 5); g.strokeCircle(w2x(d.cx), w2y(d.cy), 9);
    } else if (wx.active === 'snow' && d.bergs && d.bergs.length){
      g.fillStyle(0xEAF4FA, 0.9);
      for (let k = 0; k < Math.min(5, d.bergs.length); k++){ const b = d.bergs[k]; g.fillCircle(w2x(b.x), w2y(b.y), 1.6); }
    } else if (wx.active === 'rain'){
      // ambient rain: streak glyph pinned by the player (no fixed center)
      const rx = w2x(gs.player.x) + 14, ry = w2y(gs.player.y) - 14;
      g.lineStyle(1.5, 0x9FC0D8, 0.9);
      for (let k = 0; k < 3; k++) g.lineBetween(rx + k*4, ry, rx + k*4 - 3, ry + 6);
    }
  }
  // player marker — the SAME heading-arrow icon the minimap uses (masked layer; the
  // player is always within revealed cells)
  drawPlayerArrow(landG, w2x(gs.player.x), w2y(gs.player.y), gs.player.heading, 9, 0x88BBFF);
}
