/* game-kit 26c9b87: js/mg-pour.js — edit in game-kit and run tools/kit-sync.js */
// Library mini game "pour" (from 八尺様 ― 境の夜: the salt heaps): press and hold to pour, release when the heap is inside the band.
// A miss just empties the dish and lets you pour again. Mouse, touch, Space / E. Register it with useMinigames() of js/mg-library.js.
//   cfg: title, help, button ('押して注ぐ'), lo / hi (0.62 / 0.8: the band, 0..1 of the dish), speed (0.55 per second held),
//        ok / few / many / spill (the lines), look: 'salt' (white heap, default) | 'water' | 'sand'
//   hooks: { sound(name, ctx) }  name = 'pour' (pressed) | 'ok'
import { mgFrame } from './mg-frame.js';

export const pourOk = (level, lo = 0.62, hi = 0.8) => level >= lo && level <= hi;

export default {
  type: 'pour',
  about: '押している間だけ注ぎ、線の高さで離す（塩・水・砂など）',
  mount(host, cfg = {}, ctx = {}, hooks = {}) {
    return new Promise((done) => {
      const lo = cfg.lo ?? 0.62, hi = cfg.hi ?? 0.8, speed = cfg.speed ?? 0.55, snd = (n) => hooks.sound && hooks.sound(n, ctx);
      let level = 0, holding = false, raf = 0, last = 0;
      const f = mgFrame(host, { title: cfg.title || '注ぐ', help: cfg.help || '押している間、落ちていきます。線のところで離してください。' }, (ok) => { cancelAnimationFrame(raf); done(ok); });
      f.body.innerHTML = `<div class="mgx-pour mgx-pour--${cfg.look || 'salt'}"><div class="mgx-pour-dish"><div class="mgx-pour-heap"></div><div class="mgx-pour-band" style="bottom:${lo * 100}%;height:${(hi - lo) * 100}%"></div></div><button type="button" class="btn primary mgx-pour-btn">${cfg.button || '押して注ぐ'}</button></div>`;
      const heap = f.body.querySelector('.mgx-pour-heap'), btn = f.body.querySelector('.mgx-pour-btn');
      const draw = () => { heap.style.height = `${Math.min(1, level) * 100}%`; };
      const miss = (m) => { f.say(m); level = 0; setTimeout(draw, 250); };
      const tick = (t) => { if (holding) { const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; level += dt * speed; if (level > 1.05) { holding = false; miss(cfg.spill || 'こぼれてしまった。もう一度、少しずつ。'); } draw(); } last = t; raf = requestAnimationFrame(tick); };
      const press = () => { if (holding || f.done) return; holding = true; f.say(''); snd('pour'); };
      const release = () => { if (!holding) return; holding = false; if (pourOk(level, lo, hi)) { f.say(cfg.ok || 'ちょうどいい。'); snd('ok'); setTimeout(() => f.end(true), 650); } else miss(level < lo ? cfg.few || '少なすぎます。線まで注いでください。' : cfg.many || '多すぎます。線のところで離してください。'); };
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, release);
      f.on('keydown', (e) => { if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); press(); } });
      f.on('keyup', (e) => { if (e.code === 'Space' || e.code === 'KeyE') release(); });
      if (ctx.qa) return f.end(true);
      raf = requestAnimationFrame(tick); btn.focus();
    });
  },
};
