// ── scenes/UIScene.js ──
// Parallel overlay scene: the HUD, the big map (M), and the pause menu (Esc).
// Reads live state from the GameScene each frame; renders above the world.
class UIScene extends Phaser.Scene {
  constructor(){ super('UIScene'); }

  create(){
    this.scene.bringToTop();
    this.gs = this.scene.get('GameScene');
    this.hud = new HUD(this, this.gs);

    // big map — drawn BELOW the HUD (depth 50) so your instruments stay visible
    // while you sail with the chart up; the chart itself is non-pausing
    this.mapG = this.add.graphics().setScrollFactor(0).setDepth(50);                    // backdrop + revealed tint
    this.mapLandG = this.add.graphics().setScrollFactor(0).setDepth(51);                // land / ports / you — clipped to the revealed area
    this.mapMaskG = this.make.graphics({ add: false });                                 // mask = the revealed cells
    this.mapLandG.setMask(this.mapMaskG.createGeometryMask());
    this.mapText = this.add.text(GAME_W/2, GAME_H - 44, '', { fontFamily:'ui-monospace,monospace', fontSize:'12px', color:'#8AAAC8' }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
    this.mapG.setVisible(false); this.mapLandG.setVisible(false); this.mapText.setVisible(false);

    // pause menu
    this.menuBg = this.add.graphics().setScrollFactor(0).setDepth(130);
    this.menuTitle = this.add.text(GAME_W/2, GAME_H/2 - 150, 'PAUSED', { fontFamily:'ui-monospace,monospace', fontSize:'24px', color:'#D4C890', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(131);
    this.btnResume   = this._btn(GAME_W/2, GAME_H/2 - 100, 'Resume',           () => { this.gs.menuOpen = false; });
    this.btnNew      = this._btn(GAME_W/2, GAME_H/2 -  58, 'New Game',         () => { this.gs.resetGame(); });
    this.btnLoad     = this._btn(GAME_W/2, GAME_H/2 -  16, 'Load Last Save',   () => { this.gs.loadGame(); });
    this.btnDownload = this._btn(GAME_W/2, GAME_H/2 +  26, 'Download Save',    () => { Save.exportSaved(); });
    this.btnImport   = this._btn(GAME_W/2, GAME_H/2 +  68, 'Import Save File', () => { this.gs.importGame(); });
    this.btnTuning   = this._btn(GAME_W/2, GAME_H/2 + 110, 'Tuning Panel',     () => { if (globalThis.SOS_toggleTuning) globalThis.SOS_toggleTuning(); });
    this.btnExtras   = this._btn(GAME_W/2, GAME_H/2 + 152, 'Weather',          () => { this.gs.extrasOn = !this.gs.extrasOn; });   // toggles M11 weather only (zoom is always on)
    this._menuObjs = [this.menuBg, this.menuTitle, this.btnResume, this.btnNew, this.btnLoad, this.btnDownload, this.btnImport, this.btnTuning, this.btnExtras];
    for (const o of this._menuObjs) o.setVisible(false);
    // R-1: reflow the HUD (and touch controls) whenever the canvas re-fits
    this.scale.on('resize', () => { if (this.hud) this.hud.relayout(); });

    // ── touch add-on: build on-screen controls (no-op on desktop) ──
    if (typeof TouchInput !== 'undefined'){
      TouchInput.init(this, this.gs);
      if (TouchInput.active){
        // tap the minimap (top-right circle) → open the world map (mirrors M)
        const mr = MINIMAP_H/2, full = mr + COMPASS_RING_W + COMPASS_LABEL_PAD;
        const cxp = GAME_W - 12 - full, cyp = 12 + full;
        this._miniZone = this.add.zone(cxp, cyp, mr*2, mr*2).setScrollFactor(0).setDepth(141)
          .setInteractive(new Phaser.Geom.Circle(mr, mr, mr), Phaser.Geom.Circle.Contains);
        this._miniZone.on('pointerdown', () => { if (!this.gs.menuOpen && !this.gs.docked && !this.gs.mapOpen) this.gs.toggleMap(); });
        // invisible tappable rows over the docked shop menu (mirror 1-9,0 + F)
        this._buildDockZones();
      }
    }
  }

  // Invisible tap zones stacked over the docked shop text rows. Each calls the
  // same GameScene action its number key does. Positions track drawDock()'s
  // layout (w=440,h=400, centered); rows are the menu lines in order.
  _buildDockZones(){
    const acts = [
      () => this.gs.repairAtPort(),                                   // [1]
      () => this.gs.restockAtPort(),                                  // [2]
      () => this.gs.sellAllAtPort(),                                  // [3]
      () => this.gs.buySourceAtPort(),                                // [4]
      () => { if (typeof CrewSystem !== 'undefined') CrewSystem.hireOne(this.gs, this.gs.dockPort); },   // [5]
      () => { if (typeof UpgradeSystem !== 'undefined') UpgradeSystem.buySail(this.gs); },               // [6]
      () => { if (typeof UpgradeSystem !== 'undefined') UpgradeSystem.buyCannon(this.gs); },             // [7]
      () => { if (typeof UpgradeSystem !== 'undefined') UpgradeSystem.buyShip(this.gs); },               // [8]
      () => { if (typeof HireSystem !== 'undefined') HireSystem.hireAtDock(this.gs); },                  // [9]
      () => { if (typeof BountySystem !== 'undefined') BountySystem.acceptAtDock(this.gs); },            // [0]
      () => { this.gs.docked = false; this.gs.dockPort = null; },                                        // [F] depart
    ];
    this._dockZones = [];
    for (const fn of acts){
      const z = this.add.zone(0, 0, 400, 15).setOrigin(0, 0).setScrollFactor(0).setDepth(141)
        .setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => { if (this.gs.docked) fn(); });
      z.setVisible(false);
      this._dockZones.push(z);
    }
  }

  // Position/toggle dock zones to overlay the menu text lines (called each frame
  // while docked). PLACEHOLDER geometry — tuned against the live menu layout.
  _layoutDockZones(){
    if (!this._dockZones || !this._dockZones.length) return;
    const on = !!(this.gs.docked && this.gs.dockPort);
    const w = 440, x = GAME_W/2 - w/2, y = GAME_H/2 - 200;
    // menu body starts after title(1) + blank(1) + gold line(1) + blank(1) ≈ 5 lines
    const rowH = 17, firstRowY = y + 24 + rowH*5, zw = w - 40, zx = x + 20;
    for (let i = 0; i < this._dockZones.length; i++){
      const z = this._dockZones[i];
      z.setVisible(on);
      if (on){ z.setPosition(zx, firstRowY + i*rowH); z.setSize(zw, rowH); z.input.hitArea.setTo(0, 0, zw, rowH); }
    }
  }

  _btn(x, y, label, fn){
    const t = this.add.text(x, y, label, { fontFamily:'ui-monospace,monospace', fontSize:'16px', color:'#D4C890', backgroundColor:'#1a2c3c', padding:{ x:22, y:9 } })
      .setOrigin(0.5).setScrollFactor(0).setDepth(131).setInteractive({ useHandCursor:true });
    t.on('pointerover', () => t.setColor('#F0C840'));
    t.on('pointerout',  () => t.setColor('#D4C890'));
    t.on('pointerdown', () => { if (this.gs.menuOpen) fn(); });   // only act while the menu is open
    return t;
  }

  update(){
    const gs = this.gs;
    if (!gs || !gs.player) return;

    // big map (only re-render on pan/zoom)
    if (gs.mapOpen){
      if (gs.mapDirty){ drawWorldMap(this.mapG, this.mapLandG, this.mapMaskG, gs); gs.mapDirty = false; }
      this.mapG.setVisible(true); this.mapLandG.setVisible(true);
      this.mapText.setText('MAP   ' + Math.round(gs.mapCenterX/COORD_SCALE) + ', ' + Math.round(gs.mapCenterY/COORD_SCALE) + '     drag to pan · wheel / Z X zoom · M or Esc close   (still sailing)').setVisible(true);
    } else { this.mapG.setVisible(false); this.mapLandG.setVisible(false); this.mapText.setVisible(false); }

    // pause menu
    const open = gs.menuOpen;
    for (const o of this._menuObjs) o.setVisible(open);
    if (open){
      const bw = 340, bh = 410, bx = GAME_W/2 - bw/2, by = GAME_H/2 - bh/2;
      this.menuBg.clear();
      this.menuBg.fillStyle(0x0A1119, 0.72); this.menuBg.fillRect(0, 0, GAME_W, GAME_H);
      this.menuBg.fillStyle(0x0E1820, 0.97); this.menuBg.fillRect(bx, by, bw, bh);
      this.menuBg.lineStyle(2, 0x2A9EAE, 0.5); this.menuBg.strokeRect(bx, by, bw, bh);
      const hasSave = Save.exists();
      this.btnLoad.setAlpha(hasSave ? 1 : 0.4); this.btnDownload.setAlpha(hasSave ? 1 : 0.4);   // grey out with no save
      const panelOn = !!(document.getElementById('panel') && document.getElementById('panel').classList.contains('open'));
      this.btnTuning.setText('Tuning Panel: ' + (panelOn ? 'ON' : 'OFF'));
      this.btnExtras.setText('Weather: ' + (gs.extrasOn ? 'ON' : 'OFF')).setColor(gs.extrasOn ? '#D4C890' : '#7a8a98');
    }

    // HUD always updates (it renders above the map so instruments stay visible)
    this.hud.update(gs.player, windOff(gs.player.heading, WindSystem.dirAt(gs, gs.player.x, gs.player.y)));
    this.hud.drawPopups(gs.popups);

    // touch overlay: movement+fire buttons show only while actively sailing
    // (hidden when paused, docked, or the chart is up — those have their own UI).
    if (typeof TouchInput !== 'undefined' && TouchInput.active){
      TouchInput.setControlsVisible(!gs.menuOpen && !gs.docked && !gs.mapOpen && gs.player.hull > 0);
      if (this._pauseVis === undefined) this._pauseVis = true;
      if (TouchInput._pauseBtn) TouchInput._pauseBtn.setVisible(!gs.docked && !gs.mapOpen);
      if (TouchInput._fsBtn) TouchInput._fsBtn.setVisible(!gs.docked && !gs.mapOpen);
      if (this._miniZone) this._miniZone.setVisible(!gs.menuOpen && !gs.docked && !gs.mapOpen);
      this._layoutDockZones();
    }
  }
}
