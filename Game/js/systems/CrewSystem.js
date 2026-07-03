// ── systems/CrewSystem.js ──
// Crew is a ship STAT (not a commodity): more crew above the tier's minimum gives
// a speed bonus and a faster reload, both capped; below the minimum the ship is
// understaffed (a flat speed penalty + fewer broadside balls — see ShipTiers).
// Crew is bought for gold at ports (cheaper at a Trading Hub).
//
// Per-crew rates + caps come from the ship's tier via ShipTiers (Dinghy ~1.5%/crew
// → Leviathan ~0.4%/crew). The global helpers crewSpeedMult / crewReloadMult are
// read by GameScene movement and Combat.fire. The hire action is driven by the
// dock menu key (handled centrally in GameScene, like repair/restock).

// linear crew bonus (each crew adds an equal share), capped at CREW_BONUS_CAP
function crewBonusFraction(ship){
  const rate = (typeof ShipTiers !== 'undefined') ? ShipTiers.crewBonusRate(ship) : CREW_SPEED_PER;
  const base = (typeof ShipTiers !== 'undefined') ? ShipTiers.minCrew(ship) : CREW_DEFAULT;
  const over = Math.max(0, (ship.crew || 0) - base);     // only crew ABOVE the minimum gives a bonus
  return Math.min(CREW_BONUS_CAP, over * rate);
}
function crewSpeedMult(ship){
  let m = 1 + crewBonusFraction(ship);
  if (typeof ShipTiers !== 'undefined' && ShipTiers.understaffed(ship)) m *= 0.7;   // understaffed: −30% speed
  return m;
}
function crewReloadMult(ship){ return 1 - crewBonusFraction(ship); }   // <1 = faster reload

const CrewSystem = {
  init(scene){
    // crew is normally stamped by ShipTiers.apply on spawn; only default if missing
    if (typeof scene.player.crew !== 'number') scene.player.crew = CREW_DEFAULT;
  },

  // hire one crew at the docked port (cheaper at a Trading Hub), capped at the
  // ship tier's max crew capacity. Spends from the bank.
  hireOne(scene, port){
    const pl = scene.player;
    const cap = (typeof ShipTiers !== 'undefined') ? ShipTiers.maxCrew(pl) : CREW_MAX;
    if ((pl.crew || 0) >= cap){ scene.flashPopup(pl.x, pl.y, 'CREW FULL', 0xE0503A); return; }
    const spec = port && (typeof PORT_TYPES !== 'undefined') && PORT_TYPES[port.type];
    const cost = Math.round(CREW_HIRE_COST * (spec && spec.crewDiscount ? 0.6 : 1));
    if (typeof BankSystem !== 'undefined' && BankSystem.spend(scene, cost)){
      pl.crew = (pl.crew || 0) + 1;
      scene.flashPopup(pl.x, pl.y - 20, '+1 CREW', 0x8AAAC8);
    } else scene.flashPopup(pl.x, pl.y, 'NO GOLD', 0xE0503A);
  },
};
