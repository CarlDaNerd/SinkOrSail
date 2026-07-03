// ── debug/DebugOverlay.js ──
// Dev-only tuning panel + range-ring visualizer + flag controls + standing
// readout (handoff §14). Isolated here so it never leaks into shipping logic;
// it only reads/writes P / DEBUG and talks to the scene via game.scene.
// Removing this one <script> tag (and the #panel markup) ships a clean build.
(function(){
  const fields = ['maxSpeed','noGo','turnPeak','turnMin','balls','spread','cannonSpeed','cooldown','damage','cannonLife','navySight','navyThresh','navyAttack','navyLeash','navyRecover','crimePenalty','merchFlee','merchFight','privHits','privAssist','privLawful','regenCap','regenRate','regenDelay','collMin','collScale','collTier','collLand','windOscAmp','windOscSpeed','windShiftEvery','windShiftSize','windShiftDur','rainBoost','rainGust','stormChance','stormGust','cycPull','cycReach','cycDrift','cycDmg'];
  const fmt = { maxSpeed:v=>v.toFixed(2), noGo:v=>'±'+v+'°', turnPeak:v=>v+'°/s', turnMin:v=>v+'°/s', balls:v=>v, spread:v=>v+'°', cannonSpeed:v=>v.toFixed(1), cooldown:v=>v.toFixed(2)+'s', damage:v=>v, cannonLife:v=>v.toFixed(1)+'s', navySight:v=>v+'px', navyThresh:v=>v, navyAttack:v=>v+'px', navyLeash:v=>v+'px', navyRecover:v=>v.toFixed(1), crimePenalty:v=>'-'+v, merchFlee:v=>v+'px', merchFight:v=>v+'%', privHits:v=>v, privAssist:v=>v+'px', privLawful:v=>v, regenCap:v=>v+'%', regenRate:v=>v.toFixed(1), regenDelay:v=>v+'s', collMin:v=>v.toFixed(2), collScale:v=>v, collTier:v=>'×'+v.toFixed(2)+'/lvl', collLand:v=>'×'+v.toFixed(1), windOscAmp:v=>'±'+v+'°', windOscSpeed:v=>'×'+v.toFixed(1), windShiftEvery:v=>v+'s', windShiftSize:v=>'±'+v+'°', windShiftDur:v=>v+'s', rainBoost:v=>'×'+v.toFixed(2), rainGust:v=>'×'+v.toFixed(1), stormChance:v=>v+'%', stormGust:v=>'×'+v.toFixed(1), cycPull:v=>v.toFixed(1), cycReach:v=>v+'px', cycDrift:v=>v.toFixed(2), cycDmg:v=>v+'%' };

  function syncPanel(){ fields.forEach(f => { const el = document.getElementById(f); if (el){ el.value = P[f]; document.getElementById('v_' + f).textContent = fmt[f](P[f]); } }); }

  const RING_FIELDS = new Set(['navySight','navyAttack','navyLeash','merchFlee','privAssist']);
  fields.forEach(f => { const el = document.getElementById(f); if (el) el.addEventListener('input', e => {
    P[f] = parseFloat(e.target.value);
    document.getElementById('v_' + f).textContent = fmt[f](P[f]);
    if (RING_FIELDS.has(f)){ DEBUG.ring.active = true; DEBUG.ring.radius = P[f]; DEBUG.ring.age = 0; DEBUG.ring.label = f; }
  }); });

  const infEl = document.getElementById('infAmmo'); if (infEl) infEl.addEventListener('change', e => { DEBUG.infAmmo = e.target.checked; });
  const ramEl = document.getElementById('collRamWanted'); if (ramEl){ ramEl.checked = DEBUG.ramWanted; ramEl.addEventListener('change', e => { DEBUG.ramWanted = e.target.checked; }); }

  function sc(){ return game.scene.getScene('GameScene'); }

  // (flag controls + the navy-standing/wanted readout now live on the in-game HUD)

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

  // ── tuning panel show/hide (edge tab + backtick hotkey) ──
  const panelEl = document.getElementById('panel');
  const tabEl = document.getElementById('panelTab');
  let panelOpen = !!(panelEl && panelEl.classList.contains('open'));
  function setPanel(open){ panelOpen = open; if (panelEl) panelEl.classList.toggle('open', open); if (tabEl) tabEl.textContent = open ? '✕ HIDE' : '⚙ TUNE'; }
  globalThis.SOS_toggleTuning = () => setPanel(!panelOpen);   // called by the in-game pause-menu button
  if (tabEl){ tabEl.textContent = panelOpen ? '✕ HIDE' : '⚙ TUNE'; tabEl.addEventListener('click', () => setPanel(!panelOpen)); }
  document.addEventListener('keydown', e => { if (e.key === '`'){ e.preventDefault(); setPanel(!panelOpen); } });

  // ── DEV / QC TOOLS ── (test the game without grinding it; adapted to numeric ShipTiers)
  const $ = id => document.getElementById(id);
  const onChk = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', e => fn(e.target.checked)); };
  const onClick = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  const nearestPort = (s, ownedOnly) => { let best = null, bd = Infinity; for (const p of s.navyPorts){ if (ownedOnly && p.owner !== 'player') continue; const d = Math.hypot(s.player.x - p.x, s.player.y - p.y); if (d < bd){ bd = d; best = p; } } return best; };

  onChk('dbgInfGold', v => { DEBUG.infGold = v; });
  onChk('dbgWeatherOff', v => { DEBUG.weatherOff = v; const s = sc(); if (s && v && typeof WeatherSystem !== 'undefined') WeatherSystem.clear(s); });

  onClick('dbgWxGo', () => { const s = sc(), ty = $('dbgWxType').value; if (!s || !ty || typeof WeatherSystem === 'undefined') return;
    s.extrasOn = true; DEBUG.weatherOff = false; const wo = $('dbgWeatherOff'); if (wo) wo.checked = false; WeatherSystem.start(s, ty); });
  onClick('dbgWxClear', () => { const s = sc(); if (s && typeof WeatherSystem !== 'undefined') WeatherSystem.clear(s); });

  onClick('dbgSpawn', () => {
    const s = sc(); if (!s) return;
    const fac = $('dbgSpawnFaction').value, tier = $('dbgSpawnTier').value;
    const a = Math.random() * Math.PI * 2, r = 240 + Math.random() * 140;
    const x = s.player.x + Math.cos(a) * r, y = s.player.y + Math.sin(a) * r;
    // Math.random (not the gameplay PRNG) so a dev spawn never perturbs determinism
    const ship = Enemy.create(fac, 80, x, y, Math.random() * 360, null, Math.random, (Date.now() % 100000));
    if (tier && typeof ShipTiers !== 'undefined'){ ship.tier = parseInt(tier, 10); ShipTiers.apply(s, ship, true); }
    ship.crew = 0;                                   // enemies are crewless (capture = empty hull)
    if ($('dbgSpawnWeak').checked) ship.hull = Math.max(1, Math.round(ship.maxHull * 0.1));
    if (fac === 'merchant' && typeof CommoditySystem !== 'undefined'){ const c = CommoditySystem.nearestIslandCommodity(s, x, y);
      if (c){ if (!ship.hold && typeof Cargo !== 'undefined') ship.hold = Cargo.make(20); ship.cargo = { commodity:c, qty:6 }; if (ship.hold) Cargo.add(ship.hold, c, 6); } }
    s.ships.push(ship); s.flashPopup(x, y - 20, 'DEV SPAWN: ' + fac, 0x6ED0E0);
  });

  onClick('dbgApplyTier', () => { const s = sc(), t = $('dbgMyTier').value; if (s && t && typeof ShipTiers !== 'undefined'){ ShipTiers.setTier(s, s.player, parseInt(t, 10)); s.flashPopup(s.player.x, s.player.y - 20, 'TIER: ' + ShipTiers.get(s.player.tier).name, 0x6ED0E0); } });

  onClick('dbgGold', () => { const s = sc(); if (!s) return; s.player.bank = (s.player.bank || 0) + 10000; s.flashPopup(s.player.x, s.player.y - 20, '+10000g', 0xF0C840); });
  onClick('dbgHeal', () => { const s = sc(); if (!s) return; s.player.hull = s.player.maxHull; s.player.sailBroken = false; s.player.ammo = s.player.maxAmmo; s.flashPopup(s.player.x, s.player.y - 20, 'HEALED', 0x4CA84C); });

  onClick('dbgCapturePort', () => {
    const s = sc(); if (!s) return;
    const port = nearestPort(s, false);
    if (!port){ s.flashPopup(s.player.x, s.player.y, 'NO PORT', 0xE0503A); return; }
    if (port.owner === 'player'){ s.flashPopup(port.x, port.y, 'ALREADY YOURS', 0xE0A040); return; }
    port.owner = 'player'; port.hull = port.maxHull; port.towers = port.towers || [];
    s.ownedPorts = s.ownedPorts || []; if (s.ownedPorts.indexOf(port) === -1) s.ownedPorts.push(port);
    if (typeof EV !== 'undefined') s.events.emit(EV.PORT_CAPTURED, { port });
    s.flashPopup(port.x, port.y - 30, 'DEV CAPTURED: ' + port.name, 0x6ED0E0);
  });

  onClick('dbgTpPort', () => { const s = sc(); if (!s) return; const port = nearestPort(s, false); if (!port) return;
    s.player.x = port.x + 120; s.player.y = port.y; s.player.vel = 0; if (s.follow) s.follow.setPosition(s.player.x, s.player.y); });

  // drop a fresh empty prize right at one of your ports + fire the runner hook
  onClick('dbgSpawnPrize', () => {
    const s = sc(); if (!s) return;
    const port = nearestPort(s, true);
    if (!port){ s.flashPopup(s.player.x, s.player.y, 'NEED AN OWNED PORT', 0xE0503A); return; }
    const ship = Enemy.create('prize', 80, port.x, port.y, 0, null, Math.random, (Date.now() % 100000));
    if (typeof ShipTiers !== 'undefined'){ ship.tier = (typeof STARTER_TIER !== 'undefined' ? STARTER_TIER : 2); ShipTiers.apply(s, ship, true); }
    ship.crew = 0; ship.faction = 'prize'; ship.alive = false; ship.beingTowed = false;
    if (typeof EV !== 'undefined') s.events.emit(EV.PRIZE_DELIVERED, { ship, port });
    s.flashPopup(port.x, port.y - 30, 'DEV PRIZE DELIVERED', 0x6ED0E0);
  });

  onClick('dbgClearEnemies', () => { const s = sc(); if (!s) return; for (const sh of s.ships) sh.alive = false; s.ships.length = 0; if (s.tows) s.tows.length = 0; s.flashPopup(s.player.x, s.player.y - 20, 'ENEMIES CLEARED', 0x6ED0E0); });

  syncPanel();
})();
