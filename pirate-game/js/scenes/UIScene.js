// ── scenes/UIScene.js ──
// Parallel HUD scene drawn on top of the GameScene (handoff §13). It owns the
// HUD's text/graphics objects and pulls live state from the GameScene each
// frame. Runs after GameScene in the scene list, so it reads post-update state.
class UIScene extends Phaser.Scene {
  constructor(){ super('UIScene'); }
  create(){
    this.scene.bringToTop();                       // ensure the HUD renders above the world
    this.gs = this.scene.get('GameScene');
    this.hud = new HUD(this, this.gs);
  }
  update(){
    const gs = this.gs;
    if (!gs || !gs.player) return;
    const pl = gs.player;
    this.hud.update(pl, windOff(pl.heading, P.windFrom));
    this.hud.drawPopups(gs.popups);
  }
}
