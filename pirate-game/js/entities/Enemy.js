// ── entities/Enemy.js ──
// Faction-driven NPC ships (merchant / pirate / navy / privateer) + the fleet
// spawner. Roster is deliberately scarce so each encounter reads as a legible
// event rather than ambient noise (handoff §9). Behavior lives in systems/AI.js.
const Enemy = {
  create(faction, hull, x, y, heading, home, r, i){
    return {
      id:faction + '_' + i, faction, x, y, heading, vel:0, sailState:2,
      hull, maxHull:hull, fire:0, wake:[],
      state:'cruise', waypoint:{ x:x + (r() - 0.5)*2400, y:y + (r() - 0.5)*2400 },
      home, hostileToPlayer:false, hitsByPlayer:0, alive:true,
    };
  },

  // (re)build scene.ships using the enemy PRNG; avoid spawning on islands or on
  // top of the player start.
  spawnFleet(scene){
    scene.ships.length = 0;
    const r = scene.eprng;
    const spawn = (faction, hull, n) => {
      const homed = (faction === 'navy' || faction === 'privateer');
      for (let i = 0; i < n; i++){
        // Navy & privateers home to — and START near — a port, distributed across
        // the available ports so each port is guarded and they begin inside their
        // leash. Merchants & pirates spawn anywhere in open sea.
        const home = homed ? scene.navyPorts[i % scene.navyPorts.length] : null;
        let x, y, att = 0;
        do {
          if (home){ const a = r()*Math.PI*2, rr = 150 + r()*(P.navyLeash*0.7); x = home.x + Math.cos(a)*rr; y = home.y + Math.sin(a)*rr; }
          else { x = (r() - 0.5)*2*SPAWN_RANGE; y = (r() - 0.5)*2*SPAWN_RANGE; }   // open sea near origin (Phase 1)
          att++;
        } while (att < 40 && (Collision.checkIsland(scene, x, y, 40).hit || Math.hypot(x, y) < 450));
        scene.ships.push(Enemy.create(faction, hull, x, y, r()*360, home, r, i));
      }
    };
    spawn('merchant', 50, 5);
    spawn('pirate',   75, 3);
    spawn('navy',     90, 5);
    spawn('privateer',70, 2);
  },
};
