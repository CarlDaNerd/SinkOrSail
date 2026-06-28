# Pirate — Combat + Factions V1 (modular)

A top-down Age of Sail sandbox in Phaser 3. This is the modular port of the
single-file prototype (`../pirate-combat-v1.html`), restructured per §3 of the
handoff doc (`../pirate-game-handoff-v2.md`). Behavior matches the prototype —
the prototype remains the behavioral oracle.

## Run it

No build step. Two options:

- **Double-click `index.html`** — works from `file://` (classic `<script>` tags).
  Requires internet the first time for the Phaser CDN.
- **Local server** (avoids any `file://` quirks):
  ```
  cd pirate-game
  python -m http.server 8000
  # open http://localhost:8000
  ```

Click or press ENTER on the title screen to set sail.

## Controls

| Key            | Action                              |
|----------------|-------------------------------------|
| A / D · ← / →  | Turn                                |
| W / S          | Raise / lower sails (0→1→2)          |
| Q / E          | Port / starboard broadside          |
| F              | Dock at a port (when in range)      |
| R              | Reset / revive ship                 |
| `` ` ``        | Show / hide the tuning panel        |
| (panel)        | Switch flag (neutral / pirate)      |

**Ports.** Sail within range of a port marker and press **F** to dock: repair
hull (the only way to heal above the 30% out-of-combat regen cap), restock ammo,
or depart — both cost gold. Ports are navy-controlled, so you can't dock while
WANTED or mid-combat. Docking freezes the world like a pause menu.

The right-hand panel is the **dev tuning overlay** (`js/debug/DebugOverlay.js`):
live sliders, flag buttons, infinite-ammo toggle, range-ring visualizer, and a
"copy constants" button. It is dev-only — deleting that one `<script>` tag and
the `#panel` markup ships a clean build.

## Structure

```
index.html                 — DOM + ordered <script> tags (no game logic)
js/
  constants.js             — DEFAULTS / P (live config) / DEBUG + fixed consts
  main.js                  — Phaser config + launch; exposes global `game`
  utils/      PRNG, MathUtils (pure)
  systems/    SailingPhysics, CollisionSystem, Steering, FactionSystem,
              FlagSystem, Combat, AI
  world/      WorldGen (per-chunk gen), ChunkManager (streaming),
              Island (render/bake), Port, Visibility
  entities/   Player, Enemy, Cannonball, Loot   (data factories)
  ui/         WindCompass, MiniMap, HUD
  scenes/     BootScene → MenuScene → GameScene (+ parallel UIScene)
  debug/      DebugOverlay (tuning panel — dev only)
  missions/   MissionLoader (stub; JSON missions later)
missions/                  — empty (JSON mission files later)
assets/                    — empty (procedural art for now)
```

## How it fits together

- **No bundler / no ES modules.** Plain classic scripts share one global scope;
  `index.html` loads them in dependency order. Systems are namespaced globals
  (`Combat`, `AI`, `Collision`, …) whose methods take `scene` as the first arg.
- **`GameScene`** holds all mutable run state and orchestrates the per-frame
  loop, delegating to the system modules. It exposes a thin facade
  (`navyHostile()`, `inCombat()`, `requestFlag()`, `spawnFleet()`) so the HUD
  and debug panel have a stable API.
- **`UIScene`** runs parallel to `GameScene` (last in the scene list, so it
  renders on top and updates after), reading live state each frame.
- **Frame-rate independence** is preserved: `dt` (per-frame) and `dts`
  (per-second) are derived in `GameScene.update()` and threaded through.
- **Streamed world.** The world is an effectively unlimited, chunk-streamed
  ocean. `ChunkManager` keeps a window of chunks loaded around the player (inner
  3×3 always loaded, outer ring budgeted) and syncs `scene.islands` (land) and
  `scene.reefs` to the union of loaded chunks — so collision / visibility /
  steering keep working unchanged, just on nearby terrain.
- **Biomes (region tier).** `WorldGen` decides each ~4000px region's biome from a
  smooth value-noise "landiness" field (so oceans, archipelago belts, and
  mainlands cluster instead of forming a checkerboard): **ocean** (most common),
  **archipelago** (island pockets), and **mainland** (rare — only at a local
  landiness peak, so mainlands are rarely adjacent and are ringed by islands).
  Each region's features (mainland + fringe islands + outcrops + **reefs** +
  shallow patches) are anchored inside the region; a chunk owns the features
  whose anchor falls in it (a mainland's body may overflow into neighbours).
  Everything is a pure function of `(WORLD_SEED, region)`, so it's deterministic
  and visit-order independent. A starter mainland is guaranteed near the origin.
  Reefs **damage the hull on contact** (they don't block); ports sit on a
  landmass **coast** so you can dock. Next phases: per-chunk AI spawning, then
  fog + the draggable M-map, then local A* pathfinding.
