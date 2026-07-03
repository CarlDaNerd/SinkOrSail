// ── systems/AchievementSystem.js ──
// A basic achievement layer. It reads the existing event bus (kills, captures,
// ports, prizes, bounties, weather) for counter goals, and lightly POLLS derived
// state (bank balance, ship tier, owned ports, hires, maxed upgrades, WANTED) for
// the rest. On unlock: a world popup + a HUD toast (drawn by HUD) + an
// 'achievement:unlocked' event (so the dev log shows it). Persisted by SaveSystem.
//
// Owns scene.achievements = { unlocked:{id:true}, stats:{...}, toast, _checkAt }.
//
// PLACEHOLDER: the achievement list + every goal number below is first-pass
// content — tune, rename, or extend freely. Everything is text-only (no art).

// small guards so polled goals never throw if a feature isn't present.
// 0-based tier index: Dinghy=0, Sloop=1, …, Galleon=4, Leviathan=5. Reads main's
// numeric ShipTiers (ship.tier) and falls back to FB2's ShipTier.indexOf.
function _achTierIdx(s){
  const t = s.player && s.player.tier;
  if (!t) return 0;
  if (typeof ShipTiers !== 'undefined') return t - 1;
  if (typeof ShipTier  !== 'undefined') return ShipTier.indexOf(s.player);
  return 0;
}
function _achSailMaxed(s){ return !!(s.player.upgrades && typeof UPGRADE_SAIL !== 'undefined' && s.player.upgrades.sail >= UPGRADE_SAIL.length - 1); }
function _achCannonMaxed(s){ return !!(s.player.upgrades && typeof UPGRADE_CANNON !== 'undefined' && s.player.upgrades.cannon >= UPGRADE_CANNON.length - 1); }

// PLACEHOLDER CONTENT — goals are tuning values, adjust to taste.
const ACHIEVEMENTS = [
  // ── event-counter goals (incremented by the bus) ──
  { id:'first_blood',    name:'First Blood',         desc:'Sink your first ship',           goal:1,     val:(s,st)=>st.kills },
  { id:'pirates_dozen',  name:"Pirate's Dozen",      desc:'Sink 12 ships',                  goal:12,    val:(s,st)=>st.kills },
  { id:'scourge',        name:'Scourge of the Seas', desc:'Sink 50 ships',                  goal:50,    val:(s,st)=>st.kills },
  { id:'prize_crew',     name:'Prize Crew',          desc:'Capture (board) your first ship', goal:1,    val:(s,st)=>st.captures },
  { id:'harbormaster',   name:'Harbormaster',        desc:'Capture your first port',        goal:1,     val:(s,st)=>st.ports },
  { id:'merchant_prince',name:'Merchant Prince',     desc:'Commission your first runner',   goal:1,     val:(s,st)=>st.prizes },
  { id:'bounty_hunter',  name:'Bounty Hunter',       desc:'Complete a bounty',              goal:1,     val:(s,st)=>st.bounties },
  { id:'weathered',      name:'Weathered',           desc:'Witness all 5 kinds of weather', goal:5,     val:(s,st)=>st.weather.length },
  // ── polled (derived-state) goals ──
  { id:'trade_baron',    name:'Trade Baron',         desc:'Bank 10,000 gold',               goal:10000, val:(s)=>s.player.bank || 0 },
  { id:'admiral',        name:'Admiral',             desc:'Own 3 ports at once',            goal:3,     val:(s)=>(s.ownedPorts ? s.ownedPorts.length : 0) },
  { id:'shipwright',     name:'Shipwright',          desc:'Command a bigger ship than a Dinghy', goal:1, val:(s)=>_achTierIdx(s) >= 1 ? 1 : 0 },
  { id:'ship_of_line',   name:'Ship of the Line',    desc:'Command a Galleon or larger',    goal:1,     val:(s)=>_achTierIdx(s) >= 4 ? 1 : 0 },
  { id:'press_ganged',   name:'Press-Ganged',        desc:'Hire a privateer escort',        goal:1,     val:(s)=>(s.hire && s.hire.hired ? s.hire.hired.length : 0) },
  { id:'full_sail',      name:'Full Sail',           desc:'Max the sail-material upgrade',  goal:1,     val:(s)=>_achSailMaxed(s) ? 1 : 0 },
  { id:'master_gunner',  name:'Master Gunner',       desc:'Max the cannon-type upgrade',    goal:1,     val:(s)=>_achCannonMaxed(s) ? 1 : 0 },
  { id:'wanted_man',     name:'Wanted Man',          desc:'Become WANTED by the navy',      goal:1,     val:(s)=>(s.navyHostile && s.navyHostile()) ? 1 : 0 },
];

const AchievementSystem = {
  _defaultSlice(){ return { unlocked:{}, stats:{ kills:0, captures:0, ports:0, prizes:0, bounties:0, weather:[] }, toast:null, _checkAt:0 }; },

  init(scene){
    if (!scene.achievements) scene.achievements = this._defaultSlice();
    if (this._wired) return; this._wired = true;           // subscribe once per page load
    const st = () => scene.achievements.stats;
    scene.events.on(EV.SHIP_SUNK,     e => { if (e && e.by === 'player'){ st().kills++; this._check(scene); } });
    scene.events.on(EV.SHIP_CAPTURED, () => { st().captures++; this._check(scene); });
    scene.events.on(EV.PORT_CAPTURED, () => { st().ports++;    this._check(scene); });
    scene.events.on(EV.PRIZE_DELIVERED,() => { st().prizes++;  this._check(scene); });
    scene.events.on('bounty:completed',() => { st().bounties++; this._check(scene); });
    scene.events.on(EV.WEATHER_CHANGED, e => { if (e && e.type && st().weather.indexOf(e.type) < 0){ st().weather.push(e.type); this._check(scene); } });
  },

  // poll the derived goals on a light interval + expire the toast
  update(scene, dt, dts){
    const a = scene.achievements; if (!a) return;
    const t = scene.time.now / 1000;
    if (t >= a._checkAt){ a._checkAt = t + ACH_CHECK_INTERVAL_S; this._check(scene); }
    if (a.toast && t > a.toast.until) a.toast = null;
  },

  _check(scene){
    const a = scene.achievements;
    for (const ach of ACHIEVEMENTS){
      if (a.unlocked[ach.id]) continue;
      let v = 0; try { v = ach.val(scene, a.stats) || 0; } catch (e){ v = 0; }
      if (v >= ach.goal) this._unlock(scene, ach);
    }
  },

  _unlock(scene, ach){
    const a = scene.achievements;
    a.unlocked[ach.id] = true;
    a.toast = { name: ach.name, desc: ach.desc, until: scene.time.now / 1000 + ACH_TOAST_S };
    scene.flashPopup(scene.player.x, scene.player.y - 52, '★ ' + ach.name, 0xF0C840);
    scene.events.emit('achievement:unlocked', { id: ach.id, name: ach.name, desc: ach.desc });
  },

  // for the HUD list overlay (J)
  list(scene){
    const a = scene.achievements, out = [];
    for (const ach of ACHIEVEMENTS){
      let v = 0; try { v = ach.val(scene, a.stats) || 0; } catch (e){}
      out.push({ name: ach.name, desc: ach.desc, unlocked: !!a.unlocked[ach.id], val: Math.min(v, ach.goal), goal: ach.goal });
    }
    return out;
  },
  count(scene){ const a = scene.achievements; let n = 0; for (const ach of ACHIEVEMENTS) if (a.unlocked[ach.id]) n++; return { done: n, total: ACHIEVEMENTS.length }; },
};
