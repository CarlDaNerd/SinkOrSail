// ── systems/SaveSystem.js ──
// Save / load. The world is fully deterministic from WORLD_SEED, so we persist
// ONLY the mutable run state (player, standing, flag, explored fog) — not terrain
// or ships (the fleet respawns on load). Auto-saved to localStorage when you dock;
// also exportable / importable as a .json file. Saving only happens at ports
// (the auto-save fires on docking; file export is in the dock menu).
const Save = {
  KEY: 'sos_save_v1',
  VERSION: 1,

  serialize(scene){
    const p = scene.player;
    return {
      v: this.VERSION, seed: WORLD_SEED, t: Date.now(),
      px: p.x, py: p.y, ph: p.heading, hull: p.hull, ammo: p.ammo, gold: p.gold, bank: p.bank, sail: p.sailState,
      tier: p.tier, crew: p.crew, upgrades: p.upgrades,
      standing: scene.navyStanding, flag: scene.flag,
      explored: Array.from(scene.explored),
      ach: scene.achievements ? { unlocked: scene.achievements.unlocked, stats: scene.achievements.stats } : undefined,
      ownedPorts: (scene.ownedPorts || []).map(p => [Math.round(p.x), Math.round(p.y)]),
      // transient player-built fleet — re-linked to deterministic ports by coords on load
      runners: (scene.runners || []).map(r => ({ x:Math.round(r.x), y:Math.round(r.y), h:Math.round(r.heading) || 0, tier:r.tier, hull:Math.round(r.hull), phase:r.phase, timer:r.timer, leg:r.leg, earned:r.earned, cv:!!r.convoy,
        home: r.home ? [Math.round(r.home.x), Math.round(r.home.y)] : null, route: (r.route || []).map(p => [Math.round(p.x), Math.round(p.y)]) })),
      escorts: ((scene.hire && scene.hire.hired) || []).map(e => ({ x:Math.round(e.x), y:Math.round(e.y), h:Math.round(e.heading) || 0, tier:e.tier, hull:Math.round(e.hull),
        ar: e.assigned ? (scene.runners || []).findIndex(r => r.id === e.assigned) : -1 })),   // SC1: assigned-runner index
      // captured prizes in tow — coords/tier/hull only; re-stamped on load
      tows: (scene.tows || []).map(t => ({ x:Math.round(t.x), y:Math.round(t.y), h:Math.round(t.heading) || 0, tier:t.tier || 1, hull:Math.round(t.hull) })),
      // SC1: tavern missions (dest re-linked by coords on load)
      missions: (scene.activeMissions || []).map(m => ({ type:m.type, title:m.title, need:m.need, done:m.done, reward:m.reward,
        dest: m.dest ? [Math.round(m.dest.x), Math.round(m.dest.y)] : null })),
      // SC1: the Leviathan — position/hull, or dead:true so a slain one stays slain
      lev: (() => { const L = (scene.ships || []).find(x => x.isLeviathan);
        return L && L.alive ? { x:Math.round(L.x), y:Math.round(L.y), h:Math.round(L.heading) || 0, hull:Math.round(L.hull) } : { dead:true }; })(),
      // SC1: ports whose for-sale derelict was bought (port state itself is deterministic)
      soldDerelicts: (scene.navyPorts || []).filter(p => p._derelictSold).map(p => [Math.round(p.x), Math.round(p.y)]),
      bounties: (scene.bounties || []).map(b => ({ killsNeeded:b.killsNeeded, killsDone:b.killsDone, reward:b.reward, chunkKey:b.chunkKey,
        issuer: b.issuer ? [Math.round(b.issuer.x), Math.round(b.issuer.y)] : null, targets: (b.targets || []).filter(t => t && t.alive).map(t => ({ x:Math.round(t.x), y:Math.round(t.y), h:Math.round(t.heading) || 0, hull:Math.round(t.hull) })) })),
    };
  },

  write(scene){
    try { localStorage.setItem(this.KEY, JSON.stringify(this.serialize(scene))); return true; }
    catch (e){ return false; }
  },
  read(){
    try { const s = JSON.parse(localStorage.getItem(this.KEY)); return (s && s.v === this.VERSION) ? s : null; }
    catch (e){ return null; }
  },
  exists(){ return !!this.read(); },
  clear(){ try { localStorage.removeItem(this.KEY); } catch (e){} },

  // apply a save object onto a live GameScene (assumes create() already ran)
  apply(scene, s){
    if (!s || s.v !== this.VERSION) return false;
    const p = scene.player;
    p.x = s.px; p.y = s.py; p.heading = s.ph; p.vel = 0;
    p.hull = s.hull; p.ammo = s.ammo; p.gold = s.gold; p.bank = (typeof s.bank === 'number') ? s.bank : (p.bank || 0); p.sailState = s.sail;
    p.fire = { port:0, star:0, bow:0, stern:0 }; p.wake = []; p.lastHitAt = -99; p.lastFiredAt = -99;
    // restore ship tier + crew, then re-stamp tier-derived stats (maxHull/balls/scale/sails, clamp hull & crew)
    if (typeof s.tier === 'number') p.tier = s.tier;
    if (typeof s.crew === 'number') p.crew = s.crew;
    if (s.upgrades) p.upgrades = { sail: s.upgrades.sail || 0, cannon: s.upgrades.cannon || 0 };
    if (typeof ShipTiers !== 'undefined') ShipTiers.apply(scene, p, false);
    scene.navyStanding = s.standing; scene.flag = s.flag; scene.flagPending = null;
    scene.explored = new Set(s.explored || []);
    // restore achievement progress onto the slice AchievementSystem.init() built
    if (s.ach && scene.achievements){
      scene.achievements.unlocked = s.ach.unlocked || {};
      if (s.ach.stats) scene.achievements.stats = Object.assign(scene.achievements.stats, s.ach.stats);
    }
    // restore captured ports (match by deterministic world coords; ids reset per page)
    if (Array.isArray(s.ownedPorts) && scene.navyPorts){
      scene.ownedPorts = [];
      const owned = new Set(s.ownedPorts.map(c => c[0] + ',' + c[1]));
      for (const port of scene.navyPorts){
        if (owned.has(Math.round(port.x) + ',' + Math.round(port.y))){ port.owner = 'player'; port.hull = port.maxHull; scene.ownedPorts.push(port); }
      }
    }
    scene.docked = false; scene.dockPort = null; scene.menuOpen = false; scene.mapOpen = false;
    scene.cannonballs.length = 0; scene.loot.length = 0; scene.popups.length = 0;
    // BUGFIX: the pre-load fleet is discarded below, so every berth claim from it
    // must be voided or those docks stay blocked by ghost occupants forever
    if (scene.navyPorts) for (const port of scene.navyPorts) for (const d of (port.docks || [])){ d.occupantId = null; }
    // BUGFIX: pre-load weather would sit at stale coordinates — clear it
    if (typeof WeatherSystem !== 'undefined' && scene.weather) WeatherSystem.clear(scene);
    scene.ships = []; Enemy.spawnFleet(scene);
    // BUGFIX: restore towed prizes (they were silently dropped — lost on load —
    // while STALE tows ghosted through into the loaded game)
    scene.tows = [];
    if (Array.isArray(s.tows)){
      for (const tv of s.tows){
        const tow = { id: 'tow_' + Math.random().toString(36).slice(2, 8), x: tv.x, y: tv.y, heading: tv.h || 0,
          tier: tv.tier || 1, hull: tv.hull, crew: 0, vel: 0, faction: 'prize', state: 'towed', beingTowed: true,
          alive: true, wake: [], fire: { port:0, star:0, bow:0, stern:0 } };
        if (typeof ShipTiers !== 'undefined') ShipTiers.apply(scene, tow, false);
        scene.tows.push(tow);
      }
    }
    // SC1: tavern missions — dest re-linked to the deterministic port by coords
    if (scene.activeMissions){
      scene.activeMissions.length = 0;
      if (Array.isArray(s.missions)) for (const md of s.missions){
        let dest = null;
        if (md.dest) for (const port of scene.navyPorts){ if (Math.round(port.x) === md.dest[0] && Math.round(port.y) === md.dest[1]){ dest = port; break; } }
        if (md.type === 'delivery' && !dest) continue;              // destination port unreachable → drop
        scene.activeMissions.push({ type:md.type, title:md.title, need:md.need, done:md.done, reward:md.reward, dest,
          desc:'' });
      }
    }
    // SC1: the Leviathan — reposition the boot-spawned one, or keep a slain one slain
    if (s.lev){
      const idx = scene.ships.findIndex(x => x.isLeviathan);
      if (s.lev.dead){ if (idx >= 0) scene.ships.splice(idx, 1); }
      else if (idx >= 0){ const L = scene.ships[idx];
        L.x = s.lev.x; L.y = s.lev.y; L.heading = s.lev.h || 0;
        L.hull = Math.min(L.maxHull, s.lev.hull || L.maxHull); }
    }
    // SC1: bought derelicts stay bought
    if (Array.isArray(s.soldDerelicts)) for (const c of s.soldDerelicts){
      for (const port of scene.navyPorts){
        if (Math.round(port.x) === c[0] && Math.round(port.y) === c[1]){ port.derelict = null; port._derelictSold = true; break; }
      }
    }
    this._restoreFleet(scene, s);                         // runners / escorts / bounties (player-built state)
    Chunks.update(scene);                                  // unload the old window, stream terrain at the loaded spot
    // safety: if an old save lands inside land (world-gen changed since it was
    // written), nudge the ship out to the nearest open water
    if (Collision.checkIslandHull(scene, p).hit){
      const ox = p.x, oy = p.y; let found = false;
      for (let rr = 80; rr <= 1400 && !found; rr += 80) for (let k = 0; k < 12 && !found; k++){
        const a = (k/12)*Math.PI*2; p.x = ox + Math.cos(a)*rr; p.y = oy + Math.sin(a)*rr;
        if (!Collision.checkIslandHull(scene, p).hit) found = true; else { p.x = ox; p.y = oy; }
      }
    }
    if (scene.follow) scene.follow.setPosition(p.x, p.y);
    return true;
  },

  // rebuild player-built transient state (runners, escorts, bounties) from a save:
  // re-link ports by deterministic world coords, re-stamp tier stats, and re-spawn
  // any live bounty targets back into the fleet. Runs after Enemy.spawnFleet.
  _restoreFleet(scene, s){
    const portAt = (c) => { if (!c) return null; const k = c[0] + ',' + c[1]; for (const port of scene.navyPorts){ if (Math.round(port.x) + ',' + Math.round(port.y) === k) return port; } return null; };
    const stamp = (ship) => { if (typeof ShipTiers !== 'undefined') ShipTiers.apply(scene, ship, true); else { ship.maxHull = ship.maxHull || 130; ship.hull = ship.hull || ship.maxHull; } };

    if (Array.isArray(s.runners) && scene.runners){
      scene.runners.length = 0;
      for (let i = 0; i < s.runners.length; i++){
        const rd = s.runners[i], home = portAt(rd.home) || scene.navyPorts[0];
        if (!home) continue;
        const route = (rd.route || []).map(portAt).filter(Boolean);
        const r = { id:'runner_load_' + i, faction:'runner', owner:'player', isRunner:true,
          x:rd.x, y:rd.y, heading:rd.h || 0, vel:0, sailState:2, wake:[], tier:rd.tier || STARTER_TIER, crew:0, alive:true, lastHitAt:-999,
          home, route: route.length ? route : [home], leg:rd.leg || 0, phase:rd.phase || 'repair', timer:rd.timer || 0, earned:rd.earned || 0, convoy: !!rd.cv };   // SC1
        stamp(r); r.hull = Math.min(r.maxHull, rd.hull || r.maxHull);
        scene.runners.push(r);
      }
    }
    if (Array.isArray(s.escorts) && scene.hire){
      scene.hire.hired.length = 0;
      for (let i = 0; i < s.escorts.length; i++){
        const ed = s.escorts[i];
        const e = { id:'escort_load_' + i, faction:'privateer', owner:'player', isEscort:true,
          x:ed.x, y:ed.y, heading:ed.h || 0, vel:0, sailState:2, wake:[], tier:ed.tier || 3, alive:true, fireCd:0, tracer:null, crew:0,
          assigned: (typeof ed.ar === 'number' && ed.ar >= 0 && scene.runners && scene.runners[ed.ar]) ? scene.runners[ed.ar].id : null };   // SC1
        stamp(e); e.hull = Math.min(e.maxHull, ed.hull || e.maxHull);
        scene.hire.hired.push(e);
      }
    }
    if (Array.isArray(s.bounties) && scene.bounties && typeof Enemy !== 'undefined'){
      scene.bounties.length = 0;
      for (let i = 0; i < s.bounties.length; i++){
        const bd = s.bounties[i], issuer = portAt(bd.issuer);
        if (!issuer) continue;
        const targets = [];
        for (const td of (bd.targets || [])){
          const ship = Enemy.create('pirate', 75, td.x, td.y, td.h || 0, null, scene.eprng, scene.ships.length);
          ship.hull = Math.min(ship.maxHull, td.hull || ship.maxHull);
          scene.ships.push(ship); targets.push(ship);
        }
        scene.bounties.push({ id:'bnt_load_' + i, issuer, killsNeeded:bd.killsNeeded, killsDone:bd.killsDone || 0, targets, chunkKey:bd.chunkKey, reward:bd.reward });
      }
    }
  },

  // ── file export / import (the "Both" storage half) ──
  // download the LAST SAVE (the stored localStorage save) as a .json file
  exportSaved(){
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return false;
      const blob = new Blob([raw], { type:'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'sinkorsail-save.json'; document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      return true;
    } catch (e){ return false; }
  },
  importFile(cb){
    try {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json'; inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        document.body.removeChild(inp);
        if (!f){ cb(null); return; }
        const r = new FileReader();
        r.onload = () => { try { const s = JSON.parse(r.result); cb(s && s.v === this.VERSION ? s : null); } catch (e){ cb(null); } };
        r.readAsText(f);
      };
      inp.click();
    } catch (e){ cb(null); }
  },
};
