// ── systems/ShipTier.js ── (MS — the 6-tier ship system)
// The backbone the Big Four hang off. A ship's tier sets its hull, cannon count,
// storage (hold capacity), and crew caps (min to operate / max aboard). Crew,
// cannon, and capture systems all read tier from here. Acquire ships by buying
// (at port) or capturing (CaptureSystem). Values live in SHIP_TIERS (constants);
// all placeholders pending feel-tuning.
//
// A ship carries: ship.tier (key string). Everything else is derived so the
// table is the single source of truth.
const ShipTier = {
  specOf(ship){ return SHIP_TIERS[SHIP_TIER_INDEX[ship.tier] || 0]; },
  indexOf(ship){ return SHIP_TIER_INDEX[ship.tier] || 0; },
  byKey(key){ return SHIP_TIERS[SHIP_TIER_INDEX[key] || 0]; },
  next(ship){ const i = this.indexOf(ship); return i < SHIP_TIERS.length - 1 ? SHIP_TIERS[i + 1] : null; },

  // derived caps
  maxHull(ship){ return this.specOf(ship).hull; },
  minCrew(ship){ return this.specOf(ship).minCrew; },
  maxCrew(ship){ return this.specOf(ship).maxCrew; },
  cannons(ship){ return this.specOf(ship).cannons; },
  storage(ship){ return this.specOf(ship).storage; },
  crewBonusRate(ship){ return this.specOf(ship).crewBonus; },

  // is the ship below the crew needed to operate fully? (understaffed penalty)
  understaffed(ship){ return (ship.crew || 0) < this.minCrew(ship); },
  // fraction of cannons usable right now: full if crewed, scaled down if short
  cannonsUsable(ship){
    const need = this.minCrew(ship), have = ship.crew || 0;
    if (have >= need) return this.cannons(ship);
    return Math.max(1, Math.floor(this.cannons(ship) * (have / need)));
  },

  // stamp a tier onto a ship: set caps, clamp current values into them. `full`
  // heals to max hull + sets crew to a fraction of max (used on spawn / buy).
  apply(ship, tierKey, opts){
    opts = opts || {};
    ship.tier = tierKey;
    const spec = this.byKey(tierKey);
    ship.maxHull = spec.hull;
    if (opts.full || ship.hull == null) ship.hull = spec.hull;
    ship.maxHull = spec.hull; if (ship.hull > spec.hull) ship.hull = spec.hull;
    // storage = hold capacity
    if (!ship.hold) ship.hold = Cargo.make(spec.storage); else ship.hold.capacity = spec.storage;
    // crew: clamp into [0, maxCrew]; on a fresh/full ship start at a fraction
    if (opts.crewFrac != null) ship.crew = Math.round(spec.maxCrew * opts.crewFrac);
    if (ship.crew == null) ship.crew = spec.minCrew;
    ship.crew = Math.max(0, Math.min(spec.maxCrew, ship.crew));
    return ship;
  },

  // registry hook: stamp the player's starting tier (doc: small ship, half crew)
  init(scene){
    const pl = scene.player;
    if (!pl.tier){ this.apply(pl, PLAYER_START_TIER, { full:true, crewFrac:PLAYER_START_CREW_FRAC }); }
  },
};
