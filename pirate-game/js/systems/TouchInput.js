// ── systems/TouchInput.js ──
// Touch / mobile input add-on. A namespaced-global singleton (methods take the
// scene first, matching every other system). It is PURELY ADDITIVE: on desktop
// (no touch) it renders nothing and reports nothing, so the keyboard path in
// GameScene.update() is byte-for-byte unchanged.
//
// Design (Noah's rulings):
//   • Steering = HOLD buttons (turn-left / turn-right) mirroring A / D (.isDown).
//   • Sail     = +/- buttons mirroring W / S (edge = one pulse per tap).
//   • Firing   = 4 discrete buttons: bow / stern / port / star (edge pulses).
//   • Pause    = top-left button mirroring Esc.
//   • Tap port/ship  → in combat: capture attempt; else: dock attempt.
//   • Tap minimap    → open the world map (mirrors M).
//   • Docked shop rows tappable via invisible zones over the menu (mirrors 1-9,0).
//
// GameScene reads via TouchInput.held(name) (continuous) and
// TouchInput.justDown(name) (consumed edge, once per press). All positions and
// sizes here are PLACEHOLDERS — tuned live.

const TouchInput = {
  active: false,          // true only on a touch device (or forced)
  _scene: null,
  _held: {},              // name -> bool (currently pressed)
  _edge: {},              // name -> bool (pressed since last consume)
  _btns: [],              // Phaser button objects (for resize reposition)
  _dockZones: [],         // invisible tap zones over the docked shop rows

  // Buttons that behave as HOLD (report via held()); everything else is edge.
  HOLD_BTNS: ['turnL', 'turnR'],

  // ── detection ──────────────────────────────────────────────────────────────
  isTouchDevice(){
    return (typeof window !== 'undefined') &&
      (('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0) || !!window.FORCE_TOUCH);
  },

  // ── lifecycle ────────────────────────────────────────────────────────────────
  // Called from UIScene.create() (it owns the on-screen overlay, like the HUD).
  init(uiScene, gameScene){
    this._scene = gameScene;
    this.active = this.isTouchDevice();
    if (!this.active) return;                     // desktop: no overlay, no reads

    this._buildButtons(uiScene);
    this._buildPauseButton(uiScene);
    // resize: re-fit the canvas is handled by Phaser.Scale.RESIZE (main.js);
    // we just reposition our buttons when the game size changes.
    uiScene.scale.on('resize', () => this._layout());
  },

  // A pressable button. `name` is the logical control; `hold` marks it HOLD-type.
  _mkButton(scene, name, label, hold){
    const t = scene.add.text(0, 0, label, {
      fontFamily: 'ui-monospace,monospace', fontSize: TOUCH_BTN_FONT + 'px',
      color: '#D4C890', backgroundColor: '#16283a',
      padding: { x: TOUCH_BTN_PAD_X, y: TOUCH_BTN_PAD_Y },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(140).setAlpha(TOUCH_BTN_ALPHA)
      .setInteractive({ useHandCursor: true });

    const press = () => {
      if (this._scene && this._scene.menuOpen) return;   // menu owns input while paused
      this._held[name] = true; this._edge[name] = true;
      t.setColor('#F0C840');
    };
    const release = () => { this._held[name] = false; t.setColor('#D4C890'); };

    t.on('pointerdown', press);
    t.on('pointerup', release);
    t.on('pointerout', release);      // finger slid off the button
    t._touchName = name; t._touchHold = hold;
    this._btns.push(t);
    return t;
  },

  _buildButtons(scene){
    // LEFT cluster — movement (turn L/R hold, sail +/-)
    this._mkButton(scene, 'turnL', '◀', true);
    this._mkButton(scene, 'turnR', '▶', true);
    this._mkButton(scene, 'sailUp', 'SAIL +', false);
    this._mkButton(scene, 'sailDn', 'SAIL −', false);
    // RIGHT cluster — firing (bow / stern / port / star)
    this._mkButton(scene, 'fireBow',  'BOW',  false);
    this._mkButton(scene, 'fireStern','STERN',false);
    this._mkButton(scene, 'firePort', 'PORT', false);
    this._mkButton(scene, 'fireStar', 'STAR', false);
    this._layout();
  },

  _buildPauseButton(scene){
    const t = scene.add.text(TOUCH_MARGIN, TOUCH_MARGIN, '☰', {
      fontFamily: 'ui-monospace,monospace', fontSize: (TOUCH_BTN_FONT + 4) + 'px',
      color: '#D4C890', backgroundColor: '#16283a',
      padding: { x: TOUCH_BTN_PAD_X, y: TOUCH_BTN_PAD_Y },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(140).setAlpha(TOUCH_BTN_ALPHA)
      .setInteractive({ useHandCursor: true });
    t.on('pointerdown', () => { if (this._scene) this._scene.toggleMenu(); });
    this._pauseBtn = t;
  },

  // Position the two clusters relative to current screen size (thumb-reachable).
  _layout(){
    if (!this.active) return;
    const sz = (this._scene && this._scene.scale) ? this._scene.scale.gameSize : { width: GAME_W, height: GAME_H };
    const W = sz.width, H = sz.height, m = TOUCH_MARGIN, gap = TOUCH_BTN_GAP;
    const by = H - m - TOUCH_BTN_H/2;                     // bottom row baseline
    const pos = {};
    // left cluster (bottom-left)
    pos.turnL  = [m + TOUCH_BTN_W*0.5, by];
    pos.turnR  = [m + TOUCH_BTN_W*1.5 + gap, by];
    pos.sailUp = [m + TOUCH_BTN_W*0.5, by - TOUCH_BTN_H - gap];
    pos.sailDn = [m + TOUCH_BTN_W*1.5 + gap, by - TOUCH_BTN_H - gap];
    // right cluster (bottom-right): diamond-ish — port/star bottom, bow/stern above
    const rx = W - m - TOUCH_BTN_W*1.5 - gap, rx2 = W - m - TOUCH_BTN_W*0.5;
    pos.firePort  = [rx,  by];
    pos.fireStar  = [rx2, by];
    pos.fireBow   = [rx,  by - TOUCH_BTN_H - gap];
    pos.fireStern = [rx2, by - TOUCH_BTN_H - gap];
    for (const b of this._btns){ const p = pos[b._touchName]; if (p) b.setPosition(p[0], p[1]); }
    if (this._pauseBtn) this._pauseBtn.setPosition(m, m);
  },

  // ── read API (consumed by GameScene) ────────────────────────────────────────
  held(name){ return this.active && !!this._held[name]; },
  // Edge read: true once per press, then cleared (matches Keyboard.JustDown feel).
  justDown(name){
    if (!this.active) return false;
    if (this._edge[name]){ this._edge[name] = false; return true; }
    return false;
  },

  // Show/hide the movement+fire overlay (hidden while docked or paused; those
  // states have their own touch surfaces). Called each frame from UIScene.
  setControlsVisible(v){
    if (!this.active) return;
    for (const b of this._btns) b.setVisible(v);
  },

  // ── world-tap: dock or capture ───────────────────────────────────────────────
  // Wired from GameScene: a pointerdown on the world (not on a button/overlay).
  // Noah's rule: in combat → capture; not in combat → dock. Capture fns already
  // self-check range + threshold and return truthy when they consume.
  handleWorldTap(scene){
    if (!this.active) return;
    if (scene.menuOpen || scene.mapOpen || scene.docked) return;
    const pl = scene.player; if (!pl || pl.hull <= 0) return;
    if (scene.inCombat()){
      // capture: port-capture wins over boarding if both are eligible (matches B key)
      let consumed = (typeof PortCaptureSystem !== 'undefined') && PortCaptureSystem.tryCapture(scene);
      if (!consumed && typeof BoardingSystem !== 'undefined') BoardingSystem.tryBoard(scene);
    } else {
      // dock: reuse the exact near-port dock branch conditions
      if (scene.nearPort){
        if (scene.navyHostile()) scene.flashPopup(pl.x, pl.y, 'PORT CLOSED — WANTED', 0xE0503A);
        else { scene.docked = true; scene.dockPort = scene.nearPort; pl.vel = 0;
          scene.events.emit(EV.DOCK_ENTERED, { port: scene.nearPort });
          Systems.onDock(scene, scene.nearPort);
          if (Save.write(scene)) scene.flashPopup(pl.x, pl.y - 40, 'GAME SAVED', 0x8AAAC8); }
      }
    }
  },
};
