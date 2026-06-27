# Pirate Game — Corrected Design & Technical Handoff (V2)

> **This document supersedes the original handoff.** It folds in every change validated during interactive prototyping: frame-rate independence, hull-shaped collision, the faction/standing/witness systems, the false-colors flag, line-of-sight, AI obstacle avoidance, and the survivability tuning. Where this doc and the original disagree, **this doc wins**. Constants here are the actual values arrived at by feel-testing, not theoretical starting points.
>
> **Build philosophy (unchanged and correct):** physics and feel first, features second. Get the world rendering, then sailing, then combat, then factions. Test each layer against the described behavior before moving on.

---

## 1. Overview

A top-down Age of Sail sandbox. The player captains a ship through a procedurally generated ocean, sailing on real wind mechanics, fighting broadside cannon duels, looting, and navigating a world of reactive factions. Built in Phaser 3, desktop browsers.

**The game's actual subject is social consequence.** Almost every system answers the same question in a different form: *who are you to the people around you, and is anyone watching?* The flag you fly, your standing with each faction, what the navy witnesses, whether merchants flee, whether privateers help — these are all facets of that. The sailing is the verb; the factions are the meaning.

**The central playstyle tension** the design must support: **open pirate** (black flag flying — pirates ignore you, everyone else flees, navy hunts you) vs. **undercover operator** (neutral colors — trade peacefully, shadow a target, raise the flag at the last second to strike). The most interesting play happens in the space between outlaw and merchant, where you calculate who's watching before you act.

**Space carries meaning.** Open sea is free but pirate territory; navy waters near ports are safe but watched. With line-of-sight blocked by land, islands become tactical cover — places to raise colors unseen, break a chase, or commit a crime with land between you and a patrol.

---

## 2. Technical Stack

- **Engine:** Phaser 3 (CDN, no build tools)
- **Language:** JavaScript ES6+
- **Renderer:** WebGL (`Phaser.AUTO`, Canvas fallback)
- **No build system, no bundler, no TypeScript, no ECS framework.** Plain JS files opened directly. This is correct for the project's scale — do not add tooling.
- **No physics engine.** All movement is manual math. Do NOT use Arcade/Matter.
- **No audio** in initial build.
- **Desktop only**, 1280×720 target.
- **No external art** initially — everything drawn procedurally with Phaser Graphics.

### Phaser CDN
```html
<script src="https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js"></script>
```

### ⚠️ CRITICAL: Frame-rate independence (this is the #1 thing the original doc got wrong)

The original doc expressed every physics value per-frame assuming a locked 60fps. **This is a bug.** On a 144Hz monitor the game runs 2.4× too fast. All movement must be scaled by frame delta.

**The pattern used throughout:**
```javascript
update(time, delta) {
  const dt  = Math.min(delta, 50) / (1000/60); // frame-normalized step; cap prevents tunneling on lag spikes
  const dts = delta / 1000;                    // seconds elapsed this frame
  // ...
}
```
- **Per-frame motion** (position steps, speed lerps) multiply by `dt`.
- **Rates expressed per second** (turn rates in deg/sec, regen/sec, cooldowns in seconds, standing recovery/sec) multiply by `dts`.
- The `Math.min(delta, 50)` cap means a lag spike can't teleport a ship through an island.
- Phaser config sets `fps: { target: 60 }` but the code must NOT rely on it being exact.

Because of this change, **all constants are re-expressed accordingly** (turn in deg/sec not deg/frame, cannon life in seconds not frames, etc.). The original doc's literal numbers are invalid; use the constants in §11.

### ⚠️ Phaser Graphics color format
Colors are hex **numbers**, not strings. `graphics.fillStyle(0xC8905A, 1.0)` — second arg is alpha. Getting this wrong renders everything black.

### Heading convention (consistent everywhere)
`0° = north (up), 90° = east (right), 180° = south (down), 270° = west (left)`.
Movement: `x += sin(heading)·vel·dt`, `y -= cos(heading)·vel·dt` (y inverted in screen space).
Ships are drawn pointing **up (−y)** at rest; `setRotation(DegToRad(heading))` then orients them correctly. **Pick this and never deviate** — the original doc waffled on this and it must be settled.

---

## 3. File Structure (revised)

Keeps the original's sensible split, with additions for systems the prototype proved are core (factions, flags) and a debug overlay. Line-of-sight moves out of MathUtils because it needs world data.

```
pirate-game/
├── index.html
├── js/
│   ├── main.js                 — Phaser config + launch; defines dt/dts contract
│   ├── constants.js            — ALL tuned constants, grouped by section (see §11)
│   ├── scenes/
│   │   ├── BootScene.js
│   │   ├── MenuScene.js
│   │   ├── GameScene.js        — world + all per-frame orchestration
│   │   └── UIScene.js          — HUD overlay, parallel scene
│   ├── entities/
│   │   ├── Player.js
│   │   ├── Enemy.js            — merchant / pirate / navy / privateer (faction-driven)
│   │   ├── Cannonball.js
│   │   └── Loot.js
│   ├── world/
│   │   ├── WorldGen.js
│   │   ├── Island.js           — stores constituent ellipses; collision data
│   │   ├── Port.js             — class exists in V1 (navy ports used now)
│   │   └── Visibility.js       — NEW: losBlocked() / canSee(); needs island data
│   ├── systems/
│   │   ├── SailingPhysics.js   — wind, speed curve, momentum, sail state
│   │   ├── Steering.js         — NEW: avoidIrons() + avoidLand() AI navigation
│   │   ├── Combat.js           — broadsides, cannonballs, hit detection, loot
│   │   ├── AI.js               — per-faction state machines (steering/state only)
│   │   ├── FactionSystem.js    — NEW: standing, witness/crime, forgiveness
│   │   ├── FlagSystem.js       — NEW: colors, raise delay, combat lock
│   │   └── CollisionSystem.js  — hull-shaped island collision + ship separation
│   ├── ui/
│   │   ├── HUD.js
│   │   ├── MiniMap.js          — top-right corner
│   │   └── WindCompass.js
│   ├── utils/
│   │   ├── PRNG.js             — seeded LCG; SEPARATE instances per domain
│   │   └── MathUtils.js        — PURE stateless math only (windOff, angleTo, angleDiff, distance)
│   ├── debug/
│   │   └── DebugOverlay.js     — NEW: range rings, scale bar, infinite ammo, (optional) tuning panel
│   └── missions/
│       └── MissionLoader.js    — exists in V1 even if it loads nothing (establishes pattern)
├── missions/                   — JSON mission files (empty for now)
└── assets/                     — empty for now
```

**Separate PRNG instances** (one each for world gen, enemy gen, in-game events), passed around, never re-seeded mid-run. World seed fixed at 42 for now.

---

## 4. Visual Direction

Illustrated board-game / indie top-down. Warm, readable, stylized — not pixel art, not realistic. Flat fills, depth through layered shapes, no gradients.

**Palette:**

| Element | Hex |
|---|---|
| Deep ocean | `0x15263C` |
| Shallow water ring | `0x2A9EAE` @ 45% alpha |
| Beach / sand | `0xC8905A` |
| Jungle green | `0x3D6E25` |
| Dark jungle core | `0x2B5018` |
| Rock cap | `0x685848` |
| Player hull / deck | `0x7A4E28` / `0xC08840` |
| Merchant hull / deck | `0xB89A60` / `0xD0AA70` |
| Pirate hull / deck | `0x5A2010` / `0x7A3020` |
| Navy hull / deck | `0x24506E` / `0x3E7AA0` |
| Privateer hull / deck | `0x2B5A2B` / `0x46863C` |
| Sail | `0xD4C48C` @ 90% |
| Wake | `0xA0CCD8` @ ~28% (player), `0x88AABB` (others) |
| HUD background | `0x0E1820` @ 90% |
| HUD text (gold) | `0xD4C890` |
| HUD accent (blue) | `0x8AAAC8` |
| Gold / loot | `0xF0C840` |
| Danger / warning | `0xE0503A` |

**Faction is readable from the stern flag** (see §9): pirate = black with white dot, navy = blue, privateer = green.

---

## 5. World

- **Size:** 6000 × 6000 px. **Seed:** 42 (fixed for now).
- Camera follows player, bounded to world, lerp 0.08. Visible world border.
- **Navy ports:** at least 2, placed on large landmasses. Marked with a cyan dot + ring. Navy and privateer ships home to these.

### PRNG (seeded LCG)
```javascript
function makePRNG(seed){
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
}
```

### Island generation (large first so small fill gaps)

| Type | Count | Shape |
|---|---|---|
| Large landmass | 5 | Cluster of 3–5 overlapping ellipses; each rx 110–200, ry 85–170. Hosts ports. |
| Medium island | 13 | Single ellipse, rx 45–85, ry 36–70 |
| Small outcrop | 18 | Single ellipse, rx 15–35, ry 12–28 |

**Placement:** ≥280px from world edge; keep 380px clear around world center (player start); large ≥600px apart, medium ≥220px, small ≥100px; up to 40 attempts per island then skip.

### Rendering (4-layer, baked)
Draw each island's ellipses outside-in: shallow ring (×2.35, 45% alpha) → beach (×2) → jungle (×1.56) → dark core (×1.0). Small outcrops use a rock cap (`0x685848`) instead of jungle layers. **Bake each island to a RenderTexture once** — they never move. Only ships, cannonballs, loot redraw per frame.

---

## 6. Sailing Physics (`SailingPhysics.js`)

The soul of the game. Get this feeling right before anything else.

### Wind
Wind has a FROM direction, fixed at **315° (NW)** for now (future: slow shifts, storms). Always shown on the compass.

```javascript
function windOff(heading, windFrom){ let d = Math.abs(heading - windFrom) % 360; return d > 180 ? 360 - d : d; } // 0–180
```

### Speed curve (note the tunable no-go and downwind-loss)
```javascript
function calcTargetSpeed(wa){
  if (wa < NO_GO) return 0;                                         // in irons
  if (wa < 90)    return MAX_SPEED * (0.5 + 0.5*(wa-NO_GO)/(90-NO_GO));
  return MAX_SPEED * (1.0 - DOWNWIND_LOSS*(wa-90)/90);
}
```
- `NO_GO = 30` (half-angle; forgiving, supports relaxed sailing)
- Beam reach (90°) = max speed; dead downwind = `MAX_SPEED*(1-DOWNWIND_LOSS)`.

### Momentum (dt-scaled)
```javascript
const target = calcTargetSpeed(windOff(heading, WIND_FROM)) * SAIL_MULTIPLIERS[sailState];
const rate = (target > vel ? ACCEL : DECEL) * dt;
vel += (target - vel) * Math.min(rate, 1);
```
Slightly faster accel than decel; ship carries speed through tacks.

### Sail states (W raise / S lower, on key press via `JustDown`)
| State | Multiplier | Visual |
|---|---|---|
| 0 No sails | 0.0 | mast/yard only |
| 1 Main sail | 0.55 | half-height sail |
| 2 Full sail | 1.0 | full sail |

### Variable turn rate — parameterized bell curve (replaces the original's hardcoded formula)

The original used fixed coefficients (`-3.2x²+3.7x+0.15`) which locked the curve's shape. Use an **independently tunable** curve instead: turn rate (deg/sec) rises from a rest value to a peak at some speed fraction, then falls to a full-speed value.

```javascript
// returns deg/sec; scale by dts when applying
function calcTurnDegS(vel){
  const x     = Math.min(vel / MAX_SPEED, 1);
  const px    = TURN_PEAK_AT / 100;            // speed fraction where peak occurs
  const peak  = TURN_PEAK_DEG_S;
  const minV  = TURN_MIN_DEG_S;                // value at rest
  const fullV = TURN_PEAK_DEG_S * TURN_FULL_PCT/100; // value at full speed
  if (x <= px){ const t = px === 0 ? 1 : x/px; return minV + (peak-minV)*(1-(1-t)*(1-t)); } // ease-out rise
  const t = (x-px)/(1-px); return peak + (fullV-peak)*(t*t);                                 // ease-in fall
}
```
Tuned result: **12°/s at rest → 94°/s peak at 58% speed → 47°/s at full.** Rewards a controlled cruise over drifting or flooring it.

### Player movement (per frame)
```javascript
const turnDeg = calcTurnDegS(player.vel) * dts;
if (left)  player.heading = (player.heading - turnDeg + 360) % 360;
if (right) player.heading = (player.heading + turnDeg) % 360;
// speed via momentum block above (uses dt)
// position step uses dt (see moveShip in §7)
```
The player is deliberately allowed to steer into the no-go zone and stall (so the player can *feel* irons). AI ships are not (see §8 Steering).

---

## 7. Collision (`CollisionSystem.js`)

The original doc's collision was wrong in three ways: a single fat circle (couldn't thread gaps), a jarring teleport-back response, and no ship-vs-ship handling. All corrected.

### Hull-shaped island collision (replaces single 22px radius)
The hull is a long ellipse (drawn width 20 / length 40 → `HULL_LEN=20` semi-length, `HULL_BEAM=10` half-width). **Bowsprit and yard are excluded** — they're cosmetic. Approximate the hull by sampling 3 points along the ship's centerline (stern, mid, bow), each a beam-radius circle, oriented to heading:

```javascript
function checkIslandHull(ship){
  const sin=Math.sin(ship.heading*RAD), cos=Math.cos(ship.heading*RAD);
  for (const off of [-HULL_LEN*0.7, 0, HULL_LEN*0.7]){
    const px=ship.x+sin*off, py=ship.y-cos*off;
    const c = checkIsland(px, py, HULL_BEAM);   // ellipse test below
    if (c.hit) return c;
  }
  return { hit:false };
}
function checkIsland(x,y,radius){
  for (const island of islands) for (const e of island.ellipses){
    const nx=(x-e.cx)/(e.rx+radius), ny=(y-e.cy)/(e.ry+radius);
    if (nx*nx+ny*ny < 1){ const a=Math.atan2(y-e.cy, x-e.cx); return { hit:true, nx:Math.cos(a), ny:Math.sin(a) }; }
  }
  return { hit:false };
}
```
This lets a ship thread a gap when pointed through it, while a ship sideways-on to a reef still needs full clearance. (Approximation, not exact ellipse-vs-ellipse — fine for this scale. Note: a true oriented-ellipse test is a possible later upgrade.)

### Slide-along-coast response (replaces the bounce)
On collision, remove only the *into-shore* component of motion; keep the *along-shore* component so the ship grazes past instead of teleporting back.

```javascript
function moveShip(s, dt){
  const stepX = Math.sin(s.heading*RAD)*s.vel*dt;
  const stepY = -Math.cos(s.heading*RAD)*s.vel*dt;
  const ox=s.x, oy=s.y;
  s.x = clamp(s.x+stepX, 60, WORLD_W-60);
  s.y = clamp(s.y+stepY, 60, WORLD_H-60);
  let col = checkIslandHull(s);
  if (!col.hit) return;                          // clear
  const dot = stepX*col.nx + stepY*col.ny;       // into-shore component
  const sx = stepX - dot*col.nx, sy = stepY - dot*col.ny; // tangential
  s.x = clamp(ox+sx, 60, WORLD_W-60);
  s.y = clamp(oy+sy, 60, WORLD_H-60);
  if (!checkIslandHull(s).hit){ s.vel *= 0.94; return; }  // grazed past, minor loss
  s.x=ox; s.y=oy;                                // still stuck: revert
  if (checkIslandHull(s).hit){ s.x=clamp(ox+col.nx*2,60,WORLD_W-60); s.y=clamp(oy+col.ny*2,60,WORLD_H-60); }
  s.vel *= 0.5;
}
```

### Ship-vs-ship separation (new)
After all ships move, push apart any overlapping pair softly (no damage — soft bump, not a ram). Never push a ship onto land.

```javascript
function resolveShipCollisions(allLivingShips){
  const min = HULL_BEAM * 2.4;                   // beam-to-beam touch distance
  for (let i=0;i<ships.length;i++) for (let j=i+1;j<ships.length;j++){
    const a=ships[i], b=ships[j];
    const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy);
    if (d>0 && d<min){
      const overlap=(min-d)/2, ux=dx/d, uy=dy/d;
      const aOld={x:a.x,y:a.y}; a.x-=ux*overlap; a.y-=uy*overlap; if(checkIslandHull(a).hit){a.x=aOld.x;a.y=aOld.y;}
      const bOld={x:b.x,y:b.y}; b.x+=ux*overlap; b.y+=uy*overlap; if(checkIslandHull(b).hit){b.x=bOld.x;b.y=bOld.y;}
      a.vel*=0.92; b.vel*=0.92;
    }
  }
}
```
**Future hook:** the doc's "Ram Reinforcement" upgrade can layer damage on top of this separation later.

---

## 8. Line-of-Sight & Steering

### Visibility (`world/Visibility.js`) — NEW SYSTEM
Land blocks sight. Used for all navy detection and crime witnessing. Sample along the sight line; if any sample hits solid land (beach radius, not the shallow ring), the view is blocked.

```javascript
function losBlocked(ax,ay,bx,by){
  const d=Math.hypot(bx-ax,by-ay), steps=Math.max(2,Math.ceil(d/40));
  for (let i=1;i<steps;i++){ const t=i/steps; if (checkIsland(ax+(bx-ax)*t, ay+(by-ay)*t, 0).hit) return true; }
  return false;
}
function canSee(ox,oy,tx,ty,range){
  if (Math.hypot(tx-ox,ty-oy) >= range) return false;
  return !losBlocked(ox,oy,tx,ty);
}
```
**Performance:** runs per navy ship per frame. Fine at this roster size; throttle (every few frames) if the Code build scales up.

### Steering (`systems/Steering.js`) — NEW SYSTEM
Two layers that prevent AI ships getting stuck. **Apply land avoidance first, then irons avoidance**, to the AI's desired heading before turning.

**avoidIrons** — never let an AI ship park head-to-wind:
```javascript
function avoidIrons(heading){
  if (windOff(heading, WIND_FROM) >= NO_GO) return heading;
  const rel = angleDiff(WIND_FROM, heading);            // near 0 = into wind
  const edge = rel >= 0 ? NO_GO+2 : -(NO_GO+2);
  return (WIND_FROM + edge + 360) % 360;
}
```

**avoidLand** — look ahead; if blocked, fan out for the nearest clear bearing:
```javascript
function avoidLand(s, heading){
  const probe = 110;
  if (!headingBlocked(s, heading, probe)) return heading;
  for (let off=20; off<=160; off+=20){
    const right=(heading+off)%360, left=(heading-off+360)%360;
    const rOk=!headingBlocked(s,right,probe), lOk=!headingBlocked(s,left,probe);
    if (rOk && lOk) return headingBlocked(s,right,probe*0.6) ? left : right; // prefer more open side
    if (rOk) return right;
    if (lOk) return left;
  }
  return heading; // boxed in — let collision handle it
}
function headingBlocked(s, heading, dist){
  const sin=Math.sin(heading*RAD), cos=Math.cos(heading*RAD);
  for (const step of [dist*0.5, dist]) if (checkIsland(s.x+sin*step, s.y-cos*step, HULL_BEAM).hit) return true;
  return false;
}
```
This is **reactive avoidance, not pathfinding** — against a large landmass a ship may take a wandering route. Acceptable at this scale; A* is a possible later addition.

---

## 9. Factions, Standing & Flags

This is the heart of the game and the most significant expansion over the original doc, which only had merchant-flees / pirate-attacks. Three subsystems: standing, witnessing, and flags.

### Roster (V1 — "light," deliberately scarce)
| Faction | Count | Hull | Default stance |
|---|---|---|---|
| Merchant | 5 | 50 | Neutral; flees only when threatened |
| Pirate | 3 | 75 | Hostile to player **unless** pirate flag flown |
| Navy | 5 | 90 | Friendly; hostile when witnessing crime / pirate colors / WANTED |
| Privateer | 2 | 70 | Ally to the lawful; hostile if WANTED or hit enough |

**Pirates are rare and always hostile on detect** (not probabilistic). Scarcity makes each encounter a legible event rather than ambient noise.

### Navy Standing (the "undercover" meter)
A single account-level value, 0 = neutral/friendly, negative = suspect. `navyHostile()` is `standing <= NAVY_HOSTILE_THRESHOLD` (−40). Recovers toward 0 at `NAVY_STANDING_RECOVER_PER_S` (2/s) when not committing crimes.

### Witnessing — crimes are only crimes if the navy SEES them
- A **crime = hitting a non-pirate within navy line-of-sight.** Attacking pirates is lawful (you're doing the navy's job) and never lowers standing.
- Witnessing drops standing by `CRIME_PENALTY` (25), with a **1.5s grace window** so one incident doesn't stack penalties every volley.
- Crimes committed out of navy sight (open sea, or behind an island breaking LOS) go unseen — this is the entire basis of the undercover playstyle.
- A witnessing navy ship also sets its personal `hostileToPlayer` flag.

### Navy behavior
- **Hunts pirates** near its home waters when not engaged with the player (the original doc never had navy fight pirates — it must).
- **Leashed:** patrols within `NAVY_LEASH` (850px) of its home port; if dragged beyond, it breaks off and returns home. Makes ports dangerous, open sea freer.
- **Hostile** (via standing, witnessed crime, or seeing pirate colors): pursues from sight range, fires within `NAVY_ATTACK_RANGE` (300px), positioning perpendicular for broadsides.
- **Forgiveness (important):** a navy ship clears its personal grudge once the player is **no longer WANTED, not flying pirate colors, AND out of sight / far away.** Without this, ships hold a permanent grudge even after standing recovers — a bug. Forgiveness does NOT trigger mid-chase while still WANTED or still flying colors (preserves "they remember what they saw").

### Privateers (allies of the lawful)
- **Hostile if** player is WANTED **OR** has hit them ≥ `PRIVATEER_HITS_BEFORE_HOSTILE` (3) times (hybrid).
- **Assist only when lawful** (standing > `PRIVATEER_LAWFUL_CUTOFF`, −15): they hunt pirates within `PRIVATEER_ASSIST_RANGE` (460px), biased toward pirates near the player so they feel like they're helping *your* fight.
- Shady-but-not-WANTED player: they go "wary" — patrol, won't assist.
- Direct-hit grudges (you shot them) persist; WANTED-only hostility forgives when standing recovers.
- **Killing a privateer in navy sight is a crime** (they're law enforcement) — covered by the non-pirate-hit rule.

### Merchants
- **Flee only when threatened:** player flying pirate colors, OR provoked (you've hit them/another merchant), OR player is WANTED. Otherwise they ignore you and sail on — you can shadow them peacefully. (The original "always flee" makes undercover impossible and is wrong.)
- A tunable `MERCHANT_FIGHT_CHANCE_PCT` (20%) of provoked merchants fight back like weak pirates instead of fleeing. The fight/flee roll is cached per-ship so behavior is stable, not flickering.

### Flag System (`FlagSystem.js`) — NEW; the false-colors mechanic
Two flags: **neutral** and **pirate**. Switched via UI (test build used panel buttons; production should use a clear in-world control).

- **Pirate colors:** pirates ignore you (fellow pirate, unless you've hit them), merchants flee on sight, **navy goes hostile-on-sight** the moment they witness the colors within LOS range (with a standing hit + popup).
- **Raise/lower takes `FLAG_RAISE_DELAY_S` (1.2s)** — show a half-raised flag during the change.
- **Locked during combat:** cannot change flags within `FLAG_COMBAT_LOCK_S` (5s) of firing or being hit. You can't flip colors to dodge a fight mid-exchange.
- **The flag does not control minds — it controls beliefs (Option B).** Lowering your flag does NOT call off a navy that already witnessed you; they stay hostile until standing recovers / they lose you / they forgive (see Navy). The flag fools ships that haven't yet made up their mind, not ones already committed. This is the key design choice — do not implement it as a hard escape button.
- **Rendered on a small stern flagpole** (not the mast). Pirate = black with a white skull-dot; navy ships fly blue, privateers green, so allegiance reads off the stern. The pending (changing) flag draws faint/half-raised.

### Continuous detection note
Navy must check **every frame** whether the player is flying pirate colors within LOS — not only at the instant the flag is raised. (A bug we hit: checking only at raise-time meant a navy ship you approached *after* raising never reacted.)

---

## 10. Combat (`Combat.js`)

### Controls & firing
- **Q** = port broadside (`heading − 90°`), **E** = starboard (`heading + 90°`), on `JustDown`.
- Each volley fires `BALLS_PER_VOLLEY` (3) cannonballs in a `SPREAD_DEG` (10°) fan.
- Player cooldown `FIRE_COOLDOWN_S` (2s) per side; **enemy cooldown = player × `ENEMY_COOLDOWN_MULT` (1.8)**.

```javascript
function fire(ship, side){            // side: 'port' | 'star'
  const cd = ship.faction==='player' ? FIRE_COOLDOWN_S : FIRE_COOLDOWN_S*ENEMY_COOLDOWN_MULT;
  if (ship.faction==='player'){ if ((ship.ammo<=0 && !infiniteAmmo) || ship.fire[side]>0) return; }
  else { if (ship.fire>0) return; }
  const fa = (ship.heading + (side==='port'?-90:90) + 360) % 360;
  const half=(BALLS_PER_VOLLEY-1)/2;
  for (let b=0;b<BALLS_PER_VOLLEY;b++){
    const ang = fa + (b-half)*SPREAD_DEG;
    cannonballs.push({
      x: ship.x+Math.sin(fa*RAD)*20, y: ship.y-Math.cos(fa*RAD)*20,
      vx: Math.sin(ang*RAD)*CANNON_SPEED, vy: -Math.cos(ang*RAD)*CANNON_SPEED,
      owner: ship.id, ownerFaction: ship.faction, age: 0,
    });
  }
  if (ship.faction==='player'){ if(!infiniteAmmo) ship.ammo=Math.max(0,ship.ammo-BALLS_PER_VOLLEY); ship.fire[side]=cd; ship.lastFiredAt=now; }
  else ship.fire=cd;
}
```
Note **one unified fire path** (the original doc had an undefined `fireEnemyBroadside` with a mismatched signature — consolidate). Enemies pass side as a sign and map it to `'port'/'star'`.

### Cannonball update (dt-scaled, seconds-based life)
```javascript
ball.x += ball.vx*dt; ball.y += ball.vy*dt; ball.age += dt/60;
if (ball.age > CANNON_LIFE_S) destroy;
if (checkIsland(ball.x, ball.y, 4).hit) destroy;       // land blocks shots
// hit player if ownerFaction !== 'player' and within 24px
// hit a ship if within 24px AND ball.ownerFaction !== that ship's faction (no same-faction friendly fire)
```
Constants: `CANNON_SPEED 5.5`, `CANNON_LIFE_S 1.0`, `CANNON_DAMAGE 10`. Effective range ≈ speed×life×60 ≈ 330px — keep this comfortably above pirate engagement range so the player isn't auto-inside the enemy bubble.

### onHit
```javascript
target.hull -= CANNON_DAMAGE;
if (ball.ownerFaction === 'player'){
  target.hostileToPlayer = true;
  if (target.faction === 'privateer') target.hitsByPlayer++;
  if (target.faction !== 'pirate') reportCrime(target.x, target.y); // pirate-hunting is lawful
}
if (target.hull <= 0){ target.alive=false; spawnLoot(target); }
```

### Loot
On kill, drop a glowing gold coin (value by faction: pirate ~44, navy ~50, privateer ~40, merchant ~28). Collected by sailing within `LOOT_COLLECT_RADIUS` (36px): `gold += value; ammo = min(maxAmmo, ammo+6)`. Expires after ~10s, fading near the end.

### Combat maneuver (AI)
To fire a broadside, an AI ship turns **perpendicular** to its target and fires only when 70–110° off the bearing. It slows to sail state 1 to hold position. Shared by pirate, navy, privateer, and fighting merchants.

---

## 11. Constants (`constants.js`) — TUNED VALUES

These are the actual feel-tested values, grouped as the prototype's panel grouped them. **Sailing accel/decel are dt-scaled — keep the delta-time formulation; do not port them into a per-frame model.**

```javascript
// ── SAILING ── (dt-scaled)
const MAX_SPEED = 2;        // px per 1/60s at beam reach, full sail
const ACCEL = 0.006;       // lerp toward higher target speed (×dt)
const DECEL = 0.007;       // lerp toward lower target speed (×dt)
const WIND_FROM = 315;     // degrees wind comes FROM (NW)
const NO_GO = 30;          // half-angle of no-go zone
const DOWNWIND_LOSS = 0.20;// fraction of max lost dead downwind

// ── TURNING (parameterized bell curve, deg/sec) ──
const TURN_PEAK_DEG_S = 94;
const TURN_PEAK_AT    = 58; // % of max speed where turn peaks
const TURN_MIN_DEG_S  = 12; // turn rate at rest
const TURN_FULL_PCT   = 50; // % of peak available at full speed → 47°/s

// ── BROADSIDE ──
const BALLS_PER_VOLLEY = 3;
const SPREAD_DEG = 10;
const CANNON_SPEED = 5.5;   // px per 1/60s (×dt)
const FIRE_COOLDOWN_S = 2;  // player, per side
const CANNON_DAMAGE = 10;
const CANNON_LIFE_S = 1.0;
const ENEMY_COOLDOWN_MULT = 1.8;

// ── NAVY ──
const NAVY_SIGHT = 540;            // detection / witness range (LOS-gated)
const NAVY_HOSTILE_THRESHOLD = -40;
const NAVY_ATTACK_RANGE = 300;
const NAVY_LEASH = 850;            // max distance from home port before returning
const NAVY_STANDING_RECOVER_PER_S = 2;
const CRIME_PENALTY = 25;          // standing lost per witnessed crime (1.5s grace)

// ── MERCHANTS ──
const MERCHANT_FLEE_RANGE = 310;
const MERCHANT_FIGHT_CHANCE_PCT = 20;

// ── PRIVATEERS (allies) ──
const PRIVATEER_HITS_BEFORE_HOSTILE = 3;
const PRIVATEER_ASSIST_RANGE = 460;
const PRIVATEER_LAWFUL_CUTOFF = -15; // assist only if standing above this

// ── SURVIVAL ──
const PLAYER_HULL = 130;
const REGEN_CAP_PCT = 30;          // out-of-combat regen heals only up to 30% of max hull
const REGEN_RATE_PER_S = 1.5;
const REGEN_OUT_OF_COMBAT_DELAY_S = 5;

// ── FLAGS ──
const FLAG_RAISE_DELAY_S = 1.2;
const FLAG_COMBAT_LOCK_S = 5;

// ── HULL / COLLISION ──
const HULL_LEN = 20;   // semi-length of hull body
const HULL_BEAM = 10;  // half-beam; collision sample radius (bowsprit excluded)
const SHIP_RADIUS = 22;// legacy/general proximity; hull check preferred for land

// ── WORLD ──
const WORLD_W = 6000, WORLD_H = 6000, WORLD_SEED = 42;
const GAME_W = 1280, GAME_H = 720;
const SAIL_MULTIPLIERS = [0, 0.55, 1.0];

// ── LOOT / WAKE ──
const LOOT_COLLECT_RADIUS = 36;
const LOOT_EXPIRE_S = 10;
const WAKE_LENGTH = 60, WAKE_MIN_SPEED = 0.2;

// ── ROSTER ──
const MERCHANT_COUNT = 5, PIRATE_COUNT = 3, NAVY_COUNT = 5, PRIVATEER_COUNT = 2;
```

---

## 12. Survival Model

The player needs to survive "a bit" more easily without trivializing combat:
- **Player hull 130** (vs. enemies' 50–90) — the gentlest, most invisible buff.
- **Enemy cooldown ×1.8** — thins incoming fire mildly (×2 was too dramatic).
- **Capped out-of-combat regen:** heals only the **bottom 30%** of hull (so a bad fight can't kill you on lingering chip damage and you can limp away), only after 5s without being hit, at 1.5/s. Above 30% requires a port repair (preserves the port-economy design). Reaching this cap is a "don't quite die" mechanic, not "never lose."

---

## 13. HUD & UI (`UIScene.js`, parallel scene)

- **Top-left panel:** speed bar + knot value, sail-state label (color-coded), hull bar, ammo, gold, broadside cooldown bars.
- **Top-right corner:** mini-map (islands, player blue dot, faction-colored ship dots).
- **Compass** (left of the mini-map): wind no-go sector (red), wind-from arrow (blue), heading needle (yellow).
- **Status banner (top-center):** "★ WANTED — NAVY HOSTILE" and/or "☠ PIRATE COLORS FLYING".
- **Center warning:** "IN IRONS — turn away" when sail up and within no-go.
- **Damage / loot popups:** floating "−10" / "+44g" / "WITNESSED" / "COLORS SEEN".
- **Game over:** "YOU SANK" overlay; R to reset/revive.
- **Pixel scale bar (bottom-center):** 200px world reference (also useful as a shipped minimap legend; came from the debug overlay).

---

## 14. Debug Overlay (`debug/DebugOverlay.js`) — dev-only

Isolated so it never leaks into shipping logic. Keep available behind a toggle:
- **Infinite ammo** flag.
- **Range rings:** drag a range value → draw that radius on the player, fading, to visualize detection/attack/leash/flee/assist distances against the scale bar.
- **(Optional) live tuning panel:** the prototype's slider panel. Not required in production — constants live in `constants.js` — but valuable if re-tuning. Rebuild only if needed.

---

## 15. Controls (V1)

| Key | Action |
|---|---|
| A / ← | Turn left |
| D / → | Turn right |
| W (press) | Raise sails 0→1→2 |
| S (press) | Lower sails 2→1→0 |
| Q (press) | Port broadside |
| E (press) | Starboard broadside |
| R (press) | Reset / revive ship (works even when sunk) |
| (UI) | Switch flag (neutral / pirate) — locked during combat |

**Bug note for the port:** the reset key must be read **outside** any `if(hull>0)` input gate, or it won't work after sinking (a bug we hit).

---

## 16. V1 Build Checklist

**World:** seeded PRNG · island gen (3 types, spacing) · 4-layer render baked to RenderTexture · world border · navy ports · enemy placement (avoid islands + player start).

**Sailing:** wind angle + speed curve + no-go · dt-scaled momentum · sail states · parameterized bell-curve turn (deg/sec, ×dts) · player movement + world clamp · hull-shaped island collision + slide response · wake.

**Steering (AI):** avoidIrons · avoidLand (look-ahead fan) · applied before turning.

**Collision:** hull-shaped land check · ship-vs-ship separation (land-safe) · cannonball-vs-island.

**Combat:** unified fire path (Q/E, 3-ball spread) · dt-scaled cannonball update with seconds-based life · hit detection (player/ship/island, no same-faction FF) · hull damage · enemy auto-fire when perpendicular · death + loot · loot collection + ammo restock.

**Factions:** standing (recover/sec) · witness/crime via LOS (non-pirate hits only, grace window) · navy (hunt pirates, leash, hostile logic, forgiveness, per-frame color detection) · merchants (conditional flee + fight-back roll) · privateers (hybrid hostility, lawful assist with player bias, persistent direct-hit grudge).

**Flags:** two-flag state · raise delay · combat lock · Option-B witness memory · stern flagpole render · per-frame navy color detection.

**Visibility:** losBlocked / canSee used by all navy sight checks.

**Survival:** hull 130 · enemy cooldown ×1.8 · capped out-of-combat regen.

**HUD:** speed/sail/hull/ammo/gold · cooldown bars · compass · mini-map (top-right) · in-irons warning · WANTED/colors banner · popups · game-over · scale bar.

**Architecture stubs (cheap now):** MissionLoader scanning empty `/missions/` · Port/Island/Visibility classes · separate PRNG instances · debug overlay scaffold.

---

## 17. Future Scope (architecture-aware, build later)

Unchanged in intent from the original, with one overarching note: **these systems must talk to each other, or the game is a menu of features rather than a world.** The connective tissue is the priority when you reach this phase — e.g. raiding a convoy near a port should raise prices AND heat AND change who sails there next.

- **Ship tiers:** Sloop → Brigantine → Frigate (combat) / Fluyt (cargo). The two Tier-3 ships are an identity choice (fight vs. trade), echoing the pirate/trader spine. Buy at port or capture (arrives damaged). Upgrade progress doesn't transfer between hulls.
- **Ports & economy:** port types with distinct economies; finite inventories replenished by merchant shipping; prices driven by supply; player raiding disrupts routes and ripples through prices. **This is where the faction and economy systems must interconnect.**
- **Upgrades:** Hull / Cannons / Sails / Cargo / Crew / Ram — 2–3 tiers each, intentionally shallow.
- **Resources:** Crew (affects sailing/combat, hired at ports), Food (drains over time, hunger penalties), Ammo (ammo types later).
- **Fog of war & exploration:** hidden world revealed by sailing; permanent discoveries; navigation uncertainty far from land; named landmarks; hidden locations.
- **Save system:** Safe Harbors as save points; death returns to last save; optional Ironman.
- **Weather & events:** storms (visibility, wind shifts, hull risk); sea events (wreckage, drifting ships, bottles, legendary encounters).
- **Reputation/heat:** the prototype's standing/witness system IS the seed of this — extend per-faction with fading regional heat and long-term infamy.
- **Rumors & missions:** tavern rumors as soft objectives; JSON-defined missions via MissionLoader (no code changes to add one).

---

## 18. Notes for the Coding Chat

1. **Frame-rate independence is non-negotiable.** Every motion scales by `dt` (per-frame) or `dts` (per-second rates). Test by confirming identical speed at 30/60/144fps.
2. **The prototype HTML is the behavioral oracle.** Where this doc and your intuition differ, match the prototype's feel. Port system-by-system and verify each against it before moving on.
3. **Phaser Graphics colors are `0xRRGGBB` numbers**, second arg alpha. Wrong = everything black.
4. **No Phaser physics.** Manual math in `update()`.
5. **Hull-shaped collision, not a circle.** Bowsprit excluded. This is what lets ships thread gaps.
6. **Slide along coasts, never teleport-back.** Ship-vs-ship is a soft bump, not a ram.
7. **Crime = hitting a non-pirate in navy LOS.** Pirate-hunting is lawful. Land blocks sight.
8. **The flag controls beliefs, not minds (Option B).** Lowering colors doesn't erase what the navy already witnessed. Navy forgive only when player is no longer a threat AND out of contact.
9. **Navy detect pirate colors every frame**, not just at raise-time.
10. **Reset key (R) must be read outside the alive-gate** so it works after sinking.
11. **Separate PRNG instances** per domain; pass them, don't re-seed.
12. **Bake islands to RenderTexture.** First optimization if frames drop.
13. **Keep constants in one sectioned file.** Tune by editing + reload; the live panel is dev-only.
14. **Don't add build tooling.** Plain JS via CDN is correct for this scale.
