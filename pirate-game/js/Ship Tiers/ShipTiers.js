// ── systems/ShipTiers.js ──
// 6-tier ship backbone (Dinghy → Leviathan). Namespaced-global singleton,
// scene-first methods, defensive (no dependency on Carl-owned systems).
//
// Each tier defines:
//   name           display name
//   hull           max hull at that tier              // PLACEHOLDER — live-tune
//   scale          visual size multiplier in drawShip  // PLACEHOLDER
//   sails          number of masts/sails to draw       // PLACEHOLDER
//   broadsideBalls balls per port/star broadside       // PLACEHOLDER
//   bow / stern    whether that chaser gun exists       // LOCKED distribution
//
// Progression rule (per Noah): the player STARTS at Sloop (tier 2) and the tier
// only ever changes through ShipTiers.setTier(). Capture/buy systems (not yet in
// Carl's tree) are the future callers of that single entry point — this module
// does NOT implement capture or purchase, only the data + the hook.

const SHIP_TIERS = {
  1: { name:'Dinghy',    hull:60,  scale:1.00, sails:1, broadsideBalls:1, bow:false, stern:false },
  2: { name:'Sloop',     hull:100, scale:1.15, sails:1, broadsideBalls:2, bow:false, stern:false },
  3: { name:'Brig',      hull:160, scale:1.30, sails:2, broadsideBalls:3, bow:true,  stern:false },
  4: { name:'Frigate',   hull:230, scale:1.50, sails:2, broadsideBalls:3, bow:true,  stern:false },
  5: { name:'Galleon',   hull:320, scale:1.75, sails:3, broadsideBalls:4, bow:true,  stern:true  },
  6: { name:'Leviathan', hull:450, scale:2.10, sails:3, broadsideBalls:5, bow:true,  stern:true  },
};

const TIER_MIN = 1, TIER_MAX = 6;
const STARTER_TIER = 2;          // Sloop — player's locked start

// ── chaser cooldowns — INTENTIONALLY DIFFERENT so the two HUD readouts and the
// firing cadence are visually distinguishable from each other and from the
// broadside reload (P.cooldown). // PLACEHOLDER — live-tune.
const BOW_COOLDOWN   = 1.2;
const STERN_COOLDOWN = 2.6;

const ShipTiers = {
  get(tier){ return SHIP_TIERS[this.clamp(tier)]; },
  clamp(tier){ return Math.max(TIER_MIN, Math.min(TIER_MAX, tier | 0)); },

  has(ship, which){                              // which = 'bow' | 'stern'
    const t = this.get(ship && ship.tier ? ship.tier : STARTER_TIER);
    return which === 'bow' ? !!t.bow : which === 'stern' ? !!t.stern : false;
  },

  cooldown(which){ return which === 'bow' ? BOW_COOLDOWN : STERN_COOLDOWN; },

  // Stamp tier-derived stats onto a ship. healFull=true tops hull to the new max
  // (used on tier change / spawn); otherwise hull is clamped to the new max.
  apply(scene, ship, healFull){
    const t = this.get(ship.tier);
    ship.maxHull = t.hull;
    ship.hull = healFull ? t.hull : Math.min(ship.hull, t.hull);
    ship.broadsideBalls = t.broadsideBalls;
    ship.scale = t.scale;
    ship.sails = t.sails;
    return ship;
  },

  // SINGLE entry point for changing tier. Future capture/buy modules call this.
  setTier(scene, ship, n){
    ship.tier = this.clamp(n);
    this.apply(scene, ship, true);
    if (scene && scene.events) scene.events.emit('ship-tier-changed', { ship, tier: ship.tier });
    return ship.tier;
  },
};
