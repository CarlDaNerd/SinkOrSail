// ── systems/PortCaptureSystem.js ──
// You don't BUILD a home base — you TAKE one. Shell a port (player cannonballs
// only) until its hull drops below PORT_CAPTURE_THRESHOLD_PCT, then press B while
// close to capture it the way you board a ship. A captured port flips to
// owner:'player': it heals back up, its towers stop firing on you (DefenseSystem
// already skips owner==='player'), and it becomes a home for towed prizes plus the
// usual dock / bank / repair.
//
// Damaging a port is an act of war: it makes you WANTED (reportCrime), same as
// attacking the navy. Un-damaged world ports slowly regen out of combat.
//
// Shares the B key with ship capture; GameScene tries PortCaptureSystem.tryCapture
// first (you're either next to a port or next to a ship, not both).
const PortCaptureSystem = {
  init(scene){
    scene.ownedPorts = scene.ownedPorts || [];
  },

  // a player shot landed on this port (called from Combat.updateCannonballs)
  damagePort(scene, port){
    if (port.owner === 'player') return;
    port.hull = Math.max(0, port.hull - PORT_CANNONBALL_DMG);
    port.lastHitAt = scene.time.now / 1000;
    scene.flashPopup(port.x, port.y, '-' + PORT_CANNONBALL_DMG, 0xE0503A);
    // shelling a port is a crime the navy responds to (like attacking the navy)
    if (typeof FactionSystem !== 'undefined') FactionSystem.reportCrime(scene, port.x, port.y);
  },

  capturable(scene, port){
    return port.owner !== 'player'
      && port.hull <= port.maxHull * PORT_CAPTURE_THRESHOLD_PCT / 100
      && Math.hypot(scene.player.x - port.x, scene.player.y - port.y) < PORT_CAPTURE_RANGE;
  },

  nearestCapturable(scene){
    let best = null, bd = PORT_CAPTURE_RANGE;
    for (const port of scene.navyPorts){
      if (port.owner === 'player') continue;
      if (port.hull > port.maxHull * PORT_CAPTURE_THRESHOLD_PCT / 100) continue;
      const d = Math.hypot(scene.player.x - port.x, scene.player.y - port.y);
      if (d < bd){ bd = d; best = port; }
    }
    return best;
  },

  // called from the shared B handler; returns true if it consumed the press
  // I18-3: side-effect-free peek for the HUD hint box
  isReady(scene){
    return !!this.nearestCapturable(scene);                 // doc VI: ownership cap removed
  },

  tryCapture(scene){
    const port = this.nearestCapturable(scene);
    if (!port) return false;
    port.owner = 'player';
    port.hull = port.maxHull;                 // garrison repairs it on takeover
    port.towers = port.towers || [];          // its towers are now yours (they won't target you while owned)
    scene.ownedPorts.push(port);
    scene.flashPopup(port.x, port.y - 30, 'PORT CAPTURED: ' + port.name, 0x6ED0E0);
    scene.events.emit(EV.PORT_CAPTURED, { port });
    return true;
  },

  update(scene, dt, dts){
    const t = scene.time.now / 1000;
    // un-owned ports slowly heal out of combat
    for (const port of scene.navyPorts){
      if (port.owner === 'player') continue;
      if (port.hull < port.maxHull && (t - port.lastHitAt) > PORT_REGEN_DELAY_S){
        port.hull = Math.min(port.maxHull, port.hull + PORT_REGEN_PER_S * dts);
      }
    }
    // B handled centrally in GameScene so port-capture wins over ship-capture
    // when both are possible; nothing to poll here.
  },

  // hull bar over any damaged or owned port; capture ring when in range
  draw(scene, g){
    for (const port of scene.navyPorts){
      const damaged = port.hull != null && port.hull < port.maxHull;
      if (!damaged && port.owner !== 'player') continue;
      const w = 44, x = port.x - w/2, y = port.y - 40;
      const frac = Math.max(0, port.hull / port.maxHull);
      g.fillStyle(0x000000, 0.5); g.fillRect(x, y, w, 5);
      const col = port.owner === 'player' ? 0x6ED0E0 : (frac < PORT_CAPTURE_THRESHOLD_PCT/100 ? 0xE0A040 : 0xE0503A);
      g.fillStyle(col, 1); g.fillRect(x, y, w * frac, 5);
      if (this.capturable(scene, port)){ g.lineStyle(2, 0x6ED0E0, 0.9); g.strokeCircle(port.x, port.y, PORT_CAPTURE_RANGE * 0.5); }
    }
  },
};
