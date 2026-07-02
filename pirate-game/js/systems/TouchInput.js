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
    // MB2-9: flag the DOM as a touch device — index.html shows the portrait
    // "ROTATE YOUR DEVICE" overlay only for body.touchdev.
    document.body.classList.add('touchdev');
    // FLAG-5 ruling (Noah): AUTO-PAUSE when rotated to portrait. Opens the pause
    // menu (resume stays manual — no surprise unpause on rotate-back). Checks the
    // current orientation once at init too, in case the game loads in portrait.
    try {
      const mq = window.matchMedia('(orientation: portrait)');
      const onFlip = () => {
        const gs = this._scene;
        if (mq.matches && gs && !gs.menuOpen && gs.toggleMenu) gs.toggleMenu();
      };
      if (mq.addEventListener) mq.addEventListener('change', onFlip);
      else if (mq.addListener) mq.addListener(onFlip);               // older Safari
      onFlip();
    } catch (e) { /* matchMedia unavailable — overlay alone still blocks input */ }
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
    // MB2-8: fullscreen toggle rework. Must run inside a user gesture (browser
    // rule). Three paths by capability:
    //   • real Fullscreen API (desktop / Android / iPadOS 16.4+) → toggle, then
    //     try screen.orientation.lock('landscape') (MB2-9; Android-only, silent no-op elsewhere)
    //   • iPhone browser — Apple ships NO element-fullscreen API → show a
    //     dismissible "Add to Home Screen" instruction popup (PWA = true fullscreen)
    //   • already running standalone (installed PWA) → button hidden (nothing to do)
    const fs = scene.add.text(TOUCH_MARGIN + 56, TOUCH_MARGIN, '⛶', {
      fontFamily: 'ui-monospace,monospace', fontSize: (TOUCH_BTN_FONT + 4) + 'px',
      color: '#D4C890', backgroundColor: '#16283a',
      padding: { x: TOUCH_BTN_PAD_X, y: TOUCH_BTN_PAD_Y },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(140).setAlpha(TOUCH_BTN_ALPHA)
      .setInteractive({ useHandCursor: true });
    fs.on('pointerdown', () => this._toggleFullscreen(scene));
    this._fsBtn = fs;
    if (this._isStandalone()) fs.setVisible(false).disableInteractive();
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
    if (this._isStandalone()) return;
    if (this._canFullscreen()){
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
          this._lockLandscape();                                   // MB2-9
        }
      } catch (e) { /* fullscreen refusal is non-fatal */ }
    } else {
      this._showA2HSPopup();                                       // iPhone
    }
  },
  // MB2-9: orientation lock only works in fullscreen, Android Chrome; a rejected
  // promise elsewhere is expected and swallowed. The portrait CSS overlay
  // (index.html #rotateOverlay) is the universal fallback.
  _lockLandscape(){
    try {
      if (screen.orientation && screen.orientation.lock)
        screen.orientation.lock('landscape').catch(() => {});
    } catch (e) { /* not supported */ }
  },
  // iPhone: DOM popup (not Phaser — must overlay everything incl. browser chrome area)
  _showA2HSPopup(){
    if (document.getElementById('a2hsPopup')) return;
    const d = document.createElement('div');
    d.id = 'a2hsPopup';
    d.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(8,14,22,.88);display:flex;align-items:center;justify-content:center;font-family:ui-monospace,monospace;color:#D4C890;text-align:center;padding:24px;';
    d.innerHTML = '<div style="max-width:340px;background:#16283a;border:1px solid #8AAAC8;padding:22px 26px;border-radius:10px;">' +
      '<div style="font-size:16px;letter-spacing:1px;margin-bottom:10px;">FULLSCREEN ON iPHONE</div>' +
      '<div style="font-size:12px;line-height:1.6;color:#9fb6cc;">Safari doesn\u2019t allow fullscreen web games.<br>For true fullscreen:<br><br>1. Tap the <b>Share</b> button<br>2. Choose <b>Add to Home Screen</b><br>3. Launch the game from the new icon</div>' +
      '<div id="a2hsClose" style="margin-top:16px;font-size:13px;color:#F0C840;border:1px solid #F0C840;display:inline-block;padding:6px 18px;border-radius:6px;">GOT IT</div></div>';
    d.addEventListener('pointerdown', () => d.remove());
    document.body.appendChild(d);
  },

  _layout(){
    if (!this.active) return;
    const sz = (this._scene && this._scene.scale) ? this._scene.scale.gameSize : { width: GAME_W, height: GAME_H };
    const W = sz.width, H = sz.height, m = TOUCH_MARGIN, gap = TOUCH_BTN_GAP;
    const cy = H * 0.78;                                   // bottom-third band (PLACEHOLDER)
    const rC = TOUCH_CIRCLE_R_CANNON, rS = TOUCH_CIRCLE_R_CHASER;
    const pos = {
      cannonL:   [m + rC,      cy],
      cannonR:   [W - m - rC,  cy],
      fireBow:   [m + rS,      cy - rC - rS - gap],
      fireStern: [W - m - rS,  cy - rC - rS - gap],
      sailCycle: [m + rS,      cy + rC + rS + gap],
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
    const W = (this._scene && this._scene.scale) ? this._scene.scale.gameSize.width : GAME_W;
    this._steer = { x0: p.x, y0: p.y, t0: Date.now()/1000, moved: 0,
                    axis: (p.x < W / 2) ? -1 : 1 };        // left half = port turn, right = starboard
  },
  steerMove(p){
    const s = this._steer; if (!s) return;
    s.moved = Math.max(s.moved, Math.hypot(p.x - s.x0, p.y - s.y0));
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
      b.setVisible(show);
    }
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
