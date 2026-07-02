// ── systems/LeviathanSystem.js ── (LV1 — doc II endgame target)
// ONE Leviathan roams the world: a tier-6 hostile that regenerates in combat
// faster than a small fleet can burn it down. Capturing it needs BOTH doc
// conditions at once: hull stripped to ≤ LEV_CAPTURE_HULL_PCT AND an effective
// boarding party of ShipTiers tier-6 `board` (200 — LOCKED by doc), which no
// single crew reaches: your crew + LEV_ESCORT_BOARD per hired privateer close
// aboard. That's the doc's 'multi-ship requirement through the capture math'.
// It lives in scene.ships (existing pirate AI drives it) but is PERSISTENT —
// Population's distance cull skips it. Position is deterministic per run;
// session-only (respawns fresh each boot — flagged). ALL PLACEHOLDER except
// the two doc-locked values.
const LEV_SPAWN_DIST_MIN = 6000, LEV_SPAWN_DIST_MAX = 9000;   // ring around world origin
const LEV_CAPTURE_HULL_PCT = 10;    // doc-LOCKED: hull must be ≤ 10%
const LEV_COMBAT_REGEN_PCT = 0.012; // fraction of maxHull regenerated per second while recently hit
const LEV_REGEN_WINDOW_S = 6;       // 'in combat' = hit within this window
const LEV_ESCORT_BOARD = 45;        // boarders each nearby hired privateer contributes
const LEV_ESCORT_RANGE = 600;       // privateer must be this close to join the boarding

const LeviathanSystem = {
  init(scene){
    if (scene.ships.some(s => s.isLeviathan)) return;         // one per world
    const a = scene.eprng() * TAU;
    const d = LEV_SPAWN_DIST_MIN + scene.eprng() * (LEV_SPAWN_DIST_MAX - LEV_SPAWN_DIST_MIN);
    const s = {
      id: 'leviathan', isLeviathan: true, persistent: true,
      faction: 'pirate',                                      // existing pirate AI drives aggro/attack
      x: Math.cos(a) * d, y: Math.sin(a) * d,
      heading: Math.floor(scene.eprng() * 360), vel: 0, sailState: 2,
      tier: 6, crew: 0, alive: true, wake: [], lastHitAt: -999,
      fire: 0, push: { x: 0, y: 0 },
    };
    if (typeof ShipTiers !== 'undefined') ShipTiers.apply(scene, s, true);
    scene.ships.push(s);
  },

  update(scene, dt, dts){
    const lev = scene.ships.find(s => s.isLeviathan && s.alive);
    if (!lev) return;
    // combat regen (doc): while recently hit, heal — this is what makes a lone
    // sloop hopeless. Regen pauses once stripped into capture range so a real
    // fleet's damage actually sticks long enough to board.
    const t = scene.time.now / 1000;
    const inCombat = (t - (lev.lastHitAt || -999)) < LEV_REGEN_WINDOW_S;
    const capFloor = lev.maxHull * (LEV_CAPTURE_HULL_PCT / 100);
    if (inCombat && lev.hull > capFloor && lev.hull < lev.maxHull){
      lev.hull = Math.min(lev.maxHull, lev.hull + lev.maxHull * LEV_COMBAT_REGEN_PCT * dts);
    }
  },

  // effective boarding party for the Leviathan: your crew + nearby hired privateers
  effectiveBoarders(scene){
    const pl = scene.player;
    let n = pl.crew || 0;
    if (scene.hire) for (const e of scene.hire.hired){
      if (Math.hypot(e.x - pl.x, e.y - pl.y) < LEV_ESCORT_RANGE) n += LEV_ESCORT_BOARD;
    }
    return n;
  },

  draw(scene, g){
    const lev = scene.ships.find(s => s.isLeviathan && s.alive);
    if (!lev) return;
    // menace aura — dark ring + slow red pulse so it reads as THE endgame thing
    const t = scene.time.now / 1000, pulse = 0.25 + 0.15 * Math.sin(t * 1.4);
    g.lineStyle(3, 0x1A0A0A, 0.55); g.strokeCircle(lev.x, lev.y, 58);
    g.lineStyle(2, 0xB02020, pulse); g.strokeCircle(lev.x, lev.y, 58 + 5 * Math.sin(t * 1.4));
    // stripped + boardable? broadcast it
    if (lev.hull <= lev.maxHull * (LEV_CAPTURE_HULL_PCT / 100)){
      g.lineStyle(2, 0xF0C840, 0.8); g.strokeCircle(lev.x, lev.y, 70);
    }
  },
};
