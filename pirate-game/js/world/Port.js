// ── world/Port.js ──
// Navy/privateer home port. Minimal in V1 (just a world point); the class
// exists to establish the pattern for the future port-economy systems (§17).
class Port {
  constructor(x, y, name){ this.x = x; this.y = y; this.name = name || 'Port'; }
}
