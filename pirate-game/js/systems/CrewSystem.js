// ── systems/CrewSystem.js ──
// Crew is a ship STAT (not a commodity): more crew above the default gives a
// speed bonus and a faster reload, both capped. Bought for gold at ports
// (cheaper at a Trading Hub). The HUD already reserves a crew readout.
//
// Global helpers crewSpeedMult / crewReloadMult are read by GameScene movement
// and Combat.fire. CrewSystem is the registry hook (ensures pl.crew exists +
// wires the hire key at dock — uses key 5).

// Crew bonus is LINEAR (each crew adds an equal amount) at a per-crew rate set
// by the ship's TIER (Dinghy ~1.5%/crew → Leviathan ~0.4%/crew), capped at
// CREW_BONUS_CAP total. Below min crew the ship is understaffed: a flat speed
// penalty on top (and only some cannons fire — see ShipTier.cannonsUsable).
function crewBonusFraction(ship){
  const rate = (typeof ShipTier !== 'undefined') ? ShipTier.crewBonusRate(ship) : CREW_SPEED_PER;
  const raw = (ship.crew || 0) * rate;
  return Math.min(CREW_BONUS_CAP, raw);
}
function crewSpeedMult(ship){
  let m = 1 + crewBonusFraction(ship);
  if (typeof ShipTier !== 'undefined' && ShipTier.understaffed(ship)) m *= 0.7;   // understaffed: −30% speed
  return m;
}
function crewReloadMult(ship){ return 1 - crewBonusFraction(ship); }   // <1 = faster reload

const CrewSystem = {
  init(scene){
    // crew is set by ShipTier on spawn; only default if somehow missing
    if (typeof scene.player.crew !== 'number') scene.player.crew = CREW_DEFAULT;
    scene._crewKey = scene.input.keyboard.addKey('FIVE');
  },

  // hire one crew at the docked port (cheaper at a Trading Hub), capped at the
  // ship tier's max crew capacity
  hireOne(scene, port){
    const pl = scene.player;
    const cap = (typeof ShipTier !== 'undefined') ? ShipTier.maxCrew(pl) : CREW_MAX;
    if (pl.crew >= cap){ scene.flashPopup(pl.x, pl.y, 'CREW FULL', 0xE0503A); return; }
    const spec = port && PORT_TYPES[port.type];
    const cost = Math.round(CREW_HIRE_COST * (spec && spec.crewDiscount ? 0.6 : 1));
    if (typeof BankSystem !== 'undefined' && BankSystem.spend(scene, cost)){
      pl.crew++; scene.flashPopup(pl.x, pl.y - 20, '+1 CREW', 0x8AAAC8);
    } else scene.flashPopup(pl.x, pl.y, 'NO GOLD', 0xE0503A);
  },

  update(scene, dt, dts){
    if (scene.docked && scene._crewKey && Phaser.Input.Keyboard.JustDown(scene._crewKey)){
      this.hireOne(scene, scene.dockPort);
    }
  },
};
