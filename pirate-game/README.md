# Sink or Sail

A top-down Age of Sail pirate sandbox in Phaser 3 — sail an effectively
unlimited, procedurally-streamed ocean; raid merchants, dodge the navy, trade
commodities, capture ships and ports, and grow from a Dinghy to a Leviathan.
No build step; plain classic `<script>` tags sharing one global scope.

> Branch note: the most feature-complete build lives on `feature-batch-2`.
> `main` carries the core game; feature work lands on branches first.

## Run it

No build step. Two options:

- **Double-click `index.html`** — works from `file://`. Needs internet the first
  time for the Phaser CDN.
- **Local server** (avoids `file://` quirks):
  ```
  cd pirate-game
  python -m http.server 8000      # open http://localhost:8000
  ```

Click or press ENTER on the title screen to set sail.

## Controls

| Key             | Action                                                        |
|-----------------|---------------------------------------------------------------|
| A / D · ← / →   | Turn                                                          |
| W / S           | Raise / lower sails (none → main → full)                      |
| Q / E           | Port / starboard broadside (volley scales with ship tier)    |
| B               | Capture — a port if you're next to one shelled ≤20% hull, else the nearest ship ≤20% hull (tow the prize home) |
| F               | Dock at a port in range / depart                              |
| M               | Toggle the big map · drag to pan · Z / X (or wheel) to zoom   |
| Esc             | Pause menu                                                    |
| `` ` ``         | Show / hide the dev tuning panel                              |
| HUD buttons     | Switch flag (neutral / pirate)                                |

**At a dock:** `1` repair hull · `2` restock ammo · `3` sell all cargo ·
`4` buy the port's source commodity · `5` hire crew · `F` depart. Docking
auto-saves. The camera auto-zooms in during battle (no scroll zoom).

## Features

- **Sailing & combat** — wind-relative speed with an in-irons no-go zone, a
  parameterized turn curve, and port/starboard broadsides whose ball count scales
  with your ship's cannon count.
- **Factions & flags** — merchants, pirates, navy, privateers, each with their
  own AI. Fly neutral or pirate colours; crimes witnessed within navy line of
  sight raise your **wanted** level until the navy turns hostile.
- **Streamed, biome world** — an unlimited chunk-streamed ocean. Regions follow
  an ocean-heavy rarity ladder (open ocean → sparse scatter → dense grouping →
  rare mainland), with five island **size tiers** and shape archetypes
  (blob / stripe / crescent / ring / peninsula), edge-to-edge spacing (no
  overlap), and hull-damaging **reefs**. Fully deterministic from `WORLD_SEED`.
- **Ship tiers** — Dinghy → Sloop → Brigantine → Galleon → Man-o'-War →
  Leviathan. Tier sets hull, cannons, cargo storage, and crew caps. You start a
  Dinghy at half crew; enemies roll weighted tiers (higher tiers rarer).
- **Crew** — more crew = faster sailing and faster reload (bonus shrinks by
  tier, capped); understaffed ships are slower with fewer guns. Hire at ports.
- **Economy** — 6 commodities and cargo holds; typed ports (Trading Hub, Lumber
  Yard, farms, mines, …) with seeded buy/sell prices. A persistent **bank**
  (banked gold survives sinking/reset; on-ship gold doesn't) funds repairs,
  restocks, and hires.
- **Port capture** — shell a port below 20% hull and press **B** to take it.
  Owned ports let you dock/bank/repair (even while wanted) and stop their cannon
  towers firing on you.
- **Ship capture** — board a ship at ≤20% hull, take its cargo, and **tow** the
  empty prize back to one of your ports to deliver it (the runner pipeline hook).
- **Cannon-tower defense** — Trading Hubs and cities fire on hostile ships.
- **Camera zoom** — auto zoom-in during battle (1.4×), smoothly out otherwise.
- **Weather** — one effect at a time every few minutes: rain, snow (icebergs),
  tsunami, cyclone, storm. Ship-only status effects; **wind is never touched.**
- **Maps & fog** — a heading-arrow corner minimap and a draggable/zoomable M-map
  that reveals only where you've explored.
- **Save** — auto-saves on docking (localStorage + file export/import); managed
  from the Esc pause menu. The world regenerates from seed, so saves are tiny.
- **Weather & Zoom toggle** — a pause-menu checkbox turns the battle-zoom and
  weather systems on/off.

## Architecture

- **No bundler / no ES modules.** Plain classic scripts share one global scope;
  `index.html` loads them in dependency order. Systems are namespaced globals
  whose methods take `scene` as the first argument.
- **`GameScene`** holds the mutable run state and orchestrates the per-frame
  loop; **`UIScene`** runs in parallel on top for the HUD, maps, and menus.
- **System registry + event bus** (`core/SystemRegistry.js`, `core/Events.js`) —
  feature systems (bank, zoom, weather, ship tiers, crew, commodities, port
  economy, defense, port capture, boarding) are drop-in: they implement any of
  `init / update / draw / onDock`, subscribe to `EV.*` events, and register in
  `registerSystems()`. `GameScene` never grows a hardcoded call per feature.
- **Frame-rate independence** — `dt` (per-frame) and `dts` (per-second) are
  derived in `GameScene.update()` and threaded everywhere.
- **Tuning** — gameplay numbers live in `constants.js`; the `` ` `` panel
  (`debug/DebugOverlay.js`) edits many live. Most balance values are
  placeholders meant to be dialed in by feel.

## Structure

```
index.html                 — DOM + ordered <script> tags (no game logic)
js/
  constants.js             — all tuned constants (sailing, world, tiers, economy, …)
  main.js                  — Phaser config + launch
  core/      Events (EV bus), SystemRegistry (feature plug-in point)
  utils/     PRNG, MathUtils
  systems/   SailingPhysics, CollisionSystem, Steering, FactionSystem, FlagSystem,
             Combat, AI, ShipTier, CommoditySystem, BankSystem, CrewSystem,
             ZoomSystem, WeatherSystem, PortEconomy, DefenseSystem,
             PortCaptureSystem, BoardingSystem, SaveSystem
  world/     WorldGen (biome/region gen), ChunkManager (streaming),
             Island (render/bake), Port (+ dock slots), Visibility
  entities/  Player, Enemy, Cannonball, Loot
  ui/        WindCompass, MiniMap, WorldMap, HUD
  scenes/    BootScene → MenuScene → GameScene (+ parallel UIScene)
  debug/     DebugOverlay (dev tuning panel)
  missions/  MissionLoader (stub)
docs/                       — design docs / PRDs / build notes
```

_All gameplay numbers are placeholders to tune to feel._
