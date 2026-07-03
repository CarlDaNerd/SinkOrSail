// ── systems/TavernSystem.js ── (TM1)
// Port taverns: a dock-menu subscreen ([T] while docked) offering missions
// generated from the MISSION_DEFS templates (see missions/MissionDefs.js —
// the data-driven pattern MissionLoader established). V1 mission types:
//   hunt      — sink N pirates; auto-pays to the bank on the last kill
//   delivery  — carry a parcel to a named port; pays on docking there
// Offers regenerate per docking via the gameplay PRNG (deterministic).
// Missions are SESSION-ONLY in V1 (not in the save payload — flagged for Carl).
// ALL numbers PLACEHOLDER pending live tune.
const TAVERN_MAX_ACTIVE = 2;          // active missions the player can hold
const TAVERN_OFFERS = 2;              // offers on the board per visit

const TavernSystem = {
  init(scene){
    scene.tavernOpen = false;
    scene.activeMissions = [];
    scene._tavernOffers = null;       // regenerated on each dock
    // hunt progress rides the sink event
    scene.events.on(EV.SHIP_SUNK, (e) => this._onSink(scene, e));
  },

  // regenerate this port's offer board (called from Systems.onDock)
  onDock(scene, port){
    const defs = (typeof MISSION_DEFS !== 'undefined') ? MISSION_DEFS : [];
    scene._tavernOffers = [];
    // distinct def per slot (offset walk) so one board never offers duplicates
    const base = Math.floor(scene.eprng() * Math.max(1, defs.length));
    for (let i = 0; i < TAVERN_OFFERS && i < defs.length; i++){
      const offer = defs[(base + i) % defs.length].roll(scene, port);
      if (offer) scene._tavernOffers.push(offer);
    }
    // delivery turn-in: docking at the destination completes it
    for (let i = scene.activeMissions.length - 1; i >= 0; i--){
      const m = scene.activeMissions[i];
      if (m.type === 'delivery' && m.dest === port){
        this._complete(scene, m, i);
      }
    }
  },

  toggle(scene){
    if (!scene.docked) return;
    scene.tavernOpen = !scene.tavernOpen;
  },

  accept(scene, idx){
    if (!scene.tavernOpen || !scene._tavernOffers) return;
    const offer = scene._tavernOffers[idx];
    if (!offer) return;
    const pl = scene.player;
    if (scene.activeMissions.length >= TAVERN_MAX_ACTIVE){
      scene.flashPopup(pl.x, pl.y - 30, 'MISSION LOG FULL (' + TAVERN_MAX_ACTIVE + ')', 0xE0503A); return;
    }
    scene._tavernOffers.splice(idx, 1);
    scene.activeMissions.push(offer);
    scene.flashPopup(pl.x, pl.y - 30, 'ACCEPTED: ' + offer.title.toUpperCase(), 0xF0C840);
  },

  _onSink(scene, e){
    if (!e || !e.ship || e.by !== 'player') return;
    if (e.ship.faction !== 'pirate') return;
    for (let i = 0; i < scene.activeMissions.length; i++){        // oldest mission credits first
      const m = scene.activeMissions[i];
      if (m.type !== 'hunt') continue;
      m.done++;
      if (m.done >= m.need) this._complete(scene, m, i);
      break;                                             // one mission credits per kill
    }
  },

  _complete(scene, m, idx){
    scene.activeMissions.splice(idx, 1);
    if (typeof BankSystem !== 'undefined') BankSystem.credit(scene, m.reward);
    else scene.player.gold += m.reward;
    scene.rewardToast = { text: '✓ MISSION COMPLETE — ' + m.title.toUpperCase() + '\n+' + m.reward + ' GOLD  →  BANK', until: scene.time.now/1000 + 4 };
  },

  // the tavern board + active log as text (rendered by HUD in the dock panel)
  boardText(scene){
    const port = scene.dockPort;
    let s = '🍺  THE ' + this._tavernName(port) + '   —   ' + (port ? port.name : '') + '\n\n';
    s += 'RUMOR: "' + this._rumor(scene, port) + '"\n\nWORK ON THE BOARD:\n';
    const offers = scene._tavernOffers || [];
    if (!offers.length) s += '  (nothing today — come back after a voyage)\n';
    offers.forEach((o, i) => { s += '[' + (i + 1) + '] ' + o.title + '  —  ' + o.reward + 'g\n      ' + o.desc + '\n'; });
    s += '\nYOUR LOG (' + scene.activeMissions.length + '/' + TAVERN_MAX_ACTIVE + '):\n';
    if (!scene.activeMissions.length) s += '  (no active missions)\n';
    for (const m of scene.activeMissions) s += '  • ' + this.progressLine(m) + '\n';
    s += '\n[T] Back to port menu';
    return s;
  },

  progressLine(m){
    if (m.type === 'hunt') return m.title + '  ' + m.done + '/' + m.need;
    if (m.type === 'delivery') return m.title + '  → ' + (m.dest ? m.dest.name : '?');
    return m.title;
  },

  // deterministic flavor from the port seed — no PRNG draws
  _tavernName(port){
    const names = ['DROWNED RAT', 'BRASS PARROT', 'SALTY GIBBET', 'LAST ANCHOR', 'CROOKED COMPASS', 'WIDOW\'S WAKE'];
    return names[(port && port.seed ? port.seed : 0) % names.length];
  },
  _rumor(scene, port){
    const r = ['They say the navy pays double for pirate hulls this season',
      'A leviathan was sighted beyond the far reefs… nobody sailed back to confirm',
      'Storms have been birthing cyclones east of here',
      'A merchant swears the bergs up north chewed through his convoy',
      'Half the crews in port refuse to sail without a flagship escort'];
    return r[(port && port.seed ? (port.seed >> 3) : 0) % r.length];
  },
};
