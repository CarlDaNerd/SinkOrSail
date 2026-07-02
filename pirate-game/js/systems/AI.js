// ── systems/AI.js ──
// Per-faction state machines (handoff §9). Each picks a desired heading + sail
// + fire intent; then we steer (avoidLand → avoidIrons), turn, accelerate, move
// and fire. Maneuvering only — combat resolution lives in Combat.js.
const AI = {
  nearestPirate(scene, s, maxRange){
    let tp = null, tpd = maxRange;
    for (const o of scene.ships){ if (o.faction !== 'pirate' || !o.alive) continue; const od = dist(s, o); if (od < tpd){ tpd = od; tp = o; } }
    return tp;
  },

  // nearest alive merchant within range — pirates prey on these when idle
  nearestMerchant(scene, s, maxRange){
    let tm = null, tmd = maxRange;
    for (const o of scene.ships){ if (o.faction !== 'merchant' || !o.alive) continue; const od = dist(s, o); if (od < tmd){ tmd = od; tm = o; } }
    return tm;
  },

  // pick a trade-route destination port within range (≠ exclude); fall back to the
  // nearest port overall so a trader always migrates toward civilisation
  pickPort(scene, s, exclude){
    const ports = scene.navyPorts; if (!ports || !ports.length) return null;
    const cands = [];
    for (const p of ports){ if (p === exclude) continue; if (dist(s, p) < MERCHANT_ROUTE_RANGE) cands.push(p); }
    if (cands.length) return cands[Math.floor(scene.eprng() * cands.length)];
    let best = null, bd = 1e9; for (const p of ports){ if (p === exclude) continue; const dd = dist(s, p); if (dd < bd){ bd = dd; best = p; } }
    return best;
  },

  // head to the current destination port; on arrival PHYSICALLY DOCK (MD2):
  // claim a free berth, ease onto it and hold for a few seconds, then release
  // and sail for the next port. Port full → skip to the next destination.
  tradeRoute(scene, s){
    const t = scene.time.now/1000;
    if (s.dockedAt){                                                  // sitting on a berth
      const port = scene.navyPorts.find(p => p.id === s.dockedAt);
      const slot = port && port.docks.find(d => d.id === s.dockSlot);
      if (port && slot && t < (s.dockUntil || 0)){
        const wp = Docks.slotPos(port, slot);
        s.x += (wp.x - s.x)*0.15; s.y += (wp.y - s.y)*0.15; s.vel = 0;   // ease onto the pad, hold
        return { targetHeading: s.heading, desiredSail: 0 };
      }
      if (port) Docks.release(scene, port, s); else { s.dockedAt = null; s.dockSlot = null; }
      s.dest = this.pickPort(scene, s, s.dest);                       // depart for the next stop
    }
    if (!s.dest || dist(s, s.dest) < PORT_ARRIVE_RANGE){
      if (s.dest && typeof Docks !== 'undefined'){
        const slot = Docks.occupy(scene, s.dest, s);                  // try to take a berth
        if (slot){
          s.dockUntil = t + MERCHANT_DOCK_MIN_S + scene.eprng()*(MERCHANT_DOCK_MAX_S - MERCHANT_DOCK_MIN_S);
          return { targetHeading: s.heading, desiredSail: 0 };
        }
      }
      s.dest = this.pickPort(scene, s, s.dest);                       // full (or arrived) → next port
    }
    if (!s.dest) return this.cruise(scene, s);                        // no ports anywhere → wander
    return { targetHeading: angleTo(s, s.dest), desiredSail: 2 };
  },

  cruise(scene, s){
    if (dist(s, s.waypoint) < 100){ s.waypoint = { x:s.x + (scene.eprng() - 0.5)*3000, y:s.y + (scene.eprng() - 0.5)*3000 }; }
    return { targetHeading:angleTo(s, s.waypoint), desiredSail: s.faction === 'merchant' ? 2 : 1 };
  },

  patrolHome(scene, s){
    const home = s.home || { x:s.x, y:s.y };
    if (!s.waypoint || dist(s, s.waypoint) < 90){
      const a = scene.eprng()*Math.PI*2, rr = 150 + scene.eprng()*Math.min(P.navyLeash*0.7, 500);
      s.waypoint = { x:home.x + Math.cos(a)*rr, y:home.y + Math.sin(a)*rr };
    }
    return { targetHeading:angleTo(s, s.waypoint), desiredSail:1 };
  },

  // turn perpendicular to the target; fire the right side when 70–110° off bearing
  combatManeuver(s, target, d){
    const toT = angleTo(s, target);
    const perp1 = (toT + 90)%360, perp2 = (toT - 90 + 360)%360;
    const th = (Math.abs(angleDiff(s.heading, perp1)) < Math.abs(angleDiff(s.heading, perp2))) ? perp1 : perp2;
    let wantFire = null;
    const ad = Math.abs(angleDiff(s.heading, toT));
    if (ad > 70 && ad < 110 && s.fire <= 0){ wantFire = angleDiff(s.heading, toT) > 0 ? 1 : -1; }
    return { targetHeading:th, desiredSail:1, wantFire };
  },

  update(scene, s, dt, dts){
    const pl = scene.player;
    const d = dist(s, pl);
    let targetHeading = s.heading, desiredSail = 2, wantFire = null;
    const playerPirateFlag = scene.flag === 'pirate';

    if (s.faction === 'merchant'){
      // flee only if threatened: pirate flag shown, OR provoked, OR player is WANTED
      const threatened = playerPirateFlag || s.hostileToPlayer || FactionSystem.navyHostile(scene);
      const willFight = s.hostileToPlayer && (s._fightRoll === undefined ? (s._fightRoll = scene.eprng()*100) : s._fightRoll) < P.merchFight;
      const raider = AI.nearestPirate(scene, s, MERCHANT_PIRATE_FLEE_RANGE);   // a pirate bearing down?
      if (willFight && d < P.merchFlee){
        ({ targetHeading, desiredSail, wantFire } = AI.combatManeuver(s, pl, d)); s.state = 'fight';
      } else if (threatened && d < P.merchFlee){
        targetHeading = (angleTo(s, pl) + 180)%360; desiredSail = 2; s.state = 'flee';
      } else if (raider){
        targetHeading = (angleTo(s, raider) + 180)%360; desiredSail = 2; s.state = 'flee';   // run from the pirate
      } else if (s.dest && !s.wander){
        ({ targetHeading, desiredSail } = AI.tradeRoute(scene, s)); s.state = 'trade';        // port-to-port run
      } else { ({ targetHeading, desiredSail } = AI.cruise(scene, s)); s.state = 'cruise'; }

    } else if (s.faction === 'pirate'){
      const DETECT = 440, ATK = 260;
      // pirate flag = fellow pirate: they leave you alone (unless you've hit them)
      const friendlyToPlayer = playerPirateFlag && !s.hostileToPlayer;
      if (!friendlyToPlayer && d < DETECT){
        if (d < ATK){ ({ targetHeading, desiredSail, wantFire } = AI.combatManeuver(s, pl, d)); s.state = 'attack'; }
        else { targetHeading = angleTo(s, pl); desiredSail = 2; s.state = 'pursue'; }
      } else {
        // not on the player → prey on the nearest merchant; else roam
        const tm = AI.nearestMerchant(scene, s, DETECT);
        if (tm){ const md = dist(s, tm);
          if (md < ATK){ ({ targetHeading, desiredSail, wantFire } = AI.combatManeuver(s, tm, md)); s.state = 'raid'; }
          else { targetHeading = angleTo(s, tm); desiredSail = 2; s.state = 'stalk'; }
        } else { ({ targetHeading, desiredSail } = AI.cruise(scene, s)); s.state = 'cruise'; }
      }

    } else if (s.faction === 'navy'){
      // continuously spot pirate colors within sight (land blocks the view) → hostile
      if (playerPirateFlag && Visibility.canSee(scene, s.x, s.y, pl.x, pl.y, P.navySight)){
        if (!s.hostileToPlayer){ s.hostileToPlayer = true;
          if (!scene._coloresSeen){ scene.navyStanding = Math.max(-100, scene.navyStanding - P.crimePenalty); scene.flashPopup(pl.x, pl.y, 'COLORS SEEN', 0xE0503A); scene._coloresSeen = true; setTimeout(() => { scene._coloresSeen = false; }, 1500); }
        }
      }
      // forgiveness: drop the grudge once the player is no longer a threat AND out of contact
      if (s.hostileToPlayer && !FactionSystem.navyHostile(scene) && !playerPirateFlag){
        const stillSees = Visibility.canSee(scene, s.x, s.y, pl.x, pl.y, P.navySight);
        if (!stillSees || d > P.navySight*1.2){ s.hostileToPlayer = false; }
      }
      const hostile = FactionSystem.navyHostile(scene) || s.hostileToPlayer;
      const homeD = s.home ? Math.hypot(s.x - s.home.x, s.y - s.home.y) : 0;
      const leashed = s.home && homeD > P.navyLeash;
      // A hostile navy engages a player it can see, REGARDLESS of the leash —
      // the leash governs only idle patrol/return, never an active hunt. (Escape
      // by breaking line-of-sight or outrunning sight range; forgiveness then
      // clears the grudge.) Checking the leash first made a witnessing navy turn
      // tail for home instead of attacking.
      if (hostile && d < P.navyAttack){
        ({ targetHeading, desiredSail, wantFire } = AI.combatManeuver(s, pl, d)); s.state = 'attack';
      } else if (hostile && d < P.navySight){
        targetHeading = angleTo(s, pl); desiredSail = 2; s.state = 'pursue';
      } else if (leashed){
        targetHeading = angleTo(s, s.home); desiredSail = 2; s.state = 'return';
      } else {
        // not engaging the player → hunt pirates near home
        const tp = AI.nearestPirate(scene, s, P.navyAttack*1.4);
        if (tp){ const td = dist(s, tp);
          if (td < P.navyAttack){ ({ targetHeading, desiredSail, wantFire } = AI.combatManeuver(s, tp, td)); s.state = 'hunt'; }
          else { targetHeading = angleTo(s, tp); desiredSail = 2; s.state = 'chase'; }
        } else { ({ targetHeading, desiredSail } = AI.patrolHome(scene, s)); s.state = 'patrol'; }
      }

    } else if (s.faction === 'privateer'){
      const hostile = FactionSystem.navyHostile(scene) || s.hitsByPlayer >= P.privHits;
      const lawful = scene.navyStanding > P.privLawful;
      if (hostile){
        if (d < P.navyAttack){ ({ targetHeading, desiredSail, wantFire } = AI.combatManeuver(s, pl, d)); s.state = 'attack'; }
        else { targetHeading = angleTo(s, pl); desiredSail = 2; s.state = 'pursue'; }
      } else if (lawful){
        // hunt pirates, biased toward ones near the player so they feel like they help your fight
        let tp = null, tpd = 1e9;
        for (const o of scene.ships){ if (o.faction !== 'pirate' || !o.alive) continue;
          const od = dist(s, o), score = od + (dist(o, pl) < P.privAssist ? -150 : 0);
          if (score < tpd){ tpd = score; tp = o; } }
        if (tp && dist(s, tp) < P.privAssist){
          if (dist(s, tp) < 260){ ({ targetHeading, desiredSail, wantFire } = AI.combatManeuver(s, tp, dist(s, tp))); s.state = 'assist'; }
          else { targetHeading = angleTo(s, tp); desiredSail = 2; s.state = 'hunt'; }
        } else { ({ targetHeading, desiredSail } = AI.patrolHome(scene, s)); s.state = 'guard'; }
      } else { ({ targetHeading, desiredSail } = AI.patrolHome(scene, s)); s.state = 'wary'; }
    }

    // steer around land first, then ensure the chosen heading is sailable (not in irons)
    targetHeading = Steering.avoidLand(scene, s, targetHeading);
    targetHeading = Steering.avoidIrons(scene, s, targetHeading);

    // turn toward the (clamped) target heading
    const diff = angleDiff(s.heading, targetHeading);
    const tr = calcTurnDegS(s.vel)*0.7*dts;
    s.heading = (s.heading + Math.sign(diff)*Math.min(Math.abs(diff), tr) + 360)%360;
    s.sailState = desiredSail;
    // speed (faction speed factor: merchants slower, navy slightly slower)
    const wa = windOff(s.heading, WindSystem.dirAt(scene, s.x, s.y));
    const sf = s.faction === 'merchant' ? 0.8 : s.faction === 'navy' ? 0.92 : 1.0;
    const wxMult = (typeof WeatherSystem !== 'undefined') ? WeatherSystem.speedMult(scene) : 1;   // rain following-breeze boost
    const tspd = calcTargetSpeed(wa)*SAIL_MULTIPLIERS[s.sailState]*sf*wxMult;
    s.vel += (tspd - s.vel)*Math.min(0.012*dt, 1);
    Collision.moveShip(scene, s, dt);
    scene.pushWake(s);
    if (s.fire > 0) s.fire -= dts;
    if (wantFire !== null) Combat.fireEnemy(scene, s, wantFire);
  },
};
