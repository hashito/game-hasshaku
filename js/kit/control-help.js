/* game-kit 1d506003: js/control-help.js — edit in game-kit and run tools/kit-sync.js */
// Controls help (standard 1.17.0, from 水無瀬病院 #16 / #17 / #22: 「操作方法をメニューで表示して」「C またはボタンでしゃがむなどを教えて」
// 「走れるようになったりライトを直したりの操作が分かりづらい」). Two parts, installed by game-core for every 3D game:
//   - 操作方法 in the pause menu: every control of this game (game.json "controls"), keyboard / touch / pad as the player is using now;
//     a control the stage has not opened yet says so (まだ使えない).
//   - ctx.controlHint(k, o): a big card at the top centre with the key cap (or the touch button lit), shown when a control first matters:
//     when its gate opens (game.json controls.gate), or from the game (a low passage ahead, the light fixed, running allowed). It stays until
//     the player uses that control or presses its close button (no timer: rule no-auto-advance); o.once (default true) shows it once per game.
//   ctx.controlHint('crouch', { why: '天井が低い。' })    ctx.controlHint('custom', { key: 'G', touch: '［投げる］', text: '石を投げる' })
// 1.20.0 (水無瀬病院 2nd play test #7 「出来るようになったことの通知が他の通知と被っています」): the card lives in the notification lane (HUD
//   slot 'tc', js/hud-slots.js) under the other notices instead of floating over them at a fixed spot, and hints come one at a time: a second
//   hint while one is up waits until the first is used or closed (the stage gate opening run and light at once showed only the last one).
//   ctx.controlHintQueue() -> the waiting ids (tests).
import { esc } from './ui.js';

export const CONTROL_ROWS = [
  // [id, label, keyboard, touch, pad]
  ['move', '歩く', 'W A S D', '左下のスティック', '左スティック'],
  ['look', '見回す', 'マウス', '画面の右側をなぞる', '右スティック'],
  ['use', '調べる・使う・話す', 'E', '［操作］ボタン（物をタップしてもよい）', 'A'],
  ['run', '走る', 'Shift を押したまま', '［走る］ボタンを押したまま', '左スティックを押しこむ'],
  ['crouch', 'しゃがむ／立つ', 'C', '［しゃがむ］ボタン', 'B'],
  ['light', '懐中電灯', 'F', '［灯り］ボタン', 'Y'],
  ['hide', '隠れる', '隠れ場所の前で E', '隠れ場所をタップ', 'A'],
  ['tabs', '持ち物・目標・地図', 'Tab（地図は M）', '右上のメニュー', 'Select'],
  ['menu', 'メニュー（一時停止）', 'Esc', '右上のメニュー', 'Start'],
];
const KEYS = { run: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC'], light: ['KeyF'], use: ['KeyE'] };
const CSS = `
.gf-ch{position:fixed;left:50%;top:max(84px,12vh);transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:14px;max-width:min(560px,calc(100vw - 32px));padding:12px 14px 12px 16px;border-radius:12px;background:rgba(8,12,14,.93);border:1px solid rgba(220,230,226,.35);color:#eef3f1;box-shadow:0 8px 28px rgba(0,0,0,.55);font-size:17px;line-height:1.6;animation:gf-ch-in .35s ease-out}
.gf-ch kbd{display:inline-flex;align-items:center;justify-content:center;min-width:2.4em;min-height:2.2em;padding:0 .5em;border-radius:7px;border:2px solid #dfe8e4;border-bottom-width:4px;background:#1c2427;color:#fff;font:700 20px/1 inherit;font-family:inherit;white-space:nowrap}
.gf-ch .gf-ch-t{flex:1}.gf-ch .gf-ch-t b{display:block;font-size:18px}.gf-ch .gf-ch-t span{color:#c4d0cc;font-size:15px}
.gf-ch button{min-width:44px;min-height:44px;border-radius:8px;border:1px solid rgba(220,230,226,.4);background:transparent;color:#eef3f1;font-size:15px}
@keyframes gf-ch-in{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}
.gf-ch[data-hud-slot]{position:relative;left:auto;top:auto;transform:none;width:100%;max-width:100%;box-sizing:border-box;pointer-events:auto;animation:gf-ch-in2 .35s ease-out}
@keyframes gf-ch-in2{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.gf-ch .gf-ch-more{display:block;margin-top:2px;color:#9fb0aa;font-size:13px}
html[data-gf-calm="1"] .gf-ch{animation:none}
#t-buttons button.gf-ch-lit{outline:3px solid #f0d36a;outline-offset:2px;animation:gf-ch-pulse 1.1s ease-in-out infinite}
@keyframes gf-ch-pulse{50%{outline-color:rgba(240,211,106,.25)}}
.gf-ch-table{width:100%;border-collapse:collapse;font-size:16px}.gf-ch-table th,.gf-ch-table td{padding:8px 6px;border-bottom:1px solid rgba(160,175,170,.25);text-align:left;vertical-align:top}
.gf-ch-table th{font-weight:600;white-space:nowrap}.gf-ch-table td.gf-ch-no{color:#9aa8a4}
@media (max-width:500px){.gf-ch{font-size:16px;top:max(64px,9vh)}.gf-ch-table{font-size:15px}}
`;
function injectCss() { if (typeof document === 'undefined' || document.getElementById('gf-ch-css')) return; const s = document.createElement('style'); s.id = 'gf-ch-css'; s.textContent = CSS; document.head.appendChild(s); }

/** the rows this game has (pure): controls = game.json "controls", hides = the plan has hiding places */
export function controlRows(controls = {}, { hides = false, mode = 'mouse', open = () => true } = {}) {
  const col = mode === 'touch' ? 3 : mode === 'pad' ? 4 : 2;
  return CONTROL_ROWS.filter(([id]) => (id === 'crouch' ? !!controls.crouch : id === 'light' ? !!controls.flashlight : id === 'hide' ? hides : id === 'run' ? controls.run !== false : true))
    .map((r) => ({ id: r[0], label: r[1], how: r[col], open: open(r[0]) }));
}

export function installControlHelp(ctx) {
  const controls = (ctx.manifest && ctx.manifest.controls) || {};
  const hides = !!(ctx.data && ctx.data.plan && (ctx.data.plan.hides || []).length);
  const mode = () => (ctx.input === 'pad' ? 'pad' : ctx.isTouch ? 'touch' : 'mouse');
  const open = (k) => (ctx.controlOpen ? ctx.controlOpen(k) : true);
  if (ctx.pm && ctx.pm.registerItem) ctx.pm.registerItem({ id: 'controls', label: '操作方法', icon: 'info', after: 'map', render: (el) => {
    injectCss();
    const rows = controlRows(controls, { hides, mode: mode(), open });
    el.innerHTML = `<table class="gf-ch-table"><tbody>${rows.map((r) => `<tr><th>${esc(r.label)}</th><td class="${r.open ? '' : 'gf-ch-no'}">${esc(r.how)}${r.open ? '' : '（まだ使えない）'}</td></tr>`).join('')}</tbody></table>`;
  } });
  let card = null, cur = null;
  const seen = new Set(), queue = [];
  const close = () => { if (card) card.remove(); card = null; document.querySelectorAll('.gf-ch-lit').forEach((b) => b.classList.remove('gf-ch-lit')); cur = null; if (queue.length) setTimeout(() => { if (!card && queue.length) { const [k, o] = queue.shift(); show(k, o); } }, 350); };
  const show = (k, o) => {
    injectCss(); cur = k;
    const row = CONTROL_ROWS.find((r) => r[0] === k);
    const m = mode(), key = o.key || (row ? (m === 'touch' ? row[3] : m === 'pad' ? row[4] : row[2]) : '');
    card = document.createElement('div'); card.className = 'gf-ch'; card.id = 'gf-ch'; card.setAttribute('role', 'status');
    card.innerHTML = `<kbd>${esc(m === 'touch' ? (o.touch || '') || '' : key)}</kbd><div class="gf-ch-t"><b></b><span></span><small class="gf-ch-more" hidden></small></div><button type="button" aria-label="閉じる">閉じる</button>`;
    const kb = card.querySelector('kbd'); if (m === 'touch' && !o.touch) kb.remove();
    card.querySelector('b').textContent = `${o.why ? `${o.why} ` : ''}${o.text || (row ? row[1] : k)}${m === 'touch' ? `：${o.touch || key}` : ''}`;
    card.querySelector('span').textContent = o.sub || (k === 'crouch' ? (m === 'touch' ? 'もう一度押すと立つ。' : 'もう一度 C で立つ。') : k === 'run' ? 'しゃがんでいると走れない。' : '');
    card.querySelector('button').onclick = () => close();
    const lane = document.getElementById('hs-tc');
    if (lane && ctx.registerHudPart) { lane.appendChild(card); try { ctx.registerHudPart('gf-ch', { slot: 'tc', order: 5, el: card }); } catch { /* an older HUD */ } }
    else document.body.appendChild(card);
    more();
    for (const b of document.querySelectorAll('#t-buttons [data-k]')) if ((KEYS[k] || [o.code]).includes(b.dataset.k)) b.classList.add('gf-ch-lit');
  };
  const more = () => { const el = card && card.querySelector('.gf-ch-more'); if (!el) return; el.hidden = !queue.length; el.textContent = queue.length ? `このあと、もう ${queue.length} つ` : ''; };
  ctx.controlHint = (k, o = {}) => {
    if (typeof document === 'undefined') return false;
    if ((o.once ?? true) && seen.has(k)) return false;
    seen.add(k);
    if (card && cur === k) { close(); }            // the same hint again (once: false): shown fresh
    if (card || queue.length) { if (!queue.some(([q]) => q === k)) queue.push([k, o]); more(); return true; }
    show(k, o);
    return true;
  };
  ctx.controlHintQueue = () => queue.map(([k]) => k);
  ctx.controlHintClose = close;
  const used = (code) => { if (cur && (KEYS[cur] || []).includes(code)) close(); else { const i = queue.findIndex(([q]) => (KEYS[q] || []).includes(code)); if (i >= 0) { queue.splice(i, 1); more(); } } };
  if (typeof addEventListener !== 'undefined') addEventListener('keydown', (e) => used(e.code), true);
  if (ctx.bus) {
    ctx.bus.on('player:crouch', () => used('KeyC'));
    ctx.bus.on('player:light', () => used('KeyF'));
    ctx.bus.on('stage:up', ({ level }) => { const g = controls.gate || {}; for (const [k, at] of Object.entries(g)) if (at === level) ctx.controlHint(k, { why: 'できるようになった。' }); });
  }
  return { close };
}
