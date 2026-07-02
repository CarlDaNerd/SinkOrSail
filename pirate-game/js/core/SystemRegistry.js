// ── core/SystemRegistry.js ──
// The plug-in point that makes features drop-in. A "system" is a plain object
// that MAY implement any of:
//
//   init(scene)            — once, in GameScene.create(); set up scene.<slice>
//   update(scene, dt, dts) — every frame, in registry order
//   draw(scene, g)         — every frame after the core draw; g = scene.gfxWorld
//   onDock(scene, port)    — convenience hook fired when the player docks
//
// To add a feature: write its file, add its <script> tag, and push it into
// Systems.list via registerSystems() (bottom of this file). GameScene never has
// to grow a new hardcoded call.
//
// ORDERING IS LOAD-BEARING. The registry runs systems in array order. The tight,
// inherently-ordered core (input -> movement -> collision -> ship separation ->
// cannonballs -> loot) stays as DIRECT calls in GameScene.update(); the registry
// is for features that want to be independently addable (bank, weather, zoom,
// bounties, capture). A system's update() runs at the point in the frame where
// GameScene calls Systems.update() — currently late, after AI and combat
// resolution, before draw.
//
// All hooks are optional and null-guarded, so a system can implement only what
// it needs (a pure draw overlay, an init-only state owner, etc.).
const Systems = {
  list: [],

  // register a system object. Safe to call repeatedly with the same object —
  // it won't double-add (handy for hot-reload during dev).
  add(system){
    if (!system || this.list.indexOf(system) !== -1) return;
    this.list.push(system);
  },

  init(scene){ for (const s of this.list) if (s.init) s.init(scene); },
  update(scene, dt, dts){ for (const s of this.list) if (s.update) s.update(scene, dt, dts); },
  draw(scene, g){ for (const s of this.list) if (s.draw) s.draw(scene, g); },

  // fired by GameScene when the player docks; lets bank/bounty/menu systems
  // react without GameScene knowing they exist.
  onDock(scene, port){ for (const s of this.list) if (s.onDock) s.onDock(scene, port); },
};

// ── registration ──────────────────────────────────────────────────────────
// One place that declares which feature systems are active, in run order.
// Adding a feature = add its global here. Guarded with typeof so a missing
// (not-yet-written) system never crashes the build — it's simply skipped.
function registerSystems(){
  const candidates = [
    typeof CommoditySystem !== 'undefined' ? CommoditySystem : null,   // MC (ensures pl.hold)
    typeof BankSystem    !== 'undefined' ? BankSystem    : null,   // M0
    typeof CrewSystem    !== 'undefined' ? CrewSystem    : null,   // crew stat (speed/reload bonus, hire at dock)
    typeof UpgradeSystem !== 'undefined' ? UpgradeSystem : null,   // sail/cannon upgrades + ship-buying (ensures pl.upgrades)
    typeof DefenseSystem !== 'undefined' ? DefenseSystem : null,   // M8 (port cannon towers)
    typeof Population    !== 'undefined' ? Population    : null,   // streaming world traffic (AI ships)
    typeof PortCaptureSystem !== 'undefined' ? PortCaptureSystem : null,  // take ports (shell + B); inits scene.ownedPorts
    typeof BoardingSystem !== 'undefined' ? BoardingSystem : null,        // capture ships + tow prizes (needs an owned port)
    typeof RunnerSystem  !== 'undefined' ? RunnerSystem  : null,   // delivered prizes → AI trade runners (passive income)
    typeof HireSystem    !== 'undefined' ? HireSystem    : null,   // hired privateer escorts
    typeof BountySystem  !== 'undefined' ? BountySystem  : null,   // port pirate-hunt contracts
    typeof LeviathanSystem !== 'undefined' ? LeviathanSystem : null, // LV1: the roaming endgame target
    typeof FleetSystem   !== 'undefined' ? FleetSystem   : null,   // FM1: fleet screen + convoy/escort rules
    typeof TavernSystem  !== 'undefined' ? TavernSystem  : null,   // TM1: port taverns + mission board
    typeof WindSystem    !== 'undefined' ? WindSystem    : null,   // dynamic wind direction (drives P.windFrom)
    typeof WeatherSystem !== 'undefined' ? WeatherSystem : null,   // M11
    typeof ZoomSystem    !== 'undefined' ? ZoomSystem    : null,   // M7
    typeof AchievementSystem !== 'undefined' ? AchievementSystem : null,  // pure observer (event bus + polled goals)
    typeof DevLog        !== 'undefined' ? DevLog        : null,   // pure observer (event feed)
  ];
  for (const c of candidates) if (c) Systems.add(c);
}
