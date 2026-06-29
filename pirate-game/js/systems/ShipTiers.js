// ── systems/ShipTiers.js ──
// 6-tier ship backbone (Dinghy → Leviathan). Namespaced-global singleton,
// scene-first methods, defensive (no dependency on other systems).
//
// Each tier defines:
//   name           display name
//   hull           max hull at that tier               // PLACEHOLDER — live-tune
//   scale          visual size multiplier in drawShip   // PLACEHOLDER
//   sails          number of masts/sails to draw        // PLACEHOLDER
//   broadsideBalls balls per port/star broadside        // PLACEHOLDER
//   bow / stern    whether that chaser gun exists        // LOCKED distribution
//   minCrew        crew needed to operate fully (below = understaffed penalty)
//   maxCrew        crew capacity aboard (hire cap)
//   crewBonus      speed/reload fraction added PER crew (capped by CREW_BONUS_CAP)
//   storage        hold capacity (cargo) — applied to ship.hold.capacity, so a
//                  bigger hull hauls more cargo
//   buy            bank cost to buy this tier at a port (UpgradeSystem); Dinghy 0
//
// Progression rule: the player STARTS at Sloop (tier 2) and the tier only ever
// changes through ShipTiers.setTier(). Buy/capture systems are the future callers
// of that single entry point — this module is just the data + the hook. (A dev
// key 'T' in GameScene cycles tiers for now so the system is testable.)
const SHIP_TIERS = {
  1: { name:'Dinghy',    hull:60,  scale:1.00, sails:1, broadsideBalls:1, bow:false, stern:false, minCrew:2,   maxCrew:6,   crewBonus:0.015, storage:12,  buy:0      },
  2: { name:'Sloop',     hull:100, scale:1.15, sails:1, broadsideBalls:2, bow:false, stern:false, minCrew:5,   maxCrew:14,  crewBonus:0.012, storage:20,  buy:2800   },
  3: { name:'Brig',      hull:160, scale:1.30, sails:2, broadsideBalls:3, bow:true,  stern:false, minCrew:12,  maxCrew:30,  crewBonus:0.009, storage:40,  buy:9000   },
  4: { name:'Frigate',   hull:230, scale:1.50, sails:2, broadsideBalls:3, bow:true,  stern:false, minCrew:28,  maxCrew:60,  crewBonus:0.007, storage:80,  buy:28000  },
  5: { name:'Galleon',   hull:320, scale:1.75, sails:3, broadsideBalls:4, bow:true,  stern:true,  minCrew:60,  maxCrew:120, crewBonus:0.005, storage:140, buy:90000  },
  6: { name:'Leviathan', hull:450, scale:2.10, sails:3, broadsideBalls:5, bow:true,  stern:true,  minCrew:200, maxCrew:340, crewBonus:0.004, storage:260, buy:300000 },
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

  // ── crew-related derived stats (read by CrewSystem / boarding-capture) ──
  minCrew(ship){ return this.get(ship && ship.tier ? ship.tier : STARTER_TIER).minCrew; },
  maxCrew(ship){ return this.get(ship && ship.tier ? ship.tier : STARTER_TIER).maxCrew; },
  crewBonusRate(ship){ return this.get(ship && ship.tier ? ship.tier : STARTER_TIER).crewBonus; },
  storage(ship){ return this.get(ship && ship.tier ? ship.tier : STARTER_TIER).storage; },
  // below the crew needed to operate fully → understaffed (speed/cannon penalty)
  understaffed(ship){ return (ship.crew || 0) < this.minCrew(ship); },
  // broadside balls actually usable right now: full when crewed, scaled down when short
  cannonsUsable(ship){
    const full = this.get(ship && ship.tier ? ship.tier : STARTER_TIER).broadsideBalls;
    const need = this.minCrew(ship), have = ship.crew || 0;
    if (have >= need) return full;
    return Math.max(1, Math.floor(full * (have / need)));
  },

  // Stamp tier-derived stats onto a ship. healFull=true tops hull to the new max
  // (used on tier change / spawn); otherwise hull is clamped to the new max.
  // crewFrac (optional): set crew to that fraction of the tier's max (fresh ships);
  // otherwise existing crew is kept (defaulting to minCrew) and just clamped.
  apply(scene, ship, healFull, crewFrac){
    const t = this.get(ship.tier);
    ship.maxHull = t.hull;
    ship.hull = healFull ? t.hull : Math.min(ship.hull, t.hull);
    ship.broadsideBalls = t.broadsideBalls;
    ship.scale = t.scale;
    ship.sails = t.sails;
    // crew: pick a starting value if asked, default to minCrew if unset, then clamp
    if (crewFrac != null) ship.crew = Math.round(t.maxCrew * crewFrac);
    if (ship.crew == null) ship.crew = t.minCrew;
    ship.crew = Math.max(0, Math.min(t.maxCrew, ship.crew));
    // hold capacity scales with ship size; create the hold if it doesn't exist yet
    if (typeof Cargo !== 'undefined'){
      if (!ship.hold) ship.hold = Cargo.make(t.storage);
      else ship.hold.capacity = t.storage;
    }
    return ship;
  },

  // SINGLE entry point for changing tier. Future buy/capture modules call this.
  setTier(scene, ship, n){
    ship.tier = this.clamp(n);
    this.apply(scene, ship, true);
    if (scene && scene.events) scene.events.emit('ship-tier-changed', { ship, tier: ship.tier });
    return ship.tier;
  },
};
