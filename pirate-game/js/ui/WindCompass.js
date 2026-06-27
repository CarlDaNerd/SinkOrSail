// ── ui/WindCompass.js ──
// Compass (handoff §13): wind no-go sector (red), wind-from arrow (blue),
// heading needle (yellow). Drawn into the HUD graphics object `g`.
function drawWindCompass(g, pl, cx, cy, cr){
  g.fillStyle(0x0E1820, 0.9); g.fillCircle(cx, cy, cr + 6);
  g.lineStyle(1, 0x2a3a4a, 1); g.strokeCircle(cx, cy, cr);
  // no-go wedge centered on the wind-from bearing
  g.fillStyle(0xE0503A, 0.18); g.beginPath(); g.moveTo(cx, cy);
  for (let a = -P.noGo; a <= P.noGo; a += 4){ const ang = (P.windFrom + a - 90)*RAD; g.lineTo(cx + Math.cos(ang)*cr, cy + Math.sin(ang)*cr); }
  g.closePath(); g.fillPath();
  const wA = (P.windFrom - 90)*RAD; g.lineStyle(3, 0x8AAAC8, 1); g.lineBetween(cx, cy, cx + Math.cos(wA)*cr*0.85, cy + Math.sin(wA)*cr*0.85);
  const hA = (pl.heading - 90)*RAD; g.lineStyle(2, 0xF0C840, 1); g.lineBetween(cx, cy, cx + Math.cos(hA)*cr*0.7,  cy + Math.sin(hA)*cr*0.7);
}
