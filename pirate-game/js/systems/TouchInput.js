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

  // A visible, fixed-size button: bordered rectangle + centered label (MW-6).
  _mkButton(scene, name, label, hold, w, h){
    const bw = w || TOUCH_BTN_W, bh = h || TOUCH_BTN_H;
    const bg = scene.add.rectangle(0, 0, bw, bh, 0x16283a, TOUCH_BTN_ALPHA)
      .setStrokeStyle(2, 0x8AAAC8, 0.9).setScrollFactor(0).setDepth(140)
      .setInteractive({ useHandCursor: true });
    const t = scene.add.text(0, 0, label, {
      fontFamily: 'ui-monospace,monospace', fontSize: TOUCH_BTN_FONT + 'px', color: '#D4C890',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(141);
    const press = () => {
      if (this._scene && this._scene.menuOpen) return;
      this._held[name] = true; this._edge[name] = true;
      bg.setFillStyle(0x2a4a66, 1); t.setColor('#F0C840');
    };
    const release = () => { this._held[name] = false; bg.setFillStyle(0x16283a, TOUCH_BTN_ALPHA); t.setColor('#D4C890'); };
    bg.on('pointerdown', press); bg.on('pointerup', release); bg.on('pointerout', release);
    const self = this;
    const btn = {
      bg, t, _touchName: name,
      setPosition(x, y){ bg.setPosition(x, y); t.setPosition(x, y); return btn; },
      setVisible(v){ bg.setVisible(v); t.setVisible(v); return btn; },
    };
    this._btns.push(btn);
    return btn;
  },

  _buildButtons(scene){
    // MW-7 layout: steering is finger-drag on open screen (see steer* below).
    // LEFT bottom-third: PORT broadside cannon; RIGHT bottom-third: STARBOARD cannon.
    // One SAILS button cycles half → full → down (MW-9). Chasers kept as smaller
    // buttons above each cannon (ASSUMPTION — Noah to confirm chasers stay).
    this._mkButton(scene, 'cannonL', 'CANNON\n◀ PORT', false, TOUCH_CANNON_W, TOUCH_CANNON_H);
    this._mkButton(scene, 'cannonR', 'CANNON\nSTAR ▶', false, TOUCH_CANNON_W, TOUCH_CANNON_H);
    this._mkButton(scene, 'fireBow',   'BOW',   false, TOUCH_CHASER_W, TOUCH_CHASER_H);
    this._mkButton(scene, 'fireStern', 'STERN', false, TOUCH_CHASER_W, TOUCH_CHASER_H);
    this._mkButton(scene, 'sailCycle', 'SAILS', false, TOUCH_CHASER_W, TOUCH_CHASER_H);
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
    // MW-1: fullscreen toggle. Must run inside a user gesture (browser rule) — a
    // pointerdown qualifies. NOTE: iOS Safari support for element fullscreen is
    // limited; if it no-ops there, the fallback answer is add-to-Home-Screen (PWA).
    const fs = scene.add.text(TOUCH_MARGIN + 56, TOUCH_MARGIN, '⛶', {
      fontFamily: 'ui-monospace,monospace', fontSize: (TOUCH_BTN_FONT + 4) + 'px',
      color: '#D4C890', backgroundColor: '#16283a',
      padding: { x: TOUCH_BTN_PAD_X, y: TOUCH_BTN_PAD_Y },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(140).setAlpha(TOUCH_BTN_ALPHA)
      .setInteractive({ useHandCursor: true });
    fs.on('pointerdown', () => { if (scene.scale.isFullscreen) scene.scale.stopFullscreen(); else scene.scale.startFullscreen(); });
    this._fsBtn = fs;
  },

  _layout(){
    if (!this.active) return;
    const sz = (this._scene && this._scene.scale) ? this._scene.scale.gameSize : { width: GAME_W, height: GAME_H };
    const W = sz.width, H = sz.height, m = TOUCH_MARGIN, gap = TOUCH_BTN_GAP;
    const cy = H * 0.78;                                   // bottom-third band (PLACEHOLDER)
    const pos = {
      cannonL:   [m + TOUCH_CANNON_W/2,      cy],
      cannonR:   [W - m - TOUCH_CANNON_W/2,  cy],
      fireBow:   [m + TOUCH_CHASER_W/2,      cy - TOUCH_CANNON_H/2 - TOUCH_CHASER_H/2 - gap],
      fireStern: [W - m - TOUCH_CHASER_W/2,  cy - TOUCH_CANNON_H/2 - TOUCH_CHASER_H/2 - gap],
      sailCycle: [m + TOUCH_CHASER_W/2,      cy + TOUCH_CANNON_H/2 + TOUCH_CHASER_H/2 + gap],
    };
    for (const b of this._btns){ const p = pos[b._touchName]; if (p) b.setPosition(p[0], p[1]); }
    if (this._pauseBtn) this._pauseBtn.setPosition(m, m);
    if (this._fsBtn) this._fsBtn.setPosition(m + 56, m);
  },

  // ── read API (consumed by GameScene) ────────────────────────────────────────
  held(name){ return this.active && !!this._held[name]; },
  // Edge read: true once per press, then cleared (matches Keyboard.JustDown feel).
  justDown(name){
    if (!this.active) return false;
    if (this._edge[name]){ this._edge[name] = false; return true; }
    return false;
  },

  // y-coordinate of the top of the reserved control band (MW-12). Desktop: near screen bottom.
  safeBottomY(H){ return this.active ? H * (1 - TOUCH_SAFE_BOTTOM_FRAC) : H - 30; },

  // ── MW-7 slide-to-steer ── an invisible "virtual stick" anchored where the
  // finger lands: horizontal offset from the touch point maps to a turn axis in
  // [−1, 1]. The axis SCALES the existing calcTurnDegS turn rate in GameScene, so
  // the locked turn physics stay authoritative. (Mapping choice = ASSUMPTION.)
  _steer: null,
  steerStart(p){ this._steer = { x0: p.x, y0: p.y, t0: Date.now()/1000, moved: 0, axis: 0 }; },
  steerMove(p){
    const s = this._steer; if (!s) return;
    s.moved = Math.max(s.moved, Math.hypot(p.x - s.x0, p.y - s.y0));
    s.axis = Phaser.Math.Clamp((p.x - s.x0) / TOUCH_STEER_RANGE, -1, 1);
  },
  // returns true if the release was a TAP (short + still) — caller then runs the world-tap
  steerEnd(p){
    const s = this._steer; this._steer = null;
    if (!s) return false;
    return (s.moved < TOUCH_TAP_MAX_PX) && (Date.now()/1000 - s.t0 < TOUCH_TAP_MAX_S);
  },
  steerAxis(){ return this._steer ? this._steer.axis : 0; },

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
