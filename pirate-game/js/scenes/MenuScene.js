// ── scenes/MenuScene.js ──
// Title screen. If a saved run exists you can Continue it; otherwise just set
// sail on a new game. Starting the game launches the parallel UIScene.
class MenuScene extends Phaser.Scene {
  constructor(){ super('MenuScene'); }
  create(){
    this.cameras.main.setBackgroundColor('#15263C');
    const cx = this.scale.width/2, cy = this.scale.height/2;
    this.add.text(cx, cy - 60, 'SINK OR SAIL', { fontFamily:'ui-monospace,monospace', fontSize:'46px', color:'#D4C890', fontStyle:'bold' }).setOrigin(0.5);
    this.add.text(cx, cy - 12, 'a top-down Age of Sail sandbox', { fontFamily:'ui-monospace,monospace', fontSize:'14px', color:'#8AAAC8' }).setOrigin(0.5);

    const newGame      = () => { this.scene.start('GameScene', { load:false }); this.scene.launch('UIScene'); };
    const continueGame = () => { this.scene.start('GameScene', { load:true  }); this.scene.launch('UIScene'); };

    if (Save.exists()){
      this.add.text(cx, cy + 40, 'C — Continue       N — New Game', { fontFamily:'ui-monospace,monospace', fontSize:'14px', color:'#6a8298' }).setOrigin(0.5);
      this.input.keyboard.on('keydown-C', continueGame);
      this.input.keyboard.on('keydown-N', newGame);
      this.input.keyboard.once('keydown-ENTER', continueGame);
      this.input.once('pointerdown', continueGame);
    } else {
      this.add.text(cx, cy + 40, 'click or press ENTER to set sail', { fontFamily:'ui-monospace,monospace', fontSize:'12px', color:'#6a8298' }).setOrigin(0.5);
      this.input.once('pointerdown', newGame);
      this.input.keyboard.once('keydown', newGame);
    }
  }
}
