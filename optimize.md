# SinkOrSail — Performance Optimization Audit

**Audited at:** `main` @ `5007c26` (2026-07-02), branch `optimize-game`
**Method:** full code read of every per-frame path + an instrumented headless-Chromium run
(counters monkey-patched into `Collision.checkIsland`, `Math.hypot`, `WorldGen.generateChunk`,
plus a one-variable A/B on the suspected hotspots). Headless uses a **software GL renderer**,
so absolute FPS numbers are pessimistic — treat the *ratios* and the *per-frame call counts*
as the real findings; the counts are renderer-independent CPU work.

**Measured baseline (fresh new game, 15 ships, ~4s in):**

| Metric | Value |
|---|---|
| Ports created at boot | **924** |
| Chunks loaded / Graphics objects in GameScene | 25 / **279** |
| Total Graphics commands re-processed per frame | **180,522** |
| …of which the port-marker layer (`_portGfx`) | **151,974 (84%)** |
| `Math.hypot` calls per frame (15 ships!) | **~33,800** |
| `Collision.checkIsland` calls / ellipse tests per frame | 78 / ~5,000 |
| `WorldGen.generateChunk` calls per frame **while map open** | ~6 |
| A/B: baseline → port gfx cleared → + off-camera chunk cull | **4.4 → 19.9 → 20.7 FPS (~4.5×)** |

---

## P0 — Fix first: the game currently crashes on `main` (blocks everything, including profiling)

Not a perf item, but it gates all of them: **every new game dies within moments of starting.**

- `LeviathanSystem.js` (~line 20–33) hand-builds its ship literal **without `waypoint`** and
  pushes it into `scene.ships` as faction `'pirate'`.
- The Leviathan spawns in the empty 6–9k ring → no player/merchant in detect range → its first
  AI tick goes to `AI.cruise` → `AI.js:67` `dist(s, s.waypoint)` → **TypeError → the whole
  Phaser game loop dies** (frozen screen).
- Same class of bug: `SaveSystem.js:179` rebuilds bounty-target ships — also without `waypoint`.

**Fix (either/both):** guard `AI.cruise` like `patrolHome` already does
(`if (!s.waypoint || dist(...) < 100)`), and/or add `waypoint` to every hand-rolled ship literal.
One line; do it before any perf work so changes can actually be play-tested.

---

## The Big Issues (ranked by measured impact)

### B1 · All 924 ports are drawn, world-wide, into one Graphics that Phaser re-tessellates every frame
**Where:** `Island.drawPortMarkers` (`js/world/Island.js:81`) → `scene._portGfx`
**Evidence:** `_portGfx.commandBuffer.length = 151,974` — **84% of all Graphics commands in the
scene**. Phaser 3 Graphics have no geometry cache and no camera culling: the entire command
buffer is re-processed every single frame, even though ~920 of those ports are thousands of px
off-screen. The A/B run: clearing this one layer took the scene from **4.4 → 19.9 FPS**.
Each port draws a `DOCK_RADIUS` ring, marker dot + ring, pier plank, pilings, and a pad per berth.

**Fix:** draw only ports within a radius of the player (e.g. `POP_SPAWN_RADIUS` or
2× minimap range — that's ~3–8 ports instead of 924), and re-draw on a movement threshold
(the `_revealFog` half-cell throttle pattern already in `GameScene` is the exact idiom).
The existing dock/undock/sunk event redraws stay, they just become cheap automatically.
**Effort:** small (one filter + one throttle). **Win:** the single largest in the codebase, ~4×+ here.

### B2 · Six separate systems loop over all 924 ports every frame
**Where (all per frame):**
- `GameScene.update` dock-proximity scan — 924 `Math.hypot`
- `DefenseSystem.update` — two full port loops (tower placement check + tower fire), `js/systems/DefenseSystem.js:38,45`
- `PortCaptureSystem.update` — full port loop (regen), `js/systems/PortCaptureSystem.js:67`
- `drawMiniMap` — 924 `within()` hypots, `js/ui/MiniMap.js:24`
- `Combat.updateCannonballs` — **per player cannonball** × 924 ports, `js/systems/Combat.js:99`
- `AI.pickPort` — full port loop per merchant re-route, `js/systems/AI.js:21`

**Evidence:** ~33,800 `Math.hypot`/frame with only 15 ships — the overwhelming majority of it
is "distance to every port in the world," several times over, 60×/second.

**Fix:** one shared `scene.nearbyPorts` list (ports within ~`POP_SPAWN_RADIUS`), rebuilt only
when the player moves ~half a chunk (same throttle as B1 — build both from one pass).
Every call site above swaps `scene.navyPorts` → `scene.nearbyPorts`, except world-scope logic
(`PortCaptureSystem` regen can tick on the nearby set only — off-screen ports regenerating
lazily on first approach is invisible to the player; or keep a 1 Hz world pass).
**Effort:** small-medium. **Win:** kills ~90% of the hypot volume; frees main-thread per frame.

### B3 · The world map re-renders *everything* every frame while open
**Where:** `GameScene.updateMap` ends with an unconditional `this.mapDirty = true;`
(`js/scenes/GameScene.js`), so `UIScene` calls `drawWorldMap` **every frame** the chart is up —
full clear + fog-cell loop over the whole `explored` set + `WorldGen.generateChunk` per touched
chunk + all ports + terrain, into three Graphics.
**Evidence:** ~6 `generateChunk` calls/frame with the map open at 44 explored cells (grows with
exploration); map-open FPS measured at 5 in the harness.
**Fix (two lines + one cache):**
1. Set `mapDirty` only when something actually changed: center moved > ~2px, scale changed,
   or `explored.size` grew (fog reveal already tracks this).
2. Cache `generateChunk(cx,cy)` results in a small Map (the region layer is already memoised;
   the chunk layer re-filters and re-allocates on every call — a ~50-entry LRU ends it).
**Effort:** small. **Win:** map goes from "renders like a particle system" to near-free.

### B4 · 275+ terrain Graphics alive, none camera-culled
**Where:** `Island.bakeChunk` returns **11 Graphics per chunk**; 25 loaded (up to 49 with
hysteresis) → 279 Graphics measured, ~28,500 terrain commands re-tessellated per frame.
Phaser does not cull Graphics against the camera — chunks 3,000px off-screen cost full price.
**Fix:** on player movement (reuse the same B1/B2 throttle) set `g.setVisible(vis)` per chunk
from an AABB test against `camera.worldView` (the A/B patch was ~8 lines). Optionally also
merge the 11 layers into 3–4 Graphics per chunk (fewer objects, same visuals) — the
depth-banding only needs shallow < land-bands < rocks.
**Effort:** trivial for the cull; small for the merge. **Win:** ~85% of terrain command
processing; bigger on WebGL where every Graphics re-tessellates on CPU.

### B5 · Minimap fully redraws every frame
**Where:** `drawMiniMap` (`js/ui/MiniMap.js`) — clear + all islands×ellipses + **all 924 ports**
+ all ships + bounties + weather, every frame, into a masked Graphics.
**Fix:** redraw at 8–10 Hz (a radar sweep cadence is thematically *better* than 60 Hz), and use
`scene.nearbyPorts` from B2. Skip entirely when paused/docked/map-open (it's hidden then anyway
on some paths). **Effort:** trivial. **Win:** ~1,000 hypots + a full Graphics rebuild → 6×/s
instead of 60×/s.

---

## Medium Issues

### M1 · `Math.hypot` in every hot loop — and most call sites only *compare*
`dist()` (`js/utils/MathUtils.js:7`) is `Math.hypot`, which is dramatically slower than
`Math.sqrt(dx*dx+dy*dy)` in V8 (it handles overflow/precision cases the game never hits).
Worse, most call sites compare against a constant — no root needed at all.
**Fix:** add `dist2(a,b)` and compare squared distances in: AI target scans, collision pair
gate, cannonball hit tests, loot pickup, port scans, minimap `within`. Keep `Math.hypot` only
where the actual distance is displayed/used. **Mechanical sweep, big aggregate win.**

### M2 · `Collision.checkIsland` has no bounding pre-test
(`js/systems/CollisionSystem.js:8`) Every call runs full normalized-ellipse math on **every
ellipse of every active island** (64 ellipses now; scales with terrain density). Measured 78
calls/frame at 15 idle-ish ships → ~5,000 ellipse tests; steering fan-outs (`avoidLand` probes
up to ~34 checks when blocked), cannonballs, LOS sampling, and spawn placement all funnel here.
Islands already carry a measured footprint radius (`rad`).
**Fix:** early-out per island: `if ((x-is.cx)² + (y-is.cy)² > (is.rad + radius + maxEllipse)²) continue;`
— one line, cuts the inner loop for every far island. Optional second step: chunk-local island
lookup via `scene._chunks` instead of the flat union array.

### M3 · AI re-scans the whole fleet every frame, per ship
`AI.nearestPirate` / `nearestMerchant` / the privateer double-distance scan
(`js/systems/AI.js:6,13,171`) run **per ship per frame** → O(n²): at the 50-ship cap that's
2,500+ scans/frame before combat even starts.
**Fix:** stagger target *acquisition* round-robin (each ship re-scans every ~0.25–0.5s, offset
by index) and keep the current target until dead/out-of-range. Movement stays per-frame; only
the scan is throttled. Standard pattern, invisible to gameplay.

### M4 · Navy line-of-sight checks per frame while flying pirate colors
`Visibility.canSee` samples `checkIsland` every 40px of the sight line
(`js/world/Visibility.js`) — per navy ship, per frame, when `flag === 'pirate'` (and again for
the forgiveness check). ~11–15 ellipse-scan calls each. The file's own comment says to
throttle it if the roster grows. **Fix:** cache per-ship (`s._losAt`), re-check every ~0.3s.

### M5 · Ship-collision resolution is O(n²) with `hypot` per pair
`Collision.resolveShipCollisions` — 1,275 pairs at the 50-ship cap, plus rebuilding the `all`
array every frame. Fine today; switch the gate to squared distance (M1) and reuse a scratch
array. If ship counts ever rise, a coarse spatial hash slots in here.

### M6 · World-map fog loop scales with *total lifetime exploration*
`drawWorldMap` iterates **every explored fog cell** (string-keyed Set) to cull to the view.
A long session accumulates thousands of cells; with B3 unfixed this runs per frame.
**Fix:** after B3 it only runs on pan/zoom/reveal — acceptable. For long-run safety, bucket
explored cells per chunk (`Map<chunkKey, Set<cellKey>>`) and iterate only chunks near the view.

### M7 · Per-frame allocation churn (GC hitches)
- `GameScene.draw()` re-creates the `drawWake` + `half` closures every frame.
- `WeatherSystem._allShips` builds a fresh array per call (called in update paths).
- `resolveShipCollisions` rebuilds `all`; HUD/dock-menu/fleet-screen build big strings per frame while visible.
**Fix:** hoist closures to methods, reuse scratch arrays, and only rebuild UI strings when the
underlying numbers change. Individually small; collectively they smooth out GC pauses on mobile.

### M8 · HUD text: 26 `setText` sites, several changing every frame
Phaser re-renders a Text object's canvas + re-uploads the texture on every *changed* string
(unchanged strings early-out). Speed/coords/hull readouts change nearly every frame.
**Fix:** quantize (e.g. speed to 1 decimal — it's flavor, not physics) and/or refresh the
fast-changing labels at 10 Hz. Zero visual difference, cuts steady texture churn.

### M9 · Wakes are pushed for ships that never draw them
`RunnerSystem._sail` and `HireSystem._move` call `scene.pushWake(...)`, but `GameScene.draw`
only renders wakes for the player + `scene.ships`. Runners/escorts pay the per-move cost
(distance check + array ops) for invisible wakes. **Fix:** either draw them (free flavor) or
skip the push for those factions. Also: wake ripples draw for all ships regardless of camera —
gate `drawWake`/`drawShip` per ship with a cheap view-rect test (pairs with B4's culture).

### M10 · 924 ports exist at boot at all
`placeStartPorts` scans every region out to `WORLD_CAP` and instantiates 924 `Port` objects
(with economy state) up front. One-time cost + permanent memory + it's what makes every
"all ports" loop expensive. B1/B2 neutralize the per-frame cost; the deeper fix — lazy,
per-region port instantiation when a region first streams near — is a larger refactor that
also speeds up boot. Worth doing only after B1/B2 land and if boot time matters.

### M11 · `drawPortMarkers` full-world redraw on every dock/undock/sink event
Three event subscriptions in `GameScene.create` each trigger a complete 924-port redraw
(150k commands rebuilt) — AI merchants docking somewhere across the map included.
**Fix:** falls out of B1 automatically (redraw = nearby ports only). Until then it's spiky.

---

## Small Wins / Notes

- **S1:** `Steering.avoidLand`'s fan-out probes benefit directly from M2's bounding test —
  no separate change needed; noted so it isn't double-fixed.
- **S2:** `Combat.updateCannonballs` uses `splice` mid-iteration (O(n) each) — swap-pop is
  fine since order doesn't matter. Same in `updateLoot`. Micro.
- **S3:** Weather rain/storm draws 40–80 random streaks per frame — cheap, but they also run
  the `Math.random` + line calls when the player is *inside* menus. Gate on `!menuOpen` if
  profiling ever flags it. Micro.
- **S4:** `WindSystem` is a pure function of time — already optimal. No change.
- **S5:** `Population` runs at 1 Hz with a hard 50-ship cap — already well-designed.
  Its spawn retry loop calls `checkIsland` up to 24× but only once per second.
- **S6:** Consider `roundPixels: true` in the Phaser config — cheaper sub-pixel work on some
  GPUs; verify it doesn't shimmer the wake art. Optional/cosmetic.
- **S7:** `index.html` loads ~40 scripts sequentially without `defer` — load-time only, not
  frame-time. Lowest priority.
- **S8:** For a future deep pass: baking chunk terrain to textures (`generateTexture` /
  RenderTexture at half resolution) would eliminate terrain tessellation entirely, at a memory
  cost (~1MB per chunk at 0.5×). Only worth it if B4's cull isn't enough on target phones.

---

## Suggested order of attack

1. **P0 crash guard** (`AI.cruise` + Leviathan/save literals) — unblocks testing everything else.
2. **B1 + B2 together** — one shared "nearby ports" pass feeds both the draw cull and the
   per-frame loops. This is the 4× headline.
3. **B3 map dirty-flag + chunk cache** — two lines + a Map; fixes the worst mode (map open).
4. **B4 chunk visibility cull** (~10 lines) and **B5 minimap throttle** (~3 lines).
5. **M1 `dist2` sweep + M2 island bounding test** — mechanical, broad.
6. **M3/M4 AI + LOS staggering** — before any content raises the ship cap.
7. Remainder (M6–M11, S-items) opportunistically as their files get touched.

## Reproducing the measurements

Serve `Game/` statically, open with headless Chromium (or any browser), start a new
game, then in the console:
```js
// per-frame Graphics command load
let t=0; for (const o of game.scene.getScene('GameScene').children.list)
  if (o.type==='Graphics') t += o.commandBuffer.length; t;               // ~180k
game.scene.getScene('GameScene')._portGfx.commandBuffer.length;          // ~152k
// the A/B: clear port gfx, watch FPS
const gs = game.scene.getScene('GameScene');
Island.drawPortMarkers = () => {}; gs._portGfx.clear();
```
(Note: on current `main` you must first patch the P0 crash or the loop dies before you can measure.)
