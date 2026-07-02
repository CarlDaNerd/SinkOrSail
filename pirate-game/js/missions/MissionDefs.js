// ── missions/MissionDefs.js ── (TM1)
// Data-driven mission templates (the pattern MissionLoader.js established:
// drop a def in, no engine changes). Each def's roll(scene, port) returns an
// offer instance or null. Rewards/counts PLACEHOLDER pending live tune.
const MISSION_DEFS = [
  {
    id: 'hunt_pirates',
    roll(scene, port){
      const need = 2 + Math.floor(scene.eprng() * 3);            // 2-4 pirates
      return { type: 'hunt', title: 'Pirate hunt', need, done: 0,
        reward: 120 * need,
        desc: 'Sink ' + need + ' pirate ships. Pays on the last kill.' };
    },
  },
  {
    id: 'parcel_delivery',
    roll(scene, port){
      // pick a DIFFERENT known port as the destination, prefer nearer ones
      const cands = (scene.navyPorts || []).filter(p => p !== port);
      if (!cands.length) return null;
      cands.sort((a, b) => Math.hypot(a.x - port.x, a.y - port.y) - Math.hypot(b.x - port.x, b.y - port.y));
      const dest = cands[Math.floor(scene.eprng() * Math.min(3, cands.length))];
      const dist = Math.hypot(dest.x - port.x, dest.y - port.y);
      return { type: 'delivery', title: 'Parcel run', dest,
        reward: 60 + Math.round(dist / 40),                       // distance-scaled
        desc: 'Carry a sealed parcel to ' + dest.name + '. Pays on arrival. (No hold space used — V1)' };
    },
  },
  // escort defs land here later (doc: escort missions) — deferred, needs AI convoy work
];
