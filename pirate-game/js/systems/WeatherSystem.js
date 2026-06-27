// ── systems/WeatherSystem.js ── (M11)
// One weather effect active at a time, rolled every 2-5 minutes. Effects are
// SHIP-only status effects; WIND IS NEVER TOUCHED. Types:
//   rain    — player speed x0.75; ends after 10000px travelled OR 45s
//   snow    — icebergs drift in the field; contact damages the hull
//   tsunami — only near land; shoves the ship toward the nearest island (always survived)
//   cyclone — pulls the ship toward a center; deals 50% max hull once near center
//   storm   — lightning; >=45% chance per strike to break the sail (cap at half sail) until repaired
//
// State slice: scene.weather = { active, nextAt, endsAt, data:{...} }.
// Movement reads WeatherSystem.speedMult(scene) for the rain slow; storm sets
// player.sailBroken (cleared by a port repair).
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
    else if (type === 'cyclone'){ w.endsAt = t + CYCLONE_DURATION_S; w.data.cx = pl.x; w.data.cy = pl.y; w.data.dealt = false; }
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
      const dx = w.data.cx - pl.x, dy = w.data.cy - pl.y, d = Math.hypot(dx, dy);
      if (d < CYCLONE_RADIUS && d > 1){
        const pull = CYCLONE_PULL * (1 - d / CYCLONE_RADIUS);
        pl.x += (dx / d) * pull * dt; pl.y += (dy / d) * pull * dt;
      }
      if (!w.data.dealt && d < 80){                          // reached the eye → one big hit
        pl.hull = Math.max(0, pl.hull - pl.maxHull * CYCLONE_DAMAGE_PCT / 100); pl.lastHitAt = t; w.data.dealt = true;
        scene.flashPopup(pl.x, pl.y - 20, 'CYCLONE!', 0xB0A0E0);
      }
      if (t >= w.endsAt) this.clear(scene);

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

  // overlay rendering (on the world graphics layer)
  draw(scene, g){
    const w = scene.weather; if (!w || !w.active) return;
    const pl = scene.player, cam = scene.cameras.main;
    if (w.active === 'snow'){
      for (const b of w.data.bergs){ g.fillStyle(0xDCECF5, 0.95); g.fillCircle(b.x, b.y, b.r); g.lineStyle(2, 0x9FC2D6, 0.8); g.strokeCircle(b.x, b.y, b.r); }
    } else if (w.active === 'cyclone'){
      g.lineStyle(3, 0x8A7AC8, 0.5); for (let k = 1; k <= 4; k++) g.strokeCircle(w.data.cx, w.data.cy, CYCLONE_RADIUS * k / 4);
    } else if (w.active === 'tsunami'){
      g.lineStyle(4, 0x2A9EAE, 0.5); g.strokeCircle(pl.x, pl.y, 60);
    }
    // rain/storm are full-screen tints handled cheaply as world-space marks near player
    if (w.active === 'rain'){ g.lineStyle(1, 0x9FB6C8, 0.3); for (let i = 0; i < 40; i++){ const rx = pl.x + (scene.eprng() - 0.5) * 1400, ry = pl.y + (scene.eprng() - 0.5) * 900; g.lineBetween(rx, ry, rx - 6, ry + 12); } }
    if (w.active === 'storm' && w.data.flash > 0){ g.fillStyle(0xFFFFFF, w.data.flash); g.fillRect(pl.x - 1200, pl.y - 800, 2400, 1600); }
  },
};
