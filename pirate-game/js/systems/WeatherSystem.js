// ── systems/WeatherSystem.js ── (M11)
// One weather effect active at a time, rolled every 2-5 minutes. Effects are
// SHIP-only status effects; WeatherSystem never touches wind DIRECTION (that's
// owned by WindSystem — effects can layer gusts on top later). Types:
//   rain    — player speed x0.75; ends after 10000px travelled OR 45s
//   snow    — icebergs drift in the field; contact damages the hull
//   tsunami — only near land; shoves the ship toward the nearest island (always survived)
//   cyclone — a MOVING vortex (affects ALL ships): spawns just outside minimap range
//             upwind, rides the base wind, swirls the LOCAL wind (via cycloneDirAt →
//             WindSystem.dirAt) and drags every ship toward the eye; 50% hull at the eye.
//             Escapable by out-sailing the current. Telegraphed by a hard wind shift.
//   storm   — lightning; >=45% chance per strike to break the sail (cap at half sail) until repaired
//
// Gated by scene.extrasOn (the pause-menu checkbox): when off, any active effect
// is cleared and none roll. State slice: scene.weather = { active, nextAt, endsAt,
// data:{...} }. Movement reads WeatherSystem.speedMult(scene) for the rain slow;
// storm sets player.sailBroken (cleared by a port repair).
const WeatherSystem = {
  init(scene){
    scene.weather = { active: null, nextAt: this._rollNext(scene), endsAt: 0, data: {} };
    // clear a broken sail when repairing at port
    scene.events.on(EV.DOCK_ENTERED, () => { scene.player.sailBroken = false; });
  },

  _rollNext(scene){
    const t = scene.time.now / 1000;
    return t + WEATHER_INTERVAL_MIN_S + scene.eprng() * (WEATHER_INTERVAL_MAX_S - WEATHER_INTERVAL_MIN_S);
  },

  // movement multiplier the player speed calc applies (rain slow); 1 otherwise
  speedMult(scene){ return (scene.weather && scene.weather.active === 'rain') ? RAIN_SPEED_MULT : 1; },

  start(scene, type){
    const w = scene.weather, pl = scene.player, t = scene.time.now / 1000;
    w.active = type; w.data = {};
    if (type === 'rain'){ w.endsAt = t + RAIN_DURATION_S; w.data.distance = 0; }
    else if (type === 'snow'){ w.endsAt = t + SNOW_DURATION_S; w.data.bergs = this._spawnBergs(scene); w.data.lastHit = -99; }
    else if (type === 'tsunami'){
      // only valid near land; find the nearest island, else abort the roll
      const isl = this._nearestIsland(scene);
      if (!isl || Math.hypot(isl.cx - pl.x, isl.cy - pl.y) > TSUNAMI_ISLAND_PROXIMITY_PX){ w.active = null; return; }
      w.endsAt = t + TSUNAMI_PUSH_S; w.data.tx = isl.cx; w.data.ty = isl.cy;
    }
    else if (type === 'cyclone'){
      w.endsAt = t + CYCLONE_DURATION_S;
      const wf = scene.wind ? scene.wind.dir : P.windFrom, dsp = MINIMAP_RANGE + CYCLONE_SPAWN_MARGIN;
      w.data.cx = pl.x + Math.sin(wf * RAD) * dsp;         // spawn UPWIND, just past minimap range → it drifts in toward you
      w.data.cy = pl.y - Math.cos(wf * RAD) * dsp;
      if (typeof WindSystem !== 'undefined' && WindSystem.forceFront) WindSystem.forceFront(scene, CYCLONE_TELEGRAPH_SHIFT);   // drastic wind shift = the warning
      scene.flashPopup(pl.x, pl.y - 40, '⚠ CYCLONE FORMING', 0xB0A0E0);
    }
    else if (type === 'storm'){ w.endsAt = t + STORM_DURATION_S; w.data.nextStrike = t + STORM_STRIKE_INTERVAL_S; w.data.flash = 0; }
    if (w.active) scene.events.emit(EV.WEATHER_CHANGED, { type: w.active });
  },

  clear(scene){
    const w = scene.weather;
    w.active = null; w.data = {}; w.nextAt = this._rollNext(scene);
    scene.events.emit(EV.WEATHER_CHANGED, { type: null });
  },

  update(scene, dt, dts){
    const w = scene.weather, pl = scene.player, t = scene.time.now / 1000;
    if (!scene.extrasOn || (typeof DEBUG !== 'undefined' && DEBUG.weatherOff)){ if (w.active) this.clear(scene); return; }   // off via pause-menu checkbox or the dev "disable weather" toggle
    if (!w.active){
      if (t >= w.nextAt){ this.start(scene, WEATHER_TYPES[Math.floor(scene.eprng() * WEATHER_TYPES.length)]);
        if (!w.active) w.nextAt = this._rollNext(scene); }   // tsunami may abort if not near land
      return;
    }
    if (pl.hull <= 0){ this.clear(scene); return; }

    if (w.active === 'rain'){
      w.data.distance += pl.vel * dt;                        // travelled this frame
      if (t >= w.endsAt || w.data.distance >= RAIN_DURATION_PX) this.clear(scene);

    } else if (w.active === 'snow'){
      this._driftBergs(scene, dt);
      for (const b of w.data.bergs){
        if (Math.hypot(b.x - pl.x, b.y - pl.y) < b.r + HULL_BEAM){
          if (t - w.data.lastHit > SNOW_ICEBERG_INTERVAL){
            pl.hull = Math.max(0, pl.hull - SNOW_ICEBERG_DAMAGE); pl.lastHitAt = t; w.data.lastHit = t;
            pl.vel *= 0.6; scene.flashPopup(pl.x, pl.y - 20, 'ICEBERG!', 0xCFE8F5);
          }
        }
      }
      if (t >= w.endsAt) this.clear(scene);

    } else if (w.active === 'tsunami'){
      const ang = Math.atan2(w.data.ty - pl.y, w.data.tx - pl.x);
      pl.x += Math.cos(ang) * TSUNAMI_PUSH_SPEED * dt; pl.y += Math.sin(ang) * TSUNAMI_PUSH_SPEED * dt;
      if (t >= w.endsAt) this.clear(scene);

    } else if (w.active === 'cyclone'){
      this._updateCyclone(scene, w.data, dt, t);
      if (t >= w.endsAt || Math.hypot(w.data.cx - pl.x, w.data.cy - pl.y) > CYCLONE_DESPAWN_DIST) this.clear(scene);

    } else if (w.active === 'storm'){
      w.data.flash = Math.max(0, w.data.flash - dts);
      if (t >= w.data.nextStrike){
        w.data.nextStrike = t + STORM_STRIKE_INTERVAL_S; w.data.flash = 0.18;
        if (scene.eprng() * 100 < STORM_SAIL_HIT_CHANCE_PCT){
          pl.sailBroken = true;
          if (pl.sailState > STORM_BROKEN_SAIL_MAX_STATE) pl.sailState = STORM_BROKEN_SAIL_MAX_STATE;
          scene.flashPopup(pl.x, pl.y - 20, 'SAIL HIT!', 0xE0E040);
        }
      }
      if (t >= w.endsAt) this.clear(scene);
    }

    // a broken sail keeps the player capped at half sail until a port repair
    if (pl.sailBroken && pl.sailState > STORM_BROKEN_SAIL_MAX_STATE) pl.sailState = STORM_BROKEN_SAIL_MAX_STATE;
  },

  // ── helpers ──
  _nearestIsland(scene){ let best = null, bd = Infinity; for (const is of scene.islands){ const d = Math.hypot(is.cx - scene.player.x, is.cy - scene.player.y); if (d < bd){ bd = d; best = is; } } return best; },
  _spawnBergs(scene){
    const pl = scene.player, bergs = [];
    for (let i = 0; i < SNOW_ICEBERG_COUNT; i++){
      const a = scene.eprng() * Math.PI * 2, r = 200 + scene.eprng() * 700;
      bergs.push({ x: pl.x + Math.cos(a) * r, y: pl.y + Math.sin(a) * r, r: 14 + scene.eprng() * 18,
                   vx: (scene.eprng() - 0.5) * 0.6, vy: (scene.eprng() - 0.5) * 0.6 });
    }
    return bergs;
  },
  _driftBergs(scene, dt){ for (const b of scene.weather.data.bergs){ b.x += b.vx * dt; b.y += b.vy * dt; } },

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
    d.cx += -Math.sin(wf * RAD) * CYCLONE_DRIFT * dt;       // ride downwind (follows the base wind's path)
    d.cy +=  Math.cos(wf * RAD) * CYCLONE_DRIFT * dt;
    for (const s of this._allShips(scene)){
      const dx = s.x - d.cx, dy = s.y - d.cy, dist = Math.hypot(dx, dy);
      if (dist >= CYCLONE_RADIUS || dist < 1) continue;
      const ux = dx / dist, uy = dy / dist;                 // outward unit
      const ramp = 1 - dist / CYCLONE_RADIUS;               // 0 at the rim → 1 at the eye
      const mag = CYCLONE_PULL * ramp * ramp * dt;          // squared: gentle out near the rim (escapable), fierce in the core
      // spiral current = tangential (CCW) + inward, normalized, scaled by proximity
      let vx = -uy - ux * CYCLONE_WIND_INWARD, vy = ux - uy * CYCLONE_WIND_INWARD;
      const vm = Math.hypot(vx, vy) || 1;
      this._nudge(scene, s, s.x + (vx / vm) * mag, s.y + (vy / vm) * mag);
      // eye hit (per-ship cooldown so a trapped hull isn't shredded every frame)
      if (dist < CYCLONE_EYE_RADIUS && (!s._cycHitAt || t - s._cycHitAt > CYCLONE_EYE_COOLDOWN)){
        s._cycHitAt = t; s.hull = Math.max(0, s.hull - s.maxHull * CYCLONE_DAMAGE_PCT / 100); s.lastHitAt = t;
        scene.flashPopup(s.x, s.y - 20, 'CYCLONE!', 0xB0A0E0);
        if (s.hull <= 0 && s !== scene.player && s.alive !== false){
          s.alive = false;
          if (typeof Combat !== 'undefined' && Combat.spawnLoot) Combat.spawnLoot(scene, s);
          if (typeof EV !== 'undefined') scene.events.emit(EV.SHIP_SUNK, { ship: s, by: 'cyclone' });
        }
      }
    }
  },

  // wind bearing at (x,y) when a cyclone is active: ambient blended toward an inward
  // spiral near the eye (strong at the centre, fading to ambient at the rim). Called by
  // WindSystem.dirAt, so sailing/steering/compass all feel the swirl. No cyclone → ambient.
  cycloneDirAt(scene, x, y, ambient){
    const w = scene.weather;
    if (!w || w.active !== 'cyclone' || !w.data) return ambient;
    const d = w.data, dx = x - d.cx, dy = y - d.cy, dist = Math.hypot(dx, dy);
    if (dist >= CYCLONE_RADIUS || dist < 1) return ambient;
    const ux = dx / dist, uy = dy / dist;                   // outward
    const fx = -uy - ux * CYCLONE_WIND_INWARD, fy = ux - uy * CYCLONE_WIND_INWARD;   // swirl FLOW (toward)
    const fromBearing = (Math.atan2(-fx, fy) * 180 / Math.PI + 360) % 360;           // wind "from" = reverse of flow
    const k = 1 - dist / CYCLONE_RADIUS, wgt = k * k * (3 - 2 * k);                   // smoothstep: eye → rim
    const diff = ((fromBearing - ambient + 540) % 360) - 180;
    return (ambient + diff * wgt + 360) % 360;
  },

  // overlay rendering (on the world graphics layer). Cosmetic per-frame marks use
  // Math.random (not the gameplay PRNG) so rendering never perturbs the sim.
  draw(scene, g){
    const w = scene.weather; if (!w || !w.active) return;
    const pl = scene.player;
    if (w.active === 'snow'){
      for (const b of w.data.bergs){ g.fillStyle(0xDCECF5, 0.95); g.fillCircle(b.x, b.y, b.r); g.lineStyle(2, 0x9FC2D6, 0.8); g.strokeCircle(b.x, b.y, b.r); }
    } else if (w.active === 'cyclone'){
      g.lineStyle(3, 0x8A7AC8, 0.5); for (let k = 1; k <= 4; k++) g.strokeCircle(w.data.cx, w.data.cy, CYCLONE_RADIUS * k / 4);
    } else if (w.active === 'tsunami'){
      g.lineStyle(4, 0x2A9EAE, 0.5); g.strokeCircle(pl.x, pl.y, 60);
    }
    // rain/storm are cheap world-space marks near the player
    if (w.active === 'rain'){ g.lineStyle(1, 0x9FB6C8, 0.3); for (let i = 0; i < 40; i++){ const rx = pl.x + (Math.random() - 0.5) * 1400, ry = pl.y + (Math.random() - 0.5) * 900; g.lineBetween(rx, ry, rx - 6, ry + 12); } }
    if (w.active === 'storm' && w.data.flash > 0){ g.fillStyle(0xFFFFFF, w.data.flash); g.fillRect(pl.x - 1200, pl.y - 800, 2400, 1600); }
  },
};
