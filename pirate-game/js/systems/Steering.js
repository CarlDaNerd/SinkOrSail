// ── systems/Steering.js ──
// Reactive AI navigation (not pathfinding): keep ships off land and out of
// irons. Apply avoidLand first, then avoidIrons, to the desired heading before
// turning (handoff §8).
const Steering = {
  // if `heading` would drive the ship into land soon, fan out for the nearest clear bearing
  avoidLand(scene, s, heading){
    const probe = 110;                                          // look-ahead distance
    if (!this.headingBlocked(scene, s, heading, probe)) return heading;
    for (let off = 20; off <= 160; off += 20){
      const right = (heading + off)%360, left = (heading - off + 360)%360;
      const rClear = !this.headingBlocked(scene, s, right, probe);
      const lClear = !this.headingBlocked(scene, s, left, probe);
      if (rClear && lClear) return this.headingBlocked(scene, s, right, probe*0.6) ? left : right; // prefer more open side
      if (rClear) return right;
      if (lClear) return left;
    }
    return heading;                                             // boxed in — let collision handle it
  },

  headingBlocked(scene, s, heading, dist){
    const sin = Math.sin(heading*RAD), cos = Math.cos(heading*RAD);
    for (const step of [dist*0.5, dist]) if (Collision.checkIsland(scene, s.x + sin*step, s.y - cos*step, HULL_BEAM).hit) return true;
    return false;
  },

  // never let an AI ship park head-to-wind: nudge a no-go heading to the nearest
  // sailable edge on the side it's already leaning. Reads the LOCAL wind at the
  // ship (so a ship inside a cyclone's swirl steers against that wind, not the
  // distant ambient).
  avoidIrons(scene, s, heading){
    const wind = WindSystem.dirAt(scene, s.x, s.y);
    const wa = windOff(heading, wind);
    if (wa >= P.noGo) return heading;
    const rel = angleDiff(wind, heading);                       // near 0 = pointing into wind
    const edge = rel >= 0 ? P.noGo + 2 : -(P.noGo + 2);
    return (wind + edge + 360)%360;
  },
};
