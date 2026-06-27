// ── world/WorldGen.js ──
// Phase 2: biome-driven, region-tier world generation (deterministic).
//
//   landiness(rx,ry) — smooth value-noise field → coherent land/ocean zones.
//   biomeOf(rx,ry)   — ocean / archipelago / mainland. Mainland only at a local
//                      landiness PEAK, so mainlands are rarely adjacent and are
//                      ringed by archipelago (islands hug mainlands).
//   region(rx,ry)    — the features anchored near region (rx,ry): {lands, reefs,
//                      shallows}. Pure + memoised → identical on every rebuild.
//   generateChunk    — gathers features from every region within MAX_FEATURE_REACH
//                      of the chunk, keeping those whose ANCHOR falls in the chunk.
//                      Neighbour-gathering lets a region place big mainlands and
//                      long island chains that spill past its own bounds without
//                      orphaning the features (each is still owned by exactly one
//                      chunk — the one containing its anchor).
const WorldGen = {
  _cache: new Map(),

  landiness(rx, ry){ return valueNoise(rx*BIOME_FREQ, ry*BIOME_FREQ, (WORLD_SEED ^ 0x9E3779B9) >>> 0); },

  biomeOf(rx, ry){
    if (Math.floor(STARTER_ANCHOR_X/REGION_SIZE) === rx && Math.floor(STARTER_ANCHOR_Y/REGION_SIZE) === ry) return 'mainland';
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
    if (this._cache.size > 400) this._cache.clear();   // crude cap (regions rebuild deterministically)
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
      const starter = (Math.floor(STARTER_ANCHOR_X/REGION_SIZE) === rx && Math.floor(STARTER_ANCHOR_Y/REGION_SIZE) === ry);
      let ax, ay, minS, maxS;
      if (starter){ ax = STARTER_ANCHOR_X; ay = STARTER_ANCHOR_Y; minS = STARTER_MAINLAND_MIN; maxS = STARTER_MAINLAND_MAX; }
      else { const p = interior(); ax = p.x; ay = p.y; minS = MAINLAND_MIN; maxS = MAINLAND_MAX; }
      this._mainland(r, ax, ay, minS, maxS, lands, reefs, shallows);

    } else if (biome === 'archipelago'){
      const c = interior();
      this._cluster(r, c.x, c.y, lands, reefs, shallows);

    } else if (r() < 0.12){                                  // open ocean: a rare lone outcrop
      const p = interior(); lands.push(this._island(r, p.x, p.y, [25,55], [20,45], false));
    }

    const clear = f => Math.hypot(f.cx, f.cy) > START_CLEAR_RADIUS;   // open water around origin
    return { lands: lands.filter(clear), reefs: reefs.filter(clear), shallows: shallows.filter(clear) };
  },

  // ── feature builders ──
  _island(r, cx, cy, rxR, ryR, multi){
    const ells = [], lobes = multi ? 2 + Math.floor(r()*2) : 1;
    for (let l = 0; l < lobes; l++){
      const ox = multi ? (r()-0.5)*100 : 0, oy = multi ? (r()-0.5)*80 : 0;
      ells.push({ cx:cx+ox, cy:cy+oy, rx:rxR[0]+r()*(rxR[1]-rxR[0]), ry:ryR[0]+r()*(ryR[1]-ryR[0]) });
    }
    return { cx, cy, ells, multi };
  },

  // elongated reef parallel to the shore: rocks laid in a long, thin band along
  // `alongAngle` (the coast tangent). drawReefs uses angle/len/wid for the patch.
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

  // massive elongated landmass: lobes along a randomly-oriented spine with a
  // thick middle that tapers toward the ends → "varying thickness"
  _mainland(r, ax, ay, minS, maxS, lands, reefs, shallows){
    const W = minS + r()*(maxS - minS), H = minS + r()*(maxS - minS);
    const theta = r()*Math.PI*2, major = Math.max(W,H)/2, minor = Math.min(W,H)/2;
    const ux = Math.cos(theta), uy = Math.sin(theta), px = -uy, py = ux;
    const ells = [], n = 16 + Math.floor(r()*16);
    for (let i = 0; i < n; i++){
      const t = (i/(n-1) - 0.5)*2;
      const along = t*major*0.85, wob = (r()-0.5)*minor*0.4;
      const lx = ax + ux*along + px*wob, ly = ay + uy*along + py*wob;
      const taper = Math.sqrt(Math.max(0.04, 1 - t*t));
      const rad = (0.35 + 0.45*taper)*minor*(0.7 + r()*0.4);
      ells.push({ cx:lx, cy:ly, rx:rad*(0.9+r()*0.25), ry:rad*(0.9+r()*0.25) });
    }
    lands.push({ cx:ax, cy:ay, ells, multi:true });
    shallows.push({ cx:ax, cy:ay, rx:major*1.4, ry:major*1.4 });
    const fringeN = 4 + Math.floor(r()*6);                  // islands ring the mainland
    for (let i = 0; i < fringeN; i++){ const a = r()*Math.PI*2, rad = major + 120 + r()*420; lands.push(this._island(r, ax+Math.cos(a)*rad, ay+Math.sin(a)*rad, [80,150], [60,110], r()<0.3)); }
    const outN = 3 + Math.floor(r()*4);                     // outcrop garnish
    for (let i = 0; i < outN; i++){ const a = r()*Math.PI*2, rad = r()*(major + 250); lands.push(this._island(r, ax+Math.cos(a)*rad, ay+Math.sin(a)*rad, [25,55], [20,45], false)); }
    const reefN = 1 + (r() < 0.6 ? 1 : 0);                  // 1–2 coastal reefs, parallel to the shore (tangent = a + 90°)
    for (let i = 0; i < reefN; i++){ const a = r()*Math.PI*2, rad = major + 70 + r()*200; reefs.push(this._reef(r, ax+Math.cos(a)*rad, ay+Math.sin(a)*rad, a + Math.PI/2)); }
  },

  // archipelago: wandering CHAINS of small islands (strings you can thread)
  _cluster(r, cx, cy, lands, reefs, shallows){
    const chains = 1 + Math.floor(r()*2);                   // 1–2 chains per region
    for (let c = 0; c < chains; c++){
      let x = cx + (r()-0.5)*1400, y = cy + (r()-0.5)*1400;
      let dir = r()*Math.PI*2;
      const len = 4 + Math.floor(r()*7);                    // 4–10 islands in the chain
      for (let i = 0; i < len; i++){
        lands.push(this._island(r, x, y, [80,150], [60,110], r()<0.2));
        if (i % 3 === 0) shallows.push({ cx:x, cy:y, rx:520, ry:520 });          // shallows tiled along the chain
        if (i > 0 && r() < 0.2) lands.push(this._island(r, x+(r()-0.5)*170, y+(r()-0.5)*170, [25,55], [20,45], false));  // outcrop beside
        dir += (r()-0.5)*1.1;                               // wander the heading
        const step = 230 + r()*170;
        x += Math.cos(dir)*step; y += Math.sin(dir)*step;
      }
      if (r() < 0.45) reefs.push(this._reef(r, x, y, dir));  // reef trailing the chain, along its run
    }
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
