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
    // MB3-6: phone/tablet optimization mode — user setting (pause menu) wins,
    // else auto-detect by the device's smaller dimension. Persisted separately
    // from Carl's SaveSystem (pure UI preference, not game state).
    this.uiMode = this._detectUIMode();
    if (!this.active) return;                     // desktop: no overlay, no reads

    this._buildButtons(uiScene);
    this._applyModeScale();                                   // MB3-6
    this._buildPauseButton(uiScene);
    // resize: re-fit the canvas is handled by Phaser.Scale.RESIZE (main.js);
    // we just reposition our buttons when the game size changes.
    uiScene.scale.on('resize', () => this._layout());
  },

  // A visible, fixed-size button: bordered rectangle + centered label (MW-6).
  // MB2-1/2/3: a circular button — filled circle + vector icon drawn with Phaser
  // Graphics (no image assets; PLACEHOLDER art until real game art is sourced).
  // iconFn(g, color, r) draws in local coords centered on (0,0) pointing UP;
  // `rot` (radians) spins it to the firing direction.
  _mkCircleButton(scene, name, r, iconFn, rot){
    const bg = scene.add.circle(0, 0, r, 0x16283a, TOUCH_BTN_ALPHA)
      .setStrokeStyle(2, 0x8AAAC8, 0.9).setScrollFactor(0).setDepth(140)
      .setInteractive({ useHandCursor: true });
    const icon = scene.add.graphics().setScrollFactor(0).setDepth(141);
    icon.setRotation(rot || 0);
    const drawIcon = (color) => { icon.clear(); iconFn(icon, color, r); };
    drawIcon(TOUCH_ICON_COLOR);
    const press = () => {
      if (this._scene && this._scene.menuOpen) return;
      this._held[name] = true; this._edge[name] = true;
      bg.setFillStyle(0x2a4a66, 1); drawIcon(TOUCH_ICON_HOT);
    };
    const release = () => { this._held[name] = false; bg.setFillStyle(0x16283a, TOUCH_BTN_ALPHA); drawIcon(TOUCH_ICON_COLOR); };
    bg.on('pointerdown', press); bg.on('pointerup', release); bg.on('pointerout', release);
    const btn = {
      bg, icon, _touchName: name,
      setPosition(x, y){ bg.setPosition(x, y); icon.setPosition(x, y); return btn; },
      setVisible(v){ bg.setVisible(v); icon.setVisible(v); return btn; },
    };
    this._btns.push(btn);
    return btn;
  },

  // ── drawn icons (all sizes scale off the button radius) ──
  // Cannon pointing UP: tapered barrel + muzzle mouth punch-out + carriage ring.
  _iconCannon(g, color, r){
    const s = r / TOUCH_CIRCLE_R_CANNON;
    g.fillStyle(color, 1);
    g.fillTriangle(-7*s, 10*s, 7*s, 10*s, 0, -18*s);            // tapered barrel
    g.fillStyle(0x16283a, 1); g.fillCircle(0, -14*s, 2.5*s);    // muzzle mouth
    g.lineStyle(3*s, color, 1); g.strokeCircle(0, 12*s, 6*s);   // carriage ring
  },
  // Mast + boom + triangular sail.
  _iconSail(g, color, r){
    const s = r / TOUCH_CIRCLE_R_CHASER;
    g.lineStyle(2.5*s, color, 1);
    g.lineBetween(-1*s, -15*s, -1*s, 13*s);                     // mast
    g.lineBetween(-8*s, 13*s, 9*s, 13*s);                       // boom
    g.fillStyle(color, 1);
    g.fillTriangle(1*s, -13*s, 12*s, 9*s, 1*s, 9*s);            // sail
  },
  // MB3-3: anchor — ring, shank, stock, curved arms with fluke tips.
  _iconAnchor(g, color, r){
    const s = r / TOUCH_CIRCLE_R_CHASER;
    g.lineStyle(2.5*s, color, 1);
    g.strokeCircle(0, -12*s, 3.5*s);                            // ring
    g.lineBetween(0, -8.5*s, 0, 12*s);                          // shank
    g.lineBetween(-7*s, -4*s, 7*s, -4*s);                       // stock
    g.beginPath(); g.arc(0, 4*s, 10*s, Math.PI*0.15, Math.PI*0.85); g.strokePath();   // arms
    g.fillStyle(color, 1);
    g.fillTriangle(-13*s, 8*s, -7*s, 6*s, -9*s, 13*s);          // port fluke
    g.fillTriangle(13*s, 8*s, 7*s, 6*s, 9*s, 13*s);             // starboard fluke
  },

  _buildButtons(scene){
    // MB2 layout: LEFT bottom-third = PORT broadside; RIGHT = STARBOARD. Chasers
    // sit above each cannon (bow left, stern right) and only SHOW when the tier
    // mounts them (MB2-2, gated per-frame in setControlsVisible — resolves the
    // old 'chasers kept?' ASSUMPTION: kept, conditional). SAILS cycles half →
    // full → down (MW-9). Up-drawn cannon icon spun to fire direction:
    // port ◀ = -90°, star ▶ = +90°, bow ▲ = 0, stern ▼ = 180°.
    const C = (g, c, r) => this._iconCannon(g, c, r);
    this._mkCircleButton(scene, 'cannonL',   TOUCH_CIRCLE_R_CANNON, C, -Math.PI/2);
    this._mkCircleButton(scene, 'cannonR',   TOUCH_CIRCLE_R_CANNON, C,  Math.PI/2);
    this._mkCircleButton(scene, 'fireBow',   TOUCH_CIRCLE_R_CHASER, C,  0);
    this._mkCircleButton(scene, 'fireStern', TOUCH_CIRCLE_R_CHASER, C,  Math.PI);
    this._mkCircleButton(scene, 'sailCycle', TOUCH_CIRCLE_R_CHASER, (g, c, r) => this._iconSail(g, c, r), 0);
    // MB3-3: ACCESS PORT — appears only while in dock range (gated in
    // setControlsVisible); fires the same guarded dock path as the F key.
    this._mkCircleButton(scene, 'dockPort', TOUCH_CIRCLE_R_CANNON, (g, c, r) => this._iconAnchor(g, c, r), 0);
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
    // MB2-8 (RULED: kill fullscreen where it can't work properly): the ⛶ button
    // exists ONLY where a real element-fullscreen API does — desktop, Android,
    // iPadOS 16.4+. iPhone has no such API by Apple design, so there the button
    // is simply absent (the old Add-to-Home-Screen popup is removed). The PWA
    // manifest/meta stay: an INSTALLED SinkOrSail launches truly fullscreen on
    // iPhone anyway, no button needed. Also hidden when already standalone.
    const fs = scene.add.text(TOUCH_MARGIN + 56, TOUCH_MARGIN, '⛶', {
      fontFamily: 'ui-monospace,monospace', fontSize: (TOUCH_BTN_FONT + 4) + 'px',
      color: '#D4C890', backgroundColor: '#16283a',
      padding: { x: TOUCH_BTN_PAD_X, y: TOUCH_BTN_PAD_Y },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(140).setAlpha(TOUCH_BTN_ALPHA)
      .setInteractive({ useHandCursor: true });
    fs.on('pointerdown', () => this._toggleFullscreen(scene));
    this._fsBtn = fs;
    if (this._isStandalone() || !this._canFullscreen()) fs.setVisible(false).disableInteractive();
  },

  // ── MB2-8 fullscreen helpers ──────────────────────────────────────────────
  _isStandalone(){
    return (window.navigator.standalone === true) ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches);
  },
  _canFullscreen(){
    const el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen);
  },
  _toggleFullscreen(scene){
    if (this._isStandalone() || !this._canFullscreen()) return;   // button shouldn't exist here anyway
    const doc = document, el = doc.documentElement;
    const inFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement || scene.scale.isFullscreen);
    try {
      if (inFs){
        if (scene.scale.isFullscreen) scene.scale.stopFullscreen();
        else if (doc.exitFullscreen) doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      } else {
        // prefer Phaser (keeps its internal isFullscreen in sync); fall back to
        // the raw API (incl. webkit prefix for iPad) if Phaser's path fails.
        if (scene.scale.fullscreen && scene.scale.fullscreen.available) scene.scale.startFullscreen();
        else if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      }
    } catch (e) { /* fullscreen refusal is non-fatal */ }
  },

  _layout(){
    if (!this.active) return;
    const sz = (this._scene && this._scene.scale) ? this._scene.scale.gameSize : { width: GAME_W, height: GAME_H };
    const W = sz.width, H = sz.height, m = TOUCH_MARGIN, gap = TOUCH_BTN_GAP;
    const k = this._modeScale();                              // MB3-6: tablet scales the whole cluster
    const rC = TOUCH_CIRCLE_R_CANNON*k, rS = TOUCH_CIRCLE_R_CHASER*k;
    // MB3-5: layout anchors BOTTOM-UP from the live screen edge, so the full
    // three-row stack (chaser / cannon / sails) is guaranteed on-screen in ANY
    // orientation. The old cy = H*0.78 midpoint clipped the sails button off the
    // bottom on landscape phones (stack bottom landed past H). Rows:
    //   sails row (left only)  → bottom edge at H - m
    //   cannon row             → above sails
    //   chaser row             → above cannons
    const sy = H - m - rS;                 // sails center
    const cy = sy - rS - gap - rC;         // cannon centers
    const hy = cy - rC - gap - rS;         // chaser centers
    const pos = {
      cannonL:   [m + rC,      cy],
      cannonR:   [W - m - rC,  cy],
      fireBow:   [m + rS,      hy],
      fireStern: [W - m - rS,  hy],
      sailCycle: [m + rS,      sy],
      dockPort:  [W / 2,       cy],        // MB3-3: bottom-center (FLAG-7 PLACEHOLDER)
    };
    for (const b of this._btns){ const p = pos[b._touchName]; if (p) b.setPosition(p[0], p[1]); }
    if (this._pauseBtn) this._pauseBtn.setPosition(m, m);
    if (this._fsBtn) this._fsBtn.setPosition(m + 56, m);
  },

  // ── MB3-6 phone/tablet mode ──────────────────────────────────────────────
  uiMode: 'phone',
  _detectUIMode(){
    try { const s = localStorage.getItem('sos_uiMode'); if (s === 'phone' || s === 'tablet') return s; } catch (e) {}
    return Math.min(window.innerWidth, window.innerHeight) >= TABLET_MIN_DIM ? 'tablet' : 'phone';
  },
  setUIMode(mode){
    this.uiMode = (mode === 'tablet') ? 'tablet' : 'phone';
    try { localStorage.setItem('sos_uiMode', this.uiMode); } catch (e) {}
    if (!this.active) return;
    this._applyModeScale(); this._layout();
  },
  _modeScale(){ return this.uiMode === 'tablet' ? TABLET_BTN_SCALE : 1; },
  _applyModeScale(){
    const k = this._modeScale();
    for (const b of this._btns){ b.bg.setScale(k); b.icon.setScale(k); }
  },

  // ── read API (consumed by GameScene) ────────────────────────────────────────
  held(name){ return this.active && !!this._held[name]; },
  // Edge read: true once per press, then cleared (matches Keyboard.JustDown feel).
  justDown(name){
    if (!this.active) return false;
    if (this._edge[name]){ this._edge[name] = false; return true; }
    return false;
  },

  // y-coordinate of the top of the reserved control band (MW-12). Desktop: near
  // screen bottom. MB3-6: the band is the ACTUAL button-stack height in BOTH
  // modes, mirroring _layout's row math — the old flat 30% both over-reserved on
  // tall portrait screens (wasted HUD space) and UNDER-reserved in phone
  // landscape (30% of 390px = 117px vs a 232px stack → HUD overlapped buttons).
  safeBottomY(H){
    if (!this.active) return H - 30;
    const k = this._modeScale(), rC = TOUCH_CIRCLE_R_CANNON*k, rS = TOUCH_CIRCLE_R_CHASER*k;
    const stack = 2*rS + TOUCH_BTN_GAP + 2*rC + TOUCH_BTN_GAP + 2*rS;   // chaser+cannon+sails rows
    return H - TOUCH_MARGIN - stack - 8;
  },

  // ── MB2-4 tap-to-steer (replaces MW-7 slide-to-steer) ── press-and-HOLD the
  // LEFT half of the open screen to turn left, RIGHT half to turn right; release
  // to run straight. The axis engages IMMEDIATELY on press (no lag), at full
  // rate (±1 — binary, FLAG-1) and SCALES the existing calcTurnDegS turn rate in
  // GameScene, so the locked turn physics stay authoritative. A short still
  // press still resolves as a world TAP (dock / capture) on release, exactly as
  // before — the <0.3s turn nudge a tap causes is negligible. The API surface
  // (steerStart/Move/End/steerAxis) is unchanged so GameScene wiring is untouched.
  _steer: null,
  steerStart(p){
    if (this._steer) return;                                  // MB2-A2: one steer hold at a time
    const W = (this._scene && this._scene.scale) ? this._scene.scale.gameSize.width : GAME_W;
    this._steer = { id: p.id, x0: p.x, y0: p.y, t0: Date.now()/1000, moved: 0,
                    axis: (p.x < W / 2) ? -1 : 1 };        // left half = port turn, right = starboard
  },
  steerMove(p){
    const s = this._steer; if (!s || p.id !== s.id) return;   // MB2-A2: ignore other fingers
    s.moved = Math.max(s.moved, Math.hypot(p.x - s.x0, p.y - s.y0));
  },
  // returns true if the release was a TAP (short + still) — caller then runs the world-tap
  steerEnd(p){
    const s = this._steer;
    if (!s || p.id !== s.id) return false;                    // MB2-A2: a fire-button finger lifting must not kill the steer hold
    this._steer = null;
    return (s.moved < TOUCH_TAP_MAX_PX) && (Date.now()/1000 - s.t0 < TOUCH_TAP_MAX_S);
  },
  steerAxis(){ return this._steer ? this._steer.axis : 0; },

  // Show/hide the movement+fire overlay (hidden while docked or paused; those
  // states have their own touch surfaces). Called each frame from UIScene.
  // MB2-2: chaser buttons additionally gate on the CURRENT tier mounting that
  // gun — evaluated every frame so ShipTiers.setTier() changes reflect instantly.
  setControlsVisible(v){
    if (!this.active) return;
    const pl = this._scene ? this._scene.player : null;
    for (const b of this._btns){
      let show = v;
      if (show && pl && typeof ShipTiers !== 'undefined'){
        if (b._touchName === 'fireBow')   show = ShipTiers.has(pl, 'bow');
        if (b._touchName === 'fireStern') show = ShipTiers.has(pl, 'stern');
      }
      // MB3-3: ACCESS PORT only inside dock range
      if (show && b._touchName === 'dockPort') show = !!(this._scene && this._scene.nearPort);
      b.setVisible(show);
    }
  },

  // ── world-tap: capture only (MB3-3) ─────────────────────────────────────────
  // Wired from GameScene: a pointerdown on the world (not on a button/overlay).
  // In combat → capture (port-capture wins over boarding, matches B). Outside
  // combat a tap does NOTHING now — docking moved to the dedicated ACCESS-PORT
  // button (MB3-3), because "tap anywhere = open port menu" fired constantly
  // while maneuvering near a port.
  handleWorldTap(scene){
    if (!this.active) return;
    if (scene.menuOpen || scene.mapOpen || scene.docked) return;
    const pl = scene.player; if (!pl || pl.hull <= 0) return;
    if (scene.inCombat()){
      let consumed = (typeof PortCaptureSystem !== 'undefined') && PortCaptureSystem.tryCapture(scene);
      if (!consumed && typeof BoardingSystem !== 'undefined') BoardingSystem.tryBoard(scene);
    }
  },
};
