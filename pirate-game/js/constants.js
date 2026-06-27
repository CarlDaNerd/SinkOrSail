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
