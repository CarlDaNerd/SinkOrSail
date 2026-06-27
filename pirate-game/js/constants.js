// ── constants.js ──────────────────────────────────────────────────────────
// ALL tuned constants, grouped by section (handoff §11).
//   DEFAULTS = canonical feel-tested values. "RESET" restores P from these.
//   P        = live, mutable runtime config; the dev tuning panel mutates this
//              (see debug/DebugOverlay.js). Game code reads P.* everywhere.
//   DEBUG    = dev-only flags (infinite ammo, range-ring visualizer).
// NOTE: sailing accel/decel are dt-scaled — keep the delta-time formulation;
// do NOT port them into a per-frame model.

const DEFAULTS = {
  // ── SAILING ── (dt-scaled)
  maxSpeed:2, accel:0.006, decel:0.007, windFrom:315, noGo:30, dwLoss:0.20,
  // ── TURNING (parameterized bell curve, deg/sec) ──
  turnPeak:94, turnPeakAt:58, turnMin:12, turnFull:50,
  // ── BROADSIDE ──
  balls:3, spread:10, cannonSpeed:5.5, cooldown:2, damage:10, cannonLife:1.0,
  // ── NAVY ──
  navySight:540, navyThresh:-40, navyAttack:300, navyLeash:850, navyRecover:2, crimePenalty:25,
  // ── MERCHANTS ──
  merchFlee:310, merchFight:20,
  // ── PRIVATEERS (allies) ──
  privHits:3, privAssist:460, privLawful:-15,
  // ── SURVIVAL ──
  regenCap:30, regenRate:1.5, regenDelay:5,
  // ── FLAGS ──
  flagDelay:1.2, flagCombatLock:5,
};
const P = { ...DEFAULTS };
const DEBUG = { infAmmo:false, ring:{ active:false, radius:0, age:0, label:'' } };

// ── fixed structural constants ──
const SAIL_MULTIPLIERS = [0, 0.55, 1.0];        // 0 none / 1 main / 2 full
const RAD = Math.PI / 180;
const WORLD_SEED = 42;            // fixed → same world every launch (deterministic)

// ── WORLD STREAMING (chunked, effectively unlimited) ──
const CHUNK_SIZE = 1500;          // px per chunk (square)
const LOAD_RADIUS = 2;            // chunks loaded each side of the player → (2r+1)² window
const UNLOAD_RADIUS = 3;          // unload only beyond this (hysteresis vs. boundary thrash)
const WORLD_CAP = 50000;          // soft cap: ships clamp to ±this (keeps coords/floats sane far out)
const ISLAND_PAD = 290;           // keep island bodies inside their chunk (clean per-chunk ownership)
const START_CLEAR_RADIUS = 700;   // open water kept around the world origin (player start)
const SPAWN_RANGE = 3000;         // Phase-1 fleet spawns within this of origin

// ── MAPS ──
const MINIMAP_W = 200, MINIMAP_H = 150;   // corner minimap size (px). Shows 2× the screen's view.
const MAP_SCALE_INIT = 0.045;             // big map (M): screen-px per world-px
const MAP_SCALE_MIN = 0.02, MAP_SCALE_MAX = 0.22;

// ── BIOMES / FEATURES ──
const REGION_SIZE = 4000;         // coarse biome cell (px); a region hosts at most one mainland
const BIOME_FREQ = 0.45;          // value-noise frequency for "landiness" zoning (lower = bigger zones)
const ARCH_THRESHOLD = 0.55;      // landiness ≥ this → archipelago (islands, no mainland)
const MAINLAND_THRESHOLD = 0.55;  // landiness ≥ this AND a local peak → mainland (so mainlands rarely adjacent)
const REGION_MARGIN = 1000;       // place feature anchors this far inside their region (keeps mainlands off region edges)
const MAX_FEATURE_REACH = 5000;   // a chunk gathers features from regions within this (so big mainlands/spread groupings aren't orphaned)
// mainland dimensions: length (along the spine) x width (across) — independent,
// so shapes range from blobby to long "hotdog"/Japan-style landmasses
const MAINLAND_LEN_MIN = 2600, MAINLAND_LEN_MAX = 4400;
const MAINLAND_WIDTH_MIN = 800, MAINLAND_WIDTH_MAX = 2200;
const STARTER_LEN_MIN = 1900, STARTER_LEN_MAX = 2900;          // friendlier starter hubs near origin
const STARTER_WIDTH_MIN = 1100, STARTER_WIDTH_MAX = 1900;
const STARTER_ANCHOR_X = 2000, STARTER_ANCHOR_Y = 1700;  // starter mainland near origin (inside region (0,0))

// ── REEFS ──
const REEF_DAMAGE = 8;            // hull damage per reef-contact tick
const REEF_DAMAGE_INTERVAL = 1.0; // seconds between reef damage ticks

// ── LAND RENDERING (fixed-width layer bands, NOT scaled with island size) ──
const BAND_MIN = 20, BAND_MAX = 60;   // beach + jungle band widths (px), chosen per landmass
const SHALLOW_BAND = 38;              // shallow-water ring outset around land (px, fixed)
// Single OPAQUE shallow colour: drawn opaque (not alpha) so overlapping shallow
// areas never stack into different blues — it's one uniform blue everywhere.
const SHALLOW_COLOR = 0x1E5468;

// ── ARCHIPELAGO GROUPINGS (large, sparse, spread across several chunks) ──
const CLUSTER_MIN = 18, CLUSTER_MAX = 38;       // islands per grouping
const CLUSTER_RADIUS_MIN = 2400, CLUSTER_RADIUS_MAX = 4400;  // grouping spread radius (≈ 3–6 chunks across)
const ISLAND_GAP = 380;                          // min centre-to-centre spacing between scattered islands
// full-window canvas; the dev panel is a slide-in overlay drawer (not a layout
// sibling), so it no longer steals canvas width — toggle it from the edge tab.
const GAME_W = window.innerWidth, GAME_H = window.innerHeight;
const SHIP_RADIUS = 22, WAKE_LENGTH = 60, WAKE_MIN_SPEED = 0.2;
const HULL_LEN = 20, HULL_BEAM = 10;            // semi-length / half-beam of hull body (bowsprit excluded)

// ── PORTS / DOCKING ──
const DOCK_RADIUS = 320;          // sail within this of a port (center) to dock
const REPAIR_COST_PER_HP = 2;     // gold per hull point repaired
const AMMO_COST_PER_UNIT = 1;     // gold per ammo unit restocked

// ── COMMODITIES (MC) ──────────────────────────────────────────────────────
const COMMODITIES = ['lumber', 'cloth', 'iron', 'rum', 'sugar', 'tobacco'];
const COMMODITY_INFO = {
  lumber:  { glyph: 'L', color: 0x9C6B3C },
  cloth:   { glyph: 'C', color: 0xC9C0A0 },
  iron:    { glyph: 'I', color: 0x8A8F98 },
  rum:     { glyph: 'R', color: 0xB5612A },
  sugar:   { glyph: 'S', color: 0xEDE3C8 },
  tobacco: { glyph: 'T', color: 0x6E5A34 },
};
const MERCHANT_CARGO_MIN = 4, MERCHANT_CARGO_MAX = 12;
const HOLD_CAPACITY_DEFAULT = 20;
const HOLD_CAPACITY_MERCHANT = 16;

// ── CREW (ship stat: more crew = faster + faster reload) ──
const CREW_DEFAULT = 8, CREW_MAX = 40;
const CREW_SPEED_PER = 0.004;     // +0.4% max speed per crew above default (capped)
const CREW_RELOAD_PER = 0.004;    // -0.4% reload time per crew above default (capped)
const CREW_BONUS_CAP = 0.30;      // max +/-30% from crew
const CREW_HIRE_COST = 6;         // gold per crew at a port (cheaper at Trading Hub)

// ── CAMERA ZOOM (M7) ──
const ZOOM_MANUAL_DEFAULT = 1.0;
const ZOOM_MANUAL_MIN = 1.0, ZOOM_MANUAL_MAX = 2.2;
const ZOOM_BATTLE_LEVEL = 1.6;
const ZOOM_WHEEL_STEP = 0.12;
const ZOOM_LERP = 0.10;

// ── WEATHER (M11) ── ship-only status effects; never touches wind
const WEATHER_INTERVAL_MIN_S = 120, WEATHER_INTERVAL_MAX_S = 300;
const WEATHER_TYPES = ['rain', 'snow', 'tsunami', 'cyclone', 'storm'];
const RAIN_SPEED_MULT = 0.75;
const RAIN_DURATION_PX = 10000, RAIN_DURATION_S = 45;
const SNOW_DURATION_S = 40, SNOW_ICEBERG_DAMAGE = 12, SNOW_ICEBERG_INTERVAL = 1.0, SNOW_ICEBERG_COUNT = 10;
const TSUNAMI_ISLAND_PROXIMITY_PX = 1000, TSUNAMI_PUSH_S = 3.0, TSUNAMI_PUSH_SPEED = 6;
const CYCLONE_DURATION_S = 18, CYCLONE_PULL = 0.8, CYCLONE_RADIUS = 700, CYCLONE_DAMAGE_PCT = 50;
const STORM_DURATION_S = 30, STORM_STRIKE_INTERVAL_S = 3.5, STORM_SAIL_HIT_CHANCE_PCT = 45, STORM_BROKEN_SAIL_MAX_STATE = 1;

// ── PORT TYPES & COMMODITY ECONOMY (M8) ── (price magnitudes are placeholders)
const PORT_TYPES = {
  TradingHub:      { terrain:'mainland', towerChance:1.00, navy:'always',  source:null,      slots:[2,5], crewDiscount:true,  merchantLootMult:2.0 },
  LumberYard:      { terrain:'small-mainland', towerChance:0.25, navy:'none', source:'lumber', slots:[1,2], repairDiscount:true },
  FrontierOutpost: { terrain:'far',      towerChance:0.50, navy:'none',    source:null,      slots:[1,2], buyBonus:true },
  SugarFarm:       { terrain:'small-mainland', towerChance:0.25, navy:'none', source:'sugar',  slots:[1,2] },
  Brewery:         { terrain:'small-mainland', towerChance:0.25, navy:'none', source:'rum',    slots:[1,2] },
  TobaccoFarm:     { terrain:'small-mainland', towerChance:0.25, navy:'none', source:'tobacco',slots:[1,2] },
  IronMine:        { terrain:'rare-small-mainland', towerChance:0.50, navy:'maybe', source:'iron', slots:[1,2] },
  ClothMill:       { terrain:'medium-mainland', towerChance:0.25, navy:'none', source:'cloth',  slots:[1,2] },
};
const BASE_PRICE = { lumber:10, cloth:18, iron:24, rum:14, sugar:12, tobacco:20 };
const SOURCE_PORT_DISCOUNT = 0.6;
const FRONTIER_BUY_BONUS = 1.5;
const SEEDED_DEMAND_BOUNDS = 0.25;
const SELL_SPREAD = 0.85;
const TOWER_RANGE = 360, TOWER_COOLDOWN_S = 2.2, TOWER_DAMAGE = 10, TOWER_BALL_SPEED = 5.0;

// ── BOARDING (M4) ──
const BOARD_HEALTH_THRESHOLD_PCT = 25;
const BOARD_RANGE = 60;
const BOARD_DURATION_S = 1.6;
const BOARD_GOLD_BONUS_MULT = 1.6;

// ── SHIP TIERS (MS) ── the 6-tier ship system; the Big Four (crew/cannons/
// storage) caps + hull all derive from tier. ALL VALUES ARE PLACEHOLDERS,
// interpolated from the idea-doc anchors (Leviathan ~200 min crew; top costs
// ~28k→90k→300k; per-crew bonus 1.5%→0.4%). Tune the table to feel.
// fields: name, hull, minCrew, maxCrew, cannons, storage, buy (gold),
//         crewBonus (speed+reload per crew, linear), captureFrom (tiers you can
//         solo-capture this FROM is handled in capture rules, not here).
const SHIP_TIERS = [
  { key:'dinghy',    name:'Dinghy',     hull:90,   minCrew:2,   maxCrew:6,   cannons:2,  storage:12,  buy:0,      crewBonus:0.015 },
  { key:'sloop',     name:'Sloop',      hull:130,  minCrew:5,   maxCrew:14,  cannons:4,  storage:20,  buy:2800,   crewBonus:0.012 },
  { key:'brigantine',name:'Brigantine', hull:200,  minCrew:12,  maxCrew:30,  cannons:8,  storage:40,  buy:9000,   crewBonus:0.009 },
  { key:'galleon',   name:'Galleon',    hull:320,  minCrew:28,  maxCrew:60,  cannons:14, storage:80,  buy:28000,  crewBonus:0.007 },
  { key:'manowar',   name:"Man-o'-War", hull:520,  minCrew:60,  maxCrew:120, cannons:24, storage:140, buy:90000,  crewBonus:0.005 },
  { key:'leviathan', name:'Leviathan',  hull:900,  minCrew:200, maxCrew:340, cannons:40, storage:260, buy:300000, crewBonus:0.004 },
];
const SHIP_TIER_INDEX = { dinghy:0, sloop:1, brigantine:2, galleon:3, manowar:4, leviathan:5 };
const PLAYER_START_TIER = 'dinghy';      // doc: "Start with small ship (max half crew)"
const PLAYER_START_CREW_FRAC = 0.5;      // start at half the tier's max crew

// ── PORT CAPTURE (replaces Home Base) ──
const PORT_HULL_BASE = 300;            // base port health (placeholder)
const PORT_HULL_PER_DOCK = 120;        // + per dock slot (bigger ports tougher)
const PORT_CAPTURE_THRESHOLD_PCT = 20; // damage a port below this %, then take it
const PORT_CAPTURE_RANGE = 340;        // be within this of the port to capture (≈ dock radius)
const PORT_REGEN_PER_S = 6;            // a damaged (un-captured) port heals this fast out of combat
const PORT_REGEN_DELAY_S = 12;         // ...after this long without taking a hit
const PORT_CANNONBALL_DMG = 10;        // player shot damage to a port hull (mirror of ship damage)
const MAX_OWNED_PORTS = 8;             // cap on player-owned ports

// ── CAPTURE / RUNNERS (M5 pipeline) ──
const CAPTURE_HULL_THRESHOLD_PCT = 20; // strip a ship below this to capture it
const CAPTURE_RANGE = 60;              // be within this of the target to capture
const CAPTURE_TOW_SPEED_FRAC = 0.75;   // tow the empty prize at 75% of your max speed
const RUNNER_REPAIR_S = 8;             // a towed-in prize repairs this long before it starts running
const RUNNER_SPEED = 1.4;              // runner cruise speed (placeholder)
const RUNNER_STOPS_MIN = 2, RUNNER_STOPS_MAX = 4;  // ports visited per circuit
const RUNNER_DWELL_S = 3;              // seconds parked at each stop (trading)
const RUNNER_GOLD_PER_STOP = 40;       // gold a runner banks per trade stop (placeholder)
const PRIZE_DELIVER_RANGE = 70;        // tow a prize this close to your port to deliver it

// ── ENEMY SHIP TIER DISTRIBUTION ── higher tiers rarer. Weights per tier index
// [dinghy, sloop, brigantine, galleon, manowar, leviathan]. Placeholder curve.
const ENEMY_TIER_WEIGHTS = [40, 28, 18, 9, 4, 1];
// optional per-faction cap so e.g. merchants skew small, navy skews larger.
// value = highest tier INDEX that faction will roll (inclusive). null = no cap.
const ENEMY_TIER_CAP = { merchant: 2, pirate: 3, navy: 4, privateer: 3 };
