// ── ui/WorldMap.js ──
// The big explorable map (M key): pan + zoom over what you've EXPLORED. As you
// sail, a MINIMAP_RANGE circle around the ship is revealed into FOG_CELL cells
// (gs.explored) — the same coverage as the corner minimap, so the chart only ever
// shows where you've actually been (no leaking the whole streamed world). Terrain
// inside revealed cells is regenerated deterministically per chunk (cheap +
// region-cached). Unexplored stays dark. Re-rendered only on pan/zoom (mapDirty).
function drawWorldMap(g, gs){
  g.clear();
  g.fillStyle(0x0A1119, 1); g.fillRect(0, 0, GAME_W, GAME_H);          // dark backdrop = unexplored

  const s = gs.mapScale, cx = GAME_W/2, cy = GAME_H/2, fc = FOG_CELL;
  const w2x = wx => cx + (wx - gs.mapCenterX)*s, w2y = wy => cy + (wy - gs.mapCenterY)*s;
  const halfWx = (GAME_W/2)/s, halfWy = (GAME_H/2)/s;
  const minX = gs.mapCenterX - halfWx, maxX = gs.mapCenterX + halfWx;
  const minY = gs.mapCenterY - halfWy, maxY = gs.mapCenterY + halfWy;
  const inExplored = (wx, wy) => gs.explored.has(Math.floor(wx/fc) + ',' + Math.floor(wy/fc));

  // explored tint (one rect per revealed cell in view) + collect the chunks those
  // cells touch, so we only regenerate terrain where you've actually been
  const cellPx = fc*s, chunks = new Set();
  g.fillStyle(0x13283A, 1);
  for (const key of gs.explored){
    const ci = key.indexOf(','); const fx = +key.slice(0, ci), fy = +key.slice(ci + 1);
    const wx = fx*fc, wy = fy*fc;
    if (wx > maxX || wx + fc < minX || wy > maxY || wy + fc < minY) continue;   // cull to view
    g.fillRect(w2x(wx), w2y(wy), cellPx + 1, cellPx + 1);
    chunks.add(Math.floor(wx/CHUNK_SIZE) + ',' + Math.floor(wy/CHUNK_SIZE));
  }
  // land within revealed cells (regen each touched chunk, gate each lobe by its cell)
  for (const ck of chunks){
    const ci = ck.indexOf(','); const xk = +ck.slice(0, ci), yk = +ck.slice(ci + 1);
    const data = WorldGen.generateChunk(xk, yk);
    for (const land of data.lands){
      g.fillStyle((land.mainland || land.big) ? 0x3D6E25 : 0x4C8A30, 1);
      for (const e of land.ells) if (inExplored(e.cx, e.cy)) g.fillCircle(w2x(e.cx), w2y(e.cy), Math.max(0.7, e.rx*s));
    }
  }
  // ports — only those in REVEALED cells, so they stay hidden under the fog like the
  // land does. Coloured by port type.
  for (const p of gs.navyPorts){
    if (!inExplored(p.x, p.y)) continue;
    const col = (PORT_TYPES[p.type] && PORT_TYPES[p.type].color) || 0x8AC8E0;
    g.fillStyle(col, 1); g.fillCircle(w2x(p.x), w2y(p.y), 4);
    g.lineStyle(1.5, 0x2A9EAE, 0.6); g.strokeCircle(w2x(p.x), w2y(p.y), 8);
  }
  // player marker + heading
  const ppx = w2x(gs.player.x), ppy = w2y(gs.player.y);
  g.fillStyle(0x88BBFF, 1); g.fillCircle(ppx, ppy, 5);
  g.lineStyle(2.5, 0xFFFFFF, 0.9); g.lineBetween(ppx, ppy, ppx + Math.sin(gs.player.heading*RAD)*14, ppy - Math.cos(gs.player.heading*RAD)*14);
}
