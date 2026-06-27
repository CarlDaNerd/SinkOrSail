// ── entities/Enemy.js ──
// Faction-driven NPC ships (merchant / pirate / navy / privateer) + the fleet
// spawner. Roster is deliberately scarce so each encounter reads as a legible
// event rather than ambient noise (handoff §9). Behavior lives in systems/AI.js.
const Enemy = {
  // weighted tier roll, respecting an optional per-faction cap (higher tiers rarer)
  rollTier(faction, r){
    const cap = (ENEMY_TIER_CAP && ENEMY_TIER_CAP[faction] != null) ? ENEMY_TIER_CAP[faction] : (SHIP_TIERS.length - 1);
    let total = 0; for (let i = 0; i <= cap; i++) total += ENEMY_TIER_WEIGHTS[i];
    let roll = r() * total;
    for (let i = 0; i <= cap; i++){ roll -= ENEMY_TIER_WEIGHTS[i]; if (roll <= 0) return SHIP_TIERS[i].key; }
    return SHIP_TIERS[0].key;
  },

  create(faction, hull, x, y, heading, home, r, i){
    const ship = {
      id:faction + '_' + i, faction, x, y, heading, vel:0, sailState:2,
      hull, maxHull:hull, fire:0, wake:[],
      state:'cruise', waypoint:{ x:x + (r() - 0.5)*2400, y:y + (r() - 0.5)*2400 },
      home, hostileToPlayer:false, hitsByPlayer:0, alive:true,
    };
    // tier-derive hull + cannon count (enemies carry NO crew — capturing one
    // means its crew is dead and you take an empty vessel).
    if (typeof ShipTier !== 'undefined'){
      const tier = (r ? this.rollTier(faction, r) : 'sloop');
      ShipTier.apply(ship, tier, { full:true });
      ship.crew = 0;                            // enemies are crewless for capture purposes
    }
    return ship;
  },

  // (re)build scene.ships using the enemy PRNG; avoid spawning on islands or on
  // top of the player start.
  spawnFleet(scene){
    scene.ships.length = 0;
    const r = scene.eprng;
    const spawn = (faction, hull, n) => {
      const homed = (faction === 'navy' || faction === 'privateer');
      for (let i = 0; i < n; i++){
        // Navy & privateers home to — and START near — a port, distributed across
        // the available ports so each port is guarded and they begin inside their
        // leash. Merchants & pirates spawn anywhere in open sea.
        const home = homed ? scene.navyPorts[i % scene.navyPorts.length] : null;
        let x, y, att = 0;
        do {
          if (home){ const a = r()*Math.PI*2, rr = 150 + r()*(P.navyLeash*0.7); x = home.x + Math.cos(a)*rr; y = home.y + Math.sin(a)*rr; }
          else { x = (r() - 0.5)*2*SPAWN_RANGE; y = (r() - 0.5)*2*SPAWN_RANGE; }   // open sea near origin (Phase 1)
          att++;
        } while (att < 40 && (Collision.checkIsland(scene, x, y, 40).hit || Math.hypot(x, y) < 450));
        scene.ships.push(Enemy.create(faction, hull, x, y, r()*360, home, r, i));
        if (faction === 'merchant'){
          const ship = scene.ships[scene.ships.length - 1];
          const commodity = CommoditySystem.nearestIslandCommodity(scene, x, y);
          const qty = MERCHANT_CARGO_MIN + Math.floor(r()*(MERCHANT_CARGO_MAX - MERCHANT_CARGO_MIN + 1));
          ship.cargo = { commodity, qty };
          ship.hold = Cargo.make(HOLD_CAPACITY_MERCHANT);
          Cargo.add(ship.hold, commodity, qty);
        }
      }
    };
    spawn('merchant', 50, 5);
    spawn('pirate',   75, 3);
    spawn('navy',     90, 5);
    spawn('privateer',70, 2);
  },
};
