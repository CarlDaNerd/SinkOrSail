// ── entities/Loot.js ──
// Glowing gold coin dropped on kill; value by faction. Collected by sailing
// within LOOT_COLLECT_RADIUS (restocks ammo). Expires after ~10s (handoff §10).
const Loot = {
  valueFor(faction){ return faction === 'pirate' ? 44 : faction === 'navy' ? 50 : faction === 'privateer' ? 40 : 28; },
  create(x, y, value){ return { x, y, value, age:0, life:10 }; },
};
