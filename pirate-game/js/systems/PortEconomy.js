// ── systems/PortEconomy.js ── (M8)
// Port types + the commodity price model. Two layers:
//   1. type rule  — source ports discount their commodity; Frontier buys all
//                   high; Trading Hub gives 2x merchant loot + cheaper crew.
//   2. seeded demand — each port has a stable per-commodity wobble so profitable
//                   buy-low/sell-high routes exist and persist across reloads.
//
// priceFor(port, commodity, side):
//   side 'sell' = the port SELLS to you (your buy price)
//   side 'buy'  = the port BUYS from you (your sell price = sellPrice * SELL_SPREAD)
//
// All magnitudes are first-pass placeholders (constants.js) — tune to feel.
const PortEconomy = {
  // assign a type + defense + slots + seeded demand to a port. `prng` is the
  // enemy/event PRNG so it's deterministic per run.
  assignType(port, type, prng){
    const spec = PORT_TYPES[type];
    port.type = type;
    port.sourceCommodity = spec.source || null;
    port.seed = Math.floor(prng() * 1e9);
    // capture state: ports have hull scaled by size; owner starts as the world
    port.maxHull = PORT_HULL_BASE + (port.slotCount || 1) * PORT_HULL_PER_DOCK;
    port.hull = port.maxHull;
    port.owner = 'world';                 // 'world' | 'player'
    port.lastHitAt = -999;
    // tower presence by the type's odds; tower positions ring the port
    port.hasTowers = prng() < spec.towerChance;
    port.towers = [];
    if (port.hasTowers){
      const n = 1 + Math.floor(prng() * 2);                 // 1-2 towers
      // I18-4: towers must stand on LAND, but island chunks may not be loaded
      // at gen time — store a deterministic jitter and place lazily on the
      // first DefenseSystem tick that can see this port's island.
      for (let i = 0; i < n; i++) port.towers.push({ x: null, y: null, j: prng(), cd: 0 });
    }
    // PF1: some ports hold an unmanned derelict hull for sale at the quay
    // (doc II: 'unmanned docked ships you can buy'). Deterministic per run;
    // bought hulls join your tow line (feeds the swap/runner/delivery pipes).
    // NOTE: purchase is SESSION-ONLY — port state isn't saved, so a bought
    // derelict reappears next boot (flagged for SaveSystem).
    port.derelict = null;
    if (prng() < 0.25){
      const dTier = 1 + Math.floor(prng() * 3);                    // T1-T3 PLACEHOLDER
      port.derelict = { tier: dTier, price: (typeof SHIP_TIERS !== 'undefined' && ShipTiers.get(dTier).buy) ? Math.round(ShipTiers.get(dTier).buy * 0.55) : dTier * 300 };
    }
    // EMPIRE-1b: finite stock per commodity, seeded at a starting fraction of cap;
    // depleted by player purchases, replenished by docking merchants (AI.tradeRoute)
    // and by player sales. PLACEHOLDER cap/seed — feel-tune.
    port.stock = {};
    for (const c of COMMODITIES) port.stock[c] = Math.round(PORT_STOCK_CAP * PORT_STOCK_START_FRAC);
    // navy/privateer presence
    port.navy = spec.navy === 'always' ? true : (spec.navy === 'maybe' ? prng() < 0.5 : false);
    port.privateer = (!port.navy && type === 'IronMine') ? prng() < 0.8 : false;
    // precompute a per-commodity demand wobble in [1-b, 1+b]
    const b = SEEDED_DEMAND_BOUNDS, dem = {};
    let s = port.seed >>> 0;
    for (const c of COMMODITIES){ s = (Math.imul(1664525, s) + 1013904223) >>> 0; dem[c] = 1 + (s / 4294967296 * 2 - 1) * b; }
    port.demand = dem;
    return port;
  },

  // the port's SELL price for a commodity (what you pay to buy from it)
  sellPrice(port, commodity){
    let p = BASE_PRICE[commodity] * (port.demand ? port.demand[commodity] : 1);
    if (port.sourceCommodity === commodity) p *= SOURCE_PORT_DISCOUNT;   // source port = cheap here
    return Math.max(1, Math.round(p));
  },

  // the port's BUY price for a commodity (what it pays you to sell)
  buyPrice(port, commodity){
    let p = this.sellPrice(port, commodity) * SELL_SPREAD;
    if (PORT_TYPES[port.type] && PORT_TYPES[port.type].buyBonus) p = BASE_PRICE[commodity] * (port.demand ? port.demand[commodity] : 1) * FRONTIER_BUY_BONUS;
    return Math.max(1, Math.round(p));
  },

  priceFor(port, commodity, side){ return side === 'buy' ? this.buyPrice(port, commodity) : this.sellPrice(port, commodity); },

  // EMPIRE-1b: add stock to a port (capped), used by merchant deliveries (AI.tradeRoute)
  // and player sales. Returns the amount actually added.
  deliver(port, commodity, qty){
    if (!port.stock) port.stock = {};
    const have = port.stock[commodity] || 0, room = Math.max(0, PORT_STOCK_CAP - have);
    const add = Math.max(0, Math.min(qty, room));
    port.stock[commodity] = have + add;
    return add;
  },

  // player buys `qty` of a commodity from the port (gold from bank -> hold)
  buy(scene, port, commodity, qty){
    const pl = scene.player, unit = this.sellPrice(port, commodity);
    const room = Cargo.free(pl.hold);
    const canAfford = Math.floor((pl.bank || 0) / unit);
    const inStock = (port.stock ? port.stock[commodity] : null) || 0;   // EMPIRE-1b: finite stock caps purchase
    const take = Math.max(0, Math.min(qty, room, canAfford, inStock));
    if (take <= 0) return 0;
    BankSystem.spend(scene, take * unit); Cargo.add(pl.hold, commodity, take);
    if (port.stock) port.stock[commodity] = Math.max(0, inStock - take);
    scene.events.emit(EV.TRADE, { port, commodity, side:'sell', qty:take, gold:take * unit });
    return take;
  },

  // player sells `qty` of a commodity to the port (hold -> gold to bank)
  sell(scene, port, commodity, qty){
    const pl = scene.player, unit = this.buyPrice(port, commodity);
    const have = Cargo.qty(pl.hold, commodity);
    const give = Math.max(0, Math.min(qty, have));
    if (give <= 0) return 0;
    Cargo.remove(pl.hold, commodity, give); BankSystem.credit(scene, give * unit);
    this.deliver(port, commodity, give);   // EMPIRE-1b: sold goods join the port's physical stock
    scene.events.emit(EV.TRADE, { port, commodity, side:'buy', qty:give, gold:give * unit });
    return give;
  },
};
