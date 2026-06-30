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
const DEBUG = { infAmmo:false, infGold:false, weatherOff:false, ring:{ active:false, radius:0, age:0, label:'' } };

// ── fixed structural constants ──
const SAIL_MULTIPLIERS = [0, 0.55, 1.0];        // 0 none / 1 main / 2 full
const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
const WORLD_SEED = 42;            // fixed → same world every launch (deterministic)

// ── WORLD STREAMING (chunked, effectively unlimited) ──
const CHUNK_SIZE = 1500;          // px per chunk (square)
const LOAD_RADIUS = 2;            // chunks loaded each side of the player → (2r+1)² window
const UNLOAD_RADIUS = 3;          // unload only beyond this (hysteresis vs. boundary thrash)
const WORLD_CAP = 50000;          // soft cap: ships clamp to ±this (keeps coords/floats sane far out)
const ISLAND_PAD = 290;           // keep island bodies inside their chunk (clean per-chunk ownership)
const START_CLEAR_RADIUS = 700;   // open water kept around the world origin (player start)
const SPAWN_RANGE = 3000;         // Phase-1 fleet spawns within this of origin (legacy; Population streams now)

// ── WORLD POPULATION (streaming AI traffic) ──────────────────────────────────
// Ships spawn in a window around the player and despawn when far behind, so the
// world feels alive wherever you sail without simulating thousands of ships.
// Density scales with nearby PORTS: semi-crowded near port clusters, sparse in
// open sea. All placeholders — tune to feel.
const POP_SPAWN_RADIUS = 4500;    // ships spawn within this of the player
const POP_DESPAWN_RADIUS = 7000;  // ...and despawn beyond this (ambient traffic leaves the area)
const POP_INTERVAL_S = 1.0;       // how often the population manager runs (seconds)
const POP_MAX_SHIPS = 50;         // hard cap on live ships (perf)
const SPAWN_VIEW_MARGIN = 120;    // ships spawn at least this far beyond the visible viewport edge (appear over the horizon)
const POP_MERCHANTS_AMBIENT = 2;  // open-sea merchant traffic when no ports are near
const POP_MERCHANTS_PER_PORT = 2; // + this many merchants per nearby port (denser near ports)
const POP_NAVY_PER_PORT = 2;      // navy guards per nearby DEFENDED port
const POP_PRIV_PER_PORT = 1;      // privateers per nearby privateer port
const POP_PIRATES_AMBIENT = 2;    // roaming pirates target in the window (sparse)
const MERCHANT_WANDER_FRAC = 0.2; // fraction of merchants that wander instead of running routes
// merchant trade routes
const MERCHANT_ROUTE_RANGE = 9000;      // a trader looks this far for its next port
const PORT_ARRIVE_RANGE = 280;          // a merchant counts as "arrived" at a port within this
const MERCHANT_PIRATE_FLEE_RANGE = 440; // a merchant flees a pirate within this

// ── MAPS ──
const MINIMAP_W = 178, MINIMAP_H = 134;   // corner minimap size (px); the circle radius is MINIMAP_H/2 (MINIMAP_W is vestigial)
const MINIMAP_RANGE = 1350;       // world radius (px) the minimap shows AND the big-map fog reveals — kept matched
const FOG_CELL = 375;             // big-map fog reveal cell size (px) — finer than a chunk so the revealed radius matches the minimap
const COORD_SCALE = 25;           // world px per displayed coordinate unit (HUD + map show position / COORD_SCALE so numbers stay small)
const COMPASS_RING_W = 16;        // width (px) of the compass ring wrapped around the circular minimap
const COMPASS_LABEL_PAD = 16;     // space (px) beyond the ring for the cardinal letters (so ticks never cross them)
const MAP_SCALE_INIT = 0.045;             // big map (M): screen-px per world-px
const MAP_SCALE_MIN = 0.02, MAP_SCALE_MAX = 0.22;

// ── BIOMES (SEA vs. CLUSTER) ──────────────────────────────────────────────
// The world is MOSTLY OPEN SEA. Land is concentrated into discrete CLUSTERS. A
// cluster sits ONLY at a strict local landiness PEAK at/above CLUSTER_LANDINESS,
// so no two clusters are even diagonally adjacent — they're always ringed by open
// water. Each cluster is a "cluster of clusters": >=1 mainland at its heart,
// ringed by smaller sub-groups + lone islands (a bounded footprint, not sprawling).
// Open-sea regions are empty except for the occasional small lone cluster adrift.
//   strict local peak AND L >= CLUSTER_LANDINESS → cluster ; otherwise → sea
const REGION_SIZE = 4000;         // coarse biome cell (px)
const BIOME_FREQ = 0.45;          // landiness-noise frequency (lower = bigger zones)
const CLUSTER_LANDINESS = 0.50;   // a strict local landiness peak at/above this → a cluster (rare); else open sea
const OCEAN_LONE_CLUSTER_CHANCE = 0.05;  // a sea region's chance of a small lone cluster (a few islands, no mainland)
const REGION_MARGIN = 1000;       // place lone features this far inside their region
const MAX_FEATURE_REACH = 6000;   // a chunk gathers features from regions within this (covers larger cluster footprints)

// ── ISLAND SIZE TIERS — footprint RADIUS (half-span) px. Every shape archetype
// is built to FIT inside this radius (stripes included), so a tier's span ≈ 2×
// these numbers regardless of archetype — no more giant elongated outliers. ──
const TIER_TINY   = [25, 75];     // span ~50–150 px   (outcrops / garnish)
const TIER_SMALL  = [100, 225];   // span ~200–450 px
const TIER_MEDIUM = [300, 700];   // span ~600–1400 px
const TIER_LARGE  = [750, 1200];  // span ~1500–2400 px

// mainland: independent length × width (blob → long curved "hotdog"/Japan)
const MAINLAND_LEN_MIN = 2600, MAINLAND_LEN_MAX = 3800;   // kept ≤ region size so a continent stays within its cell
const MAINLAND_WIDTH_MIN = 800, MAINLAND_WIDTH_MAX = 2200;
const STARTER_LEN_MIN = 1900, STARTER_LEN_MAX = 2900;          // friendlier starter mainlands near origin
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

// ── GROUPINGS ───────────────────────────────────────────────────────────────
// Islands are spaced EDGE-TO-EDGE (centre distance > rad₁+rad₂+gap) so they never
// overlap. Groupings anchor near their region CENTRE (± CLUSTER_JITTER) so two
// neighbouring groupings on the 4000px region grid stay clear of each other.
const DENSE_COUNT_MIN = 7, DENSE_COUNT_MAX = 13;         // islands in a big (dense) grouping
const DENSE_RADIUS_MIN = 1100, DENSE_RADIUS_MAX = 1400;  // contained spread (stays inside its region, with an ocean buffer)
const SPARSE_COUNT_MIN = 2, SPARSE_COUNT_MAX = 5;        // islands in a sparse scatter (used as the occasional bigger sub-group)
const SPARSE_RADIUS_MIN = 800, SPARSE_RADIUS_MAX = 1100;
const DENSE_GAP = 220;                                   // min edge-to-edge spacing in a dense grouping
const SPARSE_GAP = 480;                                  // wider edge-to-edge spacing in a sparse scatter
const CLUSTER_JITTER = 180;                              // anchor a cluster near its region centre ± this (so neighbours stay apart)
// sub-cluster ('mini') sizing — small tight groups that a mega-cluster is built from
const MINI_COUNT_MIN = 3, MINI_COUNT_MAX = 6;           // islands in a sub-cluster
const MINI_RADIUS_MIN = 300, MINI_RADIUS_MAX = 550;     // sub-cluster spread
const MINI_GAP = 200;                                   // edge-to-edge spacing inside a sub-cluster

// ── MEGA-CLUSTER (a "cluster of clusters") ───────────────────────────────────
// Built at every cluster region: a MAINLAND heart, a ring of sub-clusters, and a
// few lone islands — bounded so a cluster reads as a legible archipelago.
const CLUSTER_MAINLAND_LEN_MIN = 2000, CLUSTER_MAINLAND_LEN_MAX = 2700;   // moderate mainland at the heart
const CLUSTER_MAINLAND_WIDTH_MIN = 900, CLUSTER_MAINLAND_WIDTH_MAX = 1600;
const CLUSTER_SECOND_MAINLAND_CHANCE = 0.30;            // sometimes a 2nd, smaller mainland in the cluster
const MEGA_SUBCLUSTERS_MIN = 2, MEGA_SUBCLUSTERS_MAX = 4;  // sub-groups ringing the heart
const MEGA_SUB_RING_MIN = 200, MEGA_SUB_RING_MAX = 650;    // a sub-cluster centre sits this far beyond the heart's edge
const MEGA_LONE_MIN = 2, MEGA_LONE_MAX = 5;             // lone islands sprinkled through the cluster
const MEGA_LONE_GAP = 220;                              // edge-to-edge spacing for the lone cluster islands
const MEGA_SUB_SPARSE_CHANCE = 0.20;                    // a sub-group is occasionally a bigger 'sparse' scatter for variety
// full-window canvas; the dev panel is a slide-in overlay drawer (not a layout
// sibling), so it no longer steals canvas width — toggle it from the edge tab.
const GAME_W = window.innerWidth, GAME_H = window.innerHeight;
const SHIP_RADIUS = 22, WAKE_LENGTH = 60, WAKE_MIN_SPEED = 0.2;
// ── COLLISION PUSH ── each ship carries a decaying drift vector (s.push); land
// collisions slide along it, ship-ship collisions shove via it (mass = maxHull, so
// bigger ships push harder). Head-on into a cliff still kills all speed.
const PUSH_DECAY = 0.90;          // per-frame retention of a ship's collision drift (frame-normalized) — ~gone in ~1s
const PUSH_TRANSFER = 0.6;        // fraction of the closing speed converted into a shove on ship-ship impact
const HULL_LEN = 20, HULL_BEAM = 10;            // semi-length / half-beam of hull body (bowsprit excluded)

// ── PORTS / DOCKING ──
const DOCK_RADIUS = 320;          // sail within this of a port (center) to dock
const REPAIR_COST_PER_HP = 2;     // gold per hull point repaired
const AMMO_COST_PER_UNIT = 1;     // gold per ammo unit restocked

// ── COMMODITIES + PORT ECONOMY (M8) ──────────────────────────────────────────
// Trade-only goods; gold is the currency. Source ports sell their good cheap;
// Frontier Outposts pay the most when you sell; each port has a stable seeded
// price wobble so buy-low/sell-high routes exist. All magnitudes are placeholders.
const COMMODITIES = ['lumber', 'cloth', 'iron', 'rum', 'sugar', 'tobacco'];
const COMMODITY_INFO = {
  lumber:  { glyph: 'L', color: 0x9C6B3C },
  cloth:   { glyph: 'C', color: 0xC9C0A0 },
  iron:    { glyph: 'I', color: 0x8A8F98 },
  rum:     { glyph: 'R', color: 0xB5612A },
  sugar:   { glyph: 'S', color: 0xEDE3C8 },
  tobacco: { glyph: 'T', color: 0x6E5A34 },
};
const HOLD_CAPACITY_DEFAULT = 20;       // player cargo-hold capacity (units)
const BASE_PRICE = { lumber:10, cloth:18, iron:24, rum:14, sugar:12, tobacco:20 };
const SOURCE_PORT_DISCOUNT = 0.6;       // a source port sells its own good at 60% price
const FRONTIER_BUY_BONUS = 1.5;         // Frontier Outpost pays 1.5x when buying from you
const SEEDED_DEMAND_BOUNDS = 0.25;      // per-port per-commodity price wobble (±25%)
const SELL_SPREAD = 0.85;               // ports buy from you at 85% of their sell price

// 8 port types — terrain hint, tower odds, navy presence, source good, dock count,
// and a distinct map/marker COLOUR per type (placeholders — tune to taste).
const PORT_TYPES = {
  TradingHub:      { terrain:'mainland',          towerChance:1.00, navy:'always', source:null,       slots:[2,5], crewDiscount:true, merchantLootMult:2.0, color:0xF0C840 },
  LumberYard:      { terrain:'small-mainland',     towerChance:0.25, navy:'none',   source:'lumber',   slots:[1,2], repairDiscount:true, color:0xB5793A },
  FrontierOutpost: { terrain:'far',               towerChance:0.50, navy:'none',   source:null,       slots:[1,2], buyBonus:true, color:0xB0B6BE },
  SugarFarm:       { terrain:'small-mainland',     towerChance:0.25, navy:'none',   source:'sugar',    slots:[1,2], color:0xF2E7B0 },
  Brewery:         { terrain:'small-mainland',     towerChance:0.25, navy:'none',   source:'rum',      slots:[1,2], color:0xD9772E },
  TobaccoFarm:     { terrain:'small-mainland',     towerChance:0.25, navy:'none',   source:'tobacco',  slots:[1,2], color:0xC2C24A },
  IronMine:        { terrain:'rare-small-mainland',towerChance:0.50, navy:'maybe',  source:'iron',     slots:[1,2], color:0x7FA8C8 },
  ClothMill:       { terrain:'medium-mainland',    towerChance:0.25, navy:'none',   source:'cloth',    slots:[1,2], color:0xC77BC9 },
};
// port cannon towers (M8 defense) — fire on the player when WANTED / pirate nearby
const TOWER_RANGE = 360, TOWER_COOLDOWN_S = 2.2, TOWER_DAMAGE = 10, TOWER_BALL_SPEED = 5.0;
// a port's hull (set by PortEconomy.assignType; sized by dock count)
const PORT_HULL_BASE = 300, PORT_HULL_PER_DOCK = 120;

// ── WORLD-WIDE PORT PLACEMENT ────────────────────────────────────────────────
// Ports are placed deterministically per cluster: each mainland gets a few, a
// couple of the larger islands per cluster get one, and the odd lone sea-cluster
// gets a frontier outpost. (One-time scan of ±PORT_REGION_RADIUS regions for now;
// fully-streaming placement is a later pass.)
const PORT_REGION_RADIUS = 7;          // place ports across ± this many regions of origin (≈ ±28000px)
const MAINLAND_PORTS_MIN = 2, MAINLAND_PORTS_MAX = 3;   // ports per mainland (2–3, scales with size)
const MAINLAND_PORT_PER_RAD = 600;     // ~1 port per this much mainland footprint radius
const ISLAND_PORT_MIN_RAD = 90;        // an island must be at least this big to host a port (excludes tiny outcrops)
const SMALL_ISLAND_PORTS_MAX = 2;      // hard cap on small-island ports per cluster
const LONE_CLUSTER_PORT_CHANCE = 0.40; // chance a lone open-sea cluster gets a single Frontier Outpost

// ── FEATURE SYSTEMS (registry-driven; togglable from the pause menu) ─────────
const EXTRAS_DEFAULT = true;      // weather on by default (pause-menu "Weather" button flips scene.extrasOn; zoom is always on)

// ── M7 ZOOM ── auto zoom-IN during battle only; NO scroll/manual zoom ──
const ZOOM_DEFAULT = 1.0;         // normal sailing zoom
const ZOOM_BATTLE_LEVEL = 1.4;    // camera zoom while in combat — edit to taste
const ZOOM_LERP = 0.02;           // smoothing toward the target zoom (per 1/60s)

// ── M11 WEATHER ── one effect at a time, rolled every few minutes; never touches WIND ──
const WEATHER_INTERVAL_MIN_S = 120, WEATHER_INTERVAL_MAX_S = 300;   // 2–5 min between effects
const WEATHER_TYPES = ['rain', 'snow', 'tsunami', 'cyclone', 'storm'];
// rain — gentle speed tax; ends on distance OR time
const RAIN_SPEED_MULT = 0.75, RAIN_DURATION_S = 45, RAIN_DURATION_PX = 10000;
// snow — drifting icebergs damage the hull on contact
const SNOW_DURATION_S = 40, SNOW_ICEBERG_COUNT = 14, SNOW_ICEBERG_DAMAGE = 12, SNOW_ICEBERG_INTERVAL = 1.0;
// tsunami — only near land; shoves the ship toward the nearest island (survivable)
const TSUNAMI_ISLAND_PROXIMITY_PX = 1800, TSUNAMI_PUSH_S = 6, TSUNAMI_PUSH_SPEED = 2.2;
// cyclone — pulls the ship toward a centre; one big hit at the eye
const CYCLONE_DURATION_S = 16, CYCLONE_RADIUS = 900, CYCLONE_PULL = 1.4, CYCLONE_DAMAGE_PCT = 50;
// storm — lightning strikes can break the sail (capped to half) until a port repair
const STORM_DURATION_S = 20, STORM_STRIKE_INTERVAL_S = 2.5, STORM_SAIL_HIT_CHANCE_PCT = 45, STORM_BROKEN_SAIL_MAX_STATE = 1;

// ── DEV LOG ── real-time world-event feed (bottom-left; toggle with L) ──
const DEVLOG_DEFAULT_ON = true;   // PLACEHOLDER: show the dev log by default (it's a dev/QC build)
const DEVLOG_MAX = 60;            // PLACEHOLDER: ring-buffer size (events kept)
const DEVLOG_VISIBLE = 14;        // PLACEHOLDER: lines drawn on screen at once
const DEVLOG_LINE_TTL = 24;       // PLACEHOLDER: seconds before an old line fades to its dim floor

// ── ACHIEVEMENTS ── event-counter + polled goals; unlock toast + list overlay (J) ──
const ACH_TOAST_S = 5;            // PLACEHOLDER: seconds an unlock toast stays on screen
const ACH_CHECK_INTERVAL_S = 0.4; // how often polled (stat-threshold) achievements re-check

// ── CREW ── crew is a ship STAT (per-tier caps live in ShipTiers). Above baseline
// each crew adds a small speed + reload bonus (capped); below the tier's minCrew the
// ship is understaffed (flat speed penalty + fewer broadside balls). Hired at ports.
const CREW_DEFAULT = 8;           // fallback crew if a ship has none stamped
const CREW_MAX = 40;              // fallback cap when no tier is present
const CREW_SPEED_PER = 0.004;    // fallback +/- per crew when no tier (ShipTiers.crewBonus overrides)
const CREW_BONUS_CAP = 0.30;     // max +/-30% total from crew (speed up / reload down)
const CREW_HIRE_COST = 6;        // gold per crew hired at a port (cheaper at a Trading Hub)
const PLAYER_START_CREW_FRAC = 0.5;  // new player starts at half the start tier's max crew

// ── CAPTURE / BOARDING ── shell a ship OR a port below its threshold, then press B
// (port-capture is tried first). A captured ship becomes an empty hull you TOW to a
// port you own, where it's delivered (runners hook). Boarding is gated behind owning
// a port, so you must capture a port first.
const CAPTURE_HULL_THRESHOLD_PCT = 20; // strip a ship below this % hull to board it
const CAPTURE_RANGE = 60;              // be within this of the target to board
const BOARD_DURATION_S = 1.6;          // boarding timer once started (you're pinned)
const CAPTURE_TOW_SPEED_FRAC = 0.75;   // tow the empty prize at this fraction of max speed
const PRIZE_DELIVER_RANGE = 70;        // tow a prize this close to an owned port to deliver
// port capture
const PORT_CAPTURE_THRESHOLD_PCT = 20; // shell a port below this % hull, then take it
const PORT_CAPTURE_RANGE = 340;        // be within this of the port to capture (~dock radius)
const PORT_HIT_RADIUS = 50;            // a player shot this close to a port centre damages it (ports are big targets; lets a full volley land)
const PORT_CANNONBALL_DMG = 10;        // player shot damage to a port hull
const PORT_REGEN_PER_S = 6;            // a damaged un-owned port heals this fast out of combat
const PORT_REGEN_DELAY_S = 12;         // ...after this long without taking a hit
const MAX_OWNED_PORTS = 8;             // cap on player-owned ports

// ── RUNNERS ── a delivered prize becomes an AI trade runner banking passive gold
const RUNNER_REPAIR_S = 8;             // a towed-in prize repairs this long before it starts running
const RUNNER_SPEED = 1.4;              // runner cruise speed (placeholder)
const RUNNER_STOPS_MIN = 2, RUNNER_STOPS_MAX = 4;   // ports visited per circuit
const RUNNER_DWELL_S = 3;              // seconds parked at each stop (trading)
const RUNNER_GOLD_PER_STOP = 40;       // gold a runner banks per trade stop (placeholder)
const RUNNER_ARRIVE_RANGE = 130;       // a runner counts as "arrived" at a route port within this

// ── HIRED PRIVATEERS ── escorts that patrol near you and shell pirates (hitscan)
const PRIVATEER_HIRE_SLOTS = 3;        // max escorts you can employ
const PRIVATEER_HIRE_COST = 1500;      // gold per escort
const ESCORT_ENGAGE_RANGE = 900;       // an escort looks this far for a pirate threat
const ESCORT_ATTACK_RANGE = 280;       // and fires within this
const ESCORT_DAMAGE = 12;              // damage per escort shot
const ESCORT_FIRE_COOLDOWN_S = 1.6;    // seconds between escort shots
const ESCORT_SPEED = 1.9;              // escort cruise speed
const ESCORT_PATROL_RADIUS = 360;      // orbit radius around the guard anchor when idle
