// ── utils/MathUtils.js ──
// PURE stateless math only (handoff §3). No world data. windOff takes the wind
// direction as an argument so it stays pure.
function windOff(h, w){ let d = Math.abs(h - w) % 360; return d > 180 ? 360 - d : d; }      // 0–180
function angleTo(f, t){ return (Math.atan2(t.x - f.x, -(t.y - f.y)) * 180 / Math.PI + 360) % 360; }
function angleDiff(a, b){ let d = (b - a + 360) % 360; return d > 180 ? d - 360 : d; }       // -180..180
function dist(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); }
