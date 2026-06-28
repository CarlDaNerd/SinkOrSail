// ── entities/Player.js ──
// The player ship. Tier-driven: starts at Sloop (tier 2); hull / size / sail count
// / broadside are stamped from ShipTiers. fire is per-side {port, star, bow, stern}
// (bow/stern are the chaser guns higher tiers mount); AI ships use a single number.
const Player = {
  create(x, y){
    const startTier = (typeof STARTER_TIER !== 'undefined') ? STARTER_TIER : 2;
    const p = {
      x, y, heading:180, vel:0, sailState:2, tier:startTier,
      hull:130, maxHull:130, ammo:48, maxAmmo:48, gold:0,
      fire:{ port:0, star:0, bow:0, stern:0 }, wake:[], id:'player', faction:'player',
      lastHitAt:-99, lastFiredAt:-99, sailBroken:false,
    };
    if (typeof ShipTiers !== 'undefined') ShipTiers.apply(null, p, true);   // hull/scale/sails/broadside from tier
    return p;
  },
};
