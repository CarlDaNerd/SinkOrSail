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
    this.mapG = this.add.graphics().setScrollFactor(0).setDepth(50);
    this.mapText = this.add.text(GAME_W/2, GAME_H - 44, '', { fontFamily:'ui-monospace,monospace', fontSize:'12px', color:'#8AAAC8' }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
    this.mapG.setVisible(false); this.mapText.setVisible(false);

    // pause menu
    this.menuBg = this.add.graphics().setScrollFactor(0).setDepth(130);
    this.menuTitle = this.add.text(GAME_W/2, GAME_H/2 - 150, 'PAUSED', { fontFamily:'ui-monospace,monospace', fontSize:'24px', color:'#D4C890', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(131);
    this.btnResume   = this._btn(GAME_W/2, GAME_H/2 - 100, 'Resume',           () => { this.gs.menuOpen = false; });
    this.btnNew      = this._btn(GAME_W/2, GAME_H/2 -  58, 'New Game',         () => { this.gs.resetGame(); });
    this.btnLoad     = this._btn(GAME_W/2, GAME_H/2 -  16, 'Load Last Save',   () => { this.gs.loadGame(); });
    this.btnDownload = this._btn(GAME_W/2, GAME_H/2 +  26, 'Download Save',    () => { Save.exportSaved(); });
    this.btnImport   = this._btn(GAME_W/2, GAME_H/2 +  68, 'Import Save File', () => { this.gs.importGame(); });
    this.btnTuning   = this._btn(GAME_W/2, GAME_H/2 + 110, 'Tuning Panel',     () => { if (globalThis.SOS_toggleTuning) globalThis.SOS_toggleTuning(); });
    this.btnExtras   = this._btn(GAME_W/2, GAME_H/2 + 152, 'Weather & Zoom',   () => { this.gs.extrasOn = !this.gs.extrasOn; });   // checkbox for the M7 zoom + M11 weather features
    this._menuObjs = [this.menuBg, this.menuTitle, this.btnResume, this.btnNew, this.btnLoad, this.btnDownload, this.btnImport, this.btnTuning, this.btnExtras];
    for (const o of this._menuObjs) o.setVisible(false);
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
      if (gs.mapDirty){ drawWorldMap(this.mapG, gs); gs.mapDirty = false; }
      this.mapG.setVisible(true);
      this.mapText.setText('MAP   ' + Math.round(gs.mapCenterX) + ', ' + Math.round(gs.mapCenterY) + '     drag to pan · wheel / Z X zoom · M or Esc close   (still sailing)').setVisible(true);
    } else { this.mapG.setVisible(false); this.mapText.setVisible(false); }

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
      this.btnExtras.setText('Weather & Zoom: ' + (gs.extrasOn ? 'ON' : 'OFF')).setColor(gs.extrasOn ? '#D4C890' : '#7a8a98');
    }

    // HUD always updates (it renders above the map so instruments stay visible)
    this.hud.update(gs.player, windOff(gs.player.heading, P.windFrom));
    this.hud.drawPopups(gs.popups);
  }
}
