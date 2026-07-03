// ── missions/MissionLoader.js ──
// Stub that establishes the data-driven mission pattern (handoff §3/§16). Scans
// the (currently empty) missions/ set and loads nothing in V1; JSON-defined
// missions land here later with no code changes to add one.
class MissionLoader {
  constructor(scene){ this.scene = scene; this.missions = []; }
  scan(){ /* V1: no mission files yet. */ return this.missions; }
}
