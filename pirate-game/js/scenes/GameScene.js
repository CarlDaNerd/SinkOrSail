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
    this.mapOpen = false; this.mapDirty = false;        // big map (M) — non-pausing chart
    this.mapFollow = true;                              // chart tracks the ship until you drag it
    this.mapCenterX = 0; this.mapCenterY = 0; this.mapScale = MAP_SCALE_INIT;
    Chunks.init(this);                                 // stream terrain around the player
    this.navyPorts = this.placeStartPorts();
    Island.drawPortMarkers(this);
    this.ships = []; Enemy.spawnFleet(this);

    this.gfxWorld = this.add.graphics().setDepth(4);   // wakes, loot
    this.gfxShips = this.add.graphics().setDepth(10);
    this.gfxFx    = this.add.graphics().setDepth(11);   // cannonballs
    this.follow = this.add.rectangle(this.player.x, this.player.y, 1, 1, 0, 0);
    this.cameras.main.startFollow(this.follow, true, 0.08, 0.08);
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,Q,E,F,ESC,ONE,TWO,THREE,FOUR,M,Z,X,B');
    this.input.on('wheel', (p, over, dx, dy) => { if (!this.mapOpen) return; this.mapScale = Phaser.Math.Clamp(this.mapScale * (dy < 0 ? 1.12 : 0.892), MAP_SCALE_MIN, MAP_SCALE_MAX); this.mapDirty = true; });
    this.input.on('pointermove', (p) => { if (!this.mapOpen || !p.isDown) return; this.mapFollow = false; this.mapCenterX -= (p.position.x - p.prevPosition.x)/this.mapScale; this.mapCenterY -= (p.position.y - p.prevPosition.y)/this.mapScale; this.mapDirty = true; });

    this.missions = new MissionLoader(this); this.missions.scan();

    // continuing a saved run? apply it now that the scene is fully built
    if (data && data.load){ const s = Save.read(); if (s) Save.apply(this, s); }

    registerSystems();        // declare active feature systems (core/SystemRegistry.js)
    Systems.init(this);       // each feature sets up its own scene.<slice>
  }

  // Anchor two ports on the COAST of the nearest large landmasses to origin (the
  // starter mainland is guaranteed near origin). Ports sit at the water's edge so
  // you can actually sail up and dock. (Per-mainland ports across the world come
  // with the AI-streaming phase.)
  placeStartPorts(){
    const NAMES = ['Port Royal', 'Tortuga'];
    const TYPES = ['TradingHub', 'LumberYard'];
    const slotsForType = (type) => { const s = PORT_TYPES[type].slots; return s[0] + Math.floor(this.eprng() * (s[1] - s[0] + 1)); };
    const mk = (x, y, i) => { const p = new Port(x, y, NAMES[i], slotsForType(TYPES[i])); PortEconomy.assignType(p, TYPES[i], this.eprng); return p; };
    const larges = this.islands.filter(is => is.mainland && Math.hypot(is.cx, is.cy) < 9000)
                       .sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy));
    const ports = [];
    for (const land of larges){ if (ports.length >= 2) break; const cp = this.findCoastPoint(land, 0); ports.push(mk(cp.x, cp.y, ports.length)); }
    if (ports.length === 1){ const cp = this.findCoastPoint(larges[0], Math.PI); ports.push(mk(cp.x, cp.y, 1)); }  // 2nd harbour on the far coast
    const fb = [{ x:1900, y:-1400 }, { x:-1500, y:1500 }];
    while (ports.length < 2){ const p = fb[ports.length]; ports.push(mk(p.x, p.y, ports.length)); }
    return ports;
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
    if (this.mapOpen){ this.mapFollow = true; this.mapCenterX = this.player.x; this.mapCenterY = this.player.y; this.mapScale = MAP_SCALE_INIT; this.mapDirty = true; }
  }
  toggleMenu(){ this.menuOpen = !this.menuOpen; }
  // pause-menu load helpers
  loadGame(){ const s = Save.read(); if (s && Save.apply(this, s)) this.flashPopup(this.player.x, this.player.y - 30, 'GAME LOADED', 0x8AAAC8); this.menuOpen = false; }
  importGame(){ Save.importFile(s => { if (s && Save.apply(this, s)){ this.flashPopup(this.player.x, this.player.y - 30, 'SAVE IMPORTED', 0x8AAAC8); } this.menuOpen = false; }); }
  // map keeps updating while you sail: follow the ship (until dragged) + key zoom
  updateMap(dts){
    if (this.mapFollow){ this.mapCenterX = this.player.x; this.mapCenterY = this.player.y; }
    if (this.keys.Z.isDown) this.mapScale = Math.max(MAP_SCALE_MIN, this.mapScale*(1 - 1.6*dts));
    if (this.keys.X.isDown) this.mapScale = Math.min(MAP_SCALE_MAX, this.mapScale*(1 + 1.6*dts));
    this.mapDirty = true;
  }
  // full run restart (the Reset Game menu button)
  resetGame(){
    this.player = Player.create(0, 0);
    this.navyStanding = 0;
    this.flag = 'neutral'; this.flagPending = null; this.flagChangeAt = 0;
    this.docked = false; this.dockPort = null; this.nearPort = null;
    this.cannonballs.length = 0; this.loot.length = 0; this.popups.length = 0;
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
  pushWake(s){ if (s.vel > WAKE_MIN_SPEED){ s.wake.push({ x:s.x - Math.sin(s.heading*RAD)*16, y:s.y + Math.cos(s.heading*RAD)*16 }); if (s.wake.length > WAKE_LENGTH) s.wake.shift(); } }

  // ── docking (gold sinks: spend as much as you can afford; partial if short) ──
  repairAtPort(){
    const pl = this.player, need = pl.maxHull - pl.hull;
    if (need <= 0) return;
    const spend = Math.min((pl.bank||0), Math.ceil(need * REPAIR_COST_PER_HP));
    if (spend <= 0){ this.flashPopup(pl.x, pl.y, 'NO GOLD', 0xE0503A); return; }
    pl.hull = Math.min(pl.maxHull, pl.hull + spend / REPAIR_COST_PER_HP);
    pl.bank -= spend;
    this.flashPopup(pl.x, pl.y - 20, 'REPAIRED', 0x4CA84C);
  }
  restockAtPort(){
    const pl = this.player, need = pl.maxAmmo - pl.ammo;
    if (need <= 0) return;
    const units = Math.min(need, Math.floor((pl.bank||0) / AMMO_COST_PER_UNIT));
    if (units <= 0){ this.flashPopup(pl.x, pl.y, 'NO GOLD', 0xE0503A); return; }
    pl.ammo += units; pl.bank -= units * AMMO_COST_PER_UNIT;
    this.flashPopup(pl.x, pl.y - 20, '+' + units + ' AMMO', 0xF0C840);
  }
  // sell the entire hold at this port's buy prices (gold -> bank)
  sellAllAtPort(){
    const pl = this.player, port = this.dockPort; if (!port || !pl.hold) return;
    let goldGained = 0, unitsSold = 0;
    for (const c of COMMODITIES){ const have = Cargo.qty(pl.hold, c); if (have > 0){ const unit = PortEconomy.buyPrice(port, c); const sold = PortEconomy.sell(this, port, c, have); unitsSold += sold; goldGained += sold * unit; } }
    if (unitsSold > 0) this.flashPopup(pl.x, pl.y - 20, '+' + goldGained + 'g SOLD', 0xF0C840);
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

  update(time, delta){
    const dt = Math.min(delta, 50)/(1000/60);      // frame-normalized step (cap prevents tunneling)
    const dts = delta/1000;                        // seconds elapsed this frame
    const pl = this.player;
    if (DEBUG.infAmmo) pl.ammo = pl.maxAmmo;

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
      if (Phaser.Input.Keyboard.JustDown(this.keys.F)){ if (this.dockPort) Docks.release(this, this.dockPort, this.player); this.docked = false; this.dockPort = null; }
      else if (Phaser.Input.Keyboard.JustDown(this.keys.ONE)) this.repairAtPort();
      else if (Phaser.Input.Keyboard.JustDown(this.keys.TWO)) this.restockAtPort();
      else if (Phaser.Input.Keyboard.JustDown(this.keys.THREE)) this.sellAllAtPort();
      else if (Phaser.Input.Keyboard.JustDown(this.keys.FOUR)) this.buySourceAtPort();
      this.draw();                                   // keep the (frozen) world visible behind the menu
      return;
    }

    if (pl.hull > 0 && !(typeof BoardingSystem !== 'undefined' && BoardingSystem.isPinned(this))){
      if (Phaser.Input.Keyboard.JustDown(this.keys.W)) pl.sailState = Math.min(2, pl.sailState + 1);
      if (Phaser.Input.Keyboard.JustDown(this.keys.S)) pl.sailState = Math.max(0, pl.sailState - 1);
      if (Phaser.Input.Keyboard.JustDown(this.keys.Q)) Combat.fire(this, pl, 'port');
      if (Phaser.Input.Keyboard.JustDown(this.keys.B)){
        let used = false;
        if (typeof PortCaptureSystem !== 'undefined') used = PortCaptureSystem.tryCapture(this);
        if (!used && typeof BoardingSystem !== 'undefined') used = BoardingSystem.tryBoard(this);
        if (!used) this.flashPopup(pl.x, pl.y, 'NOTHING TO CAPTURE', 0xE0503A);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.E)) Combat.fire(this, pl, 'star');
      const td = calcTurnDegS(pl.vel)*dts;
      if (this.cursors.left.isDown  || this.keys.A.isDown) pl.heading = (pl.heading - td + 360)%360;
      if (this.cursors.right.isDown || this.keys.D.isDown) pl.heading = (pl.heading + td)%360;
      const wa = windOff(pl.heading, P.windFrom);
      const weatherMult = (typeof WeatherSystem !== 'undefined' && this.weather) ? WeatherSystem.speedMult(this) : 1;
      const crewMult = (typeof crewSpeedMult !== 'undefined') ? crewSpeedMult(pl) : 1;
      const tgt = calcTargetSpeed(wa)*SAIL_MULTIPLIERS[pl.sailState]*weatherMult*crewMult;
      pl.vel += (tgt - pl.vel)*Math.min((tgt > pl.vel ? P.accel : P.decel)*dt, 1);
      Collision.moveShip(this, pl, dt);
      // reefs: drag + periodic hull damage while grounded (they don't block, they hurt)
      if (Collision.checkReef(this, pl.x, pl.y)){
        pl.vel *= 0.85;
        const now = this.time.now/1000;
        if (now - (this._lastReefAt || -99) > REEF_DAMAGE_INTERVAL){ pl.hull = Math.max(0, pl.hull - REEF_DAMAGE); this._lastReefAt = now; this.flashPopup(pl.x, pl.y - 20, 'REEF!', 0xE0503A); }
      }
      if (pl.fire.port > 0) pl.fire.port -= dts; if (pl.fire.star > 0) pl.fire.star -= dts;
      this.follow.setPosition(pl.x, pl.y);
      this.pushWake(pl);
    }

    Chunks.update(this);                           // stream terrain in/out around the player
    for (const k of this._chunks.keys()) this.explored.add(k);   // remember where you've sailed (big-map fog)

    // dock proximity + enter (F). Ports are navy-controlled: no docking while
    // WANTED or mid-combat — recover standing / break off first.
    this.nearPort = null;
    if (pl.hull > 0){
      let best = DOCK_RADIUS;
      for (const p of this.navyPorts){ const dd = Math.hypot(pl.x - p.x, pl.y - p.y); if (dd < best){ best = dd; this.nearPort = p; } }
      if (this.nearPort && Phaser.Input.Keyboard.JustDown(this.keys.F)){
        const mine = this.nearPort.owner === 'player';
        if (this.navyHostile() && !mine) this.flashPopup(pl.x, pl.y, 'PORT CLOSED — WANTED', 0xE0503A);
        else if (this.inCombat()) this.flashPopup(pl.x, pl.y, "CAN'T DOCK IN COMBAT", 0xE0503A);
        else if (Docks.isFull(this.nearPort)) this.flashPopup(pl.x, pl.y, 'DOCKS FULL', 0xE0503A);
        else { Docks.occupy(this, this.nearPort, pl); this.docked = true; this.dockPort = this.nearPort; pl.vel = 0; this.events.emit(EV.DOCK_ENTERED, { port: this.nearPort }); Systems.onDock(this, this.nearPort); if (Save.write(this)) this.flashPopup(pl.x, pl.y - 40, 'GAME SAVED', 0x8AAAC8); }   // auto-save on docking
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

    for (const s of this.ships){ if (s.alive && !s.beingTowed) AI.update(this, s, dt, dts); }
    Collision.resolveShipCollisions(this);
    Combat.updateCannonballs(this, dt);
    Combat.updateLoot(this, dts);
    for (let i = this.popups.length - 1; i >= 0; i--){ this.popups[i].age += dts; this.popups[i].y -= 12*dts; if (this.popups[i].age > this.popups[i].life) this.popups.splice(i, 1); }
    if (DEBUG.ring.active){ DEBUG.ring.age += dts; if (DEBUG.ring.age > 2.2) DEBUG.ring.active = false; }

    Systems.update(this, dt, dts);   // feature systems (weather, bounties, bank, zoom, ...) run late

    if (this.mapOpen) this.updateMap(dts);         // live chart while sailing (non-pausing)
    this.draw();
  }

  draw(){
    const gw = this.gfxWorld; gw.clear();
    // wakes
    const drawWake = (s, col) => { if (s.wake.length < 2) return; gw.lineStyle(2, col, 0.28); for (let i = 1; i < s.wake.length; i += 2){ const a = s.wake[i - 1], b = s.wake[i]; gw.lineBetween(a.x, a.y, b.x, b.y); } };
    drawWake(this.player, 0xA0CCD8);
    for (const s of this.ships) if (s.alive && !s.beingTowed) drawWake(s, 0x88AABB);
    // loot
    for (const l of this.loot){ const fade = l.age > l.life - 2 ? (l.life - l.age)/2 : 1; const lc = (l.kind === 'commodity' && COMMODITY_INFO[l.commodity]) ? COMMODITY_INFO[l.commodity].color : 0xF0C840; gw.fillStyle(lc, 0.85*fade); gw.fillCircle(l.x, l.y, 7); gw.lineStyle(2, lc, 0.4*fade); gw.strokeCircle(l.x, l.y, 12); }
    // debug range ring (world space, centered on player)
    if (DEBUG.ring.active && this.player.hull > 0){
      const fade = 1 - DEBUG.ring.age/2.2;
      gw.lineStyle(2, 0xF0C840, 0.5*fade); gw.strokeCircle(this.player.x, this.player.y, DEBUG.ring.radius);
      gw.lineStyle(1, 0xF0C840, 0.25*fade); gw.lineBetween(this.player.x, this.player.y, this.player.x + DEBUG.ring.radius, this.player.y);
    }
    // ships
    const gs = this.gfxShips; gs.clear();
    for (const s of this.ships) if (s.alive && !s.beingTowed) this.drawShip(gs, s);
    if (this.player.hull > 0) this.drawShip(gs, this.player);
    // cannonballs
    const gf = this.gfxFx; gf.clear(); gf.fillStyle(0x201810, 1);
    for (const b of this.cannonballs){ gf.fillCircle(b.x, b.y, 3); }
    Island.drawPortMarkers(this);    // refresh dock-slot occupancy markers
    Systems.draw(this, gw);          // feature overlays (weather, boarding, defense, ...) on the world layer
  }

  drawShip(g, s){
    const colors = {
      player:[0x7A4E28, 0xC08840], merchant:[0xB89A60, 0xD0AA70],
      pirate:[0x5A2010, 0x7A3020], navy:[0x24506E, 0x3E7AA0], privateer:[0x2B5A2B, 0x46863C],
    }[s.faction];
    g.save(); g.translateCanvas(s.x, s.y); g.rotateCanvas(s.heading*RAD);
    g.fillStyle(colors[0], 1); g.fillEllipse(0, 0, 20, 40);
    g.fillStyle(colors[1], 1); g.fillEllipse(0, 2, 13, 30);
    g.lineStyle(2.5, 0x2A1404, 1); g.lineBetween(-11, -3, 11, -3); g.lineBetween(0, -18, 0, -26);
    if (s.sailState > 0){ const h = s.sailState === 2 ? 18 : 10; g.fillStyle(0xD4C48C, 0.9); g.fillRect(-9, -3, 18, h);
      if (s.faction === 'merchant' && s.cargo && COMMODITY_INFO[s.cargo.commodity]){
        const ci = COMMODITY_INFO[s.cargo.commodity];
        g.fillStyle(ci.color, 1); g.fillRect(-4, -3 + h/2 - 4, 8, 8);
        g.lineStyle(1, 0x2A1404, 0.8); g.strokeRect(-4, -3 + h/2 - 4, 8, 8);
      }
    }
    g.fillStyle(0x2A1404, 1); g.fillCircle(0, -3, 3.5);
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
