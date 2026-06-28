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
    // minimap into its own masked graphics so islands never spill past the edges
    const mmx = GAME_W - MINIMAP_W - 12, mmy = 12;
    this.miniG = scene.add.graphics().setScrollFactor(0).setDepth(100);
    const mmMask = scene.make.graphics({ add: false });
    mmMask.fillStyle(0xffffff, 1); mmMask.fillRect(mmx, mmy, MINIMAP_W, MINIMAP_H);
    this.miniG.setMask(mmMask.createGeometryMask());

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
    // flag switch buttons (below the panel)
    const flagBtn = (x, label) => scene.add.text(x, 166, label, { fontFamily:'ui-monospace,monospace', fontSize:'11px', color:'#9fb6cc', backgroundColor:'#1a2c3c', padding:{ x:9, y:5 } }).setScrollFactor(0).setDepth(101).setOrigin(0, 0).setInteractive({ useHandCursor:true });
    this.btnFlagN = flagBtn(20, '⚐ NEUTRAL');
    this.btnFlagP = flagBtn(130, '☠ PIRATE');
    this.btnFlagN.on('pointerdown', () => { if (!this.gs.menuOpen) this.gs.requestFlag('neutral'); });
    this.btnFlagP.on('pointerdown', () => { if (!this.gs.menuOpen) this.gs.requestFlag('pirate'); });
    this.tFlagStatus = mk(20, 196, 9, '#6a8298');

    this.tIrons  = scene.add.text(GAME_W/2, GAME_H*0.30, '', { fontFamily:'ui-monospace,monospace', fontSize:'18px', color:'#E0503A', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    this.tStatus = scene.add.text(GAME_W/2, 26, '', { fontFamily:'ui-monospace,monospace', fontSize:'14px', color:'#E0503A', fontStyle:'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);
    this.tOver   = scene.add.text(GAME_W/2, GAME_H/2, '', { fontFamily:'ui-monospace,monospace', fontSize:'30px', color:'#E0503A', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(102);
    this.cx = GAME_W - MINIMAP_W - 66; this.cy = 66; this.cr = 40;
    this.tScale = scene.add.text(GAME_W/2, GAME_H - 22, '', { fontFamily:'ui-monospace,monospace', fontSize:'10px', color:'#D4C890' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);
    this.tDockPrompt = scene.add.text(GAME_W/2, GAME_H - 96, '', { fontFamily:'ui-monospace,monospace', fontSize:'13px', color:'#F0C840', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
    this.tDockMenu = scene.add.text(GAME_W/2, GAME_H/2, '', { fontFamily:'ui-monospace,monospace', fontSize:'14px', color:'#D4C890', align:'center', lineSpacing:6 }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
    this.popupPool = []; for (let i = 0; i < 16; i++){ const t = scene.add.text(0, 0, '', { fontFamily:'ui-monospace,monospace', fontSize:'12px', fontStyle:'bold' }).setScrollFactor(0).setDepth(60).setOrigin(0.5); this.popupPool.push(t); }
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
    g.fillStyle(0x0E1820, 0.9); g.fillRect(12, 10, 250, 150);

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
    this.tCrew.setText('CREW 20');
    this.tCoord.setText(Math.round(pl.x) + ',' + Math.round(pl.y));
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

    // flag buttons
    const f = gs.flag, pend = gs.flagPending, locked = gs.inCombat();
    this.btnFlagN.setColor((!pend && f === 'neutral') ? '#F0C840' : '#9fb6cc').setAlpha(locked ? 0.45 : 1);
    this.btnFlagP.setColor((!pend && f === 'pirate')  ? '#F0C840' : '#9fb6cc').setAlpha(locked ? 0.45 : 1);
    this.tFlagStatus.setText(locked ? '⚠ colors locked (in combat)'
      : pend ? 'raising ' + pend + ' colors… ' + Math.max(0, gs.flagChangeAt - gs.time.now/1000).toFixed(1) + 's'
      : 'flying ' + f + ' colors');

    this.tIrons.setText((pl.sailState > 0 && wa < P.noGo) ? 'IN IRONS — turn away' : '');
    let banner = hostile ? '★ WANTED — NAVY HOSTILE' : '';
    if (f === 'pirate'){ banner = (banner ? banner + '   ' : '') + '☠ PIRATE COLORS FLYING'; }
    this.tStatus.setText(banner).setColor(hostile ? '#E0503A' : '#D0A030');
    this.tOver.setText(pl.hull <= 0 ? 'YOU SANK\npress Esc → Reset Game' : '');

    drawWindCompass(g, pl, this.cx, this.cy, this.cr);
    drawMiniMap(this.miniG, gs, pl);
    g.lineStyle(1.5, 0xD2B48C, 1); g.strokeRect(GAME_W - MINIMAP_W - 12, 12, MINIMAP_W, MINIMAP_H);
    const ref = 200*gs.cameras.main.zoom, bx = GAME_W/2 - ref/2, by = GAME_H - 26;
    g.lineStyle(2, 0xD4C890, 0.8);
    g.lineBetween(bx, by, bx + ref, by); g.lineBetween(bx, by - 5, bx, by + 5); g.lineBetween(bx + ref, by - 5, bx + ref, by + 5);
    this.tScale.setText('200 px').setPosition(GAME_W/2, by + 4);

    this.drawDock(g);
  }

  drawDock(g){
    const gs = this.gs, pl = gs.player;
    if (gs.docked && gs.dockPort){
      const w = 420, h = 248, x = GAME_W/2 - w/2, y = GAME_H/2 - h/2;
      g.fillStyle(0x0E1820, 0.94); g.fillRect(x, y, w, h);
      g.lineStyle(2, 0x2A9EAE, 0.6); g.strokeRect(x, y, w, h);
      const port = gs.dockPort;
      const repairNeed = pl.maxHull - pl.hull, ammoNeed = pl.maxAmmo - pl.ammo;
      const l1 = repairNeed <= 0 ? '[1] Hull fully repaired' : '[1] Repair hull  —  ' + Math.ceil(repairNeed * REPAIR_COST_PER_HP) + 'g';
      const l2 = ammoNeed   <= 0 ? '[2] Ammo full'           : '[2] Restock ammo  —  ' + (ammoNeed * AMMO_COST_PER_UNIT) + 'g';
      let cargo = '(empty)';
      if (pl.hold){ const parts = []; for (const c of COMMODITIES){ const q = pl.hold.items[c]; if (q) parts.push((COMMODITY_INFO[c] ? COMMODITY_INFO[c].glyph : c) + q); } if (parts.length) cargo = parts.join(' '); }
      const src = port.sourceCommodity;
      const l4 = src ? ('[4] Buy ' + src + '  —  ' + PortEconomy.sellPrice(port, src) + 'g/ea') : '[4] — (no local good)';
      this.tDockMenu.setText('⚓  ' + port.name + '   (' + (port.type || 'Port') + ')\n\nGOLD  ' + (pl.bank || 0) + '     HOLD  ' + cargo + '\n\n' + l1 + '\n' + l2 + '\n[3] Sell all cargo\n' + l4 + '\n\n[F] Depart').setVisible(true);
      this.tDockPrompt.setVisible(false);
    } else if (gs.nearPort){
      let msg;
      if (gs.navyHostile()) msg = '⚓  ' + gs.nearPort.name + ' — PORT CLOSED (WANTED)';
      else if (gs.inCombat()) msg = '⚓  cannot dock in combat';
      else msg = '⚓  Press F to dock at ' + gs.nearPort.name;
      this.tDockPrompt.setText(msg).setVisible(true);
      this.tDockMenu.setVisible(false);
    } else {
      this.tDockPrompt.setVisible(false); this.tDockMenu.setVisible(false);
    }
  }
}
