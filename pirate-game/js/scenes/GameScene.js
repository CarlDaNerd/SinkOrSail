// ── scenes/GameScene.js ──
// World + all per-frame orchestration (handoff §3). Holds the mutable run state
// (player, ships, cannonballs, loot, popups, navyStanding, flag) and delegates
// physics / combat / AI / faction / flag logic to the system modules. The
// dt/dts frame-rate-independence contract lives here (§2).
class GameScene extends Phaser.Scene {
  constructor(){ super('GameScene'); }

  create(data){
    this.eprng = makePRNG(WORLD_SEED*7 + 13);          // enemy/event PRNG; terrain self-seeds per chunk
    this.cameras.main.setBackgroundColor('#15263C');   // no bounds — the world streams infinitely

    this.player = Player.create(0, 0);                 // start at the world origin
    this.navyStanding = 0;                             // 0 = neutral/friendly, negative = wanted
    this.flag = 'neutral'; this.flagPending = null; this.flagChangeAt = 0;
    this.docked = false; this.dockPort = null; this.nearPort = null;  // port docking state
    this.cannonballs = []; this.loot = []; this.popups = [];

    this.islands = []; this.reefs = [];                // active sets — filled by the chunk manager
    this.explored = new Set();                          // chunk keys you've sailed near (for the big map)
    this.menuOpen = false;                              // pause menu (Esc)
    this.extrasOn = EXTRAS_DEFAULT;                      // weather on/off (pause-menu "Weather" button); zoom is always on
    this.achOpen = false;                               // achievements list overlay (J)
    this.mapOpen = false; this.mapDirty = false;        // big map (M) — non-pausing chart
    this.mapFollow = true;                              // chart tracks the ship until you drag it
    this.mapAnim = null;                                // active C-key recenter tween { sx, sy, ss, t0 }
    this.mapCenterX = 0; this.mapCenterY = 0; this.mapScale = MAP_SCALE_INIT;
    this.viewZoom = ZOOM_DEFAULT;                        // manual in-game camera zoom (scroll wheel); ZoomSystem lerps to it out of combat
    Chunks.init(this);                                 // stream terrain around the player
    this.navyPorts = this.placeStartPorts();
    Island.drawPortMarkers(this);
    // MD2: berth pads change color with occupancy — redraw the static port layer
    // when any ship docks/undocks/sinks (cheap: only fires on those events)
    this.events.on(EV.SHIP_DOCKED,   () => Island.drawPortMarkers(this));
    this.events.on(EV.SHIP_UNDOCKED, () => Island.drawPortMarkers(this));
    this.events.on(EV.SHIP_SUNK,     () => Island.drawPortMarkers(this));
    this.ships = []; Enemy.spawnFleet(this);

    this.gfxWorld = this.add.graphics().setDepth(4);   // wakes, loot
    this.gfxShips = this.add.graphics().setDepth(10);
    this.gfxFx    = this.add.graphics().setDepth(11);   // cannonballs
    this.follow = this.add.rectangle(this.player.x, this.player.y, 1, 1, 0, 0);
    this.cameras.main.startFollow(this.follow, true, 0.08, 0.08);
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,Q,E,F,ESC,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,NINE,ZERO,M,Z,X,T,J,L,B,C,V,SPACE');   // V: flagship swap (SW1); SPACE: double broadside (CQ)
    this.input.on('wheel', (p, over, dx, dy) => {
      if (this.mapOpen){ this.mapAnim = null; this.mapScale = Phaser.Math.Clamp(this.mapScale * (dy < 0 ? 1.12 : 0.892), MAP_SCALE_MIN, MAP_SCALE_MAX); this.mapDirty = true; }
      else if (!this.docked && !this.menuOpen){ this.viewZoom = Phaser.Math.Clamp(this.viewZoom * (dy < 0 ? 1.08 : 0.926), ZOOM_MIN, ZOOM_DEFAULT); }   // in-game: scroll to zoom OUT (down to the sight-circle limit)
    });
    this.input.on('pointermove', (p) => { if (!this.mapOpen || !p.isDown) return; this.mapFollow = false; this.mapAnim = null; this.mapCenterX -= (p.position.x - p.prevPosition.x)/this.mapScale; this.mapCenterY -= (p.position.y - p.prevPosition.y)/this.mapScale; this.mapDirty = true; });
    // touch: tap the world (a port/ship in range) → dock or capture. Ignored on
    // desktop (TouchInput.active false) and when the tap hit a UI button — the
    // parallel UIScene reports what interactive object (if any) is under the pointer.
    // MW-7: press on open water = start of a steer-drag OR a tap. Movement past the
    // tap threshold steers (slide left/right); a short still press = world tap
    // (dock / capture). Presses on UI buttons are excluded via hitTestPointer.
    this.input.on('pointerdown', (p) => {
      if (typeof TouchInput === 'undefined' || !TouchInput.active) return;
      if (this.mapOpen || this.docked || this.menuOpen) return;
      const ui = this.scene.get('UIScene');
      const hits = ui ? ui.input.hitTestPointer(p) : [];
      if (hits && hits.length) return;
      TouchInput.steerStart(p);
    });
    this.input.on('pointermove', (p) => {
      if (typeof TouchInput === 'undefined' || !TouchInput.active || !p.isDown) return;
      TouchInput.steerMove(p);
    });
    this.input.on('pointerup', (p) => {
      if (typeof TouchInput === 'undefined' || !TouchInput.active) return;
      const wasTap = TouchInput.steerEnd(p);
      if (wasTap && !this.mapOpen) TouchInput.handleWorldTap(this);
    });

    this.missions = new MissionLoader(this); this.missions.scan();

    registerSystems();        // declare active feature systems (core/SystemRegistry.js)
    Systems.init(this);       // each feature sets up its own scene.<slice> (e.g. pl.bank)

    // continuing a saved run? apply it now that the scene is fully built
    if (data && data.load){ const s = Save.read(); if (s) Save.apply(this, s); }
  }

  // Place TYPED ports across the world, deterministically per cluster: every
  // mainland gets 2–3 (scaling with size), up to 2 of a cluster's larger islands
  // get one, and the odd lone open-sea cluster gets a Frontier Outpost. Coast
  // points are computed straight from each landmass's ellipse lobes, so this works
  // for regions that haven't streamed in yet. (One-time ±PORT_REGION_RADIUS scan.)
  placeStartPorts(){
    const R = PORT_REGION_RADIUS;
    const NAMES = ['Port Royal','Tortuga','Nassau','Havana','Cartagena','Kingston','Bridgetown','San Juan','Maracaibo','Campeche','Porto Bello','Willemstad','Santiago','Bonaire','Eleuthera','Petit Goave','Panama','Veracruz','Trinidad','Barbados','Curacao','Aruba','Antigua','Martinique'];
    let ni = 0;
    const ports = [];
    const mk = (x, y, type, prng) => {
      const sr = PORT_TYPES[type].slots, slots = sr[0] + Math.floor(prng() * (sr[1] - sr[0] + 1));
      const p = new Port(x, y, NAMES[ni++ % NAMES.length], slots);
      PortEconomy.assignType(p, type, prng);
      return p;
    };
    for (let ry = -R; ry <= R; ry++) for (let rx = -R; rx <= R; rx++){
      const biome = WorldGen.biomeOf(rx, ry);
      if (biome !== 'cluster' && biome !== 'sea') continue;
      const reg = WorldGen.region(rx, ry);
      if (!reg.lands.length) continue;
      const prng = makePRNG(hashCoords(rx, ry, (WORLD_SEED ^ 0x504F5254) >>> 0));   // 'PORT' salt — decoupled from terrain/enemy PRNGs
      if (biome === 'cluster'){
        this._placeClusterPorts(reg, prng, mk, ports);
      } else if (prng() < LONE_CLUSTER_PORT_CHANCE){
        const isl = reg.lands.filter(l => (l.rad || 0) >= ISLAND_PORT_MIN_RAD).sort((a, b) => (b.rad || 0) - (a.rad || 0))[0];
        if (isl){ const cp = this._coastOf(isl, prng() * TAU); ports.push(mk(cp.x, cp.y, 'FrontierOutpost', prng)); }
      }
    }
    if (!ports.length) ports.push(mk(1900, -1400, 'TradingHub', makePRNG(123)));   // safety net (never empty)
    return ports;
  }

  // ports for one mega-cluster: 2–3 per mainland (TradingHub + source ports), and
  // up to 2 of the cluster's larger islands (0/1/2 roll, the biggest first).
  _placeClusterPorts(reg, prng, mk, ports){
    const mains = reg.lands.filter(l => l.mainland);
    const isles = reg.lands.filter(l => !l.mainland && (l.rad || 0) >= ISLAND_PORT_MIN_RAD).sort((a, b) => (b.rad || 0) - (a.rad || 0));
    const MAIN_TYPES = ['ClothMill','LumberYard','SugarFarm','Brewery','TobaccoFarm','IronMine'];
    const ISLE_TYPES = ['LumberYard','SugarFarm','Brewery','TobaccoFarm','FrontierOutpost'];
    for (const m of mains){
      const n = Math.max(MAINLAND_PORTS_MIN, Math.min(MAINLAND_PORTS_MAX, Math.round((m.rad || 1200) / MAINLAND_PORT_PER_RAD)));
      const base = prng() * TAU;
      for (let i = 0; i < n; i++){
        const ang = base + (i / n) * TAU + (prng() - 0.5) * 0.5;     // spaced around the coast
        const cp = this._coastOf(m, ang);
        const type = (i === 0) ? 'TradingHub' : MAIN_TYPES[Math.floor(prng() * MAIN_TYPES.length)];
        ports.push(mk(cp.x, cp.y, type, prng));
      }
    }
    const roll = prng();
    let nIsl = roll < 0.25 ? 0 : roll < 0.75 ? 1 : 2;               // ~25% / 50% / 25%
    nIsl = Math.min(nIsl, SMALL_ISLAND_PORTS_MAX, isles.length);
    for (let i = 0; i < nIsl; i++){
      const isl = isles[i];                                         // the biggest eligible islands first
      const cp = this._coastOf(isl, prng() * TAU);
      ports.push(mk(cp.x, cp.y, ISLE_TYPES[Math.floor(prng() * ISLE_TYPES.length)], prng));
    }
  }

  // a coast point on a single landmass, computed from its ellipse lobes (no
  // scene.islands dependency, so it works for not-yet-streamed regions): march out
  // from the centre along `ang` to the last point still on land.
  _coastOf(land, ang){
    const cx = land.cx, cy = land.cy, cos = Math.cos(ang), sin = Math.sin(ang);
    const inside = (x, y) => { for (const e of (land.ells || [])){ const nx = (x - e.cx) / e.rx, ny = (y - e.cy) / e.ry; if (nx*nx + ny*ny < 1) return true; } return false; };
    let last = null;
    for (let rr = 0; rr < 4000; rr += 20){
      const x = cx + cos*rr, y = cy + sin*rr;
      if (inside(x, y)) last = { x, y, rr };
      else if (last && rr > last.rr + 60) return { x: last.x, y: last.y };
    }
    return last ? { x: last.x, y: last.y } : { x: cx + cos*(land.rad || 200), y: cy + sin*(land.rad || 200) };
  }

  // march outward from a landmass center until we cleanly exit land into open
  // water; that last land point is a coast (harbour) spot.
  findCoastPoint(land, startAngle){
    const cx = land.cx, cy = land.cy, dirs = 32;
    for (let k = 0; k < dirs; k++){
      const a = (startAngle || 0) + (k/dirs)*Math.PI*2;
      let last = null;
      for (let rr = 0; rr < 3000; rr += 20){
        const x = cx + Math.cos(a)*rr, y = cy + Math.sin(a)*rr;
        if (Collision.checkIsland(this, x, y, 0).hit) last = { x, y, rr };
        else if (last && rr > last.rr + 60){
          const wx = cx + Math.cos(a)*(last.rr + 140), wy = cy + Math.sin(a)*(last.rr + 140);
          if (!Collision.checkIsland(this, wx, wy, 0).hit) return { x:last.x, y:last.y };   // open water beyond → good coast
          break;
        }
      }
    }
    return { x:cx, y:cy };
  }

  // ── maps + pause menu ──
  toggleMap(){
    this.mapOpen = !this.mapOpen;
    if (this.mapOpen){ this.mapFollow = true; this.mapAnim = null; this.mapCenterX = this.player.x; this.mapCenterY = this.player.y; this.mapScale = MAP_SCALE_INIT; this.mapDirty = true; }
  }
  toggleMenu(){ this.menuOpen = !this.menuOpen; }
  // pause-menu load helpers
  loadGame(){ const s = Save.read(); if (s && Save.apply(this, s)) this.flashPopup(this.player.x, this.player.y - 30, 'GAME LOADED', 0x8AAAC8); this.menuOpen = false; }
  importGame(){ Save.importFile(s => { if (s && Save.apply(this, s)){ this.flashPopup(this.player.x, this.player.y - 30, 'SAVE IMPORTED', 0x8AAAC8); } this.menuOpen = false; }); }
  // map keeps updating while you sail: follow the ship (until dragged) + key zoom
  updateMap(dts){
    // C: ease the chart back to the ship + reset zoom over MAP_RECENTER_S, then re-follow
    if (Phaser.Input.Keyboard.JustDown(this.keys.C)){ this.mapFollow = false; this.mapAnim = { sx:this.mapCenterX, sy:this.mapCenterY, ss:this.mapScale, t0:this.time.now/1000 }; }
    if (this.mapAnim){
      const p = Math.min(1, (this.time.now/1000 - this.mapAnim.t0) / MAP_RECENTER_S), e = p*p*(3 - 2*p);   // smoothstep
      this.mapCenterX = this.mapAnim.sx + (this.player.x - this.mapAnim.sx)*e;   // targets the LIVE ship (still sailing)
      this.mapCenterY = this.mapAnim.sy + (this.player.y - this.mapAnim.sy)*e;
      this.mapScale   = this.mapAnim.ss + (MAP_SCALE_INIT - this.mapAnim.ss)*e;
      if (p >= 1){ this.mapAnim = null; this.mapFollow = true; }   // done → resume following the ship
    } else if (this.mapFollow){ this.mapCenterX = this.player.x; this.mapCenterY = this.player.y; }
    if (this.keys.Z.isDown){ this.mapAnim = null; this.mapScale = Math.max(MAP_SCALE_MIN, this.mapScale*(1 - 1.6*dts)); }
    if (this.keys.X.isDown){ this.mapAnim = null; this.mapScale = Math.min(MAP_SCALE_MAX, this.mapScale*(1 + 1.6*dts)); }
    this.mapDirty = true;
  }
  // full run restart (the Reset Game menu button)
  resetGame(){
    const keepBank = (this.player && typeof this.player.bank === 'number') ? this.player.bank : 0;
    this.player = Player.create(0, 0);
    this.player.bank = keepBank;                    // banked gold survives a full reset
    this.navyStanding = 0;
    this.flag = 'neutral'; this.flagPending = null; this.flagChangeAt = 0;
    this.docked = false; this.dockPort = null; this.nearPort = null;
    this.cannonballs.length = 0; this.loot.length = 0; this.popups.length = 0;
    if (this.tows) this.tows.length = 0;                            // BUGFIX: prizes must not survive New Game
    for (const port of (this.navyPorts || [])) for (const d of (port.docks || [])){ d.occupantId = null; }   // BUGFIX: void ghost berth claims
    this.ships = []; Enemy.spawnFleet(this);
    this.explored.clear();
    this.follow.setPosition(0, 0);
    this.menuOpen = false; this.mapOpen = false;
  }

  // ── thin facade so UI / debug callers have a stable scene API ──
  navyHostile(){ return FactionSystem.navyHostile(this); }
  inCombat(){ return FlagSystem.inCombat(this); }
  requestFlag(f){ return FlagSystem.requestFlag(this, f); }
  spawnFleet(){ Enemy.spawnFleet(this); }
  flashPopup(x, y, txt, color){ this.popups.push({ x, y, txt, color, age:0, life:1.2 }); }
  // MW-14: emit a ripple at the stern every WAKE_EMIT_DIST of travel (distance-based
  // → no dt needed). Each ripple carries its spawn time + heading for the draw pass.
  pushWake(s){
    if (s.vel <= WAKE_MIN_SPEED) return;
    const sx = s.x - Math.sin(s.heading*RAD)*16, sy = s.y + Math.cos(s.heading*RAD)*16;
    const last = s.wake[s.wake.length - 1];
    if (!last || Math.hypot(sx - last.x, sy - last.y) > WAKE_EMIT_DIST){
      s.wake.push({ x: sx, y: sy, t0: this.time.now/1000, heading: s.heading });
      if (s.wake.length > WAKE_LENGTH) s.wake.shift();
    }
  }

  // ── docking (gold sinks: spend as much as you can afford; partial if short) ──
  repairAtPort(){
    const pl = this.player, need = pl.maxHull - pl.hull;
    if (need <= 0) return;
    const spend = Math.min(pl.bank, Math.ceil(need * REPAIR_COST_PER_HP));   // spend from the bank (gold is swept on dock)
    if (spend <= 0){ this.flashPopup(pl.x, pl.y, 'NO GOLD', 0xE0503A); return; }
    pl.hull = Math.min(pl.maxHull, pl.hull + spend / REPAIR_COST_PER_HP);
    pl.bank -= spend;
    this.flashPopup(pl.x, pl.y - 20, 'REPAIRED', 0x4CA84C);
  }
  restockAtPort(){
    const pl = this.player, need = pl.maxAmmo - pl.ammo;
    if (need <= 0) return;
    const units = Math.min(need, Math.floor(pl.bank / AMMO_COST_PER_UNIT));  // spend from the bank
    if (units <= 0){ this.flashPopup(pl.x, pl.y, 'NO GOLD', 0xE0503A); return; }
    pl.ammo += units; pl.bank -= units * AMMO_COST_PER_UNIT;
    this.flashPopup(pl.x, pl.y - 20, '+' + units + ' AMMO', 0xF0C840);
  }
  // sell the entire hold at this port's buy prices (gold -> bank)
  sellAllAtPort(){
    const pl = this.player, port = this.dockPort; if (!port || !pl.hold) return;
    let gold = 0, units = 0;
    for (const c of COMMODITIES){ const have = Cargo.qty(pl.hold, c); if (have > 0){ const unit = PortEconomy.buyPrice(port, c); const sold = PortEconomy.sell(this, port, c, have); units += sold; gold += sold * unit; } }
    if (units > 0) this.flashPopup(pl.x, pl.y - 20, '+' + gold + 'g SOLD', 0xF0C840);
    else this.flashPopup(pl.x, pl.y, 'NO CARGO', 0xE0503A);
  }
  // buy this port's source commodity up to capacity / affordability
  buySourceAtPort(){
    const pl = this.player, port = this.dockPort; if (!port) return;
    const c = port.sourceCommodity;
    if (!c){ this.flashPopup(pl.x, pl.y, 'NOTHING TO BUY', 0xE0503A); return; }
    const got = PortEconomy.buy(this, port, c, Cargo.free(pl.hold));
    if (got > 0) this.flashPopup(pl.x, pl.y - 20, '+' + got + ' ' + (COMMODITY_INFO[c] ? COMMODITY_INFO[c].glyph : '?'), COMMODITY_INFO[c] ? COMMODITY_INFO[c].color : 0xF0C840);
    else this.flashPopup(pl.x, pl.y, "CAN'T BUY", 0xE0503A);
  }

  // fog of war: reveal a MINIMAP_RANGE-radius circle around the ship (same coverage
  // as the minimap), stamped into FOG_CELL cells. Throttled to ~half a cell of
  // movement so it isn't re-stamped every frame.
  _revealFog(){
    const pl = this.player, R = MINIMAP_RANGE, fc = FOG_CELL;
    if (this._fogAt && Math.hypot(pl.x - this._fogAt.x, pl.y - this._fogAt.y) < fc*0.5) return;
    this._fogAt = { x: pl.x, y: pl.y };
    const R2 = R*R, before = this.explored.size;
    const f0x = Math.floor((pl.x - R)/fc), f1x = Math.floor((pl.x + R)/fc);
    const f0y = Math.floor((pl.y - R)/fc), f1y = Math.floor((pl.y + R)/fc);
    for (let fy = f0y; fy <= f1y; fy++) for (let fx = f0x; fx <= f1x; fx++){
      const dx = (fx + 0.5)*fc - pl.x, dy = (fy + 0.5)*fc - pl.y;
      if (dx*dx + dy*dy <= R2) this.explored.add(fx + ',' + fy);
    }
    if (this.mapOpen && this.explored.size !== before) this.mapDirty = true;   // refresh an open chart live
  }

  update(time, delta){
    const dt = Math.min(delta, 50)/(1000/60);      // frame-normalized step (cap prevents tunneling)
    const dts = delta/1000;                        // seconds elapsed this frame
    const pl = this.player;
    if (DEBUG.infAmmo) pl.ammo = pl.maxAmmo;
    if (DEBUG.infGold) pl.bank = Math.max(pl.bank || 0, 1e7);   // dev: infinite gold

    // ── dev-log + achievements-list toggles (work anytime, even docked / paused) ──
    if (Phaser.Input.Keyboard.JustDown(this.keys.L) && this.devlog) this.devlog.on = !this.devlog.on;
    if (Phaser.Input.Keyboard.JustDown(this.keys.J)) this.achOpen = !this.achOpen;

    // ── overlay toggles (M = map, Esc = pause menu); not while docked ──
    if (!this.docked){
      if (!this.menuOpen && Phaser.Input.Keyboard.JustDown(this.keys.M)) this.toggleMap();
      if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)){ if (this.mapOpen) this.mapOpen = false; else this.toggleMenu(); }
    }

    // ── pause menu: world frozen; buttons handled in UIScene ──
    if (this.menuOpen){ this.draw(); return; }
    // (the big map does NOT pause — sailing continues; it's handled after the sim)

    // ── docked: world is frozen; F departs, 1/2 buy ──
    if (this.docked){
      if (Phaser.Input.Keyboard.JustDown(this.keys.F)){ this.docked = false; this.dockPort = null; }
      if (Phaser.Input.Keyboard.JustDown(this.keys.V)) this.swapToPrize();   // AUD-3: dock-menu [V] swap (RULED a: docked too)
      else if (Phaser.Input.Keyboard.JustDown(this.keys.ONE)) this.repairAtPort();
      else if (Phaser.Input.Keyboard.JustDown(this.keys.TWO)) this.restockAtPort();
      else if (Phaser.Input.Keyboard.JustDown(this.keys.THREE)) this.sellAllAtPort();
      else if (Phaser.Input.Keyboard.JustDown(this.keys.FOUR)) this.buySourceAtPort();
      else if (Phaser.Input.Keyboard.JustDown(this.keys.FIVE) && typeof CrewSystem !== 'undefined') CrewSystem.hireOne(this, this.dockPort);
      else if (Phaser.Input.Keyboard.JustDown(this.keys.SIX)   && typeof UpgradeSystem !== 'undefined') UpgradeSystem.buySail(this);
      else if (Phaser.Input.Keyboard.JustDown(this.keys.SEVEN) && typeof UpgradeSystem !== 'undefined') UpgradeSystem.buyCannon(this);
      else if (Phaser.Input.Keyboard.JustDown(this.keys.EIGHT) && typeof UpgradeSystem !== 'undefined') UpgradeSystem.buyShip(this);
      else if (Phaser.Input.Keyboard.JustDown(this.keys.NINE)  && typeof HireSystem !== 'undefined') HireSystem.hireAtDock(this);
      else if (Phaser.Input.Keyboard.JustDown(this.keys.ZERO)  && typeof BountySystem !== 'undefined') BountySystem.acceptAtDock(this);
      this.draw();                                   // keep the (frozen) world visible behind the menu
      return;
    }

    if (pl.hull > 0){
      const T = (typeof TouchInput !== 'undefined') ? TouchInput : null;
      if (Phaser.Input.Keyboard.JustDown(this.keys.W)) pl.sailState = Math.min(2, pl.sailState + 1);
      if (Phaser.Input.Keyboard.JustDown(this.keys.S)) pl.sailState = Math.max(0, pl.sailState - 1);
      if (T && T.justDown('sailCycle')) pl.sailState = (pl.sailState + 1) % 3;   // MW-9: half → full → down → …
      if (Phaser.Input.Keyboard.JustDown(this.keys.Q) || (T && T.justDown('cannonL'))) Combat.fire(this, pl, 'port');
      if (Phaser.Input.Keyboard.JustDown(this.keys.E) || (T && T.justDown('cannonR'))) Combat.fire(this, pl, 'star');
      if (Phaser.Input.Keyboard.JustDown(this.cursors.space)){ Combat.fire(this, pl, 'port'); Combat.fire(this, pl, 'star'); }   // spacebar = full broadside (both sides)
      // bow/stern chaser guns (only mounted on Brig+ / Galleon+); no-op at lower tiers
      if (Phaser.Input.Keyboard.JustDown(this.cursors.up)   || (T && T.justDown('fireBow')))   Combat.fireChaser(this, pl, 'bow');
      if (Phaser.Input.Keyboard.JustDown(this.cursors.down) || (T && T.justDown('fireStern'))) Combat.fireChaser(this, pl, 'stern');
      // B: capture — shell a port/ship below its threshold, then press B (port-capture wins if both are in range)
      if (Phaser.Input.Keyboard.JustDown(this.keys.B)){
        let consumed = (typeof PortCaptureSystem !== 'undefined') && PortCaptureSystem.tryCapture(this);
        if (!consumed && typeof BoardingSystem !== 'undefined') BoardingSystem.tryBoard(this);
      }
      // CQ (doc): SPACE fires BOTH broadsides — each side still honors its own cooldown/ammo
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)){ Combat.fire(this, pl, 'port'); Combat.fire(this, pl, 'star'); }
      // SW1: V (or the touch swap button) — make the towed prize your flagship
      if (Phaser.Input.Keyboard.JustDown(this.keys.V) ||
          (typeof TouchInput !== 'undefined' && TouchInput.active && TouchInput.justDown('swapPrize'))) this.swapToPrize();
      // DEV: cycle ship tier (until a real buy/capture progression exists)
      if (Phaser.Input.Keyboard.JustDown(this.keys.T) && typeof ShipTiers !== 'undefined'){
        ShipTiers.setTier(this, pl, (pl.tier % TIER_MAX) + 1);
        this.flashPopup(pl.x, pl.y - 32, '⚓ ' + ShipTiers.get(pl.tier).name.toUpperCase(), 0x6ED0E0);
      }
      const td = calcTurnDegS(pl.vel)*dts;
      if (this.cursors.left.isDown  || this.keys.A.isDown) pl.heading = (pl.heading - td + 360)%360;
      if (this.cursors.right.isDown || this.keys.D.isDown) pl.heading = (pl.heading + td)%360;
      // MW-7: finger-drag axis scales the SAME locked turn rate (never exceeds it)
      { const ax = (T && T.active) ? T.steerAxis() : 0;
        if (ax !== 0) pl.heading = (pl.heading + td*ax + 360)%360; }
      const wa = windOff(pl.heading, WindSystem.dirAt(this, pl.x, pl.y));
      const wMult = (typeof WeatherSystem !== 'undefined') ? WeatherSystem.speedMult(this) : 1;   // rain slow (1 otherwise)
      const cMult = (typeof crewSpeedMult !== 'undefined') ? crewSpeedMult(pl) : 1;               // crew bonus / understaffed penalty
      const uMult = (typeof UpgradeSystem !== 'undefined') ? UpgradeSystem.speedMult(this) : 1;   // sail-material upgrade
      const tgt = calcTargetSpeed(wa)*SAIL_MULTIPLIERS[pl.sailState]*wMult*cMult*uMult*hullSpeedMult(pl);   // CQ: battered hull slows, then stops (regen recovers you)
      pl.vel += (tgt - pl.vel)*Math.min((tgt > pl.vel ? P.accel : P.decel)*dt, 1);
      Collision.moveShip(this, pl, dt);
      // reefs: drag + periodic hull damage while grounded (they don't block, they hurt)
      if (Collision.checkReef(this, pl.x, pl.y)){
        pl.vel *= 0.85;
        const now = this.time.now/1000;
        if (now - (this._lastReefAt || -99) > REEF_DAMAGE_INTERVAL){ pl.hull = Math.max(0, pl.hull - REEF_DAMAGE); this._lastReefAt = now; this.flashPopup(pl.x, pl.y - 20, 'REEF!', 0xE0503A); }
      }
      if (pl.fire.port > 0) pl.fire.port -= dts; if (pl.fire.star > 0) pl.fire.star -= dts;
      if (pl.fire.bow > 0) pl.fire.bow -= dts; if (pl.fire.stern > 0) pl.fire.stern -= dts;   // chaser cooldowns
      this.follow.setPosition(pl.x, pl.y);
      this.pushWake(pl);
    }

    Chunks.update(this);                           // stream terrain in/out around the player
    this._revealFog();                             // fog-of-war: reveal a MINIMAP_RANGE circle around the ship

    // dock proximity + enter (F). Ports are navy-controlled: no docking while
    // WANTED or mid-combat — recover standing / break off first.
    this.nearPort = null;
    if (pl.hull > 0){
      let best = DOCK_RADIUS;
      for (const p of this.navyPorts){ const dd = Math.hypot(pl.x - p.x, pl.y - p.y); if (dd < best){ best = dd; this.nearPort = p; } }
      // MB3-3: the touch ACCESS-PORT button (shown only in dock range) fires the
      // exact same path as F — same WANTED / in-combat guards, same save sweep.
      const dockPressed = Phaser.Input.Keyboard.JustDown(this.keys.F) ||
        (typeof TouchInput !== 'undefined' && TouchInput.active && TouchInput.justDown('dockPort'));
      if (this.nearPort && dockPressed){
        if (this.navyHostile()) this.flashPopup(pl.x, pl.y, 'PORT CLOSED — WANTED', 0xE0503A);
        // CQ (doc): YOUR OWN port never turns you away mid-fight — safe harbor
        else if (this.inCombat() && this.nearPort.owner !== 'player') this.flashPopup(pl.x, pl.y, "CAN'T DOCK IN COMBAT", 0xE0503A);
        else if (pl.vel > DOCK_MAX_VEL) this.flashPopup(pl.x, pl.y, 'TOO FAST TO DOCK — SLOW DOWN', 0xE0A040);   // CQ: require slow speed
        else { this.docked = true; this.dockPort = this.nearPort; pl.vel = 0; this.events.emit(EV.DOCK_ENTERED, { port: this.nearPort }); Systems.onDock(this, this.nearPort); if (Save.write(this)) this.flashPopup(pl.x, pl.y - 40, 'GAME SAVED', 0x8AAAC8); }   // sweep gold->bank, then auto-save
      }
    }

    FactionSystem.recoverStanding(this, dts);
    FlagSystem.resolveFlag(this);

    // capped out-of-combat hull regen: heals only the bottom REGEN_CAP_PCT of
    // max hull, only when not hit for REGEN_OUT_OF_COMBAT_DELAY_S (§12)
    if (pl.hull > 0){
      const cap = pl.maxHull*P.regenCap/100;
      const outOfCombat = (this.time.now/1000 - pl.lastHitAt) > P.regenDelay;
      if (outOfCombat && pl.hull < cap){ pl.hull = Math.min(cap, pl.hull + P.regenRate*dts); }
    }

    for (const s of this.ships){ if (s.alive) AI.update(this, s, dt, dts); }
    Collision.resolveShipCollisions(this);
    Combat.updateCannonballs(this, dt);
    Combat.updateLoot(this, dts);
    for (let i = this.popups.length - 1; i >= 0; i--){ this.popups[i].age += dts; this.popups[i].y -= 12*dts; if (this.popups[i].age > this.popups[i].life) this.popups.splice(i, 1); }
    if (DEBUG.ring.active){ DEBUG.ring.age += dts; if (DEBUG.ring.age > 2.2) DEBUG.ring.active = false; }

    if (this.mapOpen) this.updateMap(dts);         // live chart while sailing (non-pausing)

    Systems.update(this, dt, dts);                 // feature systems (bank, ...) run late, before draw
    this.draw();
  }

  // ── SW1: make the captured prize your flagship (doc: keep-captured-ship) ──
  // RULED: works both at sea and while docked (V key / touch button); the OLD
  // ship becomes the towed prize (role swap); blocked with a warning if your
  // crew is below the prize's min-to-operate; gold (on you), cargo (hold
  // travels, capacity re-set by tier), and crew carry over — upgrades stay
  // with each HULL (snapshot on the tow, restored if you swap back).
  swapToPrize(){
    const pl = this.player;
    const tow = (this.tows && this.tows.length) ? this.tows[this.tows.length - 1] : null;
    if (!tow){ this.flashPopup(pl.x, pl.y - 30, 'NO CAPTURED PRIZE IN TOW', 0xE0503A); return; }
    const spec = ShipTiers.get(tow.tier || 1);
    if (pl.crew < spec.minCrew){                                     // RULED c: block, prize stays a tow
      this.flashPopup(pl.x, pl.y - 30, 'NEED ' + spec.minCrew + ' CREW TO SAIL THE ' + spec.name.toUpperCase() + ' — STAYS IN TOW', 0xE0503A);
      return;
    }
    const t = this.time.now/1000;
    const keptCrew = Math.min(pl.crew, spec.maxCrew), lost = pl.crew - keptCrew;
    if (!this._swapArm || t - this._swapArm > 4){                    // two-press confirm (4s window)
      this._swapArm = t;
      this.flashPopup(pl.x, pl.y - 30, 'BOARD THE ' + spec.name.toUpperCase() + '? PRESS AGAIN' + (lost > 0 ? ' — ' + lost + ' CREW WON\'T FIT (FLAG-9)' : ''), 0xF0C840);
      return;
    }
    this._swapArm = 0;
    // snapshot the old hull, then trade roles in place
    const old = { tier: pl.tier, hull: pl.hull, upgrades: pl.upgrades, hold: pl.hold };
    pl.tier = tow.tier || 1;
    pl.upgrades = tow.upgrades || null;                              // RULED d: hull keeps its own upgrades (enemy hulls: none)
    pl.hull = tow.hull;
    pl.hold = tow.hold || null;
    ShipTiers.apply(this, pl, false);                                // clamps hull/ammo/crew, re-caps the hold to the new tier
    if (typeof UpgradeSystem !== 'undefined' && UpgradeSystem.init) UpgradeSystem.init(this);   // re-seed the slice if the new hull had none
    pl.crew = keptCrew;                                              // RULED: crew carries (FLAG-9: overflow is lost)
    // gold never moves — it's on the player, not the hull (RULED: gold carries)
    tow.tier = old.tier; tow.hull = old.hull; tow.upgrades = old.upgrades; tow.hold = old.hold;
    ShipTiers.apply(this, tow, false); tow.crew = 0;                 // tows stay crewless
    this.flashPopup(pl.x, pl.y - 30, '⚓ FLAGSHIP: ' + spec.name.toUpperCase(), 0x6ED0E0);
    this.events.emit('ship-tier-changed', { ship: pl, tier: pl.tier });
  }

  draw(){
    const gw = this.gfxWorld; gw.clear();
    // MW-14: each ripple is a pair of short arcs flanking the travel line — they
    // widen and fade over WAKE_RIPPLE_LIFE_S (the surf-ripple read). PLACEHOLDER shape.
    const nowS = this.time.now/1000;
    const drawWake = (s, col) => {
      for (const r of s.wake){
        const a = (nowS - r.t0) / WAKE_RIPPLE_LIFE_S;
        if (!(a >= 0 && a < 1)) continue;                       // also skips old-format entries safely
        const grow = 4 + a*11, alpha = 0.34 * (1 - a);
        const px = Math.cos(r.heading*RAD), py = Math.sin(r.heading*RAD);   // perpendicular to travel
        // MB3-4: the arc sweep must ROTATE with the ripple's heading — it was a
        // fixed 0..π / π..2π (screen axes), so the half-circles only faced the
        // right way for east/west travel and flipped inside-out elsewhere. φ is
        // the travel direction in canvas-arc angle terms; each arc now bulges
        // AWAY from the travel line (surf spreading outward) at every heading.
        const phi = r.heading*RAD - Math.PI/2;
        gw.lineStyle(1.5, col, alpha);
        gw.beginPath(); gw.arc(r.x + px*grow*0.7, r.y + py*grow*0.7, grow, phi, phi + Math.PI); gw.strokePath();
        gw.beginPath(); gw.arc(r.x - px*grow*0.7, r.y - py*grow*0.7, grow, phi + Math.PI, phi + TAU); gw.strokePath();
      }
    };
    drawWake(this.player, 0xCFE8F5);
    for (const s of this.ships) if (s.alive) drawWake(s, 0xA8C0D0);
    // loot
    for (const l of this.loot){ const fade = l.age > l.life - 2 ? (l.life - l.age)/2 : 1; gw.fillStyle(0xF0C840, 0.85*fade); gw.fillCircle(l.x, l.y, 7); gw.lineStyle(2, 0xF0C840, 0.4*fade); gw.strokeCircle(l.x, l.y, 12); }
    // debug range ring (world space, centered on player)
    if (DEBUG.ring.active && this.player.hull > 0){
      const fade = 1 - DEBUG.ring.age/2.2;
      gw.lineStyle(2, 0xF0C840, 0.5*fade); gw.strokeCircle(this.player.x, this.player.y, DEBUG.ring.radius);
      gw.lineStyle(1, 0xF0C840, 0.25*fade); gw.lineBetween(this.player.x, this.player.y, this.player.x + DEBUG.ring.radius, this.player.y);
    }
    // ships
    const gs = this.gfxShips; gs.clear();
    for (const s of this.ships) if (s.alive) this.drawShip(gs, s);
    for (const s of (this.tows || [])) this.drawShip(gs, s);   // captured prizes trailing the player (drawn as real hulls, not a blob)
    if (this.player.hull > 0) this.drawShip(gs, this.player);
    // cannonballs
    const gf = this.gfxFx; gf.clear(); gf.fillStyle(0x201810, 1);
    for (const b of this.cannonballs){ gf.fillCircle(b.x, b.y, 3); }

    // MB2-5: muzzle flashes — tiny burst at the firing cannon's mouth, computed
    // from the ship's CURRENT pos/heading so it rides a moving hull. Core disc +
    // 3 short spikes fanned around the fire angle; shrinks + fades over
    // MUZZLE_FLASH_LIFE. Expired entries are pruned in the same pass.
    if (this.muzzleFlashes && this.muzzleFlashes.length){
      for (let i = this.muzzleFlashes.length - 1; i >= 0; i--){
        const f = this.muzzleFlashes[i], a = (nowS - f.t0) / MUZZLE_FLASH_LIFE;
        if (a >= 1 || !f.ship){ this.muzzleFlashes.splice(i, 1); continue; }
        const mx = f.ship.x + Math.sin(f.fa*RAD) * MUZZLE_OFFSET;
        const my = f.ship.y - Math.cos(f.fa*RAD) * MUZZLE_OFFSET;
        const k = 1 - a, r = MUZZLE_FLASH_R * (0.6 + 0.4*k);       // slight shrink over life
        gf.fillStyle(0xFFE9A0, 0.9*k); gf.fillCircle(mx, my, r*0.55);          // hot core
        gf.lineStyle(2, 0xF0A030, 0.8*k);                                      // orange spikes
        for (const off of [-28, 0, 28]){
          const th = (f.fa + off) * RAD;
          gf.lineBetween(mx, my, mx + Math.sin(th)*r*1.7, my - Math.cos(th)*r*1.7);
        }
      }
    }

    Systems.draw(this, gw);                          // feature overlays draw on the world layer
  }

  drawShip(g, s){
    const colors = {
      player:[0x7A4E28, 0xC08840], merchant:[0xB89A60, 0xD0AA70],
      pirate:[0x5A2010, 0x7A3020], navy:[0x24506E, 0x3E7AA0], privateer:[0x2B5A2B, 0x46863C],
      prize:[0x5F5A4E, 0x918A72],   // captured empty hull (weathered) — trailed as a tow
    }[s.faction] || [0x5F5A4E, 0x918A72];
    g.save(); g.translateCanvas(s.x, s.y); g.rotateCanvas(s.heading*RAD);
    const sc = s.scale || 1; g.scaleCanvas(sc, sc);                      // tier visual size
    g.fillStyle(colors[0], 1); g.fillEllipse(0, 0, 20, 40);
    g.fillStyle(colors[1], 1); g.fillEllipse(0, 2, 13, 30);
    // MW-15: dull-red overlay fading out over HIT_FLASH_S after a hit
    { const fs = this.time.now/1000 - (s.lastHitAt || -99);
      if (fs >= 0 && fs < HIT_FLASH_S){ g.fillStyle(0xB03028, 0.55 * (1 - fs/HIT_FLASH_S)); g.fillEllipse(0, 0, 20, 40); } }
    g.lineStyle(2.5, 0x2A1404, 1); g.lineBetween(-11, -3, 11, -3); g.lineBetween(0, -18, 0, -26);
    // sails — one per mast (count from tier; default 1), stacked toward the bow
    if (s.sailState > 0){
      const h = s.sailState === 2 ? 18 : 10, nS = Math.max(1, s.sails || 1);
      g.fillStyle(0xD4C48C, 0.9);
      for (let m = 0; m < nS; m++){ g.fillRect(-9, -3 - m*(h + 6), 18, h); }
    }
    g.fillStyle(0x2A1404, 1); g.fillCircle(0, -3, 3.5);
    // bow / stern chaser muzzles (only on tiers that mount them)
    if (typeof ShipTiers !== 'undefined'){
      g.fillStyle(0x15100A, 1);
      if (ShipTiers.has(s, 'bow'))   g.fillRect(-2, -22, 4, 6);          // forward muzzle
      if (ShipTiers.has(s, 'stern')) g.fillRect(-2, 16, 4, 6);           // aft muzzle
    }
    // stern flagpole + flag (local coords: stern is +y / downward)
    let flagColor = null;
    if (s.faction === 'player'){ flagColor = this.flag === 'pirate' ? 0x101010 : null; }
    else if (s.faction === 'pirate'){ flagColor = 0x101010; }
    else if (s.faction === 'navy'){ flagColor = 0x3E7AA0; }
    else if (s.faction === 'privateer'){ flagColor = 0x46863C; }
    g.lineStyle(1.5, 0x2A1404, 1); g.lineBetween(0, 18, 0, 28);
    if (flagColor !== null){ g.fillStyle(flagColor, 1); g.fillRect(0, 18, 9, 6);
      if (flagColor === 0x101010){ g.fillStyle(0xD4D4D4, 1); g.fillCircle(4.5, 21, 1.4); }   // skull dot for pirate colors
    }
    // pending flag: draw it half-raised + faint to show it's changing
    if (s.faction === 'player' && this.flagPending !== null){
      const pc = this.flagPending === 'pirate' ? 0x101010 : 0xB89A60;
      g.fillStyle(pc, 0.4); g.fillRect(0, 23, 8, 5);
    }
    g.restore();
    // hull bar for damaged ships
    if (s.hull < s.maxHull){ const w = 22, pct = Math.max(0, s.hull/s.maxHull);
      g.fillStyle(0x000000, 0.5); g.fillRect(s.x - w/2, s.y - 32, w, 3);
      g.fillStyle(pct < 0.35 ? 0xE0503A : 0x4CA84C, 1); g.fillRect(s.x - w/2, s.y - 32, w*pct, 3); }
  }
}
