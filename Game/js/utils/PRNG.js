// ── utils/PRNG.js ──
// Seeded LCG. Create SEPARATE instances per domain (world gen, enemy gen,
// in-game events); pass them around, never re-seed mid-run (handoff §3).
function makePRNG(seed){
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
}

// 2D integer coordinate hash → uint32 seed. Used to seed each chunk so its
// contents are a pure function of (seed, cx, cy) — identical regardless of the
// order chunks are visited, which is what makes streaming deterministic.
function hashCoords(cx, cy, seed){
  let h = seed >>> 0;
  h = Math.imul(h ^ (cx >>> 0), 2654435761) >>> 0;
  h = Math.imul(h ^ (cy >>> 0), 2246822519) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}

// Smooth 2D value noise in [0,1] over the integer lattice (bilinear + smoothstep
// of hashed lattice values). Low-frequency sampling gives coherent zones — used
// to decide biome "landiness" so oceans/archipelagos/mainlands cluster instead
// of forming a random checkerboard.
function _smooth(t){ return t*t*(3 - 2*t); }
function valueNoise(x, y, seed){
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const v00 = hashCoords(ix,   iy,   seed) / 4294967296;
  const v10 = hashCoords(ix+1, iy,   seed) / 4294967296;
  const v01 = hashCoords(ix,   iy+1, seed) / 4294967296;
  const v11 = hashCoords(ix+1, iy+1, seed) / 4294967296;
  const sx = _smooth(fx), sy = _smooth(fy);
  const a = v00 + (v10 - v00)*sx, b = v01 + (v11 - v01)*sx;
  return a + (b - a)*sy;
}
