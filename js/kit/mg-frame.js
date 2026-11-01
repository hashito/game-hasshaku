/* game-kit 26c9b87: js/mg-frame.js — edit in game-kit and run tools/kit-sync.js */
// The frame of the library mini games (js/mg-*.js): a top-anchored panel (title, close, help, the stage, a message line) inside the host
// the game gives. Esc and the close button end without penalty. Style: css/kit.css "mini game library" block (.mgx-*, theme tokens).
//   const f = mgFrame(host, { title, help }, (ok) => done(ok));   f.body / f.say(text) / f.on(type, fn) / f.end(ok)
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function mgFrame(host, { title = '', help = '' } = {}, done = () => {}) {
  host.innerHTML = `<div class="mgx" role="dialog" aria-label="${esc(title)}"><div class="mgx-head"><b>${esc(title)}</b><button type="button" class="btn mgx-close" data-close>閉じる</button></div>${help ? `<p class="mgx-help">${esc(help)}</p>` : ''}<div class="mgx-body"></div><p class="mgx-msg" aria-live="polite"></p></div>`;
  const msg = host.querySelector('.mgx-msg');
  let finished = false;
  const offs = [];
  const f = {
    body: host.querySelector('.mgx-body'),
    say: (t) => { msg.textContent = t || ''; },
    // a window listener that lives until the game ends
    on: (type, fn) => { addEventListener(type, fn); offs.push(() => removeEventListener(type, fn)); },
    end: (ok) => { if (finished) return; finished = true; offs.forEach((o) => o()); done(!!ok); },
    get done() { return finished; },
  };
  host.querySelector('[data-close]').onclick = () => f.end(false);
  f.on('keydown', (e) => { if (e.code === 'Escape') f.end(false); });
  return f;
}
