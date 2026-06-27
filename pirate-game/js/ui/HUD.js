// ── ui/HUD.js ──
// In-canvas HUD overlay (handoff §13). Lives in the parallel UIScene: the
// text/graphics objects are created on the UIScene (`this.s`), while live game
// state is read from the GameScene (`this.gs`) each frame.
class HUD {
  constructor(scene, gs){
    this.s = scene;     // UIScene — owns the text/graphics objects
    this.gs = gs;       // GameScene — the data source
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(100);
    // minimap drawn into its own graphics, clipped by a rectangular mask so
    // islands never spill past the edges
    const mmx = GAME_W - MINIMAP_W - 12, mmy = 12;
    this.miniG = scene.add.graphics().setScrollFactor(0).setDepth(100);
    const mmMask = scene.make.graphics({ add: false });
    mmMask.fillStyle(0xffffff, 1); mmMask.fillRect(mmx, mmy, MINIMAP_W, MINIMAP_H);
    this.miniG.setMask(mmMask.createGeometryMask());
    const mk = (x, y, sz, col, o) => scene.add.text(x, y, '', { fontFamily:'ui-monospace,monospace', fontSize:sz + 'px', color:col }).setScrollFactor(0).setDepth(101).setOrigin(o ? 0.5 : 0, 0);
    this.tSpeed = mk(20, 16, 12, '#D4C890'); this.tSail = mk(20, 38, 12, '#D4C890');
    this.tHull = mk(20, 82, 11, '#D4C890'); this.tAmmo = mk(20, 100, 11, '#D4C890'); this.tGold = mk(110, 100, 11, '#F0C840');
    this.tIrons  = scene.add.text(GAME_W/2, GAME_H*0.30, '', { fontFamily:'ui-monospace,monospace', fontSize:'18px', color:'#E0503A', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    this.tStatus = scene.add.text(GAME_W/2, 26, '', { fontFamily:'ui-monospace,monospace', fontSize:'14px', color:'#E0503A', fontStyle:'bold' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);
    this.tOver   = scene.add.text(GAME_W/2, GAME_H/2, '', { fontFamily:'ui-monospace,monospace', fontSize:'30px', color:'#E0503A', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(102);
    this.cx = GAME_W - MINIMAP_W - 66; this.cy = 66; this.cr = 40;   // left of the (larger) minimap
    this.tScale = scene.add.text(GAME_W/2, GAME_H - 22, '', { fontFamily:'ui-monospace,monospace', fontSize:'10px', color:'#D4C890' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);
    // docking
    this.tDockPrompt = scene.add.text(GAME_W/2, GAME_H - 96, '', { fontFamily:'ui-monospace,monospace', fontSize:'13px', color:'#F0C840', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
    this.tDockMenu = scene.add.text(GAME_W/2, GAME_H/2, '', { fontFamily:'ui-monospace,monospace', fontSize:'14px', color:'#D4C890', align:'center', lineSpacing:6 }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
    this.popupPool = []; for (let i = 0; i < 16; i++){ const t = scene.add.text(0, 0, '', { fontFamily:'ui-monospace,monospace', fontSize:'12px', fontStyle:'bold' }).setScrollFactor(0).setDepth(60).setOrigin(0.5); this.popupPool.push(t); }
  }

  // popups are stored in world coords on the GameScene; convert to screen space
  // (UIScene doesn't scroll) so they sit over the right spot.
  drawPopups(popups){
    const cam = this.gs.cameras.main;
    for (let i = 0; i < this.popupPool.length; i++){
      const t = this.popupPool[i], p = popups[i];
      if (p){ const fade = 1 - p.age/p.life;
        t.setText(p.txt).setColor('#' + p.color.toString(16).padStart(6, '0'))
         .setPosition(p.x - cam.scrollX, p.y - cam.scrollY).setAlpha(fade).setVisible(true);
      } else t.setVisible(false);
    }
  }

  update(pl, wa){
    const g = this.g; g.clear();
    g.fillStyle(0x0E1820, 0.9); g.fillRect(12, 10, 150, 112);
    const sp = Math.min(pl.vel/P.maxSpeed, 1), sc = sp < 0.05 ? 0xE0503A : sp < 0.5 ? 0xE0A040 : 0x4CA84C;
    g.fillStyle(0x223040, 1); g.fillRect(20, 60, 130, 7); g.fillStyle(sc, 1); g.fillRect(20, 60, 130*sp, 7);
    this.tSpeed.setText('SPEED  ' + (pl.vel/P.maxSpeed*9).toFixed(1) + ' kn');
    this.tSail.setText(['NO SAILS', 'MAIN SAIL', 'FULL SAIL'][pl.sailState]).setColor(['#E0503A', '#E0A040', '#4CA84C'][pl.sailState]);
    const hp = Math.max(0, pl.hull/pl.maxHull);
    g.fillStyle(0x223040, 1); g.fillRect(20, 76, 130, 5); g.fillStyle(hp < 0.35 ? 0xE0503A : 0x4CA84C, 1); g.fillRect(20, 76, 130*hp, 5);
    this.tHull.setText('HULL ' + Math.ceil(pl.hull)); this.tAmmo.setText('AMMO ' + pl.ammo); this.tGold.setText('GOLD ' + pl.gold);
    this.tIrons.setText((pl.sailState > 0 && wa < P.noGo) ? 'IN IRONS — turn away' : '');
    // navy status banner
    const hostile = this.gs.navyHostile();
    let banner = hostile ? '★ WANTED — NAVY HOSTILE' : '';
    if (this.gs.flag === 'pirate'){ banner = (banner ? banner + '   ' : '') + '☠ PIRATE COLORS FLYING'; }
    this.tStatus.setText(banner).setColor(hostile ? '#E0503A' : '#D0A030');
    this.tOver.setText(pl.hull <= 0 ? 'YOU SANK\npress Esc → Reset Game' : '');
    // compass
    drawWindCompass(g, pl, this.cx, this.cy, this.cr);
    // minimap content (masked/clipped) + a small tan border (unmasked, crisp)
    drawMiniMap(this.miniG, this.gs, pl);
    g.lineStyle(1.5, 0xD2B48C, 1); g.strokeRect(GAME_W - MINIMAP_W - 12, 12, MINIMAP_W, MINIMAP_H);
    // bottom-center pixel scale bar (200px world reference)
    const camZoom = this.gs.cameras.main.zoom;                  // 1 in this build → screen px == world px
    const ref = 200*camZoom, bx = GAME_W/2 - ref/2, by = GAME_H - 26;
    g.lineStyle(2, 0xD4C890, 0.8);
    g.lineBetween(bx, by, bx + ref, by);
    g.lineBetween(bx, by - 5, bx, by + 5); g.lineBetween(bx + ref, by - 5, bx + ref, by + 5);
    this.tScale.setText('200 px').setPosition(GAME_W/2, by + 4);

    this.drawDock(g);
  }

  // dock menu (when docked) or "press F to dock" prompt (when near a port)
  drawDock(g){
    const gs = this.gs, pl = gs.player;
    if (gs.docked && gs.dockPort){
      const w = 400, h = 188, x = GAME_W/2 - w/2, y = GAME_H/2 - h/2;
      g.fillStyle(0x0E1820, 0.94); g.fillRect(x, y, w, h);
      g.lineStyle(2, 0x2A9EAE, 0.6); g.strokeRect(x, y, w, h);
      const repairNeed = pl.maxHull - pl.hull, ammoNeed = pl.maxAmmo - pl.ammo;
      const l1 = repairNeed <= 0 ? '[1] Hull fully repaired' : '[1] Repair hull  —  ' + Math.ceil(repairNeed * REPAIR_COST_PER_HP) + 'g';
      const l2 = ammoNeed   <= 0 ? '[2] Ammo full'           : '[2] Restock ammo  —  ' + (ammoNeed * AMMO_COST_PER_UNIT) + 'g';
      this.tDockMenu.setText('⚓  ' + gs.dockPort.name + '   (saved)\n\nGOLD  ' + pl.gold + '\n\n' + l1 + '\n' + l2 + '\n\n[F] Depart').setVisible(true);
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
