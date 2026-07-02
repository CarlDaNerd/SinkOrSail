// ── systems/BountySystem.js ── (M10)
// Port bounties: while docked, accept a contract to hunt + sink a pirate, then
// sail back to the issuing port to collect a gold reward (paid into the bank).
// Accepting spawns the target pirate near the issuing port and pushes it into
// scene.ships. You may hold several bounties at once, but a held bounty only
// counts as ACTIVE (drives the HUD compass) while you're in the same world
// CHUNK it was issued in — leave the chunk and it goes dormant until you return.
//
// Kills are detected purely by listening to EV.SHIP_SUNK (we never touch
// Combat): when a sunk ship is one of a held bounty's targets and was sunk by
// the player, that bounty's killsDone ticks up. Turn-in happens on dock.
//
// Owns scene.bounties. Emits feature-local 'bounty:accepted' / 'bounty:completed'.

// placeholder — feel-tune freely
const BOUNTY_PORT_KILLS = 1;          // pirates to sink per port bounty
const BOUNTY_SPAWN_RANGE_PX = 4500;   // how far from the issuer the target spawns (spawns at 0.5–1.0× → ~2250–4500px: a real hunt)
const BOUNTY_REWARD_GOLD = 250;       // gold credited to the bank on turn-in

const BountySystem = {
  init(scene){
    scene.bounties = scene.bounties || [];
    if (this._wired) return;          // idempotent across re-init
    this._wired = true;
    // count a kill toward any held bounty that targeted the sunk ship
    scene.events.on(EV.SHIP_SUNK, ({ ship, by }) => {
      if (by !== 'player' || !ship) return;
      for (const b of scene.bounties){
        if (b.killsDone >= b.killsNeeded) continue;
        if (b.targets.indexOf(ship) !== -1){
          b.killsDone++;
          scene.flashPopup(scene.player.x, scene.player.y - 20,
            'BOUNTY ' + b.killsDone + '/' + b.killsNeeded, 0xF0C840);
        }
      }
    });
  },

  // chunk key the player currently occupies
  chunkKeyOf(x, y){
    return Math.floor(x / CHUNK_SIZE) + ',' + Math.floor(y / CHUNK_SIZE);
  },

  // spawn one pirate within BOUNTY_SPAWN_RANGE_PX of (cx,cy); returns the ship
  spawnTarget(scene, cx, cy, idx){
    const ang = scene.eprng() * Math.PI * 2;
    const r = BOUNTY_SPAWN_RANGE_PX * (0.5 + 0.5 * scene.eprng());   // mid–far ring
    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
    const heading = scene.eprng() * 360;
    const ship = Enemy.create('pirate', 75, x, y, heading, null, scene.eprng, idx);
    scene.ships.push(ship);
    return ship;
  },

  // pressed the bounty key while docked: take a contract from scene.dockPort
  acceptAtDock(scene){
    const issuer = scene.dockPort;
    if (!issuer){ return; }
    // one open contract per issuer at a time
    const held = scene.bounties.find(b => b.issuer === issuer && b.killsDone < b.killsNeeded);
    if (held){
      scene.flashPopup(issuer.x, issuer.y - 30, 'BOUNTY ALREADY TAKEN', 0xE0503A);
      return;
    }
    const targets = [];
    const base = scene.ships.length;
    for (let i = 0; i < BOUNTY_PORT_KILLS; i++){
      targets.push(this.spawnTarget(scene, issuer.x, issuer.y, base + i));
    }
    const bounty = {
      id: 'bnt_' + Date.now() + '_' + Math.floor(scene.eprng() * 1e6),
      issuer,
      killsNeeded: BOUNTY_PORT_KILLS,
      killsDone: 0,
      targets,
      chunkKey: this.chunkKeyOf(issuer.x, issuer.y),
      reward: BOUNTY_REWARD_GOLD,
    };
    scene.bounties.push(bounty);
    scene.events.emit('bounty:accepted', { bounty });
    scene.flashPopup(issuer.x, issuer.y - 30, 'BOUNTY ACCEPTED', 0x6ED0E0);
  },

  // turn-in on docking: pay out any completed bounty issued by this port
  onDock(scene, port){
    for (let i = scene.bounties.length - 1; i >= 0; i--){
      const b = scene.bounties[i];
      if (b.issuer !== port || b.killsDone < b.killsNeeded) continue;
      BankSystem.credit(scene, b.reward);
      scene.flashPopup(port.x, port.y - 30, 'BOUNTY PAID: +' + b.reward + 'g', 0xF0C840);
      // CQ (doc): a proper reward banner, not just a floating world popup
      scene.rewardToast = { text: '☠ BOUNTY COLLECTED ☠\n+' + b.reward + ' GOLD  →  BANK', until: scene.time.now/1000 + 4 };
      scene.bounties.splice(i, 1);
      scene.events.emit('bounty:completed', { bounty: b });
    }
  },

  // light bookkeeping: drop fully-resolved bounties (turn-in handled in onDock)
  update(scene, dt, dts){
    if (!scene.bounties || !scene.bounties.length) return;
  },

  // nearest ALIVE bounty target within tracking range, for the HUD edge arrow.
  // Gated by DISTANCE (not chunk) so the arrow keeps pointing as the pirate closes
  // in — the HUD hides it only once the target is actually on the screen.
  compassTarget(scene){
    const pl = scene.player;
    let best = null, bd = Infinity;
    for (const b of scene.bounties){
      if (b.killsDone >= b.killsNeeded) continue;       // already hunted
      for (const t of b.targets){
        if (!t || !t.alive) continue;
        const d = dist(pl, t);
        if (d < bd && d <= BOUNTY_ARROW_RANGE){ bd = d; best = t; }
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  },

  // world-space red ring over live targets of active (current-chunk) bounties
  draw(scene, g){
    if (!scene.bounties || !scene.bounties.length) return;
    const here = this.chunkKeyOf(scene.player.x, scene.player.y);
    for (const b of scene.bounties){
      if (b.chunkKey !== here || b.killsDone >= b.killsNeeded) continue;
      for (const t of b.targets){
        if (!t || !t.alive) continue;
        g.lineStyle(2, 0xE0503A, 0.85); g.strokeCircle(t.x, t.y, 26);
        g.lineStyle(1, 0xE0503A, 0.4);  g.strokeCircle(t.x, t.y, 34);
      }
    }
  },
};
