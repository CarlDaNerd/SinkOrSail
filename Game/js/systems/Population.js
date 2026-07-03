// ── systems/Population.js ──
// Streaming world population. Keeps the sea around the player alive without
// simulating the whole world: every POP_INTERVAL_S it despawns ships that have
// drifted far behind, then tops the local population back up to a target that
// SCALES WITH NEARBY PORTS — semi-crowded around port clusters (merchants + navy/
// privateer guards), sparse in open sea (a couple transit merchants + the odd
// roaming pirate). Merchants are handed a trade route at spawn (AI.pickPort);
// ~MERCHANT_WANDER_FRAC of them wander instead.
//
// Owns no scene slice beyond scene._popAt (its next-run timestamp). scene.ships
// stays the shared array everything else reads.
const Population = {
  init(scene){ scene._popAt = 0; },

  update(scene, dt, dts){
    const t = scene.time.now / 1000;
    if (t < scene._popAt) return;
    scene._popAt = t + POP_INTERVAL_S;
    this.manage(scene);
  },

  // initial fill (called from Enemy.spawnFleet, before the registry inits)
  populate(scene){ scene._popAt = 0; this.manage(scene); },

  manage(scene){
    const pl = scene.player, ships = scene.ships;
    // 1) cull dead ships and anything that has drifted beyond the despawn radius
    for (let i = ships.length - 1; i >= 0; i--){
      const s = ships[i];
      // BUGFIX: every despawn path must surrender any claimed berth, or the
      // occupantId points at a gone ship and that dock is blocked forever
      if (!s.alive){ if (typeof Docks !== 'undefined') Docks.releaseAnywhere(scene, s); ships.splice(i, 1); continue; }
      if (s.persistent) continue;                                   // LV1: the Leviathan never despawns by distance
      if (Math.hypot(s.x - pl.x, s.y - pl.y) > POP_DESPAWN_RADIUS){ if (typeof Docks !== 'undefined') Docks.releaseAnywhere(scene, s); ships.splice(i, 1); }
    }
    // 2) ports inside the spawn window drive the local density
    const nearPorts = scene.navyPorts.filter(p => Math.hypot(p.x - pl.x, p.y - pl.y) < POP_SPAWN_RADIUS);

    // 3) per-faction targets
    let navyT = 0, privT = 0;
    for (const p of nearPorts){ if (p.navy) navyT += POP_NAVY_PER_PORT; if (p.privateer) privT += POP_PRIV_PER_PORT; }
    const target = {
      merchant:  POP_MERCHANTS_AMBIENT + nearPorts.length * POP_MERCHANTS_PER_PORT,
      navy:      navyT,
      privateer: privT,
      pirate:    POP_PIRATES_AMBIENT,
    };

    // 4) current counts (after the cull), then top up toward target within the cap
    const cur = { merchant:0, pirate:0, navy:0, privateer:0 };
    for (const s of ships) if (cur[s.faction] != null) cur[s.faction]++;
    this._spawn(scene, 'merchant',  target.merchant  - cur.merchant,  nearPorts);
    this._spawn(scene, 'navy',      target.navy      - cur.navy,      nearPorts);
    this._spawn(scene, 'privateer', target.privateer - cur.privateer, nearPorts);
    this._spawn(scene, 'pirate',    target.pirate    - cur.pirate,    nearPorts);
  },

  _spawn(scene, faction, n, nearPorts){
    const r = scene.eprng, pl = scene.player;
    const homed = (faction === 'navy' || faction === 'privateer');
    for (let k = 0; k < n; k++){
      if (scene.ships.length >= POP_MAX_SHIPS) return;
      let x, y, home = null;
      if ((homed || faction === 'merchant') && nearPorts.length){
        // anchored to a nearby port: guards spawn close, merchants a little off the quay
        home = nearPorts[Math.floor(r() * nearPorts.length)];
        const a = r() * TAU, rr = homed ? (150 + r() * P.navyLeash * 0.6) : (400 + r() * 900);
        x = home.x + Math.cos(a) * rr; y = home.y + Math.sin(a) * rr;
      } else {
        // ambient sea traffic: spawn out near the window edge so they sail INTO view
        const a = r() * TAU, rr = POP_SPAWN_RADIUS * 0.7 + r() * POP_SPAWN_RADIUS * 0.3;
        x = pl.x + Math.cos(a) * rr; y = pl.y + Math.sin(a) * rr;
      }
      // spawn must be off land AND beyond the visible viewport, so ships appear from
      // over the horizon and never pop into view
      const cam = scene.cameras.main;
      const viewR = cam ? Math.hypot(cam.worldView.width, cam.worldView.height)/2 + SPAWN_VIEW_MARGIN : 0;
      const bad = (px, py) => Collision.checkIsland(scene, px, py, 40).hit || Math.hypot(px - pl.x, py - pl.y) < viewR;
      let att = 0;
      while (att < 24 && bad(x, y)){
        const a = r() * TAU, rr = viewR + r() * 1200;               // retry from the player, just beyond the view edge
        x = pl.x + Math.cos(a) * rr; y = pl.y + Math.sin(a) * rr; att++;
      }
      if (bad(x, y)) continue;     // couldn't find off-screen water — skip this one

      const hull = { merchant:50, pirate:75, navy:90, privateer:70 }[faction];
      const ship = Enemy.create(faction, hull, x, y, r() * 360, home, r, (Population._id = (Population._id || 0) + 1));
      if (faction === 'merchant'){
        if (r() < MERCHANT_WANDER_FRAC) ship.wander = true;          // a few just drift
        else if (typeof AI !== 'undefined'){
          ship.dest = AI.pickPort(scene, ship, null);   // the rest run a route
          if (typeof CommoditySystem !== 'undefined') CommoditySystem.assignCargo(scene, ship);   // EMPIRE-1b
        }
      }
      scene.ships.push(ship);
    }
  },
};
