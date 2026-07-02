// ── systems/WeatherSystem.js ── (M11)
// One MOVING weather effect at a time, rolled every 2-5 minutes; each affects ALL ships.
// Wind DIRECTION is owned by WindSystem — weather layers gusts + cells on top. Types:
//   rain    — a following breeze: speeds every ship up (P.rainBoost) + gusts the wind
//             (P.rainGust); commoner the further you are from land. Ends on distance OR time.
//   storm   — a MOVING squall cell riding a front: drifts downwind, lightning strikes any ship
//             inside (P.stormChance → player sail break / bot hull hit), gusty wind.
//   cyclone — a MOVING vortex: spawns just outside minimap range upwind, rides the base wind,
//             swirls the LOCAL wind (cycloneDirAt → WindSystem.dirAt) and drags every ship toward
//             the eye; P.cycDmg% hull at the eye. Escapable by out-sailing the current.
//
// Gated by scene.extrasOn (the pause-menu checkbox) + the dev weatherOff flag. State slice:
// scene.weather = { active, nextAt, endsAt, data:{...} }. Movement reads speedMult(scene) for the
// rain boost; storms/cyclones set scene.wind.gust; storm sets player.sailBroken (port repair clears it).
const WeatherSystem = {
  init(scene){
    scene.weather = { active: null, nextAt: this._rollNext(scene), endsAt: 0, data: {} };
    scene.events.on(EV.DOCK_ENTERED, () => { scene.player.sailBroken = false; });
  },

  _rollNext(scene){
    const t = scene.time.now / 1000;
    return t + WEATHER_INTERVAL_MIN_S + scene.eprng() * (WEATHER_INTERVAL_MAX_S - WEATHER_INTERVAL_MIN_S);
  },

  // ship-speed multiplier the movement calc applies (rain gives a following breeze); 1 otherwise
  speedMult(scene){ return (scene.weather && scene.weather.active === 'rain') ? P.rainBoost : 1; },

  start(scene, type){
    const w = scene.weather, pl = scene.player, t = scene.time.now / 1000;
    w.active = type; w.data = {};
    if (type === 'rain'){
      w.endsAt = t + RAIN_DURATION_S; w.data.distance = 0;
      if (scene.wind) scene.wind.gust = P.rainGust;                 // rain freshens + gusts the wind
    } else if (type === 'storm'){
      w.endsAt = t + STORM_DURATION_S;
      w.data.cx = pl.x; w.data.cy = pl.y;                            // the squall forms over you, then drifts off downwind
      w.data.nextStrike = t + STORM_STRIKE_INTERVAL_S; w.data.flash = 0;
      if (scene.wind) scene.wind.gust = P.stormGust;
      if (typeof WindSystem !== 'undefined' && WindSystem.forceFront) WindSystem.forceFront(scene, STORM_TELEGRAPH_SHIFT);
    } else if (type === 'cyclone'){
      w.endsAt = t + CYCLONE_DURATION_S;
      const wf = scene.wind ? scene.wind.dir : P.windFrom, dsp = MINIMAP_RANGE + CYCLONE_SPAWN_MARGIN;
      w.data.cx = pl.x + Math.sin(wf * RAD) * dsp;                   // spawn UPWIND, just past minimap range → drifts in toward you
      w.data.cy = pl.y - Math.cos(wf * RAD) * dsp;
      if (typeof WindSystem !== 'undefined' && WindSystem.forceFront) WindSystem.forceFront(scene, CYCLONE_TELEGRAPH_SHIFT);   // the warning
      scene.flashPopup(pl.x, pl.y - 40, '⚠ CYCLONE FORMING', 0xB0A0E0);
    }
    else if (type === 'snow'){
      // DOC-VI snow: seed 5-20 stationary bobbing icebergs around the player;
      // they melt when the snow clears. Placement uses the gameplay PRNG (bergs
      // deal damage, so positions must be deterministic); NOTE: dev-forcing snow
      // therefore advances the gameplay PRNG, unlike dev ship spawns.
      w.endsAt = t + SNOW_DURATION_S;
      w.data.bergs = [];
      const n = SNOW_BERG_MIN + Math.floor(scene.eprng() * (SNOW_BERG_MAX - SNOW_BERG_MIN + 1));
      for (let i = 0; i < n; i++){
        const a = scene.eprng() * TAU, rr = 260 + scene.eprng() * (SNOW_FIELD_R - 260);
        w.data.bergs.push({ x: pl.x + Math.cos(a)*rr, y: pl.y + Math.sin(a)*rr,
                            r: SNOW_BERG_R_MIN + scene.eprng()*(SNOW_BERG_R_MAX - SNOW_BERG_R_MIN),
                            ph: scene.eprng() * TAU, hits: {} });   // hits: per-ship damage cooldown
      }
      scene.flashPopup(pl.x, pl.y - 40, '❄ SNOW — ICEBERGS', 0xCFE8F5);
    } else if (type === 'tsunami'){
      // DOC-VI tsunami: a wave that pushes every ship inside it TOWARD the nearest
      // island — never beaching (push stops at the coast), never damaging (RULED).
      w.endsAt = t + TSUNAMI_DURATION_S;
      w.data.cx = pl.x; w.data.cy = pl.y;                          // wave centered where it caught you
      scene.flashPopup(pl.x, pl.y - 40, '🌊 TSUNAMI', 0x6ED0E0);
    }
    if (w.active) scene.events.emit(EV.WEATHER_CHANGED, { type: w.active });
  },

  clear(scene){
    const w = scene.weather;
    w.active = null; w.data = {}; w.nextAt = this._rollNext(scene);
    if (scene.wind) scene.wind.gust = 1;                            // stop gusting the wind
    scene.events.emit(EV.WEATHER_CHANGED, { type: null });
  },

  update(scene, dt, dts){
    const w = scene.weather, pl = scene.player, t = scene.time.now / 1000;
    if (!scene.extrasOn || (typeof DEBUG !== 'undefined' && DEBUG.weatherOff)){ if (w.active) this.clear(scene); return; }   // off via pause-menu checkbox or the dev "disable weather" toggle
    if (!w.active){
      if (t >= w.nextAt){ this.start(scene, this._rollType(scene)); if (!w.active) w.nextAt = this._rollNext(scene); }
      return;
    }
    if (pl.hull <= 0){ this.clear(scene); return; }

    if (w.active === 'rain'){
      w.data.distance += pl.vel * dt;                              // travelled this front
      if (t >= w.endsAt || w.data.distance >= RAIN_DURATION_PX) this.clear(scene);

    } else if (w.active === 'snow'){
      const t = scene.time.now/1000;
      // snowfall flecks around the player (cheap, like the rain streaks)
      g.fillStyle(0xEAF4FA, 0.5);
      for (let i = 0; i < 50; i++){ const rx = pl.x + (Math.random() - 0.5)*1400, ry = pl.y + (Math.random() - 0.5)*900; g.fillCircle(rx, ry, 1.3); }
      // bergs: white cap over pale base, bobbing (visual only — RULED no drift)
      for (const b of (w.data.bergs || [])){
        const bob = Math.sin(t * SNOW_BOB_SPEED + b.ph) * SNOW_BOB_AMP;
        g.fillStyle(0xBFD8E8, 0.9);  g.fillCircle(b.x, b.y + bob, b.r);
        g.fillStyle(0xF2FAFF, 0.95); g.fillCircle(b.x - b.r*0.18, b.y + bob - b.r*0.18, b.r*0.62);
        g.lineStyle(1.5, 0x8FB4CC, 0.6); g.strokeCircle(b.x, b.y + bob, b.r);
      }
    } else if (w.active === 'tsunami'){
      // expanding concentric wave rings from the wave center — this ring set IS the
      // "visible tsunami art"; anything inside TSUNAMI_WAVE_R is being pushed
      const t = scene.time.now/1000, ph = (t * 0.5) % 1;
      for (let k = 0; k < 3; k++){
        const f = (ph + k/3) % 1, r = 200 + f * (TSUNAMI_WAVE_R - 200);
        g.lineStyle(4 * (1 - f) + 1, 0x6ED0E0, 0.5 * (1 - f) + 0.1);
        g.strokeCircle(w.data.cx, w.data.cy, r);
      }
      g.lineStyle(2, 0x6ED0E0, 0.25); g.strokeCircle(w.data.cx, w.data.cy, TSUNAMI_WAVE_R);
    } else if (w.active === 'storm'){
      this._updateStorm(scene, w.data, dt, dts, t);
      if (t >= w.endsAt) this.clear(scene);

    } else if (w.active === 'cyclone'){
      this._updateCyclone(scene, w.data, dt, t);
      if (t >= w.endsAt || Math.hypot(w.data.cx - pl.x, w.data.cy - pl.y) > CYCLONE_DESPAWN_DIST) this.clear(scene);

    } else if (w.active === 'snow'){
      this._updateSnow(scene, w.data, dt, t);
      if (t >= w.endsAt) this.clear(scene);                        // melt: bergs go with the weather slice

    } else if (w.active === 'tsunami'){
      this._updateTsunami(scene, w.data, dt, t);
      if (t >= w.endsAt) this.clear(scene);
    }

    // a broken sail keeps the player capped at half sail until a port repair
    if (pl.sailBroken && pl.sailState > STORM_BROKEN_SAIL_MAX_STATE) pl.sailState = STORM_BROKEN_SAIL_MAX_STATE;
  },

  // ── spawn weighting ── rain gets commoner the further you are from land; storm/cyclone are flat
  _rollType(scene){
    const far = Math.max(0, Math.min(1, this._distToLand(scene) / RAIN_FAR_FULL_PX));
    const wRain = WX_WEIGHT_RAIN_NEAR + (WX_WEIGHT_RAIN_FAR - WX_WEIGHT_RAIN_NEAR) * far;
    const entries = [['rain', wRain], ['storm', WX_WEIGHT_STORM], ['cyclone', WX_WEIGHT_CYCLONE], ['snow', WX_WEIGHT_SNOW]];
    // DOC-VI: tsunami only rolls within TSUNAMI_NEAR_LAND_PX of an island (doc rule)
    if (this._distToLand(scene) <= TSUNAMI_NEAR_LAND_PX) entries.push(['tsunami', WX_WEIGHT_TSUNAMI]);
    let total = 0; for (const e of entries) total += e[1];
    let r = scene.eprng() * total;
    for (const e of entries){ if ((r -= e[1]) <= 0) return e[0]; }
    return 'rain';
  },
  // nearest loaded-island surface distance from the player (Infinity → open ocean)
  _distToLand(scene){
    let best = Infinity;
    for (const is of (scene.islands || [])) for (const e of (is.ells || [])){
      const d = Math.hypot(e.cx - scene.player.x, e.cy - scene.player.y) - (e.rx || 0);
      if (d < best) best = d;
    }
    return best < 0 ? 0 : best;
  },

  // ── storm (moving squall cell) ──
  _updateStorm(scene, d, dt, dts, t){
    const wf = scene.wind ? scene.wind.dir : P.windFrom;
    d.cx += -Math.sin(wf * RAD) * STORM_DRIFT * dt;                 // ride downwind (moves with the front)
    d.cy +=  Math.cos(wf * RAD) * STORM_DRIFT * dt;
    d.flash = Math.max(0, d.flash - dts);
    if (t >= d.nextStrike){
      d.nextStrike = t + STORM_STRIKE_INTERVAL_S; d.flash = 0.18;
      if (scene.eprng() * 100 < P.stormChance){                    // one bolt, sub-100% chance → sometimes it misses
        const inCell = this._allShips(scene).filter(s => Math.hypot(s.x - d.cx, s.y - d.cy) < STORM_RADIUS);
        if (inCell.length){
          const s = inCell[Math.floor(scene.eprng() * inCell.length)];
          d.bolt = { x: s.x, y: s.y, t };                       // MW-10: lightning visual anchor
          if (s === scene.player){
            d.playerStrikes = (d.playerStrikes || 0) + 1;       // T-6: cap player strikes per storm
            if (d.playerStrikes <= STORM_PLAYER_STRIKE_CAP){
              s.sailBroken = true;
              if (s.sailState > STORM_BROKEN_SAIL_MAX_STATE) s.sailState = STORM_BROKEN_SAIL_MAX_STATE;
              scene.flashPopup(s.x, s.y - 20, 'SAIL HIT!', 0xE0E040);
            }
          } else {
            s.hull = Math.max(0, s.hull - STORM_STRIKE_DAMAGE); s.lastHitAt = t;
            scene.flashPopup(s.x, s.y - 20, 'LIGHTNING!', 0xE0E040);
            if (s.hull <= 0 && s.alive !== false){ s.alive = false;
              if (typeof Combat !== 'undefined' && Combat.spawnLoot) Combat.spawnLoot(scene, s);
              if (typeof EV !== 'undefined') scene.events.emit(EV.SHIP_SUNK, { ship: s, by: 'storm' }); }
          }
        }
      }
    }
  },

  // ── cyclone (moving vortex) ──
  // every ship in the world, so the storm sweeps friend and foe alike
  _allShips(scene){
    const out = [];
    if (scene.player && scene.player.hull > 0) out.push(scene.player);
    for (const s of (scene.ships || [])) if (s.alive) out.push(s);
    for (const r of (scene.runners || [])) if (r.alive !== false) out.push(r);
    if (scene.hire && scene.hire.hired) for (const e of scene.hire.hired) if (e.alive !== false) out.push(e);
    return out;
  },

  // move a ship, reverting if the step would beach it (so the current can't shove a hull into land)
  _nudge(scene, s, nx, ny){
    const ox = s.x, oy = s.y; s.x = nx; s.y = ny;
    if (typeof Collision !== 'undefined' && Collision.checkIslandHull && Collision.checkIslandHull(scene, s).hit){ s.x = ox; s.y = oy; }
  },

  // drift the eye downwind and apply the swirling inward current + eye hits to ALL ships
  _updateCyclone(scene, d, dt, t){
    const wf = scene.wind ? scene.wind.dir : P.windFrom;
    d.cx += -Math.sin(wf * RAD) * P.cycDrift * dt;                 // ride downwind (follows the base wind's path)
    d.cy +=  Math.cos(wf * RAD) * P.cycDrift * dt;
    for (const s of this._allShips(scene)){
      const dx = s.x - d.cx, dy = s.y - d.cy, dist = Math.hypot(dx, dy);
      if (dist >= P.cycReach || dist < 1) continue;
      const ux = dx / dist, uy = dy / dist;                        // outward unit
      const ramp = 1 - dist / P.cycReach;                          // 0 at the rim → 1 at the eye
      const mag = P.cycPull * ramp * ramp * dt;                    // squared: gentle out near the rim (escapable), fierce in the core
      // spiral current = tangential (CCW) + inward, normalized, scaled by proximity
      let vx = -uy - ux * CYCLONE_WIND_INWARD, vy = ux - uy * CYCLONE_WIND_INWARD;
      const vm = Math.hypot(vx, vy) || 1;
      this._nudge(scene, s, s.x + (vx / vm) * mag, s.y + (vy / vm) * mag);
      // eye hit (per-ship cooldown so a trapped hull isn't shredded every frame)
      if (dist < CYCLONE_EYE_RADIUS && (!s._cycHitAt || t - s._cycHitAt > CYCLONE_EYE_COOLDOWN)){
        s._cycHitAt = t; s.hull = Math.max(0, s.hull - s.maxHull * P.cycDmg / 100); s.lastHitAt = t;
        scene.flashPopup(s.x, s.y - 20, 'CYCLONE!', 0xB0A0E0);
        if (s.hull <= 0 && s !== scene.player && s.alive !== false){
          s.alive = false;
          if (typeof Combat !== 'undefined' && Combat.spawnLoot) Combat.spawnLoot(scene, s);
          if (typeof EV !== 'undefined') scene.events.emit(EV.SHIP_SUNK, { ship: s, by: 'cyclone' });
        }
      }
    }
  },

  // wind bearing at (x,y) when a cyclone is active: ambient blended toward an inward spiral near
  // the eye (strong at the centre, fading to ambient at the rim). Called by WindSystem.dirAt, so
  // sailing/steering/compass all feel the swirl. No cyclone → ambient.
  cycloneDirAt(scene, x, y, ambient){
    const w = scene.weather;
    if (!w || w.active !== 'cyclone' || !w.data) return ambient;
    const d = w.data, dx = x - d.cx, dy = y - d.cy, dist = Math.hypot(dx, dy);
    if (dist >= P.cycReach || dist < 1) return ambient;
    const ux = dx / dist, uy = dy / dist;                          // outward
    const fx = -uy - ux * CYCLONE_WIND_INWARD, fy = ux - uy * CYCLONE_WIND_INWARD;   // swirl FLOW (toward)
    const fromBearing = (Math.atan2(-fx, fy) * 180 / Math.PI + 360) % 360;           // wind "from" = reverse of flow
    const k = 1 - dist / P.cycReach, wgt = k * k * (3 - 2 * k);                       // smoothstep: eye → rim
    const diff = ((fromBearing - ambient + 540) % 360) - 180;
    return (ambient + diff * wgt + 360) % 360;
  },

  // overlay rendering (world graphics layer). Cosmetic per-frame marks use Math.random (not the
  // gameplay PRNG) so rendering never perturbs the sim.
  // ── DOC-VI snow: berg collisions — 5% max-hull per hit (RULED), per-berg
  // per-ship cooldown so a hull resting on a berg isn't shredded every frame.
  _updateSnow(scene, d, dt, t){
    if (!d.bergs) return;
    const hitShip = (s) => {
      for (const b of d.bergs){
        if (Math.hypot(s.x - b.x, s.y - b.y) > b.r + 14) continue;
        const key = s.id || 'player';
        if (t - (b.hits[key] || -1e9) < SNOW_BERG_HIT_COOLDOWN) continue;
        b.hits[key] = t;
        const dmg = Math.max(1, Math.round((s.maxHull || 100) * SNOW_BERG_DMG_PCT));
        s.hull -= dmg; s.lastHitAt = t;
        if (s === scene.player) scene.flashPopup(s.x, s.y - 30, '❄ BERG −' + dmg, 0xCFE8F5);
        if (s.hull <= 0 && s !== scene.player){ s.alive = false;
          if (typeof Docks !== 'undefined') Docks.releaseAnywhere(scene, s);
          if (typeof Combat !== 'undefined' && Combat.spawnLoot) Combat.spawnLoot(scene, s);
          scene.events.emit(EV.SHIP_SUNK, { ship: s, by: 'weather' }); }
        // nudge off the berg so contact doesn't lock the hull in place
        const a = Math.atan2(s.y - b.y, s.x - b.x); s.x += Math.cos(a)*6; s.y += Math.sin(a)*6;
      }
    };
    if (scene.player.hull > 0) hitShip(scene.player);
    for (const s of scene.ships) if (s.alive) hitShip(s);
  },

  // ── DOC-VI tsunami: push every ship inside the wave toward its NEAREST island,
  // easing to zero at the coast (never beached — RULED). No damage (RULED).
  _updateTsunami(scene, d, dt, t){
    const push = (s) => {
      if (Math.hypot(s.x - d.cx, s.y - d.cy) > TSUNAMI_WAVE_R) return;   // outside the visible wave
      let bx = null, by = null, bd = Infinity;
      for (const is of (scene.islands || [])) for (const e of (is.ells || [])){
        const dd = Math.hypot(e.cx - s.x, e.cy - s.y) - (e.rx || 0);
        if (dd < bd){ bd = dd; bx = e.cx; by = e.cy; }
      }
      if (bx === null || bd <= TSUNAMI_COAST_STOP) return;            // no land loaded / at the coast: stop
      const ease = Math.min(1, (bd - TSUNAMI_COAST_STOP) / 300);      // soften as the coast nears
      const a = Math.atan2(by - s.y, bx - s.x);
      s.x += Math.cos(a) * TSUNAMI_PUSH * ease * dt;
      s.y += Math.sin(a) * TSUNAMI_PUSH * ease * dt;
    };
    if (scene.player.hull > 0) push(scene.player);
    for (const s of scene.ships) if (s.alive) push(s);               // AI in the wave is pushed too (RULED)
  },

  draw(scene, g){
    const w = scene.weather; if (!w || !w.active) return;
    const pl = scene.player;
    if (w.active === 'cyclone'){
      // MW-13: rotating spiral arms + dark eye (replaces the 4 debug rings). PLACEHOLDER look.
      { const cx = w.data.cx, cy = w.data.cy, rot = (scene.time.now/1000) * 1.4;
        g.fillStyle(0x2A2440, 0.55); g.fillCircle(cx, cy, CYCLONE_EYE_RADIUS);          // dark eye
        g.lineStyle(2, 0x8A7AC8, 0.30); g.strokeCircle(cx, cy, P.cycReach);             // faint outer reach
        for (let arm = 0; arm < 3; arm++){
          g.lineStyle(3, 0xA89AD8, 0.45);
          g.beginPath();
          for (let k = 0; k <= 20; k++){
            const f = k/20, r = CYCLONE_EYE_RADIUS + f * (P.cycReach - CYCLONE_EYE_RADIUS);
            const th = rot + arm * (TAU/3) + f * 2.4;                                    // spiral wind-up
            const px = cx + Math.cos(th) * r, py = cy + Math.sin(th) * r;
            if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
          }
          g.strokePath();
        } }
    } else if (w.active === 'storm'){
      g.lineStyle(2, 0x5A6A80, 0.35); g.strokeCircle(w.data.cx, w.data.cy, STORM_RADIUS);   // squall boundary
      // MW-10: inside the cell, rain at ~2× density (rain draws 40 streaks → storm 80)
      if (Math.hypot(pl.x - w.data.cx, pl.y - w.data.cy) < STORM_RADIUS){
        g.lineStyle(1, 0x9FB6C8, 0.35);
        for (let i = 0; i < 80; i++){ const rx = pl.x + (Math.random() - 0.5)*1400, ry = pl.y + (Math.random() - 0.5)*900; g.lineBetween(rx, ry, rx - 8, ry + 15); }
      }
      // MW-10: jagged lightning bolt from the sky down to the struck ship
      const b = w.data.bolt;
      if (b && (scene.time.now/1000 - b.t) < STORM_BOLT_S){
        const a = 1 - (scene.time.now/1000 - b.t)/STORM_BOLT_S;
        // CQ (doc): lightning always reads WITH rain — a streak burst around the
        // bolt itself, so a spectator outside the cell still sees rain on strikes
        g.lineStyle(1, 0xBFD4E4, 0.5 * a);
        for (let i = 0; i < 26; i++){ const rx = b.x + (Math.random() - 0.5)*300, ry = b.y + (Math.random() - 0.5)*260; g.lineBetween(rx, ry, rx - 8, ry + 15); }
        const jx = () => (Math.random() - 0.5) * 26;
        g.lineStyle(3, 0xFFF6C8, a);
        g.beginPath(); g.moveTo(b.x + jx(), b.y - 260);
        g.lineTo(b.x + jx(), b.y - 170); g.lineTo(b.x + jx(), b.y - 90); g.lineTo(b.x, b.y);
        g.strokePath();
      }
    }
    if (w.active === 'rain'){ g.lineStyle(1, 0x9FB6C8, 0.3); for (let i = 0; i < 40; i++){ const rx = pl.x + (Math.random() - 0.5) * 1400, ry = pl.y + (Math.random() - 0.5) * 900; g.lineBetween(rx, ry, rx - 6, ry + 12); } }
    // storm flash: only when you're actually inside the squall
    if (w.active === 'storm' && w.data.flash > 0 && Math.hypot(pl.x - w.data.cx, pl.y - w.data.cy) < STORM_RADIUS){ g.fillStyle(0xFFFFFF, w.data.flash); g.fillRect(pl.x - 1200, pl.y - 800, 2400, 1600); }
  },
};
