/* game-kit 3f1a7d2: js/ui.js — edit in game-kit and run tools/kit-sync.js */
// Windows and short messages over a first-person game (style: css/kit.css). From ひだまり薬局 js/ui.js.
// One window at a time; while one is open the controller should not move (pass `isBlocked: () => !!ui.open`).
//
//   const ui = new KitUI({ onOpen: () => fp.release(), onClose: () => fp.lock() });
//   const w = ui.window('task', 'タイトル', 'サブ', { wide: true, locked: false, app: appBar(...) });
//   w.body.innerHTML = '...'; ui.buttons(w.foot, [{ t: 'OK', cls: 'primary', fn: () => ui.close() }]);
//   ui.say('一言'); ui.toast('通知', 'ok'); ui.talk('田辺さん', '「…」', [{ t: '返事', fn }], { face: url });
//   ui.stamp('見破った！', '説明', true)   // the big centred stamp for a moment of success
const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function ensure(id, parent = document.body) {
  let el = $(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    parent.appendChild(el);
  }
  return el;
}

export class KitUI {
  constructor(o = {}) {
    this.o = o;
    this.root = ensure("ui");
    this.sayEl = ensure("say", ensure("hud"));
    this.lane = o.lane || null;   // a ToastLane (js/toast-lane.js): toasts go there (rule U27); without it the legacy #toasts box
    this.toastsEl = this.lane ? null : ensure("toasts", ensure("hud"));
    this.open = null;
    this.cur = null;
    this.after = [];
    addEventListener("keydown", (e) => this.key(e));
  }

  // { el, body, foot, close }. opts: wide, locked (Esc does not close; set w.onEsc), cls, app (html above the title), onClose
  window(name, title, sub = "", opts = {}) {
    this.close(true);
    this.o.onOpen && this.o.onOpen(name);
    const el = document.createElement("div");
    el.className = `win-wrap ${opts.cls || ""}`;
    el.innerHTML = `<div class="win ${opts.wide ? "wide" : ""}" role="dialog" aria-label="${esc(String(title).replace(/<[^>]+>/g, ""))}">${opts.app || ""}<div class="win-head"><div class="win-title">${title}</div><div class="win-sub">${sub}</div>${opts.locked ? "" : '<button class="win-x" aria-label="閉じる">×</button>'}</div><div class="win-body"></div><div class="win-foot"></div></div>`;
    this.root.appendChild(el);
    const w = { el, body: el.querySelector(".win-body"), foot: el.querySelector(".win-foot"), name, locked: !!opts.locked, onClose: opts.onClose };
    const x = el.querySelector(".win-x");
    if (x) x.onclick = () => this.close();
    this.cur = w;
    this.open = name;
    return w;
  }

  close(silent = false) {
    const w = this.cur;
    if (!w) return;
    w.el.remove();
    this.cur = null;
    const name = this.open;
    this.open = null;
    if (silent) return;
    if (w.onClose) w.onClose();
    this.o.onClose && this.o.onClose(name);
    const fns = this.after;
    this.after = [];
    fns.forEach((f) => setTimeout(f, 200));
  }

  // run after the current window closes (e.g. a line of dialogue once a software screen is dismissed)
  afterClose(fn) {
    this.after.push(fn);
  }

  key(e) {
    if (!this.open || e.code !== "Escape") return;
    e.preventDefault();
    if (this.cur && this.cur.locked) return this.cur.onEsc && this.cur.onEsc();
    this.close();
  }

  // [{ t, cls, fn, disabled, note }]
  buttons(parent, list) {
    parent.innerHTML = "";
    for (const b of list) {
      const btn = document.createElement("button");
      btn.className = `btn ${b.cls || ""}`;
      btn.innerHTML = `${b.t}${b.note ? `<span class="note">${b.note}</span>` : ""}`;
      btn.disabled = !!b.disabled;
      btn.onclick = () => b.fn && b.fn(btn);
      parent.appendChild(btn);
    }
  }

  say(html, sec = 4.5) {
    this.sayEl.innerHTML = html;
    this.sayEl.classList.add("on");
    clearTimeout(this.sayT);
    this.sayT = setTimeout(() => this.sayEl.classList.remove("on"), sec * 1000);
  }

  toast(html, cls = "", max = 4) {
    if (this.lane) return this.lane.push({ html, kind: "toast", cls: cls === "ok" ? "tl-ok" : cls });
    const el = document.createElement("div");
    el.className = `toast ${cls}`;
    el.innerHTML = html;
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > max) this.toastsEl.firstChild.remove();
    setTimeout(() => el.classList.add("out"), 4200);
    setTimeout(() => el.remove(), 5000);
  }

  // a conversation: portrait (opts.face), the line, then choices [{ t, fn }]
  talk(who, line, choices, opts = {}) {
    const w = this.window("talk", who, opts.sub || "", { locked: !!opts.locked });
    w.body.innerHTML = `${opts.intro ? `<p class="intro">${opts.intro}</p>` : ""}<div class="talkrow">${opts.face ? `<img class="talkface" src="${opts.face}" alt="">` : ""}<div class="bubble">${line}</div></div>`;
    this.buttons(w.foot, choices.map((c) => ({ t: c.t, cls: c.cls || "choice", fn: () => c.fn() })));
    return w;
  }

  stamp(big, text = "", strong = true, sec = 2.2) {
    const el = document.createElement("div");
    el.className = `catch ${strong ? "clean" : ""}`;
    el.innerHTML = `<div class="stamp-big">${big}</div>${text ? `<div class="what">${text}</div>` : ""}`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add("out"), sec * 1000);
    setTimeout(() => el.remove(), sec * 1000 + 700);
  }

  // tabs inside a window: [['key', 'label', count?]] -> html; wire with ui.onTabs(w.body, fn)
  static tabs(list, cur) {
    return `<nav class="hb-tabs" role="tablist">${list.map(([k, t, n]) => `<button role="tab" class="hb-tab ${k === cur ? "on" : ""}" data-tab="${k}">${t}${n !== undefined ? `<span class="cnt">${n}</span>` : ""}</button>`).join("")}</nav>`;
  }

  onTabs(root, fn) {
    for (const b of root.querySelectorAll("[data-tab]")) b.onclick = () => fn(b.dataset.tab);
  }
}
