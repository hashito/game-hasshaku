// The two mini games this game adds to the standard set (rule S16 / U5): short, mouse and touch, no penalty for a miss.
//   salt : press and hold to let the salt fall; release when the heap reaches the band (a miss just pours again)
//   gate : three iron turn-buttons; each press turns one by 90 degrees; set them to 東・南・北 (the notice on the gate post)
// Both mount into the host the standard gives (game-core runMinigame) and resolve true (done) or false (closed).
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const DIRS = ['北', '東', '南', '西'];
export const GATE_ANSWER = [1, 2, 0];   // 東・南・北
export const gateOk = (v) => v.length === 3 && v.every((x, i) => ((x % 4) + 4) % 4 === GATE_ANSWER[i]);
export const saltOk = (level, lo = 0.62, hi = 0.8) => level >= lo && level <= hi;

function frame(host, title, help) {
  host.innerHTML = `<div class="hk-mg" role="dialog" aria-label="${esc(title)}"><div class="hk-mg-head"><b>${esc(title)}</b><button type="button" class="btn hk-mg-close" data-close>閉じる</button></div><p class="hk-mg-help">${esc(help)}</p><div class="hk-mg-body"></div><p class="hk-mg-msg" aria-live="polite"></p></div>`;
  return { body: host.querySelector('.hk-mg-body'), msg: host.querySelector('.hk-mg-msg'), close: host.querySelector('[data-close]') };
}

export const saltGame = {
  mount(host, cfg, ctx) {
    return new Promise((done) => {
      const f = frame(host, cfg.title || '塩を盛る', cfg.help || '押している間、塩が落ちます。線のところで離してください。');
      f.body.innerHTML = `<div class="hk-salt"><div class="hk-salt-dish"><div class="hk-salt-heap"></div><div class="hk-salt-band"></div></div><button type="button" class="btn primary hk-salt-pour">押して塩を落とす</button></div>`;
      const heap = f.body.querySelector('.hk-salt-heap'), pour = f.body.querySelector('.hk-salt-pour');
      let level = 0, holding = false, raf = 0, last = 0, finished = false;
      const draw = () => { heap.style.height = `${Math.min(1, level) * 100}%`; };
      const tick = (t) => { if (holding) { const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; level += dt * 0.55; if (level > 1.05) { holding = false; miss('こぼれてしまった。もう一度、少しずつ。'); } draw(); } last = t; raf = requestAnimationFrame(tick); };
      const miss = (m) => { f.msg.textContent = m; level = 0; setTimeout(draw, 250); };
      const end = (ok) => { if (finished) return; finished = true; cancelAnimationFrame(raf); removeEventListener('keydown', key); removeEventListener('keyup', keyUp); done(ok); };
      const release = () => { if (!holding) return; holding = false; if (saltOk(level)) { f.msg.textContent = 'ちょうどいい。白い山が、皿の真ん中に立った。'; ctx && ctx.hk && ctx.hk.sound.salt(); setTimeout(() => end(true), 650); } else miss(level < 0.62 ? '少なすぎます。線まで盛ってください。' : '多すぎます。線のところで離してください。'); };
      pour.addEventListener('pointerdown', (e) => { e.preventDefault(); holding = true; f.msg.textContent = ''; ctx && ctx.hk && ctx.hk.sound.salt(); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) pour.addEventListener(ev, release);
      const key = (e) => { if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); if (!holding) { holding = true; f.msg.textContent = ''; } } else if (e.code === 'Escape') end(false); };
      const keyUp = (e) => { if (e.code === 'Space' || e.code === 'KeyE') release(); };
      addEventListener('keydown', key); addEventListener('keyup', keyUp);
      f.close.onclick = () => end(false);
      if (ctx && ctx.qa) return end(true);
      raf = requestAnimationFrame(tick); pour.focus();
    });
  },
};

export const gateGame = {
  mount(host, cfg, ctx) {
    return new Promise((done) => {
      const f = frame(host, cfg.title || '三つの回し金', '金具を押すと、九十度ずつ回ります。左から順に、朝日が出る方・正午に日がある方・北の地蔵の方に合わせてください。');
      const v = (ctx && ctx.hk && ctx.hk.state.gate) || [0, 0, 0];
      const labels = ['朝日', '正午', '地蔵'];
      f.body.innerHTML = `<div class="hk-gate">${labels.map((l, i) => `<button type="button" class="hk-dial" data-i="${i}" aria-label="${i + 1}番目の金具"><span class="hk-dial-arrow" aria-hidden="true"></span><b class="hk-dial-dir"></b><small>${l}</small></button>`).join('')}</div><div class="hk-gate-row"><button type="button" class="btn" data-hint>貼り紙をよく読む</button><button type="button" class="btn primary" data-try>留め具を外す</button></div>`;
      const dials = [...f.body.querySelectorAll('.hk-dial')];
      const draw = () => dials.forEach((d, i) => { d.querySelector('.hk-dial-arrow').style.transform = `rotate(${v[i] * 90}deg)`; d.querySelector('.hk-dial-dir').textContent = DIRS[v[i] % 4]; d.setAttribute('aria-label', `${i + 1}番目の金具。いまは${DIRS[v[i] % 4]}。押して回す`); });
      dials.forEach((d, i) => d.addEventListener('click', () => { v[i] = (v[i] + 1) % 4; draw(); ctx && ctx.hk && ctx.hk.sound.knock({ n: 1, vol: 0.25, pan: 0 }); f.msg.textContent = ''; if (ctx && ctx.hk) ctx.hk.state.gate = v.slice(); }));
      f.body.querySelector('[data-hint]').onclick = () => { f.msg.textContent = '朝日は「東」、正午の日は「南」。最後は「北」。左から 東・南・北 に合わせます。'; };
      f.body.querySelector('[data-try]').onclick = () => { if (gateOk(v)) { f.msg.textContent = '回し金が外れた。'; setTimeout(() => end(true), 500); } else { f.msg.textContent = '留め具が引っかかる。向きがまだ合っていません。'; ctx && ctx.hk && ctx.hk.sound.knock({ n: 2, vol: 0.4 }); } };
      let finished = false;
      const end = (ok) => { if (finished) return; finished = true; removeEventListener('keydown', key); done(ok); };
      const key = (e) => { if (e.code === 'Escape') end(false); };
      addEventListener('keydown', key);
      f.close.onclick = () => end(false);
      draw();
      if (ctx && ctx.qa) return end(true);
      dials[0].focus();
    });
  },
};
