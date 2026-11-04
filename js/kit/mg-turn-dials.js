/* game-kit b4c715e: js/mg-turn-dials.js — edit in game-kit and run tools/kit-sync.js */
// Library mini game "turn-dials" (from 八尺様 ― 境の夜: the gate's three turn-buttons): each press turns a dial by one step; set every
// dial to its answer (a clue in the world tells which), then try. Mouse, touch, keyboard (Tab + Enter).
//   cfg: title, help, labels (under each dial, e.g. ['朝日', '正午', '地蔵']), answer (indexes into dirs, e.g. [1, 2, 0]),
//        dirs (['北', '東', '南', '西']), hint (the line of the hint button; none = no button), tryLabel ('外す'), ok, bad
//   hooks: { sound(name, ctx) ('turn' | 'bad' | 'ok'), get() -> saved turns, set(turns) }   (the dials keep their turns between tries)
import { mgFrame, esc } from './mg-frame.js';

export const DIRS = ['北', '東', '南', '西'];
export const dialsOk = (v, answer, n = 4) => v.length === answer.length && v.every((x, i) => ((x % n) + n) % n === answer[i]);

export default {
  type: 'turn-dials',
  about: '押すたびに一段ずつ回る金具を、手がかりの向きにそろえる',
  mount(host, cfg = {}, ctx = {}, hooks = {}) {
    return new Promise((done) => {
      const dirs = cfg.dirs || DIRS, labels = cfg.labels || ['1', '2', '3'], answer = cfg.answer || labels.map(() => 0), snd = (n) => hooks.sound && hooks.sound(n, ctx);
      const v = ((hooks.get && hooks.get()) || []).slice(0, labels.length);
      while (v.length < labels.length) v.push(0);
      const f = mgFrame(host, { cfg, ctx, title: cfg.title || '回し金', help: cfg.help || '金具を押すと一段ずつ回ります。手がかりの向きにそろえてください。' }, done);
      f.body.innerHTML = `<div class="mgx-dials">${labels.map((l, i) => `<button type="button" class="mgx-dial" data-i="${i}"><span class="mgx-dial-arrow" aria-hidden="true"></span><b class="mgx-dial-dir"></b><small>${esc(l)}</small></button>`).join('')}</div><div class="mgx-row">${cfg.hint ? '<button type="button" class="btn" data-hint>手がかりを読む</button>' : ''}<button type="button" class="btn primary" data-try>${esc(cfg.tryLabel || '外す')}</button></div>`;
      const dials = [...f.body.querySelectorAll('.mgx-dial')], step = 360 / dirs.length;
      const draw = () => dials.forEach((d, i) => { const k = v[i] % dirs.length; d.querySelector('.mgx-dial-arrow').style.transform = `rotate(${v[i] * step}deg)`; d.querySelector('.mgx-dial-dir').textContent = dirs[k]; d.setAttribute('aria-label', `${i + 1}番目の金具。いまは${dirs[k]}。押して回す`); });
      dials.forEach((d, i) => d.addEventListener('click', () => { v[i] = (v[i] + 1) % dirs.length; draw(); snd('turn'); f.say(''); hooks.set && hooks.set(v.slice()); }));
      const h = f.body.querySelector('[data-hint]'); if (h) h.onclick = () => f.say(cfg.hint);
      f.body.querySelector('[data-try]').onclick = () => { if (dialsOk(v, answer, dirs.length)) { f.say(cfg.ok || '外れた。'); snd('ok'); f.win(500); } else { f.say(cfg.bad || '引っかかる。向きがまだ合っていません。'); snd('bad'); f.miss(); } };
      draw();
      if (ctx.qa) return f.end(true);
      dials[0].focus();
    });
  },
};
