// ── main.js ──
// Phaser config + launch (handoff §3). Defines the scene order; UIScene runs
// parallel to GameScene (launched from MenuScene), and being last in the list
// it both renders on top and updates after GameScene each frame. Exposes the
// global `game` for the debug overlay. fps target is a hint only — the code
// must not rely on it being exact (frame-rate independence, §2).
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#15263C',
  scene: [BootScene, MenuScene, GameScene, UIScene],
  fps: { target: 60 },
  // RESIZE: canvas tracks the window (phone rotate / browser resize). GAME_W/H
  // are read at boot for initial layout; the resize handler keeps globals fresh
  // so touch-button layout and HUD anchors reposition correctly.
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
};
const game = new Phaser.Game(config);
