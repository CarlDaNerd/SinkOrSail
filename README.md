[README.md](https://github.com/user-attachments/files/29407356/README.md)
# Sink or Sail

A top-down, Age-of-Sail pirate sandbox. Sail an endless procedurally-streamed
ocean, trade commodities between ports, fight (or flee) the navy, capture ships
and ports, and work your way up a six-tier ship ladder from a humble Dinghy to a
Leviathan.

Built in plain JavaScript on [Phaser 3](https://phaser.io/) — no build step, no
framework, no bundler. Open a file and play.

---

## Run it

The game lives in `pirate-game/`. It's static — any web server works:

```bash
cd pirate-game
python -m http.server 8000
# open http://localhost:8000
```

Or just open `pirate-game/index.html` in a browser. (A server is recommended so
the chunked world and save features behave normally.)

No install, no dependencies — Phaser loads from a CDN.

---

## Controls

| Key | Action |
|-----|--------|
| `A` / `D` or ←/→ | Turn |
| `W` / `S` | Raise / lower sails |
| `Q` / `E` | Fire port / starboard broadside |
| `F` | Dock at a nearby port (and depart) |
| `B` | Capture — a port if you're beside one stripped below 20% hull, otherwise the nearest ship below 20% hull |
| `M` | Open / close the world map |
| `Z` / `X` | Zoom the map out / in |
| Mouse wheel | Zoom the camera (out of battle, map closed) — or zoom the map when it's open |
| `Esc` | Pause menu |

**At a dock:** `1` repair · `2` restock ammo · `3` sell all cargo · `4` buy the
port's source commodity · `5` hire crew · `F` depart.

---

## What you do

- **Sail** a wind-driven ship across an effectively unlimited, deterministic
  world that streams in around you.
- **Trade** six commodities (lumber, cloth, iron, rum, sugar, tobacco) between
  eight kinds of port, each with its own seeded prices — buy a port's specialty
  cheap, sell it dear elsewhere.
- **Fight** pirates, the navy, privateers, and merchants. Fly a neutral or a
  pirate flag; commit crimes in view of the navy and become **WANTED**.
- **Crew** your ship — more crew means faster sailing and faster reloads, but
  drop below your ship's minimum and you're **understaffed** (slow, fewer
  cannons firing). Bigger ships need far more crew.
- **Capture** ships by stripping them below 20% hull and boarding (you must own
  a port first) — then **tow the empty prize home**.
- **Capture ports** by shelling them down and taking them; a captured port
  becomes yours to dock, bank, and repair at.
- **Survive the weather** — rain, snow (icebergs), tsunamis, cyclones, and
  lightning storms, one at a time. (Wind is its own system; weather never
  touches it.)
- **Save** at any port (localStorage), with `.json` export/import.

---

## Ship tiers

Six tiers with steep gaps. A ship's tier sets its hull, cannon count, cargo
capacity, and crew limits — you grow by acquiring bigger ships, not by stacking
stat upgrades.

`Dinghy → Sloop → Brigantine → Galleon → Man-o'-War → Leviathan`

You start as a Dinghy with half a crew. Bigger ships are acquired by buying (at
ports) or capturing — and capturing up the ladder gets progressively harder
(the largest prizes require a fleet, not a single ship).

---

## Architecture

Plain global singletons, no modules/ESM, no Phaser physics, no ECS. Everything
is frame-rate-independent via a `dt` (per-frame) / `dts` (per-second) contract
established in `GameScene`.

```
pirate-game/
  index.html              loads every script in order
  js/
    constants.js          all tunable numbers live here
    core/
      Events.js           EV — event-name constants for the cross-system bus
      SystemRegistry.js   Systems — registry with init/update/draw/onDock
    scenes/GameScene.js   world + per-frame orchestration (the spine)
    systems/              one file per feature (combat, AI, weather, crew, ...)
    entities/             player, enemies, cannonballs, loot
    world/                chunk streaming, world-gen, islands, ports
    ui/                   HUD, minimap, world map, wind compass
    utils/                PRNG, math
```

**Feature systems** plug into `Systems` and react to events on the bus
(`SHIP_SUNK`, `DOCK_ENTERED`, `PORT_CAPTURED`, `PRIZE_DELIVERED`, …). A producer
emits; any number of systems react without the producer knowing. Tightly-ordered
core flow (movement → collision → combat) stays as direct calls.

**Adding a feature:** drop a `const MySystem = { init, update, draw }` object in
`js/systems/`, register it in `SystemRegistry.js`, add its `<script>` tag, and
have it own one slice of scene state and subscribe to whatever events it cares
about.

---

## Feature status

**In the game:** sailing & wind, broadside combat, factions & flags, wanted
system, chunk-streamed world, biomes/reefs/shallows, world map + fog of
exploration, save/load, commodities & trading, 8 port types with seeded
economies, docks, bank, camera zoom, weather, the six-tier ship system, crew
(speed/reload/understaffed), enemy ship tiers, ship capture (crew-split, tow
home), and port capture.

**In progress / planned:** captured-ship **runners** (auto trade routes),
multi-ship fleets, sail-material and cannon-type upgrades, buying ships at port,
world-wide placement of all port types, cultural ship/island theming, hireable
privateers, and bounties.

> Many gameplay numbers (ship stats, prices, capture thresholds, weather tuning)
> are deliberate placeholders meant to be balanced through play.

---

## Status

Early, active development — expect rough edges and changing balance. Known issues
are tracked in the design doc and the issue list.
