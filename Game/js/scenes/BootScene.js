// ── scenes/BootScene.js ──
// No external assets (everything is drawn procedurally), so Boot just hands off
// to the menu. Kept as a distinct scene to establish the standard boot pattern.
class BootScene extends Phaser.Scene {
  constructor(){ super('BootScene'); }
  create(){ this.scene.start('MenuScene'); }
}
