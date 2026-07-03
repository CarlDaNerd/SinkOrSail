// ── world/Visibility.js ──
// Land blocks sight. Used by all navy detection and crime witnessing (§8).
// Performance: runs per navy ship per frame — fine at this roster size;
// throttle (every few frames) if the roster scales up.
const Visibility = {
  // does solid land block the straight line a→b? sampled ~every 40px, beach
  // radius (0 padding) so only land — not the shallow ring — blocks the view.
  losBlocked(scene, ax, ay, bx, by){
    const d = Math.hypot(bx - ax, by - ay), steps = Math.max(2, Math.ceil(d/40));
    for (let i = 1; i < steps; i++){ const t = i/steps; if (Collision.checkIsland(scene, ax + (bx - ax)*t, ay + (by - ay)*t, 0).hit) return true; }
    return false;
  },

  // can observer (ox,oy) see target (tx,ty): within range AND not blocked
  canSee(scene, ox, oy, tx, ty, range){
    if (Math.hypot(tx - ox, ty - oy) >= range) return false;
    return !this.losBlocked(scene, ox, oy, tx, ty);
  },
};
