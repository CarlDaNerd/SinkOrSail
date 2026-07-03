// ── entities/Cannonball.js ──
// One cannonball in flight. dt-scaled motion, seconds-based life (handoff §10).
// owner = firing ship id (skip self); ownerFaction = for friendly-fire rules.
const Cannonball = {
  create(x, y, vx, vy, owner, ownerFaction){ return { x, y, vx, vy, owner, ownerFaction, age:0 }; },
};
