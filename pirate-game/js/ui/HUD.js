// ── ui/HUD.js ──
// In-canvas HUD overlay. Lives in the parallel UIScene: the text/graphics objects
// are created on the UIScene (`this.s`), while live game state is read from the
// GameScene (`this.gs`). Left panel: speed/sail/hull/ammo/gold/crew/coords/wanted
// + dual vertical cannon-reload bars; below it the flag-switch buttons (relocated
// from the dev sidebar).
class HUD {
  constructor(scene, gs){
    this.s = scene; this.gs = gs;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(100);
    // circular minimap into its own masked graphics so nothing spills past the rim
    const mmr = MINIMAP_H/2, mmfull = mmr + COMPASS_RING_W + COMPASS_LABEL_PAD, mmcx = GAME_W - 12 - mmfull, mmcy = 12 + mmfull;
    this.miniG = scene.add.graphics().setScrollFactor(0).setDepth(100);
    const mmMask = scene.make.graphics({ add: false });
    mmMask.fillStyle(0xffffff, 1); mmMask.fillCircle(mmcx, mmcy, mmr);
    this.miniG.setMask(mmMask.createGeometryMask());
    this.mmMask = mmMask;                                   // kept so relayout() can move the mask
    // bounty edge arrow on its OWN top layer, above the minimap + cardinal letters,
    // so it's never clipped underneath the compass
    this.arrowG = scene.add.graphics().setScrollFactor(0).setDepth(105);

    const mk = (x, y, sz, col) => scene.add.text(x, y, '', { fontFamily:'ui-monospace,monospace', fontSize:sz + 'px', color:col }).setScrollFactor(0).setDepth(101).setOrigin(0, 0);
    // left stats panel
    this.tSpeed = mk(20, 15, 12, '#D4C890');
    this.tSail  = mk(20, 43, 12, '#D4C890');
    this.tHull  = mk(20, 62, 11, '#D4C890');
    this.tAmmo  = mk(20, 89, 11, '#D4C890'); this.tGold = mk(104, 89, 11, '#F0C840');
    this.tCrew  = mk(20, 107, 11, '#8AAAC8'); this.tCoord = mk(110, 107, 10, '#8AAAC8');
    this.tWanted = mk(20, 126, 11, '#D4C890');
    // reload bar labels
    this.tReload  = mk(200, 14, 8, '#6a8298');
    this.tReloadP = mk(207, 92, 9, '#8AAAC8'); this.tReloadS = mk(229, 92, 9, '#8AAAC8');
    // chaser reload indicators (only shown when the ship's tier mounts that gun)
    this.tChaseBow   = mk(252, 100, 8, '#C8A86a');
    this.tChaseStern = mk(252, 118, 8, '#6aA8C8');
    // flag switch buttons (below the panel)
    const flagBtn = (x, label) => scene.add.text(x, 166, label, { fontFamily:'ui-monospace,monospace', fontSize:'11px', color:'#9fb6cc', backgroundColor:'#1a2c3c', padding:{ x:9, y:5 } }).setScrollFactor(0).setDepth(101).setOrigin(0, 0).setInteractive({ useHandCursor:true });
    // MW-4: ONE toggle — shows the current flag, tap to request the other one
    this.btnFlag = flagBtn(20, '⚐ NEUTRAL');
    this.btnFlag.on('pointerdown', () => {
      if (this.gs.menuOpen || this.gs.inCombat()) return;
      this.gs.requestFlag(this.gs.flag === 'pirate' ? 'neutral' : 'pirate');
    });
    this.tFlagStatus = mk(20, 196, 9, '#6a8298');

    this.tIrons  = scene.add.text(GAME_W/2, GAME_H*0.30, '', { fontFamily:'ui-monospace,monospace', fontSize:'18px', color:'#E0503A', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    this.tStatus = scene.add.text(GAME_W/2, 26, '', { fontFamily:'ui-monospace,monospace', fontSize:'14px', color:'#E0503A', fontStyle:'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);
    this.tOver   = scene.add.text(GAME_W/2, GAME_H/2, '', { fontFamily:'ui-monospace,monospace', fontSize:'30px', color:'#E0503A', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(102);
    // circular-minimap compass ring: static cardinal letters (north-up), seated OUTSIDE
    // the ring so the ticks never cross them
    { const mr = MINIMAP_H/2, full = mr + COMPASS_RING_W + COMPASS_LABEL_PAD, ccx = GAME_W - 12 - full, ccy = 12 + full, lr = mr + COMPASS_RING_W + COMPASS_LABEL_PAD*0.55;
      const mkC = (lab, deg) => scene.add.text(ccx + Math.sin(deg*RAD)*lr, ccy - Math.cos(deg*RAD)*lr, lab, { fontFamily:'ui-monospace,monospace', fontSize:'13px', color:'#EAD9A6', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
      this.cN = mkC('N', 0); this.cE = mkC('E', 90); this.cS = mkC('S', 180); this.cW = mkC('W', 270); }
    this.tScale = scene.add.text(GAME_W/2, GAME_H - 22, '', { fontFamily:'ui-monospace,monospace', fontSize:'10px', color:'#D4C890' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);
    this.tDockPrompt = scene.add.text(GAME_W/2, GAME_H - 96, '', { fontFamily:'ui-monospace,monospace', fontSize:'13px', color:'#F0C840', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
    this.tDockMenu = scene.add.text(GAME_W/2, GAME_H/2, '', { fontFamily:'ui-monospace,monospace', fontSize:'14px', color:'#D4C890', align:'center', lineSpacing:6 }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
    this.popupPool = []; for (let i = 0; i < 16; i++){ const t = scene.add.text(0, 0, '', { fontFamily:'ui-monospace,monospace', fontSize:'12px', fontStyle:'bold' }).setScrollFactor(0).setDepth(60).setOrigin(0.5); this.popupPool.push(t); }

    // ── dev log (bottom-left) + achievement toast / list overlay ──
    this.tLogHdr = scene.add.text(14, 0, '', { fontFamily:'ui-monospace,monospace', fontSize:'9px', color:'#6a8298' }).setScrollFactor(0).setDepth(101).setOrigin(0, 0);
    this.logLines = [];
    for (let i = 0; i < DEVLOG_VISIBLE; i++){ this.logLines.push(scene.add.text(0, 0, '', { fontFamily:'ui-monospace,monospace', fontSize:'10px', color:'#9FB6C8' }).setScrollFactor(0).setDepth(101).setOrigin(0, 0)); }
    this.tAchToast = scene.add.text(GAME_W/2, GAME_H*0.20, '', { fontFamily:'ui-monospace,monospace', fontSize:'14px', color:'#F0C840', fontStyle:'bold', align:'center', lineSpacing:3 }).setScrollFactor(0).setDepth(103).setOrigin(0.5, 0);
    this.tAchList = scene.add.text(GAME_W/2, GAME_H/2, '', { fontFamily:'ui-monospace,monospace', fontSize:'11px', color:'#D4C890', align:'left', lineSpacing:4 }).setScrollFactor(0).setDepth(103).setOrigin(0.5);
  }

  // Reposition screen-anchored HUD elements after a canvas resize (rotate / window
  // resize). Per-frame draws read the now-live GAME_W/H and self-correct; only
  // create-time positions need moving. Touch-safe bottom keeps prompts above the
  // control band (C-8). (R-1 / MW-3 / MW-8 / MW-12)
  relayout(){
    const mmr = MINIMAP_H/2, full = mmr + COMPASS_RING_W + COMPASS_LABEL_PAD;
    const cx = GAME_W - 12 - full, cy = 12 + full;
    this.mmMask.clear(); this.mmMask.fillStyle(0xffffff, 1); this.mmMask.fillCircle(cx, cy, mmr);
    const lr = mmr + COMPASS_RING_W + COMPASS_LABEL_PAD*0.55;
    const setC = (t, deg) => t.setPosition(cx + Math.sin(deg*RAD)*lr, cy - Math.cos(deg*RAD)*lr);
    setC(this.cN, 0); setC(this.cE, 90); setC(this.cS, 180); setC(this.cW, 270);
    const safeB = (typeof TouchInput !== 'undefined') ? TouchInput.safeBottomY(GAME_H) : GAME_H - 30;
    this.tIrons.setPosition(GAME_W/2, GAME_H*0.30);
    this.tStatus.setPosition(GAME_W/2, 26);
    this.tOver.setPosition(GAME_W/2, GAME_H/2);
    this.tScale.setPosition(GAME_W/2, safeB - 8);
    this.tDockPrompt.setPosition(GAME_W/2, safeB - 34);
    this.tDockMenu.setPosition(GAME_W/2, GAME_H/2);
    this.tAchToast.setPosition(GAME_W/2, GAME_H*0.20);
    this.tAchList.setPosition(GAME_W/2, GAME_H/2);
  }

  drawPopups(popups){
    const cam = this.gs.cameras.main;
    for (let i = 0; i < this.popupPool.length; i++){
      const t = this.popupPool[i], p = popups[i];
      if (p){ const fade = 1 - p.age/p.life;
        t.setText(p.txt).setColor('#' + p.color.toString(16).padStart(6, '0')).setPosition(p.x - cam.scrollX, p.y - cam.scrollY).setAlpha(fade).setVisible(true);
      } else t.setVisible(false);
    }
  }

  update(pl, wa){
    const gs = this.gs, g = this.g; g.clear();
    g.fillStyle(0x0E1820, 0.9); g.fillRect(12, 10, 290, 150);

    // speed
    const sp = Math.min(pl.vel/P.maxSpeed, 1), sc = sp < 0.05 ? 0xE0503A : sp < 0.5 ? 0xE0A040 : 0x4CA84C;
    g.fillStyle(0x223040, 1); g.fillRect(20, 33, 150, 6); g.fillStyle(sc, 1); g.fillRect(20, 33, 150*sp, 6);
    this.tSpeed.setText('SPEED  ' + (pl.vel/P.maxSpeed*9).toFixed(1) + ' kn');
    this.tSail.setText(['NO SAILS', 'MAIN SAIL', 'FULL SAIL'][pl.sailState]).setColor(['#E0503A', '#E0A040', '#4CA84C'][pl.sailState]);
    // hull
    const hp = Math.max(0, pl.hull/pl.maxHull);
    g.fillStyle(0x223040, 1); g.fillRect(20, 80, 150, 5); g.fillStyle(hp < 0.35 ? 0xE0503A : 0x4CA84C, 1); g.fillRect(20, 80, 150*hp, 5);
    this.tHull.setText('HULL ' + Math.ceil(pl.hull));
    this.tAmmo.setText('AMMO ' + pl.ammo); this.tGold.setText('GOLD ' + pl.gold);
    const crewCap = (typeof ShipTiers !== 'undefined') ? ShipTiers.maxCrew(pl) : (typeof CREW_MAX !== 'undefined' ? CREW_MAX : 40);
    const understaffed = (typeof ShipTiers !== 'undefined') && ShipTiers.understaffed(pl);
    this.tCrew.setText('CREW ' + (pl.crew || 0) + '/' + crewCap + (understaffed ? ' ⚠' : '')).setColor(understaffed ? '#E0503A' : '#8AAAC8');
    { const cxv = Math.round(pl.x/COORD_SCALE), cyv = Math.round(pl.y/COORD_SCALE);
      // ASSUMPTION: −y = North, +x = East (screen-up is north); keeps raw x,y AND adds the compass form
      const ns = cyv <= 0 ? 'N' : 'S', ew = cxv >= 0 ? 'E' : 'W';
      this.tCoord.setText(cxv + ',' + cyv + '   ' + Math.abs(cyv) + '°' + ns + ' ' + Math.abs(cxv) + '°' + ew); }
    // wanted level (standing 0..-100 → 0..5 pips)
    const wl = Math.min(5, Math.max(0, Math.ceil(-gs.navyStanding / 20))), hostile = gs.navyHostile();
    this.tWanted.setText('WANTED');
    for (let i = 0; i < 5; i++){ g.fillStyle(i < wl ? (hostile ? 0xE0503A : 0xE0A040) : 0x2a3a4a, 1); g.fillCircle(92 + i*16, 131, 5); }

    // cannon reload — two vertical bars (port | starboard), fill up as they reload
    const cd = P.cooldown, rbX = 202, rbY = 30, rbW = 15, rbH = 58, gap = 7;
    const reloadBar = (bx, val) => {
      const fill = 1 - Math.min(1, Math.max(0, val)/cd);
      g.fillStyle(0x223040, 1); g.fillRect(bx, rbY, rbW, rbH);
      g.fillStyle(fill >= 1 ? 0x4CA84C : 0xE0A040, 1); g.fillRect(bx, rbY + rbH*(1 - fill), rbW, rbH*fill);
      g.lineStyle(1, 0x3a4a5a, 1); g.strokeRect(bx, rbY, rbW, rbH);
    };
    reloadBar(rbX, pl.fire.port); reloadBar(rbX + rbW + gap, pl.fire.star);
    this.tReload.setText('RELOAD');

    // bow / stern chaser reload — horizontal bars on their own (distinct) cooldowns,
    // shown only when the ship's tier mounts that chaser gun
    const cbX = 200, cbW = 48, cbH = 7;
    const chaseBar = (y, val, cdRef, lit) => {
      const fill = 1 - Math.min(1, Math.max(0, (val || 0)) / cdRef);
      g.fillStyle(0x223040, 1); g.fillRect(cbX, y, cbW, cbH);
      g.fillStyle(fill >= 1 ? lit : 0xE0A040, 1); g.fillRect(cbX, y, cbW * fill, cbH);
      g.lineStyle(1, 0x3a4a5a, 1); g.strokeRect(cbX, y, cbW, cbH);
    };
    const hasChaser = (which) => (typeof ShipTiers !== 'undefined') && ShipTiers.has(pl, which);
    if (hasChaser('bow')){ chaseBar(100, pl.fire.bow, ShipTiers.cooldown('bow'), 0xC8A86a); this.tChaseBow.setText('BOW').setVisible(true); } else this.tChaseBow.setVisible(false);
    if (hasChaser('stern')){ chaseBar(118, pl.fire.stern, ShipTiers.cooldown('stern'), 0x6aA8C8); this.tChaseStern.setText('STERN').setVisible(true); } else this.tChaseStern.setVisible(false);

    // flag buttons
    const f = gs.flag, pend = gs.flagPending, locked = gs.inCombat();
    this.btnFlag.setText(f === 'pirate' ? '☠ PIRATE' : '⚐ NEUTRAL')
      .setColor(pend ? '#9fb6cc' : '#F0C840').setAlpha(locked ? 0.45 : 1);
    this.tFlagStatus.setText(locked ? '⚠ colors locked (in combat)'
      : pend ? 'raising ' + pend + ' colors… ' + Math.max(0, gs.flagChangeAt - gs.time.now/1000).toFixed(1) + 's'
      : 'flying ' + f + ' colors');

    this.tIrons.setText((pl.sailState > 0 && wa < P.noGo) ? 'IN IRONS — turn away' : '');
    let banner = hostile ? '★ WANTED — NAVY HOSTILE' : '';
    if (f === 'pirate'){ banner = (banner ? banner + '   ' : '') + '☠ PIRATE COLORS FLYING'; }
    this.tStatus.setText(banner).setColor(hostile ? '#E0503A' : '#D0A030');
    this.tOver.setText(pl.hull <= 0 ? 'YOU SANK\npress Esc → Reset Game' : '');

    drawMiniMap(this.miniG, gs, pl);
    { const mr = MINIMAP_H/2, full = mr + COMPASS_RING_W + COMPASS_LABEL_PAD; drawCompassRing(g, gs, pl, GAME_W - 12 - full, 12 + full, mr, COMPASS_RING_W); }
    const ref = 200*gs.cameras.main.zoom, bx = GAME_W/2 - ref/2, by = GAME_H - 26;
    g.lineStyle(2, 0xD4C890, 0.8);
    g.lineBetween(bx, by, bx + ref, by); g.lineBetween(bx, by - 5, bx, by + 5); g.lineBetween(bx + ref, by - 5, bx + ref, by + 5);
    this.tScale.setText('200 px').setPosition(GAME_W/2, by + 4);

    this.drawDock(g);
    this.drawDevLog();
    this.drawAchToast();
    this.drawAchOverlay(g);
    this.drawBountyArrow();
  }

  // off-screen red arrow pointing at the active bounty target; hidden only once the
  // target is actually ON the screen (not just on the minimap), reappears when it
  // leaves the view again. Drawn on its own top layer (this.arrowG) so it rides ABOVE
  // the compass/minimap instead of clipping underneath them.
  drawBountyArrow(){
    const g = this.arrowG; g.clear();
    const gs = this.gs;
    if (typeof BountySystem === 'undefined' || !gs.bounties || !gs.bounties.length) return;
    const t = BountySystem.compassTarget(gs);
    if (!t) return;
    const view = gs.cameras.main.worldView;
    if (view.contains(t.x, t.y)) return;                       // on the actual screen → no arrow
    const ang = Math.atan2(t.y - (view.y + view.height/2), t.x - (view.x + view.width/2));
    const ux = Math.cos(ang), uy = Math.sin(ang), margin = 46;
    const scale = Math.min((GAME_W/2 - margin)/Math.max(Math.abs(ux), 1e-4), (GAME_H/2 - margin)/Math.max(Math.abs(uy), 1e-4));
    const ex = GAME_W/2 + ux*scale, ey = GAME_H/2 + uy*scale, sz = 13;
    const ax = ex + ux*sz, ay = ey + uy*sz;                    // tip
    const bx = ex + Math.cos(ang + 2.6)*sz, by = ey + Math.sin(ang + 2.6)*sz;
    const cx2 = ex + Math.cos(ang - 2.6)*sz, cy2 = ey + Math.sin(ang - 2.6)*sz;
    g.fillStyle(0xE0503A, 0.92); g.fillTriangle(ax, ay, bx, by, cx2, cy2);
    g.lineStyle(1.5, 0x2a0a0a, 0.5); g.strokeTriangle(ax, ay, bx, by, cx2, cy2);
  }

  // ── real-time dev log (bottom-left); newest line at the bottom, older lines fade ──
  drawDevLog(){
    const gs = this.gs, dl = gs.devlog, on = !!(dl && dl.on);
    const baseY = (typeof TouchInput !== 'undefined') ? TouchInput.safeBottomY(GAME_H) - 6 : GAME_H - 30;
    // MB3-6: the reduced feed only applies in PHONE mode — tablets have the room
    const vis = (typeof TouchInput !== 'undefined' && TouchInput.active && TouchInput.uiMode === 'phone') ? Math.min(DEVLOG_VISIBLE, DEVLOG_VISIBLE_TOUCH) : DEVLOG_VISIBLE;
    if (on){
      let hdr = 'DEV LOG  [L hide]';
      if (typeof AchievementSystem !== 'undefined' && gs.achievements){ const c = AchievementSystem.count(gs); hdr += '   ·   ACH ' + c.done + '/' + c.total + ' [J]'; }
      this.tLogHdr.setText(hdr).setPosition(14, baseY - DEVLOG_VISIBLE*14 - 16).setVisible(true);
    } else this.tLogHdr.setVisible(false);
    const lines = (dl && dl.lines) ? dl.lines : [], now = gs.time.now/1000;
    for (let i = 0; i < this.logLines.length; i++){
      const t = this.logLines[i], line = (on && i < vis) ? lines[lines.length - 1 - i] : null;
      if (line){
        const fade = Math.max(0.28, 1 - (now - line.t)/DEVLOG_LINE_TTL);
        t.setText((line.n > 1 ? '(' + line.n + 'x) ' : '') + line.txt)
          .setColor('#' + line.color.toString(16).padStart(6, '0')).setAlpha(fade).setPosition(14, baseY - i*14).setVisible(true);
      } else t.setVisible(false);
    }
  }

  // ── achievement unlock toast (auto, top-centre) ──
  drawAchToast(){
    const a = this.gs.achievements, rt = this.gs.rewardToast, t = this.gs.time.now/1000;
    if (a && a.toast && t < a.toast.until){
      this.tAchToast.setText('★ ACHIEVEMENT UNLOCKED ★\n' + a.toast.name + '\n' + a.toast.desc).setVisible(true);
    } else if (rt && t < rt.until){
      this.tAchToast.setText(rt.text).setVisible(true);        // CQ: bounty banner rides the same top-centre slot
    } else this.tAchToast.setVisible(false);
  }

  // ── achievements list overlay (J) ──
  drawAchOverlay(g){
    const gs = this.gs;
    if (!gs.achOpen || typeof AchievementSystem === 'undefined' || !gs.achievements){ this.tAchList.setVisible(false); return; }
    const list = AchievementSystem.list(gs), c = AchievementSystem.count(gs);
    let s = 'ACHIEVEMENTS   ' + c.done + ' / ' + c.total + '       [J close]\n\n';
    for (const it of list){ s += (it.unlocked ? '✓ ' : '· ') + it.name + '  —  ' + it.desc + (it.unlocked ? '' : '   (' + it.val + '/' + it.goal + ')') + '\n'; }
    const w = Math.min(560, GAME_W - 24), h = 44 + (list.length + 2) * 17, x = GAME_W/2 - w/2, y = GAME_H/2 - h/2;
    g.fillStyle(0x0E1820, 0.95); g.fillRect(x, y, w, h);
    g.lineStyle(2, 0xF0C840, 0.5); g.strokeRect(x, y, w, h);
    this.tAchList.setText(s).setPosition(GAME_W/2, GAME_H/2).setVisible(true);
  }

  drawDock(g){
    const gs = this.gs, pl = gs.player;
    // TM1: the tavern board takes over the dock panel while open
    if (gs.docked && gs.dockPort && gs.tavernOpen && typeof TavernSystem !== 'undefined'){
      const w = 440, h = 400, x = GAME_W/2 - w/2, y = GAME_H/2 - h/2;
      g.fillStyle(0x140E08, 0.94); g.fillRect(x, y, w, h);          // warmer wood tone than the port menu
      g.lineStyle(2, 0xB08040, 0.6); g.strokeRect(x, y, w, h);
      this.tDockMenu.setText(TavernSystem.boardText(gs)).setVisible(true);
      this.tDockPrompt.setVisible(false);
      return;
    }
    if (gs.docked && gs.dockPort){
      const w = 440, h = 400, x = GAME_W/2 - w/2, y = GAME_H/2 - h/2;
      g.fillStyle(0x0E1820, 0.94); g.fillRect(x, y, w, h);
      g.lineStyle(2, 0x2A9EAE, 0.6); g.strokeRect(x, y, w, h);
      const port = gs.dockPort;
      const repairNeed = pl.maxHull - pl.hull, ammoNeed = pl.maxAmmo - pl.ammo;
      const l1 = repairNeed <= 0 ? '[1] Hull fully repaired' : '[1] Repair hull  —  ' + Math.ceil(repairNeed * REPAIR_COST_PER_HP) + 'g';
      const l2 = ammoNeed   <= 0 ? '[2] Ammo full'           : '[2] Restock ammo  —  ' + (ammoNeed * AMMO_COST_PER_UNIT) + 'g';
      let cargo = '(empty)';
      if (pl.hold){ const parts = []; for (const c of COMMODITIES){ const q = pl.hold.items[c]; if (q) parts.push((COMMODITY_INFO[c] ? COMMODITY_INFO[c].glyph : c) + q); } if (parts.length) cargo = parts.join(' '); cargo += '  [' + (typeof Cargo !== 'undefined' ? Cargo.used(pl.hold) : 0) + '/' + pl.hold.capacity + ']'; }
      const src = port.sourceCommodity;
      const l4 = src ? ('[4] Buy ' + src + '  —  ' + PortEconomy.sellPrice(port, src) + 'g/ea') : '[4] — (no local good)';
      const crewCap = (typeof ShipTiers !== 'undefined') ? ShipTiers.maxCrew(pl) : (typeof CREW_MAX !== 'undefined' ? CREW_MAX : 40);
      const crewSpec = (typeof PORT_TYPES !== 'undefined') && PORT_TYPES[port.type];
      const crewCost = Math.round((typeof CREW_HIRE_COST !== 'undefined' ? CREW_HIRE_COST : 6) * (crewSpec && crewSpec.crewDiscount ? 0.6 : 1));
      const l5 = ((pl.crew || 0) >= crewCap) ? '[5] Crew full (' + crewCap + ')' : '[5] Hire crew  —  ' + crewCost + 'g';
      const up = (typeof UpgradeSystem !== 'undefined') ? UpgradeSystem : null;
      const l6 = up ? '[6] ' + up.sailLabel(gs)   : '';
      const l7 = up ? '[7] ' + up.cannonLabel(gs) : '';
      const l8 = up ? '[8] ' + up.shipLabel(gs)   : '';
      const l9 = (typeof HireSystem !== 'undefined')   ? '[9] ' + HireSystem.hireLabel(gs) : '';
      const l0 = (typeof BountySystem !== 'undefined') ? '[0] Accept bounty (hunt a pirate)' : '';
      // SW1 (RULED e): swap is offered in the dock menu whenever a prize is in tow
      const lV = (gs.tows && gs.tows.length) ? '[V] Make towed prize your flagship' : '';
      const lB = (port.derelict && typeof ShipTiers !== 'undefined') ? '[B] Buy docked ' + ShipTiers.get(port.derelict.tier).name + '  —  ' + port.derelict.price + 'g' : '';   // PF1
      const lT = (typeof TavernSystem !== 'undefined') ? '[T] Enter the tavern (missions)' : '';   // TM1
      const extra = [l6, l7, l8, l9, l0, lV, lB, lT].filter(Boolean).join('\n');
      this.tDockMenu.setText('⚓  ' + port.name + '   (' + (port.type || 'Port') + ')\n\nGOLD  ' + (pl.bank || 0) + '     HOLD  ' + cargo + '     CREW  ' + (pl.crew || 0) + '/' + crewCap + '\n\n' + l1 + '\n' + l2 + '\n[3] Sell all cargo\n' + l4 + '\n' + l5 + (extra ? '\n' + extra : '') + '\n\n[F] Depart').setVisible(true);
      this.tDockPrompt.setVisible(false);
    } else if (gs.nearPort){
      let msg;
      if (gs.navyHostile()) msg = '⚓  ' + gs.nearPort.name + ' — PORT CLOSED (WANTED)';
      else if (gs.inCombat()) msg = '⚓  cannot dock in combat';
      else msg = (typeof TouchInput !== 'undefined' && TouchInput.active)
        ? '⚓  TAP THE PORT to dock at ' + gs.nearPort.name
        : '⚓  Press F to dock at ' + gs.nearPort.name;
      this.tDockPrompt.setText(msg).setVisible(true);
      this.tDockMenu.setVisible(false);
    } else {
      this.tDockPrompt.setVisible(false); this.tDockMenu.setVisible(false);
    }
  }
}
