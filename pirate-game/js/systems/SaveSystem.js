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
      standing: scene.navyStanding, flag: scene.flag,
      explored: Array.from(scene.explored),
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
    p.fire = { port:0, star:0 }; p.wake = []; p.lastHitAt = -99; p.lastFiredAt = -99;
    scene.navyStanding = s.standing; scene.flag = s.flag; scene.flagPending = null;
    scene.explored = new Set(s.explored || []);
    scene.docked = false; scene.dockPort = null; scene.menuOpen = false; scene.mapOpen = false;
    scene.cannonballs.length = 0; scene.loot.length = 0; scene.popups.length = 0;
    scene.ships = []; Enemy.spawnFleet(scene);
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
