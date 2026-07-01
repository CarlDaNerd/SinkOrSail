// ── systems/WindSystem.js ──
// Dynamic wind DIRECTION. P.windFrom — read live by the sailing speed curve, every
// bot's steering, the no-go logic, and the HUD wind compass — is driven each frame:
//
//     P.windFrom = base + oscillation
//
//   base        the prevailing bearing. Holds steady, then a "front" eases it to a
//               new bearing (±windShiftSize°) over windShiftDur s and holds again —
//               a real persistent shift, ~every windShiftEvery s.
//   oscillation the sum of WIND_OSC_PERIODS sines (incommensurate periods) → a smooth,
//               organic, never-quite-repeating wander of up to ~windOscAmp°.
//
// Nothing downstream caches windFrom, so the whole world (player, bots, compass)
// reacts for free. Weather can later layer its own gusts on top. ALWAYS-ON, and
// independent of the weather "extras" toggle — wind is fundamental to sailing.
//
// Wind is a WORLD property: seeded from WORLD_SEED (its own PRNG stream) so the
// wind's "personality" is the same each launch. NOT persisted — like weather, the
// base resets to the prevailing bearing on load; the oscillation is a pure function
// of time so it needs no saved state.
const WindSystem = {
  init(scene){
    const t = scene.time.now / 1000;
    this._prng = makePRNG((WORLD_SEED ^ WIND_SEED_SALT) >>> 0);
    const prevailing = P.windFrom;                       // the initial prevailing bearing
    scene.wind = {
      base: prevailing, from: prevailing, to: prevailing,
      shiftStart: t, shiftEnd: t,                         // no front in progress at start
      nextShiftAt: t + this._shiftGap(),
      phase: WIND_OSC_PERIODS.map(() => this._prng() * TAU),   // fixed oscillation phases (per launch)
    };
  },

  // seconds until the next front — mean ≈ windShiftEvery (rolled 0.5×–1.5×)
  _shiftGap(){ return P.windShiftEvery * (0.5 + this._prng()); },

  // smoothstep 0→1 (eased front transition)
  _smooth(k){ k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); },
  // shortest-path angle interpolation a→b (degrees)
  _angLerp(a, b, k){ const d = ((b - a + 540) % 360) - 180; return (a + d * k + 360) % 360; },

  // total oscillation offset in degrees at time t — a pure function of t + seeded phases,
  // bounded by ±windOscAmp (Σ weights = 1), so it can never wander into chaos
  _osc(scene, t){
    const ph = scene.wind.phase; let o = 0;
    for (let i = 0; i < WIND_OSC_PERIODS.length; i++){
      const period = WIND_OSC_PERIODS[i] / Math.max(0.05, P.windOscSpeed);
      o += WIND_OSC_WEIGHTS[i] * Math.sin(TAU * t / period + ph[i]);
    }
    return o * P.windOscAmp;
  },

  update(scene, dt, dts){
    const w = scene.wind; if (!w) return;
    const t = scene.time.now / 1000;

    // roll a new front once the previous one has finished AND its timer has elapsed
    if (t >= w.nextShiftAt && t >= w.shiftEnd){
      w.from = w.base;
      const delta = (this._prng() * 2 - 1) * P.windShiftSize;        // ±windShiftSize°
      w.to = (w.from + delta + 360) % 360;
      w.shiftStart = t; w.shiftEnd = t + Math.max(0.5, P.windShiftDur);
      w.nextShiftAt = w.shiftEnd + this._shiftGap();
    }

    // ease the prevailing base along the active front (smoothstep), else hold at target
    if (t < w.shiftEnd) w.base = this._angLerp(w.from, w.to, this._smooth((t - w.shiftStart) / (w.shiftEnd - w.shiftStart)));
    else                w.base = w.to;

    P.windFrom = (w.base + this._osc(scene, t) + 360) % 360;         // prevailing + oscillation → live wind
  },
};
