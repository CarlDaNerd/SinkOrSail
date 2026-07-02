# SinkOrSail — Roadmap

Reality check of the design doc against `main` (commit `c685f2e`, 50 commits). Doc = intent, code = truth. Conflicts flagged where they disagree.

---

## Notes

- Source doc: "Sink or Sail" Google Doc. Source of truth for "built": `pirate-game/js/` on `main`.
- Bank/save ownership and chunk system are core-owned; other modules use them defensively.
- Commodities are trade goods only (lumber, cloth, iron, rum, sugar, tobacco) — gold pays for upgrades/repair/building.
- Doc's own `[x]/[~]/[ ]` tags are stale in several places — the code has moved ahead of the doc's last edit. See Conflicts.

## Conflicts (doc says one thing, code does another)

- **Crew combat death**: doc marks this `[~] ...not yet`. Built (`Combat.js`, tagged `CD1`) — crew can die per-hit at `CREW_DEATH_CHANCE`, capped by `CREW_DEATH_MAX_PER_HIT`.
- **Port placement**: doc says `[~] only 2 starter ports placed, needs Carl's chunk/WorldGen`. Built — all 8 port types place world-wide (`PORT_REGION_RADIUS` covers the full world, not just the inner regions).
- **Ship tier naming**: doc's tier 5 is "Man-o'-War"; code calls it "Galleon" (tier 6 "Leviathan" matches in both).
- **Mobile**: doc lists "Mobile" under *Long Term Game Goals* (implying not started). Substantially built — MB2 and MB3 are both merged (icon fire controls, tap-steer, muzzle flash, landscape lock + PWA manifest, post-playtest fixes).
- **Achievements**: doc's only mention is a loose bullet ("Achievements (cultures and missions)"). Built as a full system, 15 achievements, no culture/mission tie-in yet.
- **Camera zoom (M7)**: doc says manual zoom only outside battle. Code: manual scroll zoom is always available; battle forces zoom-in and overrides it. Functionally close to the doc's intent, wording should be updated.
- **Several Section V bugs are already fixed** (see Bugs below) — the doc's bug list hasn't been pruned against current code.

---

## Recently Added (most recent commits first)

- Chase-boarding (boarding no longer stops your ship mid-pursuit), capture hints, land-anchored defense towers, cache-busting
- TM1 — port taverns + mission board
- FM1 — fleet/runner management screen: convoys, escorts, wind-aware explored-only reroutes
- LV1 — the Leviathan roaming endgame target
- PF1 — port identity + map info layer
- Combat & sailing QoL batch + crew combat deaths
- Wake-arc heading fix (Phaser angle-wrap)
- Berth-occupancy leak fix + towed-prize save gaps
- SW1 — ship swap: make a captured prize your flagship
- Snow + tsunami weather re-added
- Dock berths: merchants physically dock at visible piers
- MB3 — post-playtest mobile fixes (landscape map bug, optional orientation, ACCESS PORT button, wake arcs)
- MB2 — mobile batch: icon fire controls, tap-to-steer, muzzle flash, multitouch fix, landscape + PWA
- Touch/mobile input layer
- Weather rework: local wind field, moving storm cells + cyclone, rain rework, dev tab
- Bigger world (3x), border ports, spacebar broadside, per-tier ammo
- Ship collision physics: drift-vector push + slide-along-shore, ram damage (mass/tier scaled)

## Current Features (built & verified in code)

**World / sailing** — 3x world size, seeded island gen, hull-shaped collision + slide response, ship-vs-ship separation, local wind field + moving weather systems, frame-rate-independent physics throughout.

**Ship tiers** — 6 tiers, Dinghy → Sloop → Brig → Frigate → Galleon → Leviathan. Hull/crew/storage/ammo/cost all scale per tier (values still marked PLACEHOLDER in code pending live-tune).

**Crew** — hire at ports, understaffed penalty, per-crew speed/reload bonus (shrinks at higher tiers), combat death chance per hit.

**Capture / boarding** — strip-then-board, solo-capture tier rule (target tier ≤ your tier + 1, crew-capacity gated), chase-boarding (no forced stop while pursuing), ship swap (make a captured prize your flagship).

**Ports & economy** — 8 port types (Trading Hub, Lumber Yard, Frontier Outpost, Sugar Farm, Brewery, Tobacco Farm, Iron Mine, Cloth Mill), world-wide placement, seeded per-port demand, cannon tower defense, port capture + raiding, dock-speed requirement enforced.

**Fleet / runners** — capture-to-runner pipeline, wind-aware explored-only routing, reroute/escort/convoy controls, 3 privateer hire slots.

**Weather** — rain, storm, cyclone, snow, tsunami — all 5 implemented (doc's "re-add snow/tsunami" is done).

**Taverns & missions** — tavern system + mission board (`TavernSystem.js`, `MissionDefs.js`, `MissionLoader.js`) — currently a light layer, not deeply integrated with achievements yet.

**Leviathan endgame** — roaming target, dual capture condition (hull threshold + boarder count), combat regen.

**Achievements** — 15 achievements spanning combat, capture, economy, weather, and ship progression.

**Save system** — implemented; no Ironman mode yet (see Future).

**Mobile** — full touch input layer, icon-based fire controls, tap/hold steering, forced landscape + PWA manifest, muzzle flash effects, two post-launch mobile batches merged.

**Bugs from doc Section V, confirmed fixed in code:**
- Dock speed requirement (`DOCK_MAX_VEL` check + "TOO FAST TO DOCK" popup)
- AI running into land (`Steering.avoidLand`, look-ahead fan)
- No delay between being attacked and returning fire (`RETURN_FIRE_DELAY_S`)
- Guard towers not attacking (`DefenseSystem.js` — towers fire on WANTED/pirate-colors players near a defended port)
- Merchant collision falsely flagging player WANTED (explicitly patched, tagged "doc V bug" in `CollisionSystem.js`)
- Cargo/hold capacity not scaling with ship size (scales per tier now)
- No option to make a captured ship your main ship (SW1 ship-swap)

---

## Bugs — still open or unverified

*(Not found fixed in a code search; needs either a fix or a playtest pass to confirm. Marked "Unclear" rather than guessed.)*

- Islands spilling off the mini-map border — **Unclear**, not directly checked
- Small islands generating inside/on top of mainlands — **Unclear**
- Reef generation — **Unclear**
- Blue-circle suicide crash — **Unclear**, sounds like a specific repro Noah/Carl/Zap would need to re-confirm
- Cyclone escape (should require going around like an island once below half health) — **Unclear**, cyclone drag-to-center exists but the "go around it" collision behavior wasn't found
- Lightning has no rain visual paired with it — **Unclear**
- Bounty direction arrow disappearing too early (at minimap range instead of main-screen range) — **Unclear**
- No highlight marker for the hunted pirate on the minimap — **Unclear**
- Towed ships not visible — partially built (tow state exists, HUD references the towed prize) but on-screen rendering wasn't directly confirmed — **Unclear**
- Owned/captured ports blocking docking during combat — **Unclear**
- Captured ships showing as dinghies when they become runners — **Unclear**

## Future Features (from doc, not yet built)

- Ironman / hardcore save mode
- Full resource list beyond the current six commodities
- Regional/cultural ship types (Viking, Chinese, etc.) with matching island/base theming (M9) — ship type driven by the home port's culture
- Empire/economy layer: sell/store/convert an old ship to a passive-trade merchant (distinct from the runner pipeline, which is already built), outposts via port capture
- Numeric tuning pass: capture loot %, repair costs, cannon-tower stats, bounty reward/range — tier table has real numbers now but is still tagged PLACEHOLDER pending live feel-testing
- Deeper tavern/mission integration with achievements and culture
- Multiplayer (early research only, per doc — no implementation)
- Slave trading (listed in doc's idea list, unbuilt)
- Send ships only to explored ports (partially covered by FM1's explored-only routing for runners; not yet a player-wide rule)
