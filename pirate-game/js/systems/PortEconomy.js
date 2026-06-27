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
      for (let i = 0; i < n; i++){ const a = prng() * Math.PI * 2; port.towers.push({ x: port.x + Math.cos(a) * 70, y: port.y + Math.sin(a) * 70, cd: 0 }); }
    }
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

  // player buys `qty` of a commodity from the port (gold from bank -> hold)
  buy(scene, port, commodity, qty){
    const pl = scene.player, unit = this.sellPrice(port, commodity);
    const room = Cargo.free(pl.hold);
    const canAfford = Math.floor((pl.bank || 0) / unit);
    const take = Math.max(0, Math.min(qty, room, canAfford));
    if (take <= 0) return 0;
    BankSystem.spend(scene, take * unit); Cargo.add(pl.hold, commodity, take);
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
    scene.events.emit(EV.TRADE, { port, commodity, side:'buy', qty:give, gold:give * unit });
    return give;
  },
};
