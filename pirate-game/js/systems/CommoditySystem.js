// ── systems/CommoditySystem.js ── (MC)
// The commodity + cargo-hold foundation the economy sits on. Plugs into the
// registry. Commodities are TRADE-ONLY goods (lumber/cloth/iron/rum/sugar/
// tobacco); gold is currency and ammo/crew are ship stats — none of those are
// commodities. Each island produces one fixed commodity (deterministic); a
// merchant carries one, shown as a sail glyph; sinking a merchant drops that
// commodity (others drop gold). Holds have a capacity that ship type/upgrades
// scale (M1/M2). This file owns the `Cargo` helpers + the island-commodity
// mapping; CommoditySystem itself is a thin registry hook (init only for now).
//
// State slice: none of its own on the scene — cargo lives on each ship as
// ship.hold = { capacity, items:{ commodity:qty } }; merchants also get
// ship.cargo = { commodity, qty } as their single freight.

// ── Cargo hold helpers (pure-ish; operate on a ship's hold) ──
const Cargo = {
  make(capacity){ return { capacity: capacity || HOLD_CAPACITY_DEFAULT, items: {} }; },
  used(hold){ let n = 0; for (const k in hold.items) n += hold.items[k]; return n; },
  free(hold){ return Math.max(0, hold.capacity - this.used(hold)); },

  // add up to free capacity; returns the amount actually added
  add(hold, commodity, qty){
    const room = this.free(hold), take = Math.max(0, Math.min(qty, room));
    if (take > 0) hold.items[commodity] = (hold.items[commodity] || 0) + take;
    return take;
  },
  // remove up to held; returns the amount actually removed
  remove(hold, commodity, qty){
    const have = hold.items[commodity] || 0, take = Math.max(0, Math.min(qty, have));
    if (take > 0){ hold.items[commodity] = have - take; if (hold.items[commodity] <= 0) delete hold.items[commodity]; }
    return take;
  },
  qty(hold, commodity){ return hold.items[commodity] || 0; },
};

const CommoditySystem = {
  // deterministic commodity for an island: pure function of (WORLD_SEED, island
  // center) so the same island always produces the same good, visit-order
  // independent. "Statistically common within ~4x4" falls out of the spread;
  // no hard coverage guarantee (per design).
  commodityForIsland(island){
    if (island._commodity) return island._commodity;
    const h = hashCoords(Math.round(island.cx), Math.round(island.cy), (WORLD_SEED ^ 0x5bd1e995) >>> 0);
    island._commodity = COMMODITIES[h % COMMODITIES.length];
    return island._commodity;
  },

  // nearest loaded island to a point (used to pick a merchant's cargo at spawn)
  nearestIslandCommodity(scene, x, y){
    let best = null, bd = Infinity;
    for (const is of scene.islands){ const d = Math.hypot(is.cx - x, is.cy - y); if (d < bd){ bd = d; best = is; } }
    return best ? this.commodityForIsland(best) : COMMODITIES[0];
  },

  // registry hook: ensure the player has a hold (idempotent across R-reset)
  init(scene){
    const pl = scene.player;
    if (!pl.hold) pl.hold = Cargo.make(HOLD_CAPACITY_DEFAULT);
  },
};
