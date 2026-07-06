// ── systems/CrashLog.js ──
// Surfaces the crash-log bootstrap's captured errors (window.__crashLog, wired
// in index.html BEFORE any other script loads — see the inline <script> at the
// top of <head>) inside the running game: attaches live game-state context to
// new entries, echoes them into the existing on-screen dev log, and backs the
// dev panel's copy/download/clear buttons.
//
// Why a bootstrap + this split: an uncaught throw kills Phaser's rAF loop dead
// (nothing schedules the next frame — this is exactly how the P0 Leviathan/
// waypoint bug froze the whole game), so anything that depends on the scene
// being alive — DevLog lines, HUD text — never draws for THAT crash. The
// bootstrap's raw window.onerror/unhandledrejection listeners + localStorage
// persistence run independent of the scene and survive the freeze; reloading
// the page still has the entry. This file is for readability/UX, not capture.
const CrashLog = {
  init(scene){
    // live game-state snapshot attached to every future capture (the bootstrap
    // calls this at record time so error paths elsewhere don't need to know
    // about game state at all)
    window.__crashLogContext = () => ({
      x: Math.round(scene.player.x), y: Math.round(scene.player.y),
      hull: Math.round(scene.player.hull), maxHull: scene.player.maxHull,
      tier: scene.player.tier, gold: scene.player.gold, bank: scene.player.bank,
      docked: !!scene.docked, mapOpen: !!scene.mapOpen, menuOpen: !!scene.menuOpen,
      flag: scene.flag, ships: (scene.ships || []).length,
      fps: (scene.game && scene.game.loop) ? Math.round(scene.game.loop.actualFps) : undefined,
    });
    // echo new captures into the existing on-screen dev log (visible by default,
    // DEVLOG_DEFAULT_ON) so a playtester sees it without opening the dev panel.
    // Only fires for errors caught WHILE the loop is still alive — a fatal freeze
    // has nothing left to draw the line; that case relies on the bootstrap's
    // localStorage persistence + a reload instead.
    window.__crashLogSubs.push(entry => {
      if (typeof DevLog !== 'undefined') DevLog.push(scene, '⚠ ' + entry.kind.toUpperCase() + ': ' + entry.message, 0xE0503A);
    });
  },

  // Manual capture for try/catch call sites (SystemRegistry, the per-ship AI
  // loop) — funnels through the SAME bootstrap path so persistence/console/
  // DevLog all stay in one place. `meta` (e.g. {system, hook}) is folded into
  // the entry's source tag so the report shows which call site broke.
  capture(err, meta){
    const source = meta ? Object.entries(meta).map(([k, v]) => k + '=' + v).join(' ') : '';
    if (typeof window.__crashLogRecord === 'function'){
      window.__crashLogRecord('caught', (err && err.message) || String(err), (err && err.stack) || '', source);
    } else console.error('[CrashLog]', source, err);
  },

  entries(){ return window.__crashLog || []; },

  clear(){
    window.__crashLog = [];
    try { localStorage.removeItem('sos_crashlog_v1'); } catch (e){}
  },

  // human-readable report for the dev panel's COPY/DOWNLOAD buttons
  report(){
    const list = this.entries();
    if (!list.length) return '(no errors recorded)';
    return list.map(e => {
      const when = new Date(e.t).toISOString();
      const head = `[${when}] ${e.kind.toUpperCase()}: ${e.message}` + (e.source ? ` (${e.source})` : '');
      const ctx = e.ctx ? '  ctx: ' + JSON.stringify(e.ctx) : '';
      const stack = e.stack ? '\n' + e.stack : '';
      return head + ctx + stack;
    }).join('\n\n');
  },

  // mirrors Save.exportSaved's Blob-download pattern
  download(){
    const blob = new Blob([this.report()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'sinkorsail-crashlog.txt'; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  },
};
