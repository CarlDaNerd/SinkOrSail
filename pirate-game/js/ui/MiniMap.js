// ── ui/MiniMap.js ──
// Top-right corner map (handoff §13). Player-centered radar showing ±MINIMAP_RANGE
// of world around you: active (loaded) islands, ports, faction-colored ship dots,
// and you in the middle. (In an infinite streamed world there's no "whole map" to
// show — full fog-of-war + the draggable M-map come in a later phase.)
function drawMiniMap(g, gs, pl){
  const mw = 110, mh = 88, mx = GAME_W - mw - 12, my = 12;
  g.fillStyle(0x0E1820, 0.85); g.fillRect(mx, my, mw, mh);
  g.lineStyle(1, 0x2a3a4a, 1);  g.strokeRect(mx, my, mw, mh);
  const cxp = mx + mw/2, cyp = my + mh/2;                     // player sits at center
  const sx = mw/(2*MINIMAP_RANGE), sy = mh/(2*MINIMAP_RANGE);
  const inWin = (wx, wy) => Math.abs(wx - pl.x) <= MINIMAP_RANGE && Math.abs(wy - pl.y) <= MINIMAP_RANGE;
  g.fillStyle(0x3D6E25, 0.9);
  for (const is of gs.islands){
    if (is.mainland){
      // draw the mainland's actual lobe footprint so its size + shape (elongated, etc.) reads on the map
      for (const e of is.ells) if (inWin(e.cx, e.cy)) g.fillCircle(cxp + (e.cx - pl.x)*sx, cyp + (e.cy - pl.y)*sy, Math.max(1.2, e.rx*sx));
    } else if (inWin(is.cx, is.cy)){
      g.fillCircle(cxp + (is.cx - pl.x)*sx, cyp + (is.cy - pl.y)*sy, 1.3);
    }
  }
  for (const p of gs.navyPorts) if (inWin(p.x, p.y)){ g.fillStyle(0x8AC8E0, 1); g.fillCircle(cxp + (p.x - pl.x)*sx, cyp + (p.y - pl.y)*sy, 2); }
  for (const s of gs.ships){ if (!s.alive || !inWin(s.x, s.y)) continue; const c = { merchant:0xD0AA70, pirate:0xE0503A, navy:0x6AB0D8, privateer:0x6AC060 }[s.faction]; g.fillStyle(c, 1); g.fillCircle(cxp + (s.x - pl.x)*sx, cyp + (s.y - pl.y)*sy, 1.6); }
  g.fillStyle(0x88BBFF, 1); g.fillCircle(cxp, cyp, 2.4);
}
