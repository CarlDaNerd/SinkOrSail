// ── world/Port.js ── (extended by MD)
// A port: a world point you can dock at. MD adds DOCK SLOTS — 1-5 berths that
// the player or a bot ship can occupy. Slot count will be driven by port type
// once M8 lands; until then each port is given a count at construction.
//
// port.docks = [{ id, dx, dy, occupantId|null }]
//   dx/dy are slot offsets from the port centre (so berths sit side by side
//   along the quay); world position = (port.x + dx, port.y + dy).
class Port {
  constructor(x, y, name, slots){
    this.x = x; this.y = y; this.name = name || 'Port';
    this.id = 'port_' + (Port._n = (Port._n || 0) + 1);
    this.slotCount = Math.max(1, Math.min(5, slots || 1));
    this.docks = [];
    for (let i = 0; i < this.slotCount; i++){
      // fan the berths out along a short quay line near the port marker
      const spread = (i - (this.slotCount - 1) / 2) * 34;
      this.docks.push({ id: this.id + '_d' + i, dx: spread, dy: 28, occupantId: null });
    }
  }
}

// ── Docks helper ── slot occupancy for ports (player or bot ships)
const Docks = {
  // first free slot on a port, or null if full
  freeSlot(port){ for (const d of port.docks) if (d.occupantId === null) return d; return null; },
  isFull(port){ return this.freeSlot(port) === null; },
  occupiedCount(port){ let n = 0; for (const d of port.docks) if (d.occupantId !== null) n++; return n; },

  // try to dock a ship (or the player) into a free slot. ship may be the player
  // object or a bot ship; both carry an id. Returns the slot or null if full.
  occupy(scene, port, ship){
    const slot = this.freeSlot(port);
    if (!slot) return null;
    slot.occupantId = ship.id;
    ship.dockedAt = port.id; ship.dockSlot = slot.id;
    if (ship.faction !== 'player') scene.events.emit(EV.SHIP_DOCKED, { ship, port });
    return slot;
  },

  // free whatever slot a ship holds on a port
  release(scene, port, ship){
    for (const d of port.docks){ if (d.occupantId === ship.id){ d.occupantId = null; break; } }
    ship.dockedAt = null; ship.dockSlot = null;
    if (ship.faction !== 'player') scene.events.emit(EV.SHIP_UNDOCKED, { ship, port });
  },

  // free any slot held by a ship (e.g. on death), across all ports
  releaseAnywhere(scene, ship){
    for (const port of scene.navyPorts){
      for (const d of port.docks){ if (d.occupantId === ship.id){ d.occupantId = null; } }
    }
    ship.dockedAt = null; ship.dockSlot = null;
  },

  // world position of a slot
  slotPos(port, slot){ return { x: port.x + slot.dx, y: port.y + slot.dy }; },
};
