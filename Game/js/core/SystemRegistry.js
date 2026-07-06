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

  init(scene){ for (const s of this.list) if (s.init) this._safe(s, 'init', scene); },
  update(scene, dt, dts){ for (const s of this.list) if (s.update) this._safe(s, 'update', scene, dt, dts); },
  draw(scene, g){ for (const s of this.list) if (s.draw) this._safe(s, 'draw', scene, g); },

  // fired by GameScene when the player docks; lets bank/bounty/menu systems
  // react without GameScene knowing they exist.
  onDock(scene, port){ for (const s of this.list) if (s.onDock) this._safe(s, 'onDock', scene, port); },

  // Run one system's hook guarded: an uncaught throw here would otherwise kill
  // Phaser's whole rAF loop (nothing schedules the next frame — the documented
  // P0 Leviathan/waypoint bug), freezing the game for every player over ONE
  // broken feature. Instead: log it (CrashLog, or console as a fallback before
  // that script loads) and permanently disable just THIS hook on THIS system —
  // it goes inert rather than repeatedly re-throwing every frame, and every
  // other system keeps running normally.
  _safe(sys, hook, ...args){
    if (sys.__deadHooks && sys.__deadHooks[hook]) return;
    try { sys[hook](...args); }
    catch (err){
      if (!sys.__deadHooks) sys.__deadHooks = {};
      sys.__deadHooks[hook] = true;
      const name = this._nameOf(sys);
      if (typeof CrashLog !== 'undefined') CrashLog.capture(err, { system: name, hook });
      else console.error('[SystemRegistry] disabling ' + name + '.' + hook + ' after an error:', err);
    }
  },

  // Best-effort readable name for the log: these systems are global consts, so
  // find the global that points at this exact object. Only runs on the (rare)
  // error path and is cached on the system afterward.
  _nameOf(sys){
    if (sys.__name) return sys.__name;
    try { for (const k in window) if (window[k] === sys){ sys.__name = k; break; } } catch (e){}
    return sys.__name || 'system';
  },
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
