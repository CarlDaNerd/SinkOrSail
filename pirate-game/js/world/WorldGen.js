// ── world/WorldGen.js ──
// Phase 2: biome-driven, region-tier world generation (deterministic).
//
//   landiness(rx,ry) — smooth value-noise field → coherent land/ocean zones.
//   biomeOf(rx,ry)   — ocean / archipelago / mainland (with a hand-tuned spawn
//                      neighbourhood). Mainland only at a local landiness PEAK,
//                      so mainlands are rarely adjacent and ringed by islands.
//   region(rx,ry)    — features anchored near region (rx,ry): {lands, reefs,
//                      shallows}. Pure + memoised → identical on every rebuild.
//   generateChunk    — gathers features from every region within MAX_FEATURE_REACH
//                      of the chunk, keeping those whose ANCHOR falls in the chunk.
//
// Each land feature carries `bw` (a fixed per-landmass band width) so the render
// layers (beach → jungle → core) are uniform-width regardless of island size.
const WorldGen = {
  _cache: new Map(),

  landiness(rx, ry){ return valueNoise(rx*BIOME_FREQ, ry*BIOME_FREQ, (WORLD_SEED ^ 0x9E3779B9) >>> 0); },

  biomeOf(rx, ry){
    // — spawn neighbourhood: a dense, hand-tuned starter area —
    if (rx === 0 && ry === 0)   return 'mainland';                      // starter mainland (NE of spawn)
    if (rx === -1 && ry === -1) return 'mainland';                      // a second mainland (SW of spawn)
    if (Math.abs(rx) <= 1 && Math.abs(ry) <= 1) return 'archipelago';   // ring of islands around spawn
    // — procedural elsewhere —
    const L = this.landiness(rx, ry);
    if (L < ARCH_THRESHOLD) return 'ocean';
    if (L >= MAINLAND_THRESHOLD){
      let peak = true;
      for (let dy = -1; dy <= 1 && peak; dy++) for (let dx = -1; dx <= 1; dx++){
        if ((dx || dy) && this.landiness(rx+dx, ry+dy) >= L){ peak = false; break; }
      }
      if (peak) return 'mainland';
    }
    return 'archipelago';
  },

  region(rx, ry){
    const key = rx + ',' + ry;
    const hit = this._cache.get(key);
    if (hit) return hit;
    const built = this._build(rx, ry);
    if (this._cache.size > 400) this._cache.clear();
    this._cache.set(key, built);
    return built;
  },

  _build(rx, ry){
    const r = makePRNG(hashCoords(rx, ry, (WORLD_SEED * 0x85EBCA6B) >>> 0));
    const ox = rx*REGION_SIZE, oy = ry*REGION_SIZE;
    const lands = [], reefs = [], shallows = [];
    const interior = () => ({ x: ox + REGION_MARGIN + r()*(REGION_SIZE - 2*REGION_MARGIN),
                              y: oy + REGION_MARGIN + r()*(REGION_SIZE - 2*REGION_MARGIN) });
    const biome = this.biomeOf(rx, ry);

    if (biome === 'mainland'){
      const starter   = (rx === 0 && ry === 0);
      const spawnMain = starter || (rx === -1 && ry === -1);            // both spawn mainlands stay starter-sized to fit near spawn
      let ax, ay;
      if (starter){ ax = STARTER_ANCHOR_X; ay = STARTER_ANCHOR_Y; }
      else { const p = interior(); ax = p.x; ay = p.y; }
      const lenMin = spawnMain ? STARTER_LEN_MIN   : MAINLAND_LEN_MIN;
      const lenMax = spawnMain ? STARTER_LEN_MAX   : MAINLAND_LEN_MAX;
      const widMin = spawnMain ? STARTER_WIDTH_MIN : MAINLAND_WIDTH_MIN;
      const widMax = spawnMain ? STARTER_WIDTH_MAX : MAINLAND_WIDTH_MAX;
      this._mainland(r, ax, ay, lenMin, lenMax, widMin, widMax, lands, reefs, shallows);
      if (starter) this._cluster(r, 600, 400, lands, reefs, shallows);   // an extra grouping right at spawn

    } else if (biome === 'archipelago'){
      const c = interior();
      this._cluster(r, c.x, c.y, lands, reefs, shallows);

    } else if (r() < 0.12){                                  // open ocean: a rare lone outcrop
      const p = interior(); lands.push(this._island(r, p.x, p.y, 25, 55));
    }

    const clear = f => Math.hypot(f.cx, f.cy) > START_CLEAR_RADIUS;   // open water around origin
    return { lands: lands.filter(clear), reefs: reefs.filter(clear), shallows: shallows.filter(clear) };
  },

  // ── feature builders ──

  // Irregular island: a central lobe plus several scattered overlapping lobes,
  // giving a lumpy outline (inlets + jut-outs) instead of a plain circle.
  _island(r, cx, cy, rMin, rMax){
    const base = rMin + r()*(rMax - rMin);
    const ells = [{ cx, cy, rx:base*(0.85+r()*0.3), ry:base*(0.78+r()*0.34) }];
    const n = 2 + Math.floor(r()*4);                        // 2–5 extra lobes
    for (let i = 0; i < n; i++){
      const a = r()*Math.PI*2, off = base*(0.4 + r()*0.6), lr = base*(0.35 + r()*0.5);
      ells.push({ cx:cx + Math.cos(a)*off, cy:cy + Math.sin(a)*off, rx:lr*(0.8+r()*0.5), ry:lr*(0.8+r()*0.5) });
    }
    return { cx, cy, ells, bw: BAND_MIN + r()*(BAND_MAX - BAND_MIN) };
  },

  // elongated reef parallel to the shore (rocks in a thin band along `alongAngle`)
  _reef(r, cx, cy, alongAngle){
    const len = 200 + r()*300, wid = 26 + r()*40;
    const ux = Math.cos(alongAngle), uy = Math.sin(alongAngle), px = -uy, py = ux;
    const rocks = [], n = 5 + Math.floor(r()*7);
    for (let i = 0; i < n; i++){
      const t = (r()-0.5)*2, w = (r()-0.5)*2;
      rocks.push({ cx:cx + ux*t*len + px*w*wid, cy:cy + uy*t*len + py*w*wid, rx:7+r()*11, ry:7+r()*11 });
    }
    return { cx, cy, rocks, angle:alongAngle, len, wid };
  },

  // massive landmass: lobes along a randomly-oriented, possibly-CURVED spine.
  // length × width are independent (→ blobs to long hotdogs), and the spine bends
  // for the longer ones (Japan/banana). Reach is kept under the streaming bound.
  _mainland(r, ax, ay, lenMin, lenMax, widMin, widMax, lands, reefs, shallows){
    const length = lenMin + r()*(lenMax - lenMin);
    const width  = Math.min(widMin + r()*(widMax - widMin), length*0.85);
    const theta = r()*Math.PI*2, major = length/2, minor = width/2;
    const elong = 1 - minor/major;                         // 0 = round, →1 = long & thin
    const curveAmp = (r()-0.5)*2 * minor * elong * 1.3;    // bend the spine; only meaningful when elongated
    const ux = Math.cos(theta), uy = Math.sin(theta), px = -uy, py = ux;
    const ells = [], n = 16 + Math.floor(r()*18);
    for (let i = 0; i < n; i++){
      const t = (i/(n-1) - 0.5)*2;
      const along = t*major*0.85;
      const curve = curveAmp*(1 - t*t);                    // max bend mid-spine, ends straighter
      const wob = (r()-0.5)*minor*0.4;
      const lx = ax + ux*along + px*(curve + wob), ly = ay + uy*along + py*(curve + wob);
      const taper = Math.sqrt(Math.max(0.04, 1 - t*t));
      const rad = (0.35 + 0.45*taper)*minor*(0.6 + r()*0.55);   // more per-lobe size variation
      ells.push({ cx:lx, cy:ly, rx:rad*(0.85+r()*0.35), ry:rad*(0.85+r()*0.35) });
    }
    lands.push({ cx:ax, cy:ay, ells, mainland:true, bw: BAND_MIN + r()*(BAND_MAX - BAND_MIN) });
    const fringeN = 4 + Math.floor(r()*6);                 // islands ring the mainland
    for (let i = 0; i < fringeN; i++){ const a = r()*Math.PI*2, rad = major + 140 + r()*440; lands.push(this._island(r, ax+Math.cos(a)*rad, ay+Math.sin(a)*rad, 80, 150)); }
    const outN = 3 + Math.floor(r()*4);                    // outcrop garnish
    for (let i = 0; i < outN; i++){ const a = r()*Math.PI*2, rad = r()*(major + 250); lands.push(this._island(r, ax+Math.cos(a)*rad, ay+Math.sin(a)*rad, 25, 55)); }
    const reefN = 1 + (r() < 0.6 ? 1 : 0);                 // 1–2 coastal reefs, parallel to shore
    for (let i = 0; i < reefN; i++){ const a = r()*Math.PI*2, rad = major + 70 + r()*200; reefs.push(this._reef(r, ax+Math.cos(a)*rad, ay+Math.sin(a)*rad, a + Math.PI/2)); }
  },

  // archipelago grouping: small islands SCATTERED across a large radius (several
  // chunks) with a minimum spacing between them — spread out and evenly gapped
  // rather than a tight clump or a line.
  _cluster(r, cx, cy, lands, reefs, shallows){
    const R = CLUSTER_RADIUS_MIN + r()*(CLUSTER_RADIUS_MAX - CLUSTER_RADIUS_MIN);
    const target = CLUSTER_MIN + Math.floor(r()*(CLUSTER_MAX - CLUSTER_MIN + 1));
    const placed = [];
    let guard = target*25;
    while (placed.length < target && guard-- > 0){
      const a = r()*Math.PI*2, rad = Math.sqrt(r())*R;                 // sqrt → even coverage over the disc
      const x = cx + Math.cos(a)*rad, y = cy + Math.sin(a)*rad;
      if (placed.some(p => Math.hypot(p.x - x, p.y - y) < ISLAND_GAP)) continue;   // keep them spaced apart
      placed.push({ x, y });
      lands.push(this._island(r, x, y, 70, 140));
      if (placed.length % 3 === 0) shallows.push({ cx:x, cy:y, rx:560, ry:560 });  // shallow zone follows the grouping
      if (r() < 0.10) lands.push(this._island(r, x + (r()-0.5)*120, y + (r()-0.5)*120, 22, 46));   // tiny outcrop beside
    }
    const reefN = (r() < 0.5 ? 1 : 0) + (r() < 0.3 ? 1 : 0);            // a couple of reefs around the grouping
    for (let i = 0; i < reefN && placed.length; i++){ const s = placed[Math.floor(r()*placed.length)]; reefs.push(this._reef(r, s.x + 220, s.y, r()*Math.PI*2)); }
  },

  // chunk = features (from every region within MAX_FEATURE_REACH) whose anchor
  // falls in this chunk
  generateChunk(cx, cy){
    const x0 = cx*CHUNK_SIZE, y0 = cy*CHUNK_SIZE, x1 = x0 + CHUNK_SIZE, y1 = y0 + CHUNK_SIZE;
    const inChunk = (px, py) => px >= x0 && px < x1 && py >= y0 && py < y1;
    const lands = [], reefs = [], shallows = [];
    const rx0 = Math.floor((x0 - MAX_FEATURE_REACH)/REGION_SIZE), rx1 = Math.floor((x1 - 1 + MAX_FEATURE_REACH)/REGION_SIZE);
    const ry0 = Math.floor((y0 - MAX_FEATURE_REACH)/REGION_SIZE), ry1 = Math.floor((y1 - 1 + MAX_FEATURE_REACH)/REGION_SIZE);
    for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++){
      const reg = this.region(rx, ry);
      for (const f of reg.lands)    if (inChunk(f.cx, f.cy)) lands.push(f);
      for (const f of reg.reefs)    if (inChunk(f.cx, f.cy)) reefs.push(f);
      for (const f of reg.shallows) if (inChunk(f.cx, f.cy)) shallows.push(f);
    }
    return { lands, reefs, shallows };
  },
};
