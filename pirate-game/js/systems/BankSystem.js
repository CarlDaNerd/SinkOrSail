// ── systems/BankSystem.js ── (M0)
// Persistent gold account. On-ship gold (pl.gold) is at risk: lost on sink or
// R-reset. Banked gold (pl.bank) survives. Docking sweeps on-ship gold into the
// bank; all docked transactions (repair, restock, and later upgrades/hiring/
// building) spend from the bank.
//
// "Persists" here = survives reset/sink in-memory now, and is the value a future
// save/account layer will serialize (see disk-save module, later). BankSystem
// owns no scene slice; it lives on the player as pl.bank.
const BankSystem = {
  init(scene){
    const pl = scene.player;
    if (typeof pl.bank !== 'number') pl.bank = 0;           // idempotent across R-reset
    // sweep on-ship gold into the bank whenever the player docks
    scene.events.on(EV.DOCK_ENTERED, () => this.deposit(scene));
  },

  // move all on-ship gold into the bank
  deposit(scene){
    const pl = scene.player;
    if (pl.gold > 0){
      const amt = pl.gold; pl.bank += amt; pl.gold = 0;
      scene.flashPopup(pl.x, pl.y - 20, '+' + amt + 'g BANKED', 0xF0C840);
    }
  },

  // spend from the bank; returns true if affordable
  spend(scene, amount){
    const pl = scene.player;
    if (pl.bank >= amount){ pl.bank -= amount; return true; }
    return false;
  },

  // credit the bank directly (e.g. bounty rewards paid on return)
  credit(scene, amount){ scene.player.bank += amount; },
};
