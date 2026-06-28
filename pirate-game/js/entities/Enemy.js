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

  // (re)build the fleet. Population streams ships around the player and scales
  // density with nearby ports; spawnFleet just clears the set and asks it for the
  // initial fill (used on first load and on R-reset / the dev "respawn" button).
  spawnFleet(scene){
    scene.ships.length = 0;
    if (typeof Population !== 'undefined') Population.populate(scene);
  },
};
