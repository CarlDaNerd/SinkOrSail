// ── debug/DebugOverlay.js ──
// Dev-only tuning panel + range-ring visualizer + flag controls + standing
// readout (handoff §14). Isolated here so it never leaks into shipping logic;
// it only reads/writes P / DEBUG and talks to the scene via game.scene.
// Removing this one <script> tag (and the #panel markup) ships a clean build.
(function(){
  const fields = ['maxSpeed','noGo','turnPeak','turnMin','balls','spread','cannonSpeed','cooldown','damage','cannonLife','navySight','navyThresh','navyAttack','navyLeash','navyRecover','crimePenalty','merchFlee','merchFight','privHits','privAssist','privLawful','regenCap','regenRate','regenDelay'];
  const fmt = { maxSpeed:v=>v.toFixed(2), noGo:v=>'±'+v+'°', turnPeak:v=>v+'°/s', turnMin:v=>v+'°/s', balls:v=>v, spread:v=>v+'°', cannonSpeed:v=>v.toFixed(1), cooldown:v=>v.toFixed(2)+'s', damage:v=>v, cannonLife:v=>v.toFixed(1)+'s', navySight:v=>v+'px', navyThresh:v=>v, navyAttack:v=>v+'px', navyLeash:v=>v+'px', navyRecover:v=>v.toFixed(1), crimePenalty:v=>'-'+v, merchFlee:v=>v+'px', merchFight:v=>v+'%', privHits:v=>v, privAssist:v=>v+'px', privLawful:v=>v, regenCap:v=>v+'%', regenRate:v=>v.toFixed(1), regenDelay:v=>v+'s' };

  function syncPanel(){ fields.forEach(f => { const el = document.getElementById(f); if (el){ el.value = P[f]; document.getElementById('v_' + f).textContent = fmt[f](P[f]); } }); }

  const RING_FIELDS = new Set(['navySight','navyAttack','navyLeash','merchFlee','privAssist']);
  fields.forEach(f => { const el = document.getElementById(f); if (el) el.addEventListener('input', e => {
    P[f] = parseFloat(e.target.value);
    document.getElementById('v_' + f).textContent = fmt[f](P[f]);
    if (RING_FIELDS.has(f)){ DEBUG.ring.active = true; DEBUG.ring.radius = P[f]; DEBUG.ring.age = 0; DEBUG.ring.label = f; }
  }); });

  const infEl = document.getElementById('infAmmo'); if (infEl) infEl.addEventListener('change', e => { DEBUG.infAmmo = e.target.checked; });

  function sc(){ return game.scene.getScene('GameScene'); }

  const fN = document.getElementById('flagNeutral'), fP = document.getElementById('flagPirate');
  if (fN) fN.addEventListener('click', () => { const s = sc(); if (s) s.requestFlag('neutral'); });
  if (fP) fP.addEventListener('click', () => { const s = sc(); if (s) s.requestFlag('pirate'); });

  // flag status / button state (GameScene may not exist until the menu starts it)
  setInterval(() => {
    const s = sc(); if (!s || !s.flag) return;
    const el = document.getElementById('flagStatus'); if (!el) return;
    const bN = document.getElementById('flagNeutral'), bP = document.getElementById('flagPirate');
    bN.style.background = (s.flag === 'neutral' && !s.flagPending) ? '#2A9EAE' : '#1a2c3c';
    bP.style.background = (s.flag === 'pirate'  && !s.flagPending) ? '#7A3020' : '#1a2c3c';
    let msg = '';
    if (s.inCombat()){ msg = '⚠ locked — in combat'; bN.disabled = bP.disabled = true; bN.style.opacity = bP.style.opacity = 0.4; }
    else { bN.disabled = bP.disabled = false; bN.style.opacity = bP.style.opacity = 1;
      if (s.flagPending){ const t = Math.max(0, (s.flagChangeAt - s.time.now/1000)).toFixed(1); msg = 'raising ' + s.flagPending + ' colors… ' + t + 's'; }
      else msg = 'flying ' + s.flag + ' colors' + (s.flag === 'pirate' ? ' — pirates ignore you, navy hostile' : '');
    }
    el.textContent = msg;
  }, 120);

  document.querySelectorAll('.grp').forEach(h => h.addEventListener('click', () => h.classList.toggle('collapsed')));
  const rst = document.getElementById('reset');   if (rst) rst.addEventListener('click', () => { Object.assign(P, DEFAULTS); syncPanel(); });
  const rsp = document.getElementById('respawn'); if (rsp) rsp.addEventListener('click', () => { const s = sc(); if (s){ s.spawnFleet(); s.navyStanding = 0; s.cannonballs.length = 0; s.loot.length = 0; } });

  function buildConsts(){ return `// ── Tuned constants: Pirate V1 (combat + factions) ──
// SAILING (dt-scaled; keep delta-time formulation)
const MAX_SPEED=${P.maxSpeed}, ACCEL=${P.accel}, DECEL=${P.decel};
const WIND_FROM=${P.windFrom}, NO_GO=${P.noGo}, DOWNWIND_LOSS=${P.dwLoss};
const TURN_PEAK_DEG_S=${P.turnPeak}, TURN_PEAK_AT=${P.turnPeakAt}, TURN_MIN_DEG_S=${P.turnMin}, TURN_FULL_PCT=${P.turnFull};
// BROADSIDE
const BALLS_PER_VOLLEY=${P.balls}, SPREAD_DEG=${P.spread}, CANNON_SPEED=${P.cannonSpeed};
const FIRE_COOLDOWN_S=${P.cooldown}, CANNON_DAMAGE=${P.damage}, CANNON_LIFE_S=${P.cannonLife};
// NAVY
const NAVY_SIGHT=${P.navySight}, NAVY_HOSTILE_THRESHOLD=${P.navyThresh}, NAVY_ATTACK_RANGE=${P.navyAttack};
const NAVY_LEASH=${P.navyLeash}, NAVY_STANDING_RECOVER_PER_S=${P.navyRecover}, CRIME_PENALTY=${P.crimePenalty};
// MERCHANTS
const MERCHANT_FLEE_RANGE=${P.merchFlee}, MERCHANT_FIGHT_CHANCE_PCT=${P.merchFight};
// PRIVATEERS (allies): hybrid hostility (WANTED or N hits); assist only when standing > lawful cutoff
const PRIVATEER_HITS_BEFORE_HOSTILE=${P.privHits}, PRIVATEER_ASSIST_RANGE=${P.privAssist}, PRIVATEER_LAWFUL_CUTOFF=${P.privLawful};
// SURVIVAL: player hull 130; enemy cooldown ×1.8; capped out-of-combat regen
const PLAYER_HULL=130, ENEMY_COOLDOWN_MULT=1.8;
const REGEN_CAP_PCT=${P.regenCap}, REGEN_RATE_PER_S=${P.regenRate}, REGEN_OUT_OF_COMBAT_DELAY_S=${P.regenDelay};
// FLAGS: neutral | pirate. Crime = hitting a NON-pirate in navy sight (pirate-hunting is lawful).
const FLAG_RAISE_DELAY_S=${P.flagDelay}, FLAG_COMBAT_LOCK_S=${P.flagCombatLock};
// ROSTER: 5 merchant, 3 pirate (always hostile unless pirate flag), 5 navy, 2 privateer`; }

  const cp = document.getElementById('copy'); if (cp) cp.addEventListener('click', () => {
    const txt = buildConsts(), out = document.getElementById('constsOut');
    out.value = txt; out.style.display = 'block'; out.focus(); out.select();
    const flash = m => { const b = document.getElementById('copy'); b.textContent = m; setTimeout(() => b.textContent = 'COPY CONSTS', 1100); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => flash('COPIED')).catch(() => { try { document.execCommand('copy'); flash('COPIED'); } catch(e){ flash('SELECT+COPY'); } });
    else { try { document.execCommand('copy'); flash('COPIED'); } catch(e){ flash('SELECT+COPY'); } }
  });

  // live navy-standing readout
  setInterval(() => {
    const s = sc(); if (!s || s.navyStanding === undefined) return;
    const v = s.navyStanding;
    document.getElementById('navyStandVal').textContent = v.toFixed(0) + (v <= P.navyThresh ? ' (HOSTILE)' : '');
    const bar = document.getElementById('navyStandBar'); const pct = (v + 100)/100;
    bar.style.width = (pct*100) + '%'; bar.style.background = v <= P.navyThresh ? '#E0503A' : v < -10 ? '#E0A040' : '#4CA84C';
  }, 200);

  // ── tuning panel show/hide (edge tab + backtick hotkey) ──
  const panelEl = document.getElementById('panel');
  const tabEl = document.getElementById('panelTab');
  let panelOpen = !!(panelEl && panelEl.classList.contains('open'));
  function setPanel(open){ panelOpen = open; if (panelEl) panelEl.classList.toggle('open', open); if (tabEl) tabEl.textContent = open ? '✕ HIDE' : '⚙ TUNE'; }
  globalThis.SOS_toggleTuning = () => setPanel(!panelOpen);   // called by the in-game pause-menu button
  if (tabEl){ tabEl.textContent = panelOpen ? '✕ HIDE' : '⚙ TUNE'; tabEl.addEventListener('click', () => setPanel(!panelOpen)); }
  document.addEventListener('keydown', e => { if (e.key === '`'){ e.preventDefault(); setPanel(!panelOpen); } });

  syncPanel();
})();
