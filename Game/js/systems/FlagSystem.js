// ── systems/FlagSystem.js ──
// False-colors mechanic: neutral | pirate (handoff §9). Raise/lower takes
// FLAG_RAISE_DELAY_S; locked during combat. Option B: the flag controls
// BELIEFS, not minds — lowering it does NOT call off a navy that already
// witnessed you. It fools ships that haven't yet made up their mind.
const FlagSystem = {
  // "in combat" = fired or been hit within FLAG_COMBAT_LOCK_S
  inCombat(scene){
    return (scene.time.now/1000 - Math.max(scene.player.lastFiredAt, scene.player.lastHitAt)) < P.flagCombatLock;
  },

  requestFlag(scene, f){
    if (this.inCombat(scene)) return false;                     // can't change colors mid-fight
    if (f === scene.flag && !scene.flagPending) return false;
    scene.flagPending = f; scene.flagChangeAt = scene.time.now/1000 + P.flagDelay;
    return true;
  },

  // applies the pending flag once the raise delay elapses; raising pirate
  // colors in navy sight is itself a witnessed event (standing hit + popup).
  resolveFlag(scene){
    if (scene.flagPending !== null && scene.time.now/1000 >= scene.flagChangeAt){
      scene.flag = scene.flagPending; scene.flagPending = null;
      if (scene.flag === 'pirate'){
        for (const s of scene.ships){ if (s.faction === 'navy' && s.alive && Visibility.canSee(scene, s.x, s.y, scene.player.x, scene.player.y, P.navySight)){ s.hostileToPlayer = true; } }
        const seen = scene.ships.some(s => s.faction === 'navy' && s.alive && Visibility.canSee(scene, s.x, s.y, scene.player.x, scene.player.y, P.navySight));
        if (seen){ scene.navyStanding = Math.max(-100, scene.navyStanding - P.crimePenalty); scene.flashPopup(scene.player.x, scene.player.y, 'COLORS SEEN', 0xE0503A); }
      }
    }
  },
};
