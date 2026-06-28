// ── world/WorldGen.js ──
// Biome-driven, region-tier world generation (deterministic).
//
//   landiness(rx,ry) — smooth value-noise field → coherent land/ocean zones.
//   biomeOf(rx,ry)   — 'sea' or 'cluster'. The world is MOSTLY OPEN SEA; a cluster
//                      sits only at a STRICT local landiness peak, so clusters are
//                      rare and always ringed by water (no two are even diagonally
//                      adjacent). Each cluster is a "cluster of clusters": a
//                      mainland heart + a ring of sub-groups + lone islands, and
//                      every cluster has >=1 mainland. Open-sea regions are empty
//                      apart from the occasional small lone cluster adrift.
//   region(rx,ry)    — features anchored near region (rx,ry): {lands, reefs,
//                      shallows}. Pure + memoised → identical on every rebuild.
//   generateChunk    — gathers features from every region within MAX_FEATURE_REACH
//                      of the chunk, keeping those whose CENTRE falls in the chunk.
//
// Islands come in five SIZE TIERS (tiny→large→mainland) and several SHAPE
// archetypes (blob / stripe / crescent / ring / peninsula). Each tier is a
// FOOTPRINT RADIUS and every archetype is built to FIT inside it, so size is
// honest across shapes. Within a grouping islands are placed EDGE-TO-EDGE (using
// each island's measured `rad`) so they never overlap. Every shape is just a list
// of `ells` (axis-aligned ellipse lobes), so collision, render and maps consume
// them unchanged. `bw` = fixed band width; `big` (medium/large) → middle render
// depth so big land never paints over small.
const WorldGen = {
  _cache: new Map(),

  landiness(rx, ry){ return valueNoise(rx*BIOME_FREQ, ry*BIOME_FREQ, (WORLD_SEED ^ 0x9E3779B9) >>> 0); },

  biomeOf(rx, ry){
    // guaranteed starter cluster at spawn, with a ring of forced-sea around it so
    // it's always isolated (and spawn opens onto lots of water)
    if (Math.abs(rx) <= 1 && Math.abs(ry) <= 1) return (rx === 0 && ry === 0) ? 'cluster' : 'sea';
    const L = this.landiness(rx, ry);
    if (L < CLUSTER_LANDINESS) return 'sea';
    // a cluster sits ONLY at a strict local landiness peak → clusters never touch
    // (every neighbour, diagonals included, is lower) and are ringed by open water
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
      if ((dx || dy) && this.landiness(rx + dx, ry + dy) >= L) return 'sea';
    }
    return 'cluster';
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
    // a point anywhere inside the region (lone ocean islands); vs. one near the
    // region CENTRE (groupings/mainlands → neighbours on the grid stay apart)
    const interior = () => ({ x: ox + REGION_MARGIN + r()*(REGION_SIZE - 2*REGION_MARGIN),
                              y: oy + REGION_MARGIN + r()*(REGION_SIZE - 2*REGION_MARGIN) });
    const centre = () => ({ x: ox + REGION_SIZE/2 + (r()-0.5)*2*CLUSTER_JITTER,
                            y: oy + REGION_SIZE/2 + (r()-0.5)*2*CLUSTER_JITTER });
    const biome = this.biomeOf(rx, ry);

    if (biome === 'cluster'){
      const starter = (rx === 0 && ry === 0);
      const c = starter ? { x: STARTER_ANCHOR_X, y: STARTER_ANCHOR_Y } : centre();
      this._megaCluster(r, c.x, c.y, lands, reefs, shallows, starter);

    } else {                                                            // open sea — empty, save the odd lone cluster
      if (r() < OCEAN_LONE_CLUSTER_CHANCE){
        const p = interior();
        this._cluster(r, p.x, p.y, lands, reefs, shallows, 'mini');     // a small drifting cluster (no mainland)
      }
    }

    // keep a genuinely-open circle of water at the spawn origin: drop any feature
    // whose nearest LOBE EDGE (not just its centre) reaches inside START_CLEAR_RADIUS
    const clear = f => {
      const parts = f.ells || f.rocks;
      if (!parts) return Math.hypot(f.cx, f.cy) > START_CLEAR_RADIUS;   // shallow disc → centre test
      for (const e of parts){ if (Math.hypot(e.cx, e.cy) - Math.max(e.rx, e.ry) < START_CLEAR_RADIUS) return false; }
      return true;
    };
    return { lands: lands.filter(clear), reefs: reefs.filter(clear), shallows: shallows.filter(clear) };
  },

  // ── tier + shape selection ──

  // weighted size-tier pick. weights: { tiny, small, medium, large }
  _pickTier(r, w){
    const total = w.tiny + w.small + w.medium + w.large;
    let t = r()*total;
    if ((t -= w.tiny)   < 0) return TIER_TINY;
    if ((t -= w.small)  < 0) return TIER_SMALL;
    if ((t -= w.medium) < 0) return TIER_MEDIUM;
    return TIER_LARGE;
  },

  // bigger tiers unlock more exotic outlines; tiny stays a simple blob
  _pickShape(r, tier){
    if (tier === TIER_TINY) return 'blob';
    const t = r();
    if (tier === TIER_SMALL)  return t < 0.70 ? 'blob' : t < 0.86 ? 'stripe' : 'peninsula';
    if (tier === TIER_MEDIUM) return t < 0.34 ? 'blob' : t < 0.58 ? 'stripe' : t < 0.74 ? 'crescent' : t < 0.90 ? 'peninsula' : 'ring';
    return                          t < 0.28 ? 'blob' : t < 0.56 ? 'stripe' : t < 0.78 ? 'crescent' : t < 0.90 ? 'peninsula' : 'ring';   // TIER_LARGE
  },

  // ── feature builders ──

  // An island of a given size tier and shape archetype, built to fit inside the
  // tier's footprint radius R. Returns {cx, cy, ells, bw, big, shape, rad} where
  // `rad` is the measured footprint radius used for edge-to-edge spacing.
  _island(r, cx, cy, tier, forceShape){
    const R = tier[0] + r()*(tier[1] - tier[0]);
    const shape = forceShape || this._pickShape(r, tier);
    const ells = this._shapeElls(r, cx, cy, R, shape);
    let rad = 0;
    for (const e of ells){ const d = Math.hypot(e.cx - cx, e.cy - cy) + Math.max(e.rx, e.ry); if (d > rad) rad = d; }
    if (rad > R){                                          // scale exotic/elongated shapes down to fit the tier footprint
      const s = R/rad;
      for (const e of ells){ e.cx = cx + (e.cx - cx)*s; e.cy = cy + (e.cy - cy)*s; e.rx *= s; e.ry *= s; }
      rad = R;
    }
    const big = (tier === TIER_MEDIUM || tier === TIER_LARGE);
    return { cx, cy, ells, bw: BAND_MIN + r()*(BAND_MAX - BAND_MIN), big, shape, rad };
  },

  // build + place an island only if it clears every already-placed feature
  // edge-to-edge (centre distance > rad₁ + rad₂ + gap). Returns the island or null.
  _place(r, x, y, tier, force, gap, placed, lands){
    const isl = this._island(r, x, y, tier, force);
    if (placed.some(p => Math.hypot(p.x - x, p.y - y) < p.rad + isl.rad + gap)) return null;
    lands.push(isl); placed.push({ x, y, rad: isl.rad }); return isl;
  },

  // overlapping near-circular lobes marched along a (possibly curved) segment of
  // total length `len`, lobe radius ~`half` — shared by stripes and peninsula
  // arms. Lobes overlap (spacing < radius) so land is continuous; ends taper.
  _seg(r, cx, cy, ang, len, half, curve, ells){
    const ux = Math.cos(ang), uy = Math.sin(ang), px = -uy, py = ux;
    const spacing = Math.max(8, half*1.05);
    const n = Math.max(3, Math.round(len/spacing));
    for (let i = 0; i <= n; i++){
      const t = i/n - 0.5, along = t*len;
      const bend = curve*(1 - (2*t)*(2*t));                            // max bend mid-span
      const wob = (r()-0.5)*half*0.3;
      const taper = 0.6 + 0.4*Math.sqrt(Math.max(0.16, 1 - (2*t)*(2*t)));
      const rr = half*taper*(0.85 + r()*0.3);
      ells.push({ cx:cx + ux*along + px*(bend + wob), cy:cy + uy*along + py*(bend + wob), rx:rr, ry:rr });
    }
  },

  // build the lobe list for a shape, kept within footprint radius R
  _shapeElls(r, cx, cy, R, shape){
    const ells = [];
    if (shape === 'stripe'){                                           // long thin ribbon (fits: half-length ≈ R)
      const ang = r()*TAU, len = R*(1.7 + r()*0.3), half = R*(0.18 + r()*0.14);
      this._seg(r, cx, cy, ang, len, half, (r()-0.5)*2 * R*0.4, ells);

    } else if (shape === 'crescent'){                                  // lobes along an arc
      const a0 = r()*TAU, span = (110 + r()*100)*RAD, rad = R*(0.66 + r()*0.16), half = R*(0.18 + r()*0.12);
      const spacing = Math.max(8, half*1.05), n = Math.max(4, Math.round(rad*span/spacing));
      for (let i = 0; i <= n; i++){
        const u = i/n - 0.5, a = a0 + span*u, wob = (r()-0.5)*half*0.3;
        const taper = 0.6 + 0.4*Math.sqrt(Math.max(0.16, 1 - (2*u)*(2*u)));
        const rr = half*taper*(0.85 + r()*0.3);
        ells.push({ cx:cx + Math.cos(a)*(rad + wob), cy:cy + Math.sin(a)*(rad + wob), rx:rr, ry:rr });
      }

    } else if (shape === 'ring'){                                      // atoll: lobes around a ring, water lagoon inside
      const rad = R*(0.6 + r()*0.14), half = R*(0.22 + r()*0.1);
      const n = Math.max(7, Math.round(TAU*rad/(half*1.1))), a0 = r()*TAU;
      for (let i = 0; i < n; i++){
        const a = a0 + TAU*i/n, jit = (r()-0.5)*half*0.5, rr = half*(0.8 + r()*0.4);
        ells.push({ cx:cx + Math.cos(a)*(rad + jit), cy:cy + Math.sin(a)*(rad + jit), rx:rr, ry:rr });
      }

    } else if (shape === 'peninsula'){                                 // a body with a tapering arm
      ells.push({ cx, cy, rx:R*(0.42 + r()*0.14), ry:R*(0.4 + r()*0.16) });
      const lobes = 2 + Math.floor(r()*2);
      for (let i = 0; i < lobes; i++){
        const a = r()*TAU, off = R*(0.2 + r()*0.22), lr = R*(0.26 + r()*0.18);
        ells.push({ cx:cx + Math.cos(a)*off, cy:cy + Math.sin(a)*off, rx:lr, ry:lr });
      }
      const armAng = r()*TAU, armLen = R*(0.85 + r()*0.4), armHalf = R*(0.2 + r()*0.1);
      const bx = cx + Math.cos(armAng)*armLen*0.5, by = cy + Math.sin(armAng)*armLen*0.5;
      this._seg(r, bx, by, armAng, armLen, armHalf, (r()-0.5)*R*0.3, ells);

    } else {                                                           // 'blob' — lumpy central lobe + scattered lobes
      ells.push({ cx, cy, rx:R*(0.52 + r()*0.16), ry:R*(0.48 + r()*0.18) });
      const n = 2 + Math.floor(r()*4);                                 // 2–5 extra lobes
      for (let i = 0; i < n; i++){
        const a = r()*TAU, off = R*(0.2 + r()*0.35), lr = R*(0.25 + r()*0.22);
        ells.push({ cx:cx + Math.cos(a)*off, cy:cy + Math.sin(a)*off, rx:lr*(0.9 + r()*0.3), ry:lr*(0.9 + r()*0.3) });
      }
    }
    return ells;
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
  // for the longer ones (Japan/banana). Ringed by smaller islands + a couple reefs.
  _mainland(r, ax, ay, lenMin, lenMax, widMin, widMax, lands, reefs, shallows){
    const length = lenMin + r()*(lenMax - lenMin);
    const width  = Math.min(widMin + r()*(widMax - widMin), length*0.85);
    const theta = r()*TAU, major = length/2, minor = width/2;
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
    const body = { cx:ax, cy:ay, ells, mainland:true, big:true, bw: BAND_MIN + r()*(BAND_MAX - BAND_MIN) };
    let bodyRad = 0;                                       // footprint radius (for spacing sub-clusters off the coast)
    for (const e of ells){ const d = Math.hypot(e.cx - ax, e.cy - ay) + Math.max(e.rx, e.ry); if (d > bodyRad) bodyRad = d; }
    body.rad = bodyRad;
    lands.push(body);
    // ring the coast with islands, edge-spaced off the body lobes and each other
    const placed = [], ringGap = 120;
    for (let i = 0; i < ells.length; i += 2) placed.push({ x:ells[i].cx, y:ells[i].cy, rad:ells[i].rx });
    const medN = 1 + Math.floor(r()*2);                    // 1–2 medium islands offshore (claim space first)
    for (let i = 0; i < medN; i++){ const a = r()*TAU, rad = major + 250 + r()*400; this._place(r, ax+Math.cos(a)*rad, ay+Math.sin(a)*rad, TIER_MEDIUM, null, ringGap, placed, lands); }
    const fringeN = 3 + Math.floor(r()*4);                 // small islands ring the mainland coast
    for (let i = 0; i < fringeN; i++){ const a = r()*TAU, rad = major + 150 + r()*350; this._place(r, ax+Math.cos(a)*rad, ay+Math.sin(a)*rad, TIER_SMALL, null, ringGap, placed, lands); }
    const outN = 2 + Math.floor(r()*3);                    // outcrop garnish
    for (let i = 0; i < outN; i++){ const a = r()*TAU, rad = major + 110 + r()*430; this._place(r, ax+Math.cos(a)*rad, ay+Math.sin(a)*rad, TIER_TINY, null, ringGap, placed, lands); }
    const reefN = 1 + (r() < 0.5 ? 1 : 0);                 // 1–2 coastal reefs, parallel to shore
    for (let i = 0; i < reefN; i++){ const a = r()*TAU, rad = major + 70 + r()*200; reefs.push(this._reef(r, ax+Math.cos(a)*rad, ay+Math.sin(a)*rad, a + Math.PI/2)); }
    return body;
  },

  // a MEGA-CLUSTER ("cluster of clusters"): a MAINLAND heart, a ring of sub-
  // clusters just off its coast, and a few lone islands. Every cluster has >=1
  // mainland; the footprint stays bounded so it reads as one archipelago.
  _megaCluster(r, ax, ay, lands, reefs, shallows, starter){
    // 1) the mainland heart (always present → every cluster has a mainland)
    const lenMin = starter ? STARTER_LEN_MIN   : CLUSTER_MAINLAND_LEN_MIN;
    const lenMax = starter ? STARTER_LEN_MAX   : CLUSTER_MAINLAND_LEN_MAX;
    const widMin = starter ? STARTER_WIDTH_MIN : CLUSTER_MAINLAND_WIDTH_MIN;
    const widMax = starter ? STARTER_WIDTH_MAX : CLUSTER_MAINLAND_WIDTH_MAX;
    const heart = this._mainland(r, ax, ay, lenMin, lenMax, widMin, widMax, lands, reefs, shallows);
    const heartRad = (heart && heart.rad) || 1200;

    // 2) sometimes a 2nd, smaller mainland off the heart's coast (mainlands plural)
    if (!starter && r() < CLUSTER_SECOND_MAINLAND_CHANCE){
      const a = r()*TAU, off = heartRad + 500 + r()*500;
      this._mainland(r, ax + Math.cos(a)*off, ay + Math.sin(a)*off,
                     STARTER_LEN_MIN, STARTER_LEN_MAX, STARTER_WIDTH_MIN, STARTER_WIDTH_MAX, lands, reefs, shallows);
    }

    // 3) a ring of sub-clusters just beyond the heart — the "clusters" of the cluster
    const subs = MEGA_SUBCLUSTERS_MIN + Math.floor(r()*(MEGA_SUBCLUSTERS_MAX - MEGA_SUBCLUSTERS_MIN + 1));
    for (let i = 0; i < subs; i++){
      const a = r()*TAU, ring = heartRad + MEGA_SUB_RING_MIN + r()*(MEGA_SUB_RING_MAX - MEGA_SUB_RING_MIN);
      const kind = r() < MEGA_SUB_SPARSE_CHANCE ? 'sparse' : 'mini';
      this._cluster(r, ax + Math.cos(a)*ring, ay + Math.sin(a)*ring, lands, reefs, shallows, kind);
    }

    // 4) a few lone islands sprinkled through the cluster (edge-spaced off everything)
    const placed = [];
    for (const L of lands){
      if (L.rad != null) placed.push({ x:L.cx, y:L.cy, rad:L.rad });
      else if (L.ells) for (const e of L.ells) placed.push({ x:e.cx, y:e.cy, rad:Math.max(e.rx, e.ry) });
    }
    const loneN = MEGA_LONE_MIN + Math.floor(r()*(MEGA_LONE_MAX - MEGA_LONE_MIN + 1));
    for (let i = 0; i < loneN; i++){
      const a = r()*TAU, ring = heartRad*0.45 + r()*(heartRad*0.55 + MEGA_SUB_RING_MAX);   // fill within the cluster, not beyond it
      this._place(r, ax + Math.cos(a)*ring, ay + Math.sin(a)*ring, this._pickTier(r, { tiny:1, small:3, medium:2, large:0.4 }), null, MEGA_LONE_GAP, placed, lands);
    }
  },

  // island grouping used as a SUB-CLUSTER (and for lone sea clusters). Kinds:
  //   'mini'   — a small tight group (the building block of a mega-cluster)
  //   'sparse' — a looser, slightly bigger scatter
  //   'dense'  — a big maze (kept for variety; not used by the sea/cluster dispatch)
  // Islands edge-space off their measured `rad` AND off everything already in the
  // region (seeded into placed[]), so a sub-cluster never overlaps the mainland or
  // its neighbours. Only the NEWLY-added islands count toward the target.
  _cluster(r, cx, cy, lands, reefs, shallows, kind){
    const cfg = (kind === 'dense')
        ? { rMin:DENSE_RADIUS_MIN,  rMax:DENSE_RADIUS_MAX,  cMin:DENSE_COUNT_MIN,  cMax:DENSE_COUNT_MAX,  gap:DENSE_GAP,  anchor:1.0, scatter:{ tiny:1.2, small:5, medium:1,   large:0 }, reef:[0.6, 0.4] }
      : (kind === 'mini')
        ? { rMin:MINI_RADIUS_MIN,   rMax:MINI_RADIUS_MAX,   cMin:MINI_COUNT_MIN,   cMax:MINI_COUNT_MAX,   gap:MINI_GAP,   anchor:0.4, scatter:{ tiny:2,   small:6, medium:0.6, large:0 }, reef:[0.2, 0] }
        : { rMin:SPARSE_RADIUS_MIN, rMax:SPARSE_RADIUS_MAX, cMin:SPARSE_COUNT_MIN, cMax:SPARSE_COUNT_MAX, gap:SPARSE_GAP, anchor:0.5, scatter:{ tiny:1,   small:4, medium:1.6, large:0 }, reef:[0.3, 0] };
    const R = cfg.rMin + r()*(cfg.rMax - cfg.rMin);
    const count = cfg.cMin + Math.floor(r()*(cfg.cMax - cfg.cMin + 1));
    const gap = cfg.gap;
    const placed = [];   // seeded from everything already in the region so we never overlap it
    for (const L of lands){
      if (L.rad != null) placed.push({ x:L.cx, y:L.cy, rad:L.rad });
      else if (L.ells) for (const e of L.ells) placed.push({ x:e.cx, y:e.cy, rad:Math.max(e.rx, e.ry) });
    }

    let added = 0;                                          // count only the islands THIS call adds
    if (r() < cfg.anchor){
      const tier = (kind === 'mini') ? (r() < 0.7 ? TIER_SMALL : TIER_MEDIUM) : (r() < 0.7 ? TIER_MEDIUM : TIER_LARGE);
      if (this._place(r, cx, cy, tier, null, gap, placed, lands)) added++;
    }
    let guard = count*30;
    while (added < count && guard-- > 0){
      const a = r()*TAU, rad = Math.sqrt(r())*R;            // sqrt → even coverage over the disc
      const x = cx + Math.cos(a)*rad, y = cy + Math.sin(a)*rad;
      if (this._place(r, x, y, this._pickTier(r, cfg.scatter), null, gap, placed, lands)){
        added++;
        if (added % 4 === 0) shallows.push({ cx:x, cy:y, rx:480, ry:480 });
      }
    }

    const reefN = (r() < cfg.reef[0] ? 1 : 0) + (r() < cfg.reef[1] ? 1 : 0);
    for (let i = 0; i < reefN && placed.length; i++){ const s = placed[Math.floor(r()*placed.length)]; reefs.push(this._reef(r, s.x + s.rad + 120, s.y, r()*TAU)); }
  },

  // chunk = features (from every region within MAX_FEATURE_REACH) whose CENTRE
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
