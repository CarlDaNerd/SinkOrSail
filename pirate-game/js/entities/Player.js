// ── entities/Player.js ──
// The player ship. Hull 130 (the gentlest, most invisible survivability buff,
// handoff §12). fire is per-side {port, star}; AI ships use a single number.
const Player = {
  create(x, y){
    return {
      x, y, heading:180, vel:0, sailState:2,
      hull:130, maxHull:130, ammo:48, maxAmmo:48, gold:0,
      fire:{ port:0, star:0 }, wake:[], id:'player', faction:'player',
      lastHitAt:-99, lastFiredAt:-99, sailBroken:false,
    };
  },
};
