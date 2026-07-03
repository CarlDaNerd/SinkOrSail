// ── systems/SailingPhysics.js ──
// The soul of the game (handoff §6): wind speed curve + variable turn-rate
// curve. Both read P (the tuning surface). Apply per-frame motion ×dt; apply
// the deg/sec turn rate ×dts.

// Speed (px per 1/60s) as a function of wind angle off the bow (0–180).
function calcTargetSpeed(wa){
  if (wa < P.noGo) return 0;                                              // in irons
  if (wa < 90)     return P.maxSpeed * (0.5 + 0.5*(wa - P.noGo)/(90 - P.noGo));
  return P.maxSpeed * (1.0 - P.dwLoss*(wa - 90)/90);                      // downwind loss
}

// Turn rate in deg/sec: rises from a rest value to a peak at some speed
// fraction, then falls to a full-speed value (rewards a controlled cruise).
function calcTurnDegS(vel){
  const x = Math.min(vel/P.maxSpeed, 1), px = P.turnPeakAt/100;
  const peak = P.turnPeak, minV = P.turnMin, fullV = P.turnPeak*P.turnFull/100;
  if (x <= px){ const t = px === 0 ? 1 : x/px; return minV + (peak - minV)*(1 - (1 - t)*(1 - t)); } // ease-out rise
  const t = (x - px)/(1 - px); return peak + (fullV - peak)*(t*t);                                  // ease-in fall
}
