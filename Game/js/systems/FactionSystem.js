// ── systems/FactionSystem.js ──
// Navy standing (the "undercover" meter) + witnessing (handoff §9).
// A crime = hitting a NON-pirate within navy line-of-sight; pirate-hunting is
// lawful and never lowers standing. Crimes out of navy sight go unseen — the
// entire basis of the undercover playstyle.
const FactionSystem = {
  navyHostile(scene){ return scene.navyStanding <= P.navyThresh; },

  // standing recovers toward 0 when not committing crimes
  recoverStanding(scene, dts){
    if (scene.navyStanding < 0) scene.navyStanding = Math.min(0, scene.navyStanding + P.navyRecover*dts);
  },

  // crime witnessed by any navy within sight? drops standing (1.5s grace window
  // so one incident doesn't re-penalize every volley).
  reportCrime(scene, x, y){
    const now = scene.time.now/1000;
    if (scene._lastCrimeAt !== undefined && now - scene._lastCrimeAt < 1.5){
      // still register awareness (keeps them hostile) but don't re-penalize
      for (const s of scene.ships){ if (s.faction === 'navy' && s.alive && Visibility.canSee(scene, s.x, s.y, x, y, P.navySight)){ s.hostileToPlayer = true; return; } }
      return;
    }
    for (const s of scene.ships){
      if (s.faction !== 'navy' || !s.alive) continue;
      if (Visibility.canSee(scene, s.x, s.y, x, y, P.navySight)){
        scene.navyStanding = Math.max(-100, scene.navyStanding - P.crimePenalty);
        scene._lastCrimeAt = now;
        s.hostileToPlayer = true;
        scene.flashPopup(x, y, 'WITNESSED', 0xE0503A);
        return;
      }
    }
  },
};
