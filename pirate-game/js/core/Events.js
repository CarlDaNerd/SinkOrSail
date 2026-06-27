// ── core/Events.js ──
// Canonical event names for the cross-feature event bus. Producers emit on
// scene.events; any feature subscribes in its init(). The emitter never knows
// its listeners, so reacting to an event is purely additive — e.g. a kill is
// emitted once by Combat, and loot / faction standing / bounties each react
// without Combat referencing them.
//
// Usage:
//   emit:      scene.events.emit(EV.SHIP_SUNK, { ship, by });
//   subscribe: scene.events.on(EV.SHIP_SUNK, e => { ... });  // in a system init()
//
// Keep events for REACTIONS multiple features care about. Tight ordered flow
// (movement -> collision) stays as direct calls — don't event-ify everything.
const EV = {
  SHIP_SUNK:     'ship:sunk',      // { ship, by }            — Combat.onHit at hull<=0
  SHIP_HIT:      'ship:hit',       // { ship, by, amount }    — Combat.onHit
  DOCK_ENTERED:  'dock:entered',   // { port }                — GameScene dock flow
  SHIP_BOARDED:  'ship:boarded',   // { target }              — boarding (M4)
  SHIP_CAPTURED: 'ship:captured',  // { ship }                — capture (M5)
  SHIP_DOCKED:   'ship:docked',    // { ship, port }          — docks (MD)
  SHIP_UNDOCKED: 'ship:undocked',  // { ship, port }          — docks (MD)
  TRADE:         'trade',          // { port, commodity, side, qty, gold } — port economy (M8)
  PORT_DEFENSE_TRIGGERED:'port:defense', // { port }          — cannon towers fire (M8)
  PORT_CAPTURED: 'port:captured',  // { port }                — port capture (replaces home base)
  PRIZE_DELIVERED:'prize:delivered',// { ship, port }         — towed prize reached an owned port (M5 runners)
  WEATHER_CHANGED:'weather:changed',// { type }               — weather (M11)
};
