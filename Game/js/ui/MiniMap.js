// ── ui/MiniMap.js ──
// Top-right CIRCULAR minimap — a radar of the player's "sight": a MINIMAP_RANGE-
// radius circle around the ship, the same area the big map reveals as fog. Shows
// mainland footprints, island dots, ports, and ALL ships within range (not just
// on-screen ones), plus YOU as a heading arrow. Drawn into a circle-masked
// graphics (HUD owns the mask) so nothing spills past the rim; the tan ring is
// drawn separately, unmasked, by the HUD.
function drawMiniMap(g, gs, pl){
  g.clear();
  const mr = miniMapH()/2, full = mr + compassRingW() + compassLabelPad();   // map + ring + cardinal-letter pad (halved on mobile)
  const cxp = GAME_W - 12 - full, cyp = 12 + full;      // top-right corner, 12px margin
  g.fillStyle(0x0E1820, 0.92); g.fillCircle(cxp, cyp, mr);
  const R = MINIMAP_RANGE, scale = mr/R;                // MINIMAP_RANGE world px maps to the minimap radius
  const w2x = wx => cxp + (wx - pl.x)*scale, w2y = wy => cyp + (wy - pl.y)*scale;
  // circular range, radius-aware: keep a feature whose CIRCLE reaches within range,
  // so edge islands draw cleanly (clipped by the round mask) instead of popping in whole
  const within = (wx, wy, r) => { const dx = wx - pl.x, dy = wy - pl.y, rr = R + (r || 0); return dx*dx + dy*dy <= rr*rr; };   // M1: squared compare

  // land: draw every lobe so islands show their real footprint (big land a touch darker)
  for (const is of gs.islands){
    g.fillStyle((is.mainland || is.big) ? 0x3D6E25 : 0x4C8A30, 0.95);
    for (const e of is.ells) if (within(e.cx, e.cy, e.rx)) g.fillCircle(w2x(e.cx), w2y(e.cy), Math.max(1, e.rx*scale));
  }
  for (const p of (gs.nearbyPorts || gs.navyPorts)) if (within(p.x, p.y)){   // OPT-B2: NEARBY_PORTS_RADIUS ≫ MINIMAP_RANGE
    g.fillStyle((PORT_TYPES[p.type] && PORT_TYPES[p.type].color) || 0x8AC8E0, 1); g.fillCircle(w2x(p.x), w2y(p.y), 2.8);
    if (p.owner === 'player'){ g.lineStyle(1.2, 0xF0C840, 0.95); g.strokeCircle(w2x(p.x), w2y(p.y), 4.6); }   // PF1: yours = gold ring
  }
  // ships: ALL within the sight range (the whole minimap), faction-coloured
  for (const s of gs.ships){ if (!s.alive || !within(s.x, s.y)) continue; const c = { merchant:0xD0AA70, pirate:0xE0503A, navy:0x6AB0D8, privateer:0x6AC060 }[s.faction]; g.fillStyle(c, 1); g.fillCircle(w2x(s.x), w2y(s.y), 1.8); }
  // DOC-V: highlight marker for hunted bounty targets — red double ring over any
  // live target inside minimap range; a rim dot toward the nearest one beyond
  // range (same idiom as the cyclone warning dot below).
  if (typeof BountySystem !== 'undefined' && gs.bounties && gs.bounties.length){
    let nearest = null, nd = Infinity;
    for (const b of gs.bounties){
      if (b.killsDone >= b.killsNeeded) continue;
      for (const t of b.targets){
        if (!t || !t.alive) continue;
        const d = Math.hypot(t.x - pl.x, t.y - pl.y);
        if (d <= R){
          const ix = w2x(t.x), iy = w2y(t.y);
          g.lineStyle(1.5, 0xE0503A, 0.95); g.strokeCircle(ix, iy, 4.5);
          g.lineStyle(1, 0xE0503A, 0.45);   g.strokeCircle(ix, iy, 7);
        } else if (d < nd){ nd = d; nearest = t; }
      }
    }
    if (nearest && nd <= BOUNTY_ARROW_RANGE){
      const dx = nearest.x - pl.x, dy = nearest.y - pl.y, dd = Math.hypot(dx, dy) || 1;
      g.fillStyle(0xE0503A, 0.95); g.fillCircle(cxp + (dx/dd)*(mr - 4), cyp + (dy/dd)*(mr - 4), 2.2);
    }
  }
  // cyclone: a swirl icon at its eye when in sight, else a red warning dot pinned to
  // the rim in its direction (it spawns just beyond range and drifts in)
  if (typeof WeatherSystem !== 'undefined' && gs.weather && gs.weather.active === 'cyclone' && gs.weather.data){
    const d = gs.weather.data, dxp = d.cx - pl.x, dyp = d.cy - pl.y, dd = Math.hypot(dxp, dyp) || 1;
    if (dd <= R){
      const ix = w2x(d.cx), iy = w2y(d.cy);
      g.lineStyle(1.4, 0xC080E0, 0.95); g.strokeCircle(ix, iy, 5.5); g.strokeCircle(ix, iy, 2.8);
      g.fillStyle(0xC080E0, 1); g.fillCircle(ix, iy, 1.3);
    } else {
      g.fillStyle(0xE0503A, 0.95); g.fillCircle(cxp + (dxp / dd) * (mr - 4), cyp + (dyp / dd) * (mr - 4), 2.8);
    }
  }
  // YOU — a heading arrow (shared with the big map so the icon matches)
  drawPlayerArrow(g, cxp, cyp, pl.heading, 6.5, 0x88BBFF);
}

// shared player marker: a triangle pointing in the heading. Used by BOTH the minimap
// and the big map (WorldMap) so the player icon is identical on each.
function drawPlayerArrow(g, cx, cy, heading, sz, color){
  const hx = Math.sin(heading*RAD), hy = -Math.cos(heading*RAD), rx = -hy, ry = hx;
  g.fillStyle(color, 1);
  g.fillTriangle(cx + hx*sz, cy + hy*sz,
                 cx - hx*sz*0.55 + rx*sz*0.55, cy - hy*sz*0.55 + ry*sz*0.55,
                 cx - hx*sz*0.55 - rx*sz*0.55, cy - hy*sz*0.55 - ry*sz*0.55);
}
