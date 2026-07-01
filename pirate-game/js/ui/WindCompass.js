// ── ui/WindCompass.js ──
// Compass ring around the circular minimap (north-up). Ring band + rims, ticks
// every 22.5° (cardinals longest), a RED semi-transparent band covering the full
// no-go zone (windFrom ± P.noGo) with a slim solid border + an inward triangle at
// the wind-from bearing, and a YELLOW heading ARROW (triangle only, no band)
// pointing outward — so the moment its tip crosses the red edge you're in irons.
// Drawn unmasked into the HUD graphics `g`. Cardinal LETTERS are static HUD text.
function drawCompassRing(g, gs, pl, cx, cy, mr, rw){
  const inner = mr, outer = mr + rw;
  const dir = (deg, r) => [cx + Math.sin(deg*RAD)*r, cy - Math.cos(deg*RAD)*r];   // 0=N up, 90=E right
  // ring band + rims
  g.lineStyle(rw, 0x101c28, 1);    g.strokeCircle(cx, cy, mr + rw/2);
  g.lineStyle(1.5, 0xD2B48C, 0.9); g.strokeCircle(cx, cy, inner);
  g.lineStyle(1.5, 0xD2B48C, 0.9); g.strokeCircle(cx, cy, outer);
  // ticks every 22.5° from the outer rim inward (cardinals full, intercardinals
  // medium, the rest short) — they stay inside the ring, clear of the letters
  for (let a = 0; a < 360; a += 22.5){
    const card = (a % 90 === 0), inter = (a % 45 === 0);
    const len = card ? rw : (inter ? rw*0.66 : rw*0.4);
    const o = dir(a, outer), i = dir(a, outer - len);
    g.lineStyle(card ? 1.5 : 1, card ? 0xD2B48C : 0x8a9aa8, card ? 0.9 : 0.6);
    g.lineBetween(i[0], i[1], o[0], o[1]);
  }
  const localWind = (typeof WindSystem !== 'undefined') ? WindSystem.dirAt(gs, pl.x, pl.y) : P.windFrom;
  _compassNoGo(g, cx, cy, inner, outer, localWind, P.noGo);           // red no-go band + inward triangle (player-LOCAL wind → swirls near a cyclone)
  _compassArrow(g, cx, cy, inner, outer, pl.heading, 0xF0C840);       // yellow heading arrow (outward)
}

// red semi-transparent section across windFrom ± noGo, slim solid border, inward triangle
function _compassNoGo(g, cx, cy, inner, outer, deg, noGo){
  const dir = (d, r) => [cx + Math.sin(d*RAD)*r, cy - Math.cos(d*RAD)*r];
  const a0 = deg - noGo, a1 = deg + noGo, step = Math.max(2, noGo/8);
  const trace = () => {
    let p = dir(a0, inner); g.moveTo(p[0], p[1]);
    for (let a = a0; a <= a1 + 1e-3; a += step){ p = dir(Math.min(a, a1), inner); g.lineTo(p[0], p[1]); }
    for (let a = a1; a >= a0 - 1e-3; a -= step){ p = dir(Math.max(a, a0), outer); g.lineTo(p[0], p[1]); }
  };
  g.fillStyle(0xE0503A, 0.28); g.beginPath(); trace(); g.closePath(); g.fillPath();
  g.lineStyle(1.5, 0xE0503A, 1); g.beginPath(); trace(); g.closePath(); g.strokePath();
  const dw = 7, tip = dir(deg, inner + 1), b1 = dir(deg - dw, outer - 1), b2 = dir(deg + dw, outer - 1);
  g.fillStyle(0xE0503A, 1); g.fillTriangle(tip[0], tip[1], b1[0], b1[1], b2[0], b2[1]);   // points toward centre
}

// a solid arrow (triangle only) on the ring pointing OUTWARD at deg
function _compassArrow(g, cx, cy, inner, outer, deg, color){
  const dir = (d, r) => [cx + Math.sin(d*RAD)*r, cy - Math.cos(d*RAD)*r];
  const dw = 8, tip = dir(deg, outer - 1), b1 = dir(deg - dw, inner + 1), b2 = dir(deg + dw, inner + 1);
  g.fillStyle(color, 1); g.fillTriangle(tip[0], tip[1], b1[0], b1[1], b2[0], b2[1]);
}
