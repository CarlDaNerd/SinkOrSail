// ── systems/DevLog.js ──
// A real-time world-event feed for dev/QC. Subscribes to the event bus and the
// feature-local events and appends a short, timestamped line for each into a ring
// buffer (scene.devlog.lines). HUD draws the panel (bottom-left, toggle with L);
// this file only owns the buffer + the subscriptions, so it stays a pure
// init-only registry system.
//
// Consecutive identical lines collapse into one "(Nx) …" so spammy events (e.g.
// cannon-tower fire) can't flood the feed.
const DevLog = {
  init(scene){
    if (!scene.devlog) scene.devlog = { lines: [], on: DEVLOG_DEFAULT_ON };
    if (this._wired) return; this._wired = true;            // subscribe once per page load
    const log = (txt, color) => this.push(scene, txt, color);
    const fac = s => (s && s.faction) || 'ship';

    scene.events.on(EV.SHIP_SUNK,      e => log(fac(e.ship) + ' sunk by ' + (e.by === 'player' ? 'you' : (e.by || '?')), e.by === 'player' ? 0xF0C840 : 0x9FB6C8));
    scene.events.on(EV.SHIP_CAPTURED,  e => log('captured a ' + ((e.ship && e.ship.tier) || 'ship'), 0x6ED0E0));
    scene.events.on(EV.PORT_CAPTURED,  e => log('captured PORT ' + ((e.port && e.port.name) || '?'), 0x6ED0E0));
    scene.events.on(EV.PRIZE_DELIVERED,e => log('prize delivered → ' + ((e.port && e.port.name) || 'port') + ' (runner commissioned)', 0x6ED0E0));
    scene.events.on(EV.DOCK_ENTERED,   e => log('docked at ' + ((e.port && e.port.name) || 'port'), 0x8AAAC8));
    scene.events.on(EV.WEATHER_CHANGED,e => log(e && e.type ? ('weather → ' + e.type.toUpperCase()) : 'weather cleared', 0x9FB6C8));
    scene.events.on(EV.TRADE,          e => { const v = e.side === 'buy' ? 'sold' : 'bought'; log(v + ' ' + e.qty + ' ' + e.commodity + ' ' + (e.side === 'buy' ? '+' : '-') + e.gold + 'g @ ' + ((e.port && e.port.name) || '?'), 0xF0C840); });
    scene.events.on(EV.PORT_DEFENSE_TRIGGERED, e => log('TOWERS fire — ' + ((e.port && e.port.name) || 'port'), 0xE0503A));
    scene.events.on(EV.SHIP_DOCKED,    e => log(fac(e.ship) + ' docked at ' + ((e.port && e.port.name) || 'port'), 0x6a8298));
    scene.events.on('bounty:accepted', () => log('bounty accepted', 0xE0A040));
    scene.events.on('bounty:completed',e => log('bounty COMPLETED +' + ((e.bounty && e.bounty.reward) || '') + 'g', 0xF0C840));
    scene.events.on('achievement:unlocked', e => log('★ ACHIEVEMENT: ' + e.name, 0xF0C840));

    log('— dev log ready (L to hide) —', 0x6a8298);
  },

  push(scene, txt, color){
    const dl = scene.devlog; if (!dl) return;
    const t = scene.time.now / 1000;
    const last = dl.lines[dl.lines.length - 1];
    if (last && last.txt === txt){ last.n = (last.n || 1) + 1; last.t = t; return; }   // collapse repeats
    dl.lines.push({ t, txt, color: color || 0x9FB6C8, n: 1 });
    while (dl.lines.length > DEVLOG_MAX) dl.lines.shift();
  },
};
