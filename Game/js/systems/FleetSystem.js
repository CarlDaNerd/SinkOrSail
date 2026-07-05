// ── systems/FleetSystem.js ── (FM1 — runner & fleet management, doc M5 tail)
// [G] at sea opens the FLEET screen (world freezes, like the pause menu):
//   1-9  select a runner            R  reroll its route (explored-only, wind-aware)
//   E    assign/unassign a free hired privateer as its escort
//   C    toggle it into your convoy (shared route; 1.5x gather while in convoy)
//   G/Esc close
// Convoys: members adopt the leader's route and pay CONVOY_GATHER_MULT per stop
// (doc: 'up to 3 cargo ships + 1 privateer, 1.5x gather per cargo ship' —
// interpreted as each convoy cargo ship gathers at 1.5x; FLAG-10 if you meant
// a different multiplier shape). Escorts assigned to a convoy guard its leader.
// ALL numbers PLACEHOLDER pending live tune.
const CONVOY_MAX_CARGO = 3;           // doc
const CONVOY_GATHER_MULT = 1.5;       // doc

const FleetSystem = {
  init(scene){
    scene.fleetOpen = false;
    scene._fleetSel = 0;
  },

  toggle(scene){ scene.fleetOpen = !scene.fleetOpen; if (!scene._fleetText) this._mkText(scene); },

  _mkText(scene){
    scene._fleetText = scene.add.text(0, 0, '', {
      fontFamily: 'ui-monospace,monospace', fontSize: '12px', color: '#CFE8F5',
      backgroundColor: '#0E1820', padding: { x: 16, y: 14 }, lineSpacing: 3,
    }).setScrollFactor(0).setDepth(210).setVisible(false);
  },

  // key handling while the screen is open (called from GameScene.update)
  handleKeys(scene){
    const K = scene.keys, JD = Phaser.Input.Keyboard.JustDown;
    const nums = [K.ONE, K.TWO, K.THREE, K.FOUR, K.FIVE, K.SIX, K.SEVEN, K.EIGHT, K.NINE];
    nums.forEach((k, i) => { if (JD(k)) scene._fleetSel = i; });
    const r = (scene.runners || [])[scene._fleetSel];
    if (JD(K.R) && r) this.reroute(scene, r);
    if (JD(K.E) && r) this.toggleEscort(scene, r);
    if (JD(K.C) && r) this.toggleConvoy(scene, r);
  },

  // ── route rules (doc: explored-only + wind-aware) ──────────────────────────
  // candidate pool = ports the PLAYER has explored (fog cells); each leg picks
  // the wind-favored option among a few PRNG candidates, so circuits ride
  // reaching winds instead of beating upwind (doc V pathing complaint).
  exploredPorts(scene, exclude){
    const fc = FOG_CELL;
    return scene.navyPorts.filter(p => p !== exclude &&
      scene.explored.has(Math.floor(p.x / fc) + ',' + Math.floor(p.y / fc)));
  },
  pickRoute(scene, home){
    const pool = this.exploredPorts(scene, home);
    if (!pool.length) return [home];
    const n = RUNNER_STOPS_MIN + Math.floor(scene.eprng() * (RUNNER_STOPS_MAX - RUNNER_STOPS_MIN + 1));
    const route = []; let from = home;
    for (let i = 0; i < n; i++){
      let best = null, bs = -Infinity;
      const legPool = pool.filter(p => p !== from);                // no consecutive repeat stops (dwell-farming)
      const src = legPool.length ? legPool : pool;
      for (let k = 0; k < Math.min(3, src.length); k++){           // 3 PRNG candidates per leg
        const cand = src[Math.floor(scene.eprng() * src.length)];
        const th = Math.atan2(cand.y - from.y, cand.x - from.x) / RAD + 90;   // travel heading, deg
        const score = calcTargetSpeed(windOff((th + 360) % 360, WindSystem.dirAt(scene, from.x, from.y)));
        if (score > bs){ bs = score; best = cand; }
      }
      route.push(best); from = best;
    }
    return route;
  },
  reroute(scene, r){
    r.route = this.pickRoute(scene, r.home);
    r.leg = 0; if (r.phase === 'run') r.phase = 'run';
    scene.flashPopup(scene.player.x, scene.player.y - 30, 'ROUTE REDRAWN (' + r.route.length + ' STOPS)', 0x6ED0E0);
  },

  // ── escorts ─────────────────────────────────────────────────────────────────
  toggleEscort(scene, r){
    const h = scene.hire; if (!h || !h.hired.length){ scene.flashPopup(scene.player.x, scene.player.y - 30, 'NO PRIVATEERS HIRED', 0xE0503A); return; }
    const cur = h.hired.find(e => e.assigned === r.id);
    if (cur){ cur.assigned = null; scene.flashPopup(scene.player.x, scene.player.y - 30, 'ESCORT RECALLED', 0xE0A040); return; }
    const free = h.hired.find(e => !e.assigned);
    if (!free){ scene.flashPopup(scene.player.x, scene.player.y - 30, 'ALL ESCORTS ASSIGNED', 0xE0503A); return; }
    free.assigned = r.id;
    scene.flashPopup(scene.player.x, scene.player.y - 30, 'ESCORT ASSIGNED TO ' + this.runnerName(scene, r), 0x46863C);
  },
  assignedEscort(scene, r){
    return scene.hire && scene.hire.hired.find(e => e.assigned === r.id);
  },

  // ── convoys ─────────────────────────────────────────────────────────────────
  convoyMembers(scene){ return (scene.runners || []).filter(r => r.convoy); },
  convoyLeader(scene){ const m = this.convoyMembers(scene); return m.length ? m[0] : null; },
  toggleConvoy(scene, r){
    if (r.convoy){ r.convoy = false; scene.flashPopup(scene.player.x, scene.player.y - 30, this.runnerName(scene, r) + ' LEFT THE CONVOY', 0xE0A040); return; }
    if (this.convoyMembers(scene).length >= CONVOY_MAX_CARGO){ scene.flashPopup(scene.player.x, scene.player.y - 30, 'CONVOY FULL (' + CONVOY_MAX_CARGO + ' CARGO)', 0xE0503A); return; }
    r.convoy = true;
    const lead = this.convoyLeader(scene);
    if (lead && lead !== r){ r.route = lead.route; r.leg = Math.min(lead.leg, r.route.length - 1); r.phase = lead.phase === 'dwell' ? 'run' : lead.phase; }
    scene.flashPopup(scene.player.x, scene.player.y - 30, this.runnerName(scene, r) + ' JOINED THE CONVOY', 0x46863C);
  },

  runnerName(scene, r){
    const i = (scene.runners || []).indexOf(r);
    const t = (typeof ShipTiers !== 'undefined') ? ShipTiers.get(r.tier).name : 'Runner';
    return t.toUpperCase() + ' #' + (i + 1);
  },

  // ── overlay ─────────────────────────────────────────────────────────────────
  draw(scene){
    if (!scene._fleetText) this._mkText(scene);
    const t = scene._fleetText;
    if (!scene.fleetOpen){ t.setVisible(false); return; }
    // M8 (optimize.md): the whole panel string was rebuilt per frame while open —
    // rebuild at HUD_TEXT_INTERVAL_MS (instant on the frame it opens; ≤0.1s lag
    // on the selection arrow, and the world is frozen while this screen is up).
    const nowT = scene.time.now;
    if (t.visible && nowT - (this._fleetTxtAt || 0) < HUD_TEXT_INTERVAL_MS) return;
    this._fleetTxtAt = nowT;
    const rs = scene.runners || [], h = scene.hire || { hired: [] };
    let s = '⚓  FLEET   —   ' + rs.length + ' runner' + (rs.length === 1 ? '' : 's') + ', ' + h.hired.length + ' privateer' + (h.hired.length === 1 ? '' : 's') + '\n\n';
    if (!rs.length) s += '  No runners yet — tow a captured prize to one of your ports.\n';
    rs.forEach((r, i) => {
      const sel = (i === scene._fleetSel) ? '▶ ' : '  ';
      const esc = this.assignedEscort(scene, r) ? ' ⚔esc' : '';
      const con = r.convoy ? ' ⛵convoy' : '';
      const ph = r.phase === 'dwell' ? 'trading' : r.phase;
      s += sel + '[' + (i + 1) + '] ' + this.runnerName(scene, r) + '  ' + ph + '  leg ' + (Math.min(r.leg + 1, r.route.length)) + '/' + r.route.length +
           '  hull ' + Math.round(100 * r.hull / r.maxHull) + '%  earned ' + r.earned + 'g' + esc + con + '\n';
      s += '        route: ' + r.route.map(p => p.name).join(' → ') + '\n';
    });
    const freeE = h.hired.filter(e => !e.assigned).length;
    s += '\nPRIVATEERS: ' + freeE + ' guarding you, ' + (h.hired.length - freeE) + ' escorting runners';
    const cm = this.convoyMembers(scene).length;
    if (cm) s += '\nCONVOY: ' + cm + '/' + CONVOY_MAX_CARGO + ' cargo — gathering at x' + CONVOY_GATHER_MULT + ' per stop';
    s += '\n\n[1-9] select   [R] reroll route   [E] escort on/off   [C] convoy on/off   [G] close';
    t.setText(s);
    const W = scene.scale.gameSize.width, H = scene.scale.gameSize.height;
    t.setPosition(Math.max(12, W/2 - t.width/2), Math.max(12, H/2 - t.height/2)).setVisible(true);
  },
};
