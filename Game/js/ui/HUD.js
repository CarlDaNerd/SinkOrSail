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
    const mmr = miniMapH()/2, mmfull = mmr + compassRingW() + compassLabelPad(), mmcx = GAME_W - 12 - mmfull, mmcy = 12 + mmfull;
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
    { const mr = miniMapH()/2, full = mr + compassRingW() + compassLabelPad(), ccx = GAME_W - 12 - full, ccy = 12 + full, lr = mr + compassRingW() + compassLabelPad()*0.55;
      const mkC = (lab, deg) => scene.add.text(ccx + Math.sin(deg*RAD)*lr, ccy - Math.cos(deg*RAD)*lr, lab, { fontFamily:'ui-monospace,monospace', fontSize:Math.round(13*hudMiniScale()) + 'px', color:'#EAD9A6', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
      this.cN = mkC('N', 0); this.cE = mkC('E', 90); this.cS = mkC('S', 180); this.cW = mkC('W', 270); }
    this.tScale = scene.add.text(GAME_W/2, GAME_H - 22, '', { fontFamily:'ui-monospace,monospace', fontSize:'10px', color:'#D4C890' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);
    this.tDockPrompt = scene.add.text(GAME_W/2, GAME_H - 96, '', { fontFamily:'ui-monospace,monospace', fontSize:'13px', color:'#F0C840', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
    this.tDockMenu = scene.add.text(GAME_W/2, GAME_H/2, '', { fontFamily:'ui-monospace,monospace', fontSize:'14px', color:'#D4C890', align:'center', lineSpacing:6 }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
    // UI1: the ledger book — ink-on-parchment serif page (left-anchored so
    // every text line maps to a deterministic tap rectangle)
    this.tLedger = scene.add.text(0, 0, '', { fontFamily: LEDGER_FONT, fontSize: '15px', color: '#3B2A18', lineSpacing: LEDGER_LH - 15 }).setOrigin(0, 0).setScrollFactor(0).setDepth(103).setVisible(false);
    this.gs.uiHud = this;                                     // GameScene reads _pageRows for key actions
    // UI1 touch: taps route through the same rects the renderer records
    scene.input.on('pointerdown', p => {
      const g2 = this.gs;
      if (!g2.docked || !this._hits) return;
      for (const hz of this._hits){
        if (p.x >= hz.x && p.x <= hz.x + hz.w && p.y >= hz.y && p.y <= hz.y + hz.h){ hz.fn(); g2._dockDirty = true; break; }
      }
    });
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
    const mmr = miniMapH()/2, full = mmr + compassRingW() + compassLabelPad();
    const cx = GAME_W - 12 - full, cy = 12 + full;
    this.mmMask.clear(); this.mmMask.fillStyle(0xffffff, 1); this.mmMask.fillCircle(cx, cy, mmr);
    const lr = mmr + compassRingW() + compassLabelPad()*0.55;
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

  // I18-3: capture-ready hint box — bottom-centre pulse when a port or ship is
  // strip-ready and boardable RIGHT NOW ([B] / tap). Port wins the wording when
  // both are eligible, matching the B-key priority.
  drawCaptureHint(){
    const gs = this.gs;
    if (!this.tCapHint){
      this.tCapHint = this.s.add.text(0, 0, '', {
        fontFamily:'ui-monospace,monospace', fontSize:'13px', fontStyle:'bold', color:'#F0C840',
        backgroundColor:'#16283a', padding:{ x:12, y:6 },
      }).setScrollFactor(0).setDepth(150).setOrigin(0.5);
    }
    const t = this.tCapHint;
    let msg = null;
    if (!gs.docked && !gs.menuOpen && !gs.mapOpen && gs.player.hull > 0){
      if (typeof PortCaptureSystem !== 'undefined' && PortCaptureSystem.isReady(gs)) msg = '⚑ PORT READY TO CAPTURE — [B] / TAP';
      else if (typeof BoardingSystem !== 'undefined'){
        const tgt = BoardingSystem.eligibleTarget(gs);
        if (tgt && BoardingSystem.canCapture(gs, tgt)) msg = '⚔ SHIP READY TO BOARD — [B] / TAP';
      }
    }
    if (msg){
      const pulse = 0.7 + 0.3 * Math.sin(gs.time.now / 240);
      t.setText(msg).setAlpha(pulse).setPosition(GAME_W/2, (typeof TouchInput !== 'undefined' ? TouchInput.safeBottomY(GAME_H) : GAME_H - 30) - 26).setVisible(true);
    } else t.setVisible(false);
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
    // hull bar — Graphics, must stay OUTSIDE the M8 gate (g.clear runs per frame)
    const hp = Math.max(0, pl.hull/pl.maxHull);
    g.fillStyle(0x223040, 1); g.fillRect(20, 80, 150, 5); g.fillStyle(hp < 0.35 ? 0xE0503A : 0x4CA84C, 1); g.fillRect(20, 80, 150*hp, 5);
    // M8 (optimize.md): the numeric readouts change nearly every frame — rebuild
    // their strings at HUD_TEXT_INTERVAL_MS instead (bars/pips are Graphics and
    // stay per-frame; event banners below stay per-frame).
    const _txtGo = gs.time.now - (this._txtAt || 0) >= HUD_TEXT_INTERVAL_MS;
    if (_txtGo){ this._txtAt = gs.time.now;
    this.tSpeed.setText('SPEED  ' + (pl.vel/P.maxSpeed*9).toFixed(1) + ' kn');
    this.tSail.setText(['NO SAILS', 'MAIN SAIL', 'FULL SAIL'][pl.sailState]).setColor(['#E0503A', '#E0A040', '#4CA84C'][pl.sailState]);
    this.tHull.setText('HULL ' + Math.ceil(pl.hull));
    this.tAmmo.setText('AMMO ' + pl.ammo); this.tGold.setText('GOLD ' + pl.gold);
    const crewCap = (typeof ShipTiers !== 'undefined') ? ShipTiers.maxCrew(pl) : (typeof CREW_MAX !== 'undefined' ? CREW_MAX : 40);
    const understaffed = (typeof ShipTiers !== 'undefined') && ShipTiers.understaffed(pl);
    this.tCrew.setText('CREW ' + (pl.crew || 0) + '/' + crewCap + (understaffed ? ' ⚠' : '')).setColor(understaffed ? '#E0503A' : '#8AAAC8');
    { const cxv = Math.round(pl.x/COORD_SCALE), cyv = Math.round(pl.y/COORD_SCALE);
      // ASSUMPTION: −y = North, +x = East (screen-up is north); keeps raw x,y AND adds the compass form
      const ns = cyv <= 0 ? 'N' : 'S', ew = cxv >= 0 ? 'E' : 'W';
      this.tCoord.setText(cxv + ',' + cyv + '   ' + Math.abs(cyv) + '°' + ns + ' ' + Math.abs(cxv) + '°' + ew); }
    }   // end M8 10 Hz text gate
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

    // OPT-B5: the radar recomputes every island/ship/nearby-port every frame. Throttle
    // the REBUILD to ~9Hz (the miniG Graphics still renders each frame — only the
    // recompute is gated) and skip it entirely while paused (nothing moves).
    { const nowMs = gs.time.now;
      if (!gs.menuOpen && (this._miniAt === undefined || nowMs - this._miniAt >= MINIMAP_REDRAW_MS)){
        this._miniAt = nowMs; drawMiniMap(this.miniG, gs, pl);
      } }
    { const mr = miniMapH()/2, full = mr + compassRingW() + compassLabelPad(); drawCompassRing(g, gs, pl, GAME_W - 12 - full, 12 + full, mr, compassRingW()); }
    const ref = 200*gs.cameras.main.zoom, bx = GAME_W/2 - ref/2, by = GAME_H - 26;
    g.lineStyle(2, 0xD4C890, 0.8);
    g.lineBetween(bx, by, bx + ref, by); g.lineBetween(bx, by - 5, bx, by + 5); g.lineBetween(bx + ref, by - 5, bx + ref, by + 5);
    this.tScale.setText('200 px').setPosition(GAME_W/2, by + 4);

    this.drawDock(g);
    this.drawDevLog();
    this.drawAchToast();
    this.drawCaptureHint();                          // I18-3
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

  // M8 (optimize.md): the dock/tavern panels rebuild a large string per frame
  // while open — rebuild at HUD_TEXT_INTERVAL_MS instead (and instantly on the
  // frame the panel becomes visible, so nothing stale ever flashes).
  _dockGo(){
    const now = this.gs.time.now;
    if (now - (this._dockTxtAt || 0) < HUD_TEXT_INTERVAL_MS) return false;
    this._dockTxtAt = now; return true;
  }

  // ── UI1: page model — three ledger pages of rows {t, act?, buy?, sell?} ──
  _ledgerModel(gs){
    const pl = gs.player, port = gs.dockPort;
    const qn = [1, 10, Infinity][gs.dockQty || 0];
    const pages = [[], [], []];
    // page 0 — SHIP
    const rep = pl.maxHull - pl.hull;
    pages[0].push({ t: rep <= 0 ? 'Hull — fully repaired' : 'Repair hull to full  —  ' + Math.ceil(rep * REPAIR_COST_PER_HP) + 'g', act: () => gs.repairAtPort() });
    const an = pl.maxAmmo - pl.ammo;
    pages[0].push({ t: an <= 0 ? 'Ammo — full' : 'Restock ammo to full  —  ' + (an * AMMO_COST_PER_UNIT) + 'g', act: () => gs.restockAtPort() });
    const crewCap = (typeof ShipTiers !== 'undefined') ? ShipTiers.maxCrew(pl) : 40;
    pages[0].push({ t: (pl.crew || 0) >= crewCap ? 'Crew full (' + crewCap + ')' : 'Hire crew ×' + (qn === Infinity ? 'MAX' : qn) + '  (' + (pl.crew || 0) + '/' + crewCap + ')',
      act: () => { const n = qn === Infinity ? 200 : qn;
        for (let i = 0; i < n; i++){ const before = pl.crew || 0; if (typeof CrewSystem !== 'undefined') CrewSystem.hireOne(gs, port); if ((pl.crew || 0) === before) break; } } });
    if (typeof UpgradeSystem !== 'undefined'){
      pages[0].push({ t: UpgradeSystem.sailLabel(gs),   act: () => UpgradeSystem.buySail(gs) });
      pages[0].push({ t: UpgradeSystem.cannonLabel(gs), act: () => UpgradeSystem.buyCannon(gs) });
      pages[0].push({ t: UpgradeSystem.shipLabel(gs),   act: () => UpgradeSystem.buyShip(gs) });
    }
    if (typeof HireSystem !== 'undefined') pages[0].push({ t: HireSystem.hireLabel(gs), act: () => HireSystem.hireAtDock(gs) });
    if (gs.tows && gs.tows.length) pages[0].push({ t: 'Make towed prize your flagship', act: () => gs.swapToPrize() });
    if (port.derelict && typeof ShipTiers !== 'undefined') pages[0].push({ t: 'Buy docked ' + ShipTiers.get(port.derelict.tier).name + '  —  ' + port.derelict.price + 'g', act: () => gs.buyDerelict() });
    const prize = gs._prizeAtDock ? gs._prizeAtDock() : null;
    if (prize){
      const pn = prize.maxHull - prize.hull;
      pages[0].push({ t: pn <= 0 ? 'Prize hull — repaired' : 'Repair prize hull  —  ' + Math.ceil(pn * REPAIR_COST_PER_HP) + 'g', act: () => gs.repairPrize() });
      pages[0].push({ t: 'Crew the prize (' + (prize.crew || 0) + ')', act: () => gs.crewPrize() });
    }
    // page 1 — GOODS (B buys, S sells, qty chip applies; SPACE = row default)
    const src = port.sourceCommodity;
    if (src){
      const doBuy = () => { const cap = Math.min(qn === Infinity ? 9999 : qn, Cargo.free(pl.hold));
        const got = PortEconomy.buy(gs, port, src, cap);
        gs.flashPopup(pl.x, pl.y - 20, got > 0 ? '+' + got + ' ' + src : "CAN'T BUY", got > 0 ? 0xF0C840 : 0xE0503A); };
      pages[1].push({ t: 'Buy ' + src + '  —  ' + PortEconomy.sellPrice(port, src) + 'g/ea' + (port.stock != null ? '   (stock ' + Math.floor(port.stock) + ')' : ''), buy: doBuy, act: doBuy });
    }
    if (pl.hold) for (const c of COMMODITIES){
      const have = Cargo.qty(pl.hold, c);
      if (have <= 0) continue;
      const doSell = () => { const n = qn === Infinity ? have : Math.min(qn, have);
        const unit = PortEconomy.buyPrice(port, c);
        const sold = PortEconomy.sell(gs, port, c, n);
        gs.flashPopup(pl.x, pl.y - 20, sold > 0 ? '+' + (sold * unit) + 'g' : "CAN'T SELL", sold > 0 ? 0xF0C840 : 0xE0503A); };
      pages[1].push({ t: 'Sell ' + c + '  —  ' + PortEconomy.buyPrice(port, c) + 'g/ea   (have ' + have + ')', sell: doSell, act: doSell });
    }
    pages[1].push({ t: 'Sell ALL cargo', act: () => gs.sellAllAtPort() });
    // page 2 — TAVERN (missions + bounty)
    if (gs._tavernOffers) gs._tavernOffers.forEach((o, i) => {
      pages[2].push({ t: o.title + '  —  ' + o.reward + 'g' + (o.taken ? '   — ACCEPTED ✓' : ''), act: () => { if (typeof TavernSystem !== 'undefined') TavernSystem.accept(gs, i); } });
    });
    if (typeof BountySystem !== 'undefined') pages[2].push({ t: 'Accept bounty (hunt a pirate)', act: () => BountySystem.acceptAtDock(gs) });
    return pages;
  }

  // ── UI1: the ledger book renderer — parchment leaf, bookmarks, rows, seal ──
  _drawLedger(g, gs){
    const port = gs.dockPort, pl = gs.player;
    const w = LEDGER_W, h = LEDGER_H, x = GAME_W/2 - w/2, y = GAME_H/2 - h/2;
    // leaf (Graphics-only v1; textured parchment is a later phase)
    g.fillStyle(0x0B0704, 0.45); g.fillRect(x + 6, y + 8, w, h);
    g.fillStyle(0xE8D5AC, 0.98); g.fillRect(x, y, w, h);
    g.lineStyle(2, 0x8A6B3F, 1); g.strokeRect(x, y, w, h);
    g.lineStyle(1, 0x8A6B3F, 0.55); g.strokeRect(x + 7, y + 7, w - 14, h - 14);
    // wax seal = depart (tap target + F)
    const sx = x + w - 46, sy = y + h - 46;
    g.fillStyle(0x5A1616, 1); g.fillCircle(sx + 2, sy + 3, 24);
    g.fillStyle(0x7A1F1F, 1); g.fillCircle(sx, sy, 24);
    g.fillStyle(0xB23A2E, 0.8); g.fillCircle(sx - 6, sy - 7, 8);
    // page-flip chevrons
    g.fillStyle(0x6E4F2A, 0.9);
    g.fillTriangle(x + 14, y + h/2, x + 30, y + h/2 - 12, x + 30, y + h/2 + 12);
    g.fillTriangle(x + w - 14, y + h/2, x + w - 30, y + h/2 - 12, x + w - 30, y + h/2 + 12);
    // rebuild text + hit rects at 10 Hz, instantly on open or input
    if (!this.tLedger.visible || gs._dockDirty || this._dockGo()){
      gs._dockDirty = false;
      const pages = this._ledgerModel(gs);
      const page = Math.min(gs.dockPage || 0, 2);
      const rows = pages[page];
      this._pageRows = rows;
      gs.dockRow = Math.min(gs.dockRow || 0, Math.max(0, rows.length - 1));
      const names = ['SHIP', 'GOODS', 'TAVERN'];
      const marks = names.map((nm, i) => (i === page ? '▙ ' + nm + ' ▟' : '  ' + nm + '  ')).join('     ');
      const qn = ['1', '10', 'MAX'], qline = 'Quantity [Z]:   ' + qn.map((q, i) => (i === (gs.dockQty || 0) ? '«' + q + '»' : ' ' + q + ' ')).join('  ');
      let s2 = port.name + '   —   ' + (port.type || 'Port') + '\n';
      s2 += 'GOLD ' + (pl.bank || 0) + '     HOLD ' + (typeof Cargo !== 'undefined' && pl.hold ? Cargo.used(pl.hold) + '/' + pl.hold.capacity : '—') + '     CREW ' + (pl.crew || 0) + '\n';
      s2 += marks + '\n';
      s2 += (page < 2 ? qline : (typeof TavernSystem !== 'undefined' ? 'RUMOR: "' + TavernSystem._rumor(gs, port) + '"' : '')) + '\n';
      s2 += '\n';
      rows.forEach((r, i) => { s2 += (i === gs.dockRow ? '\u25B6 ' : '   ') + r.t + '\n'; });
      if (page === 2 && gs.activeMissions){
        s2 += '\nYOUR LOG (' + gs.activeMissions.length + '):\n';
        for (const m of gs.activeMissions) s2 += '   \u2022 ' + (typeof TavernSystem !== 'undefined' ? TavernSystem.progressLine(m) : m.title) + '\n';
      }
      s2 += '\n\u2190/\u2192 pages    \u2191/\u2193 rows    SPACE act    F / seal: depart';
      this.tLedger.setPosition(x + 40, y + 16).setText(s2).setVisible(true);
      // tap rects: chevrons, qty chips, rows, seal
      const hits = this._hits = [];
      const LH = LEDGER_LH;
      hits.push({ x: x, y: y + h/2 - 40, w: 40, h: 80, fn: () => { gs.dockPage = ((gs.dockPage || 0) + 2) % 3; gs.dockRow = 0; gs.tavernOpen = gs.dockPage === 2; } });
      hits.push({ x: x + w - 40, y: y + h/2 - 40, w: 40, h: 80, fn: () => { gs.dockPage = ((gs.dockPage || 0) + 1) % 3; gs.dockRow = 0; gs.tavernOpen = gs.dockPage === 2; } });
      if (page < 2) hits.push({ x: x + 40, y: y + 16 + 3*LH, w: 260, h: LH, fn: () => { gs.dockQty = ((gs.dockQty || 0) + 1) % 3; } });
      const rowsTop = y + 16 + 5*LH;
      rows.forEach((r, i) => hits.push({ x: x + 40, y: rowsTop + i*LH, w: w - 90, h: LH,
        fn: () => { if (gs.dockRow === i){ (r.act || r.buy || r.sell || (() => {}))(); } else { gs.dockRow = i; } } }));
      hits.push({ x: sx - 28, y: sy - 28, w: 56, h: 56, fn: () => { gs.docked = false; gs.dockPort = null; gs.tavernOpen = false; gs.dockPage = 0; } });
    }
  }

  drawDock(g){
    const gs = this.gs, pl = gs.player;
    if (gs.docked && gs.dockPort){
      this._drawLedger(g, gs);
      this.tDockMenu.setVisible(false);
      this.tDockPrompt.setVisible(false);
      return;
    } else if (gs.nearPort){
      let msg;
      if (gs.navyHostile()) msg = '⚓  ' + gs.nearPort.name + ' — PORT CLOSED (WANTED)';
      else if (gs.inCombat()) msg = '⚓  cannot dock in combat';
      else msg = (typeof TouchInput !== 'undefined' && TouchInput.active)
        ? '⚓  TAP THE PORT to dock at ' + gs.nearPort.name
        : '⚓  Press F to dock at ' + gs.nearPort.name;
      this.tDockPrompt.setText(msg).setVisible(true);
      this.tDockMenu.setVisible(false);
      this.tLedger.setVisible(false);
    } else {
      this.tDockPrompt.setVisible(false); this.tDockMenu.setVisible(false); this.tLedger.setVisible(false);
    }
  }
}
