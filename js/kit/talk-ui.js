/* game-kit 1d506003: js/talk-ui.js — edit in game-kit and run tools/kit-sync.js */
// The 3D conversation window (standard 1.7): who speaks, where, an optional picture, the line, and 次へ (tap / click / Enter; S11:
// the player sends each line). A choice is the same window with buttons. Both open in the ONE window of win-manager (U12), so the game
// pauses and the pointer is free while they are open; the protagonist's thoughts stay in the thought band (ctx.monologue).
//   await ctx.talk([{ who: '祖父', where: '玄関', img: 'assets/photos/x.webp', text: '…' }, { who: '私', text: '…' }], { title: '居間', last: '閉じる' });
//   const v = await ctx.choose({ who: '戸の外', text: '…', options: [{ id: 'open', label: '開ける' }, { id: 'keep', label: '開けない', primary: true }] });
//   a line may carry a voice: { who, text, voice: 'assets/voice/x.mp3', vfx: 'wall' | null } -> played when the line shows, stopped on the next line / close
//   portraits: { '祖父': 'assets/photos/ph-grandpa.webp', ... } (game.json "portraits", or createTalk / talk option): the speaker's face beside
//   EVERY line they say (a line's own img is the scene picture above it); the me-speaker has none. A window with faces or pictures keeps one size.
//   a line may carry a body effect: { who, text, fx: 'dizzy' | { dizzy: [3, 1.5] } } (js/body-fx.js)
//   ctx.talk('opening')   // a key of data/talk.json (game.json "data": { "talk": "data/talk.json" }) holding an array of lines
// ?qa (tests): nothing opens, talk resolves true and choose resolves with window.__gfChoice or the primary option; ctx.talkLog lists what was shown.
// Style: css/kit.css .gf-talk (tokens). The me-speaker (default '私') is drawn quieter.
// Steady pictures (1.11.1, from 五人分の朝: 「トップ画像が読み込み中の時に吹き出しが上下します」): every picture of a talk is loaded when it
// opens, the picture box has its size before the picture arrives (css aspect-ratio), and a line without a picture keeps the last one
// shown, so the words never jump up and down from line to line.
// 1.20.0 (水無瀬病院 2nd play test #14 #15 「事務机の問題クエストは良いのですがもう少し雰囲気のあるUIに」「選択中にバーを表示するや、早くして
// くれなどの声を入れるのもいい」): two options of ctx.choose:
//   look: 'form', form: { org: '水無瀬病院 病理科', title: '標本照合票', no: '第七号', stamp: '照合', note: '…' }   the choice is an old office form on aged
//     paper (js/paper-doc.js): the heading, a number, the question as 「問」, each option a row with a box to tick; the picked row gets a red stamp
//     (the stamp sound) before the window closes.
//   timer: { seconds: 20, urge: [{ at: 0.5, who: 'ひなた', text: '湊……早く。', voice: '…mp3' }, { at: 0.15, … }], out: { who, text, voice }, onOut() }
//     a bar empties while the player reads; at each fraction of time left the urge line shows under it and is spoken (prio 'hint'). When it runs
//     out, out is said, onOut() runs (the game's soft cost: the water rises a little), and the bar starts again. It never picks for the player
//     (rule no-auto-advance: the timer presses, it does not decide).
//   timedUrges(urge, seconds, left) (pure) -> the urge lines due at this moment (test/playtest-findings.test.mjs).
import { paperURL, hashStr } from './paper-doc.js';
export function timedUrges(urge = [], seconds, left, said = new Set()) {
  return urge.map((u, i) => ({ u, i })).filter(({ u, i }) => !said.has(i) && left <= seconds * (u.at ?? 0.5)).map(({ u, i }) => (said.add(i), u));
}
const CHOICE_CSS = `
.gf-ch-timer{margin:0 0 12px}.gf-ch-timer-track{height:9px;border-radius:5px;background:rgba(120,120,110,.28);overflow:hidden}
.gf-ch-timer-track i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#b8323a,#e0a43a);transition:width .12s linear}
.gf-ch-timer.low .gf-ch-timer-track i{animation:gf-ch-throb .6s ease-in-out infinite}@keyframes gf-ch-throb{50%{opacity:.45}}
.gf-ch-urge{min-height:1.6em;margin:6px 0 0;font-size:16px;line-height:1.5;color:#c95a4a;font-weight:700}
.gf-form-choice{position:relative;padding:22px 24px 20px;color:#1d1b17;background-color:#e6dcc0;background-size:cover;background-position:center;box-shadow:0 8px 30px rgba(0,0,0,.55);border-radius:2px;font-family:"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif}
.gf-form-choice .gf-fc-org{margin:0;font-size:13px;letter-spacing:.2em;color:#3a352c}
.gf-form-choice .gf-fc-title{margin:2px 0 2px;text-align:center;font-size:clamp(19px,4.6vw,24px);font-weight:700;letter-spacing:.35em;border-bottom:3px double #3a352c;padding-bottom:4px}
.gf-form-choice .gf-fc-no{margin:0 0 10px;text-align:right;font-size:13px;color:#4b463c}
.gf-form-choice .gf-fc-q{margin:0 0 12px;padding:8px 10px;border:1px solid #57524a;font-size:17px;line-height:1.7;background:rgba(255,252,240,.35)}
.gf-form-choice .gf-fc-q b{margin-right:.5em;color:#7a1f18}
.gf-form-choice .gf-fc-opts{display:flex;flex-direction:column;gap:6px}
.gf-form-choice .gf-fc-opt{position:relative;display:flex;align-items:center;gap:10px;min-height:48px;width:100%;padding:8px 12px;text-align:left;font:inherit;font-size:17px;color:#1d1b17;background:rgba(255,252,240,.45);border:1px solid #6a6458;border-radius:2px;cursor:pointer}
.gf-form-choice .gf-fc-opt:hover,.gf-form-choice .gf-fc-opt:focus-visible{background:rgba(255,246,214,.85);outline:2px solid #7a1f18;outline-offset:1px}
.gf-form-choice .gf-fc-box{flex:none;width:20px;height:20px;border:2px solid #2d2a24;background:#fffdf4}
.gf-form-choice .gf-fc-note{margin:12px 0 0;font-size:13px;color:#4b463c}
.gf-fc-stamp{position:absolute;right:14px;top:50%;width:58px;height:58px;margin-top:-29px;border:3px solid #b3261e;border-radius:50%;color:#b3261e;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;letter-spacing:.08em;transform:rotate(-14deg) scale(1.6);opacity:0;animation:gf-fc-stamp .22s ease-out forwards}
@keyframes gf-fc-stamp{to{transform:rotate(-14deg) scale(1);opacity:.88}}
.gf-form-choice .gf-ch-urge{color:#9a2a1e}
html[data-gf-calm="1"] .gf-fc-stamp{animation:none;opacity:.88;transform:rotate(-14deg)}
`;
function choiceCss() { if (typeof document === 'undefined' || document.getElementById('gf-choice-css')) return; const st = document.createElement('style'); st.id = 'gf-choice-css'; st.textContent = CHOICE_CSS; document.head.appendChild(st); }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const seen = new Set();
/** start loading pictures now (the browser keeps them; the window shows them at once later) */
export function preload(urls) {
  if (typeof Image === 'undefined') return;
  for (const u of urls) if (u && !seen.has(u)) { seen.add(u); const im = new Image(); im.decoding = 'async'; im.src = u; }
}

export function createTalk({ wm, qa = false, me = '私', data = null, log = [], voice = null, portraits = null, said = null, fx = null, sound = null } = {}) {
  const linesOf = (x) => (typeof x === 'string' ? (data && data[x]) || [] : x || []);
  function talk(src, o = {}) {
    const lines = linesOf(src);
    log.push({ type: 'talk', title: o.title || (typeof src === 'string' ? src : ''), n: lines.length });
    if (qa || !lines.length || !wm) return Promise.resolve(true);
    const faces = { ...(portraits || {}), ...(o.portraits || {}) }, face = (who) => (who && who !== me && faces[who]) || '';
    preload(lines.map((l) => l.img).concat(lines.map((l) => face(l.who))));
    const firstImg = (lines.find((l) => l.img) || {}).img || '';
    const picOf = (k) => { for (let j = k; j >= 0; j--) if (lines[j].img) return lines[j].img; return firstImg; };
    return new Promise((resolve) => {
      let i = 0, spoken = null;
      const hush = () => { try { spoken && spoken.stop && spoken.stop(); } catch (e) {} spoken = null; };
      const render = (el) => {
        const L = lines[i], last = i === lines.length - 1;
        hush(); if (L.voice && voice) spoken = voice(L); if (said) said(L); if (L.fx && fx) fx(L.fx);   // said: every line read goes to the game's 言葉の記録
        const f = face(L.who), words = `<p class="gf-talk-who">${esc(L.who || '')}${L.where ? `<span>（${esc(L.where)}）</span>` : ''}</p><p class="gf-talk-text">${esc(L.text).replace(/\n/g, '<br>')}</p>`;
        el.innerHTML = `<div class="gf-talk${L.who === me ? ' gf-talk--me' : ''}">${picOf(i) ? `<img class="gf-talk-img${L.img ? '' : ' gf-talk-img--kept'}" src="${esc(picOf(i))}" alt="">` : ''}${f ? `<div class="gf-talk-row"><img class="gf-talk-face" src="${esc(f)}" alt="${esc(L.who)}"><div class="gf-talk-words">${words}</div></div>` : words}<div class="gf-talk-foot"><span class="gf-talk-n">${i + 1} / ${lines.length}</span><button type="button" class="btn primary gf-talk-next">${last ? esc(o.last || '閉じる') : '次へ'}</button></div></div>`;
        const b = el.querySelector('.gf-talk-next');
        b.onclick = () => { if (last) wm.close(); else { i++; render(el); } };
        el.querySelector('.gf-talk-text').onclick = () => b.click();
        setTimeout(() => b.focus(), 30);
      };
      const pics = lines.some((l) => l.img || face(l.who));   // a window with pictures keeps one size from line to line (no text-only fit)
      wm.open('talk', { title: o.title || '会話', size: lines.some((l) => l.img) ? 'm' : 's', ...(pics ? { fit: false } : {}), locked: true, render, onClose: () => { hush(); resolve(true); } });
    });
  }
  function choose(c) {
    const options = c.options || [];
    const fallback = (options.find((x) => x.primary) || options[options.length - 1] || {}).id ?? null;
    log.push({ type: 'choose', who: c.who || '', options: options.map((x) => x.id) });
    if (qa || !wm) return Promise.resolve((typeof window !== 'undefined' && window.__gfChoice) || fallback);
    preload([c.img]);
    return new Promise((resolve) => {
      let picked = null, timer = null, urgeEl = null, barEl = null;
      const T = c.timer && c.timer.seconds > 0 ? { ...c.timer, left: c.timer.seconds, said: new Set() } : null;
      const urgeSay = (u) => { if (!u) return; if (urgeEl) urgeEl.textContent = `${u.who ? `${u.who}「` : ''}${u.text}${u.who ? '」' : ''}`; if (u.voice && voice) { try { voice({ ...u, prio: 'hint' }); } catch (e) { /* the words show */ } } };
      const stopTimer = () => { if (timer) clearInterval(timer); timer = null; };
      const startTimer = () => {
        if (!T) return; stopTimer(); let last = performance.now();
        timer = setInterval(() => {
          const now = performance.now(), dt = (now - last) / 1000; last = now;
          if (typeof document !== 'undefined' && document.hidden) return;
          T.left = Math.max(0, T.left - dt);
          if (barEl) { barEl.querySelector('i').style.width = `${((T.left / T.seconds) * 100).toFixed(1)}%`; barEl.classList.toggle('low', T.left < T.seconds * 0.3); }
          for (const u of timedUrges(T.urge || [], T.seconds, T.left, T.said)) urgeSay(u);
          if (T.left <= 0) { urgeSay(T.out); try { T.onOut && T.onOut(); } catch (e) { console.error(e); } T.left = T.seconds; T.said.clear(); }   // presses again; never picks
        }, 100);
      };
      const pick = (el, b) => {
        if (picked != null) return; picked = b.dataset.id; stopTimer();
        if (c.look === 'form') { const st = document.createElement('span'); st.className = 'gf-fc-stamp'; st.textContent = (c.form && c.form.stamp) || '確認'; b.appendChild(st); try { sound && sound('stamp'); } catch (e) { /* */ } el.querySelectorAll('.gf-fc-opt').forEach((x) => (x.disabled = true)); setTimeout(() => wm.close(), 520); }
        else wm.close();
      };
      const bar = T ? `<div class="gf-ch-timer"><div class="gf-ch-timer-track"><i></i></div><p class="gf-ch-urge" aria-live="polite"></p></div>` : '';
      wm.open('choice', { title: c.title || c.who || '選ぶ', size: c.look === 'form' ? 'm' : 's', locked: true, render: (el) => {
        if (c.look === 'form') {
          choiceCss(); const F = c.form || {};
          const bg = paperURL(F.paper || 'typed', hashStr(`${F.title || ''}${c.text || ''}`) % 9973, 640, 820);
          el.innerHTML = `<div class="gf-form-choice"${bg ? ` style="background-image:url(${bg})"` : ''}>${F.org ? `<p class="gf-fc-org">${esc(F.org)}</p>` : ''}${F.title ? `<p class="gf-fc-title">${esc(F.title)}</p>` : ''}${F.no ? `<p class="gf-fc-no">${esc(F.no)}</p>` : ''}${bar}<p class="gf-fc-q"><b>問</b>${esc(c.text).replace(/\n/g, '<br>')}</p><div class="gf-fc-opts">${options.map((x) => `<button type="button" class="gf-fc-opt gf-talk-choice${x.primary ? ' primary' : ''}" data-id="${esc(x.id)}"><span class="gf-fc-box" aria-hidden="true"></span><span>${esc(x.label)}</span></button>`).join('')}</div>${F.note ? `<p class="gf-fc-note">${esc(F.note)}</p>` : ''}</div>`;
        } else {
          if (T) choiceCss();
          el.innerHTML = `<div class="gf-talk">${c.img ? `<img class="gf-talk-img" src="${esc(c.img)}" alt="">` : ''}${c.who && c.title ? `<p class="gf-talk-who">${esc(c.who)}</p>` : ''}${bar}<p class="gf-talk-text">${esc(c.text).replace(/\n/g, '<br>')}</p><div class="gf-talk-choices">${options.map((x) => `<button type="button" class="btn${x.primary ? ' primary' : ''} gf-talk-choice" data-id="${esc(x.id)}">${esc(x.label)}</button>`).join('')}</div></div>`;
        }
        urgeEl = el.querySelector('.gf-ch-urge'); barEl = el.querySelector('.gf-ch-timer');
        el.querySelectorAll('.gf-talk-choice').forEach((b) => { b.onclick = () => pick(el, b); });
        setTimeout(() => { const p = el.querySelector('.gf-talk-choice.primary') || el.querySelector('.gf-talk-choice'); p && p.focus(); }, 30);
        startTimer();
      }, onClose: () => { stopTimer(); resolve(picked); } });
    });
  }
  return { talk, choose, log };
}
