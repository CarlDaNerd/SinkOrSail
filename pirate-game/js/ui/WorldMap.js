// ── ui/WorldMap.js ──
// The big explorable map (M key): pan + zoom over what you've EXPLORED. Chunks
// you've sailed near are remembered (gs.explored); their terrain is regenerated
// deterministically per chunk (cheap + region-cached) so we don't keep far chunks
// loaded just to draw the map. Unexplored stays dark. Drawn into a UIScene
// graphics, only re-rendered when the view pans/zooms (gs.mapDirty).
function drawWorldMap(g, gs){
  g.clear();
  g.fillStyle(0x0A1119, 1); g.fillRect(0, 0, GAME_W, GAME_H);          // dark backdrop = unexplored

  const s = gs.mapScale, cx = GAME_W/2, cy = GAME_H/2;
  const w2x = wx => cx + (wx - gs.mapCenterX)*s, w2y = wy => cy + (wy - gs.mapCenterY)*s;
  const halfWx = (GAME_W/2)/s, halfWy = (GAME_H/2)/s;
  const c0x = Math.floor((gs.mapCenterX - halfWx)/CHUNK_SIZE), c1x = Math.floor((gs.mapCenterX + halfWx)/CHUNK_SIZE);
  const c0y = Math.floor((gs.mapCenterY - halfWy)/CHUNK_SIZE), c1y = Math.floor((gs.mapCenterY + halfWy)/CHUNK_SIZE);
  if ((c1x - c0x + 1) * (c1y - c0y + 1) > 8000) return;                // safety (scale is clamped so this won't hit)

  const cs = CHUNK_SIZE*s;
  // explored tint — lets you see where you've been even across empty ocean
  g.fillStyle(0x13283A, 1);
  for (let yk = c0y; yk <= c1y; yk++) for (let xk = c0x; xk <= c1x; xk++){
    if (gs.explored.has(xk + ',' + yk)) g.fillRect(w2x(xk*CHUNK_SIZE), w2y(yk*CHUNK_SIZE), cs + 1, cs + 1);
  }
  // land within explored chunks (regenerated deterministically)
  for (let yk = c0y; yk <= c1y; yk++) for (let xk = c0x; xk <= c1x; xk++){
    if (!gs.explored.has(xk + ',' + yk)) continue;
    const data = WorldGen.generateChunk(xk, yk);
    for (const land of data.lands){ g.fillStyle(land.mainland ? 0x3D6E25 : 0x4C8A30, 1); for (const e of land.ells) g.fillCircle(w2x(e.cx), w2y(e.cy), Math.max(0.7, e.rx*s)); }
  }
  // ports
  for (const p of gs.navyPorts){ g.fillStyle(0x8AC8E0, 1); g.fillCircle(w2x(p.x), w2y(p.y), 4); g.lineStyle(1.5, 0x2A9EAE, 0.6); g.strokeCircle(w2x(p.x), w2y(p.y), 8); }
  // player marker + heading
  const ppx = w2x(gs.player.x), ppy = w2y(gs.player.y);
  g.fillStyle(0x88BBFF, 1); g.fillCircle(ppx, ppy, 5);
  g.lineStyle(2.5, 0xFFFFFF, 0.9); g.lineBetween(ppx, ppy, ppx + Math.sin(gs.player.heading*RAD)*14, ppy - Math.cos(gs.player.heading*RAD)*14);
}
