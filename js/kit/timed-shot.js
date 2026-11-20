/* game-kit 2e206ef: js/timed-shot.js — edit in game-kit and run tools/kit-sync.js */
// A moment that is gone in a few seconds, and a catch that costs something (standard 1.18.0, 鏡屋 kagamiya feedback #9 #4).
//
// ctx.timedShot.start({ id, label, seconds, aim, ok, miss }) -> { cancel(), done() }
//   A band at the top of the screen (HUD slot 'tc') shows what to shoot and how many seconds are left; the clock runs only while the player
//   can act (no window open). `aim` is a function (true = the camera points at it) or a point { x, y, z, max = 9, cos = 0.9 }.
//   The game's own shoot action calls ctx.timedShot.shoot(): true = the moment took this shot (call ok, end), false = nothing waiting / not
//   aimed. Running out calls miss. A miss never blocks the way: the moment just passes (the game says so in miss).
//   ctx.timedShot.current -> { id, left } | null. A respawn cancels it.
// ctx.aimAt(p, max = 9, cos = 0.9): the camera points at p within max metres and a cone of cos.
// ctx.hurt(reason, { line, window = 30, next }): the first grab hurts (pushed, the legs give, the heart, a line + 「もう一度つかまれたら、終わり。」);
//   a second within `window` seconds is the catch: ctx.die(reason) (its own death card from game.json "deaths"). Returns 'hurt' | 'dead'.
//   tools/check-playtest.mjs P15: every reason a game passes to ctx.die / ctx.hurt has its own card in game.json "deaths".
export const HURT_NEXT = 'もう一度つかまれたら、終わり。';

/** the clock of one timed moment (pure: test/playtest-findings.test.mjs) */
export function timedClock(seconds) {
  const c = { seconds, left: seconds, over: false };
  c.tick = (dt, active) => { if (!c.over && active) { c.left = Math.max(0, c.left - dt); if (c.left <= 0) c.over = true; } return c.over; };
  return c;
}
/** hurt or dead (pure): the second grab within `window` seconds of the first is the catch */
export function hurtStep(st, now, window = 30) {
  if (st.n >= 1 && now - st.at < window) return { n: 0, at: -1e9, out: 'dead' };
  return { n: 1, at: now, out: 'hurt' };
}

export function installTimedShot(ctx, { bus, systems }) {
  const THREE = ctx.THREE, fwd = new THREE.Vector3(), v = new THREE.Vector3();
  ctx.aimAt = (p, max = 9, cos = 0.9) => {
    const c = ctx.camera.position; ctx.camera.getWorldDirection(fwd); v.set(p.x - c.x, (p.y ?? c.y) - c.y, p.z - c.z);
    const d = v.length(); return d < max && fwd.dot(v) / (d || 1) > cos;
  };
  let cur = null, el = null;
  const band = () => {
    if (el || typeof document === 'undefined') return el;
    el = document.createElement('div'); el.id = 'gf-timed'; el.className = 'gf-timed'; el.setAttribute('role', 'status'); el.hidden = true;
    el.innerHTML = '<div class="gf-timed-label"></div><div class="gf-timed-track"><i></i></div><div class="gf-timed-key"></div>';
    (document.getElementById('hud') || document.body).appendChild(el);
    if (ctx.registerHudPart) try { ctx.registerHudPart('gf-timed', { slot: 'tc', order: 0 }); } catch { /* an older HUD */ }
    return el;
  };
  const show = () => {
    const b = band(); if (!b) return; b.hidden = !cur; if (!cur) return;
    b.querySelector('.gf-timed-label').textContent = cur.label || '';
    const key = cur.key || (ctx.isTouch ? '［撮る］' : '［Q］');
    b.querySelector('.gf-timed-key').textContent = `${key}で撮る　あと ${cur.clock.left.toFixed(1)} 秒`;
    b.querySelector('i').style.width = `${((cur.clock.left / cur.clock.seconds) * 100).toFixed(1)}%`;
    b.classList.toggle('gf-timed-low', cur.clock.left < cur.clock.seconds * 0.35);
  };
  const aimed = (c) => (typeof c.aim === 'function' ? !!c.aim() : c.aim ? ctx.aimAt(c.aim, c.aim.max ?? 9, c.aim.cos ?? 0.9) : false);
  const end = (how) => {
    const c = cur; if (!c) return; cur = null; show();
    bus.emit('timed:end', { id: c.id, how });
    try { if (how === 'ok' && c.ok) c.ok(); if (how === 'miss' && c.miss) c.miss(); } catch (e) { console.error(e); }
  };
  ctx.timedShot = {
    start(o) {
      if (cur) end('cancel');
      const c = cur = { ...o, clock: timedClock(o.seconds || 5) };
      try { ctx.sound && ctx.sound('heartbeat', 0.8); } catch { /* no sound */ }
      show(); bus.emit('timed:start', { id: c.id });
      return { cancel: () => cur === c && end('cancel'), done: () => cur === c && end('ok') };
    },
    shoot() { if (!cur || !aimed(cur)) return false; end('ok'); return true; },
    get current() { return cur && { id: cur.id, left: cur.clock.left }; },
  };
  systems.push({ id: 'timed-shot', def: { update: (dt, c, active) => { if (cur && cur.clock.tick(dt, active)) end('miss'); else if (cur && active) show(); } }, inst: null });
  bus.on('player:respawn', () => { if (cur) end('cancel'); hurt = { n: 0, at: -1e9 }; });

  let hurt = { n: 0, at: -1e9 };
  ctx.hurt = (reason, o = {}) => {
    if (ctx.state.ended) return 'dead';
    const now = performance.now() / 1000, s = hurtStep(hurt, now, o.window ?? 30); hurt = s;
    if (s.out === 'dead') { bus.emit('player:hurt', { reason, fatal: true }); ctx.die(reason); return 'dead'; }
    try { ctx.sound && ctx.sound('stinger'); } catch { /* no sound */ }
    if (ctx.body) { ctx.body.stagger && ctx.body.stagger(2.2, 0.6); ctx.body.heartbeat && ctx.body.heartbeat(6, 130, 0.6); }
    if (ctx.approach && ctx.approach.pulse) ctx.approach.pulse(1);
    if (ctx.fx && ctx.fx.spook) ctx.fx.spook(1);
    ctx.answer(`${o.line ? `${o.line}　` : ''}${o.next ?? HURT_NEXT}`);
    bus.emit('player:hurt', { reason, fatal: false });
    return 'hurt';
  };
}
