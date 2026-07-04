// ── world/ChunkManager.js ──
// Streams terrain chunks around the player. Loads a (2·LOAD_RADIUS+1)² window,
// unloads beyond UNLOAD_RADIUS (hysteresis so boundary crossings don't thrash),
// and keeps `scene.islands` synced to the union of loaded chunks' islands — the
// "active set". Because Collision / Visibility / Steering already iterate
// `scene.islands`, they keep working unchanged but now only ever test nearby
// terrain. Each chunk bakes its islands into its own Graphics, destroyed on
// unload. Loaded chunks live in `scene._chunks` (Map keyed "cx,cy").
const Chunks = {
  keyOf(cx, cy){ return cx + ',' + cy; },
  chunkOf(x, y){ return [Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE)]; },

  init(scene){
    scene._chunks = new Map();
    this.update(scene, true);                 // load the initial window synchronously
  },

  update(scene, force){
    const loaded = scene._chunks;
    const [pcx, pcy] = this.chunkOf(scene.player.x, scene.player.y);
    let changed = false;

    // unload chunks beyond the hysteresis radius (gfx is an array of layer graphics)
    for (const [key, ch] of loaded){
      if (Math.abs(ch.cx - pcx) > UNLOAD_RADIUS || Math.abs(ch.cy - pcy) > UNLOAD_RADIUS){
        if (ch.gfx) for (const g of ch.gfx) g.destroy();
        loaded.delete(key); changed = true;
      }
    }

    // gather missing chunks in the window, nearest ring first
    const missing = [];
    for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++){
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++){
        const cx = pcx + dx, cy = pcy + dy;
        if (!loaded.has(this.keyOf(cx, cy))) missing.push({ cx, cy, ring: Math.max(Math.abs(dx), Math.abs(dy)) });
      }
    }
    missing.sort((a, b) => a.ring - b.ring);

    // The player's own chunk + immediate neighbours (ring ≤ 1) always load this
    // frame, so the player is never surrounded by ungenerated terrain — even
    // right after an R-reset teleport. The outer ring streams in at a budget.
    let budget = force ? Infinity : 3;
    for (const m of missing){
      if (m.ring > 1 && budget <= 0) continue;
      const data = WorldGen.generateChunk(m.cx, m.cy);
      loaded.set(this.keyOf(m.cx, m.cy), { cx:m.cx, cy:m.cy, lands:data.lands, reefs:data.reefs, shallows:data.shallows, gfx: Island.bakeChunk(scene, data) });
      changed = true;
      if (m.ring > 1) budget--;
    }
    if (changed) this.syncActive(scene);
  },

  // sync the active sets to the union of loaded chunks: scene.islands (land,
  // for movement/LOS/steering collision) and scene.reefs (hazard rocks)
  syncActive(scene){
    const lands = [], reefs = [];
    for (const ch of scene._chunks.values()){
      for (const f of ch.lands) lands.push(f);
      for (const f of ch.reefs) reefs.push(f);
    }
    scene.islands = lands; scene.reefs = reefs;
  },

  // OPT-B4: hide the terrain Graphics of chunks outside the camera view. Phaser
  // does NOT cull Graphics — every loaded chunk's 11 layers re-tessellate each
  // frame even when 3000px off-screen. The AABB test is trivially cheap (~25-49
  // chunks); the saving is skipping the tessellation of the hidden ones. Runs
  // every frame so it tracks zoom (combat) as well as panning; setVisible only
  // fires on an actual change. CHUNK_CULL_MARGIN keeps islands whose body
  // overhangs their chunk from popping at the view edge.
  cull(scene){
    const cam = scene.cameras && scene.cameras.main; if (!cam) return;
    const wv = cam.worldView, m = CHUNK_CULL_MARGIN;
    const l = wv.x - m, r = wv.right + m, t = wv.y - m, b = wv.bottom + m;
    for (const ch of scene._chunks.values()){
      const x0 = ch.cx*CHUNK_SIZE, y0 = ch.cy*CHUNK_SIZE;
      const vis = x0 < r && x0 + CHUNK_SIZE > l && y0 < b && y0 + CHUNK_SIZE > t;
      if (ch._vis === vis) continue;                 // no redundant setVisible churn
      ch._vis = vis;
      if (ch.gfx) for (const g of ch.gfx) g.setVisible(vis);
    }
  },
};
