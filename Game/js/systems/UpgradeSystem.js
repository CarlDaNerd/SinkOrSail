// ── systems/UpgradeSystem.js ── (M-up)
// Bank-funded player progression. Three purchase tracks, all paid from pl.bank:
//   1. Sail material — raises top speed (a multiplier the mover applies).
//   2. Cannon type   — raises range = projectile lifetime (a mult Combat applies).
//                      Cannon COUNT is owned by ship tier; we never touch it.
//   3. Ship tier     — spend ShipTiers.get(next).buy to advance to the next hull.
// Owned state lives on pl.upgrades = { sail, cannon } (tier indices into the
// tables below). Ship tier owns itself via pl.tier (numeric ShipTiers). Placeholders.

// placeholder — feel-tune freely
const UPGRADE_SAIL = [
  { mult:1.00, cost:0    },   // L0 — stock canvas (owned, free)
  { mult:1.06, cost:800  },   // L1
  { mult:1.12, cost:2000 },   // L2
  { mult:1.18, cost:4500 },   // L3
  { mult:1.24, cost:9000 },   // L4 — max
];

// placeholder — feel-tune freely
const UPGRADE_CANNON = [
  { mult:1.00, cost:0    },   // L0 — stock guns (owned, free)
  { mult:1.12, cost:900  },   // L1
  { mult:1.24, cost:2200 },   // L2
  { mult:1.36, cost:4800 },   // L3
  { mult:1.48, cost:9500 },   // L4 — max
];

const UpgradeSystem = {
  // ensure the owned-state slice exists (idempotent — keep prior levels)
  init(scene){
    const pl = scene.player;
    if (!pl.upgrades) pl.upgrades = { sail:0, cannon:0 };
    if (typeof pl.upgrades.sail !== 'number')   pl.upgrades.sail = 0;
    if (typeof pl.upgrades.cannon !== 'number') pl.upgrades.cannon = 0;
  },

  // ── multipliers the parent reads each frame ──
  speedMult(scene){ return UPGRADE_SAIL[this._lvl(scene, 'sail')].mult; },
  rangeMult(scene){ return UPGRADE_CANNON[this._lvl(scene, 'cannon')].mult; },

  // current owned tier index for a track (clamped to its table)
  _lvl(scene, track){
    const u = scene.player.upgrades || {};
    const max = (track === 'sail' ? UPGRADE_SAIL : UPGRADE_CANNON).length - 1;
    return Math.max(0, Math.min(max, u[track] || 0));
  },

  // ── purchases ──
  buySail(scene){ return this._buyTrack(scene, 'sail', UPGRADE_SAIL, 'Sails'); },
  buyCannon(scene){ return this._buyTrack(scene, 'cannon', UPGRADE_CANNON, 'Cannons'); },

  // shared track-buy: advance one tier if affordable & not maxed
  _buyTrack(scene, track, table, noun){
    const pl = scene.player;
    if (!pl.upgrades) pl.upgrades = { sail:0, cannon:0 };       // ensure slice (survives R-reset)
    const lvl = this._lvl(scene, track), next = lvl + 1;
    if (next >= table.length){
      scene.flashPopup(pl.x, pl.y - 20, noun + ' MAXED', 0x8AAAC8); return false;
    }
    const cost = table[next].cost;
    if (!BankSystem.spend(scene, cost)){
      scene.flashPopup(pl.x, pl.y - 20, 'NEED ' + cost + 'g', 0xE0503A); return false;
    }
    pl.upgrades[track] = next;
    scene.flashPopup(pl.x, pl.y - 20, noun + ' L' + next + ' (-' + cost + 'g)', 0x4CA84C);
    return true;
  },

  // buy the next ship tier: cost = ShipTiers.get(next).buy; ShipTiers.setTier heals
  // to the new max and clamps existing crew into the new cap.
  buyShip(scene){
    const pl = scene.player, cur = pl.tier || TIER_MIN, nextTier = cur + 1;
    if (typeof ShipTiers === 'undefined' || nextTier > TIER_MAX){
      scene.flashPopup(pl.x, pl.y - 20, 'TOP SHIP TIER', 0x8AAAC8); return false;
    }
    const spec = ShipTiers.get(nextTier), cost = spec.buy;
    if (!BankSystem.spend(scene, cost)){
      scene.flashPopup(pl.x, pl.y - 20, 'NEED ' + cost + 'g', 0xE0503A); return false;
    }
    ShipTiers.setTier(scene, pl, nextTier);
    scene.flashPopup(pl.x, pl.y - 20, spec.name.toUpperCase() + ' (-' + cost + 'g)', 0xF0C840);
    return true;
  },

  // ── dock-menu labels (short strings the parent prints) ──
  sailLabel(scene){ return this._trackLabel(scene, 'sail', UPGRADE_SAIL, 'Sails'); },
  cannonLabel(scene){ return this._trackLabel(scene, 'cannon', UPGRADE_CANNON, 'Cannons'); },

  _trackLabel(scene, track, table, noun){
    const lvl = this._lvl(scene, track), next = lvl + 1;
    if (next >= table.length) return noun + '  MAX';
    return noun + '  L' + lvl + '->L' + next + '  - ' + table[next].cost + 'g';
  },

  shipLabel(scene){
    const cur = scene.player.tier || TIER_MIN, nextTier = cur + 1;
    if (typeof ShipTiers === 'undefined' || nextTier > TIER_MAX) return 'Top ship tier';
    const spec = ShipTiers.get(nextTier);
    return 'Buy ' + spec.name + '  - ' + spec.buy + 'g';
  },
};
