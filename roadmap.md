# SinkOrSail — Roadmap

Reality check of the design doc against `main` (commit `c685f2e`, 50 commits). Doc = intent, code = truth. Conflicts flagged where they disagree.

---

## Notes

- Source doc: "Sink or Sail" Google Doc. Source of truth for "built": `Game/js/` on `main`.
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

- KS2 — Kenney terrain tiles: beach/jungle/core land layers get world-anchored masked tile textures (flat colours remain as grout + instant `TERRAIN_TILES=false` fallback); RULED — low-hull incapacitation (slow-then-stop) no longer applies to the player's own ship, AI unchanged
- UI1 — ledger port menu: the flat dock panel becomes a 3-page parchment book (Ship / Goods / Tavern) flipped with ←/→, rows selected with ↑/↓, quantities via a 1/10/MAX chip [Z], SPACE/B/S act, wax-seal or F departs; per-commodity sell rows use live PortEconomy quotes; taps hit the same rects as keys; per-action number keybinds retired
- KS1 — Kenney Pirate Pack ship reskin: sprite hulls (6 faction colours × 4 damage states) replace polygon ships, hit-flash as tint, flags/hull-bars kept as overlays, leak-proof sprite pooling, `SHIP_SPRITES` toggle for instant fallback (CC0, CREDITS.md added)
- DBG1 - Added some crash logging to the game to help troubleshoot crashes.
- I32 fix — port defense tower shots arc over land (they spawned on land-anchored towers and the land check deleted them the same frame); ship/player shots remain land-blocked
- I27 fix — tavern offers keep stable [1]/[2] slots (accepting no longer renumbers the board; the old splice made the second accept silently no-op); taken offers stay listed as ACCEPTED
- OPT-M9/S3/S6/S7 — runner + privateer wakes now render (they paid pushWake cost invisibly); all wake/hull draws camera-view-gated; weather streak loops skip while menus are open; `roundPixels: true` (revert if wake art shimmers); all 57 scripts `defer`ed for faster load
- OPT-M7/M8/S2 — GC-churn fixes (wake/arc drawers hoisted out of per-frame closures, scratch arrays for storm ship-lists + ship-collision set), HUD/dock/tavern/fleet strings rebuilt at 10 Hz (`HUD_TEXT_INTERVAL_MS`) instead of per frame, swap-pop replaces `splice` in cannonball/loot loops (optimize.md M7, M8, S2)
- OPT-M1–M4 — `dist2` squared-compare sweep (AI scans, ship-collision pair gate, cannonball/loot/port hit tests, minimap range test, dock scan, tower gates), `checkIsland` per-island bounding pre-test, staggered AI target acquisition (`AI_SCAN_INTERVAL_S`), cached navy line-of-sight (`LOS_CHECK_INTERVAL_S`) (optimize.md M1–M4)
- EMPIRE-1 — gated prize commissioning (repair hull + crew to minimum at the port menu before a towed prize becomes a runner, replacing instant conversion) and finite port stock (depletes on player purchase, replenished by merchant AI deliveries, previously-dormant cargo-assignment code now actually wired up)
- OPT-B2 — shared `scene.nearbyPorts` list: the six per-frame all-924-port loops (dock scan, tower placement/fire, capture regen, minimap, cannonball port hits, merchant pickPort) now iterate near-player ports only (optimize.md B2)
- SC1 — save coverage expanded: missions, Leviathan (persists dead, doesn't respawn), fleet organization, derelict purchases (all-additive, old saves still load)
- WD1 — wind strength now breathes (±15% via two slow incommensurate sine waves, placeholder amplitude), applied to player/AI/escorts/runners alike; wind *direction* shifting already existed, so that doc item was stale
- Owned-port cap removed (doc VI: "should remove the limit on how many ports you can own") — `MAX_OWNED_PORTS` constant kept unused in case a soft cap comes back
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

## Bugs — resolved on deeper inspection (correction to the previous pass)

A closer code read found most of these already fixed — several carry inline comments explicitly tagged `DOC-V` / `MW-10` / `CQ (doc)`, meaning they were deliberately closed against this same bug list at some point after the doc was last updated:

- **Islands spilling off the mini-map border** — Fixed. `MiniMap.js` draws into a circle-masked graphics object ("so nothing spills past the rim").
- **Small islands generating inside/on top of mainlands** — Fixed. `WorldGen.js` seeds every already-placed feature into `placed[]` per region so "a sub-cluster never overlaps the mainland or its neighbours."
- **Lightning has no rain visual paired with it** — Fixed, explicitly tagged: "lightning always reads WITH rain — a streak burst around the bolt itself."
- **Bounty arrow disappearing too early** — Fixed. `BOUNTY_ARROW_RANGE` (4500px) is far past minimap range (1350px); comment confirms "it hides only once ON the actual screen."
- **No highlight marker for the hunted pirate on the minimap** — Fixed, tagged `DOC-V`: red double-ring over live targets in range, rim dot pointing at the nearest one beyond it.
- **Towed ships not visible** — Fixed. `GameScene.js` draws every ship in `this.tows` as a real hull each frame, comment: "captured prizes trailing the player (drawn as real hulls, not a blob)."
- **Owned/captured ports blocking docking during combat** — Fixed. The in-combat dock block explicitly excludes `owner === 'player'` ports.
- **Captured ships showing as dinghies when they become runners** — Fixed. `RunnerSystem.js` stamps the runner with the source ship's actual `tier`, not a hardcoded Dinghy.
- **Cyclone escape (doc: should require going around like an island, immediate death below half health)** — Partially resolved, design evolved differently: pull force ramps from gentle at the rim to severe at the eye (escapable if you react early), with hull damage on a per-ship cooldown while inside the eye radius. Not literally "instant death below 50% hull," but addresses the same complaint (can't be trapped inescapably). Flagging as a design decision to confirm rather than a bug.

## Bugs — still open, need input to proceed

None currently. Reef generation and the blue-circle suicide crash are both confirmed fixed (team-verified; no dedicated commit message found to cite, so noting the source is verification rather than a code citation).

## Future Features (from doc, not yet built)

- Ironman / hardcore save mode
- Full resource list beyond the current six commodities
- Regional/cultural ship types (Viking, Chinese, etc.) with matching island/base theming (M9) — ship type driven by the home port's culture
- Numeric tuning pass: capture loot %, repair costs, cannon-tower stats, bounty reward/range — tier table has real numbers now but is still tagged PLACEHOLDER pending live feel-testing
- Deeper tavern/mission integration with achievements and culture
- Multiplayer (early research only, per doc — no implementation)
- Slave trading (listed in doc's idea list, unbuilt)
- Send ships only to explored ports (partially covered by FM1's explored-only routing for runners; not yet a player-wide rule)

## Open rulings (pick by number, e.g. "R1-1")

- **R1 — Tier-5 name** (doc "Man-o'-War" vs code "Galleon"): 1) keep Galleon, edit doc · 2) rename code to Man-o'-War · 3) both: Galleon stays tier 5, Man-o'-War becomes a new tier between Galleon and Leviathan (7 tiers, rebalances tier table)
- **R2 — Camera zoom** (doc: manual zoom only outside battle; code: always manual, battle force-zoom overrides): 1) keep code, update doc wording · 2) match doc: lock manual zoom during battle
- **R3 — Stale design doc** (tags/bug list/sections outdated vs code): 1) Carl/Noah hand-edit the doc, roadmap stays the truth ledger · 2) Fable drafts a corrected doc revision to paste in · 3) leave doc as historical intent, Conflicts section is the permanent diff
- **R4 — Cyclone escape** (doc: inescapable + instant death <50% hull; code: ramped pull, escapable early, cooldown damage in eye): 1) confirm evolved design, close flag · 2) match doc literally · 3) keep ramp, add <50%-hull death inside the eye only
- **R5 — Producer-port passive trickle** (currently delivery-only restock): 1) own-commodity regen %/min toward cap — EMPIRE-2's designed answer, confirming folds it into that build · 2) delivery-only forever (buyouts brutal, supply chains dominant) · 3) trickle for producers only (in practice = option 1, EMPIRE-2 already limits regen to own resource)
- **R6 — Ironman mode**: 1) simple flag: save on dock only, no manual saves, delete on death · 2) hard: also delete on load + exports disabled (no save-scumming; conflicts with SV1 exports) · 3) defer until SV1 slots land
- **R7 — Resource list expansion** (six commodities today): 1) stay at six until EMPIRE-2 proves the loop · 2) expand to doc's full list now (needs port-type source mapping per good) · 3) add 2-3 high-value low-volume luxury/illicit goods only
- **R8 — Cultural ship types** (doc M9): 1) cosmetic first (palette + name flavor by home-port culture) · 2) full stat variants + island theming · 3) defer post-EMPIRE, bundle with achievements/culture integration
- **R9 — Explored-only sending beyond runners**: 1) adopt player-wide now (FM1 machinery exists) · 2) keep runners-only, revisit when the next send-ships feature appears (EMPIRE-4 auto-sell inherits it anyway)
- **R10 — Doc idea-list "slave trading"**: 1) omit · 2) reskin slot as generic contraband smuggling (illegal cargo, navy heat) · 3) as doc lists it — content/tone call for Carl + Noah

External flags also awaiting rulings (tracked in their PRDs/PRs, listed for one-stop visibility): E1/E3/E4 (empire-economy PRD), SV-A/SV-B/SV-C (PR #48 save organization), M-A/M-B (#27 mission destinations).

## Open design questions

- Producer-type ports (their own sourceCommodity) currently only restock via merchant delivery, same as any other port — no passive trickle for producing their own good. Flagged during EMPIRE-1b as a default, not a locked decision.
