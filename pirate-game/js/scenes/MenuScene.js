// ── scenes/MenuScene.js ──
// Minimal title screen. Any key or click sets sail: starts the GameScene and
// launches the UIScene in parallel on top of it.
class MenuScene extends Phaser.Scene {
  constructor(){ super('MenuScene'); }
  create(){
    this.cameras.main.setBackgroundColor('#15263C');
    const cx = this.scale.width/2, cy = this.scale.height/2;
    this.add.text(cx, cy - 44, 'PIRATE', { fontFamily:'ui-monospace,monospace', fontSize:'48px', color:'#D4C890', fontStyle:'bold' }).setOrigin(0.5);
    this.add.text(cx, cy + 4, 'Combat + Factions — V1', { fontFamily:'ui-monospace,monospace', fontSize:'14px', color:'#8AAAC8' }).setOrigin(0.5);
    this.add.text(cx, cy + 46, 'click or press ENTER to set sail', { fontFamily:'ui-monospace,monospace', fontSize:'12px', color:'#6a8298' }).setOrigin(0.5);

    const start = () => { this.scene.start('GameScene'); this.scene.launch('UIScene'); };
    this.input.once('pointerdown', start);
    this.input.keyboard.once('keydown', start);
  }
}
