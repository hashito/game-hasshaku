/* game-kit 9638d82: js/chat.js — edit in game-kit and run tools/kit-sync.js */
// Chat fiction engine (pure: no DOM, runs in Node). A story is a graph of nodes holding chat lines; the talk is
// rebuilt deterministically from the chosen choice IDs, and a runner plays it as an event stream (typing delays,
// read receipts, choices, endings) on an injectable clock, so tests run instantly and a resume never duplicates.
// From 未確認室 / 返事をする人 / 既読の向こう (js/engine.js, js/player.js of each). Format: docs in loadStory() below.
//
//   const story = loadStory(def);                       // def = { start, nodes, endings, tabs, speakers, player, ... }
//   const book = new EndingBook(Store);                 // any { read(key), write(key, v) }; Store from ./store.js works
//   const run = new ChatRunner(story, { book, clock: fakeClock() /* tests */, speed: 1 });
//   run.on("message", (e) => ...).on("choices", (e) => ...).on("ending", (e) => ...);
//   run.play();  run.choose("ask");  store.save(run.save());  run.restore(store.load());
//   build(story, ["ask", "go"]) -> { items, state, choices | ending, ... }   // the whole talk, no timing

// ---- story format ---------------------------------------------------------------------------------------
// { id, title, start: "n1", player: "あなた", state: { flag: 0 },
//   tabs: { club: { name: "写真部", members: 4 } },          // talk tabs; the first is where the story starts
//   speakers: { 美月: { color: "#d0607a", avatar: "url", initial: "美" }, 通知: { kind: "system" } },
//   media: { key: { src, alt, poster, transcript } },      // optional; a missing src renders a placeholder
//   nodes: { n1: { lines, set, add, prompt, choices: [{ id, label, say, if, set, add, lines, next }] },
//            n2: { lines, next: "n3" }, n3: { branch: [{ if: "a&b", next }, { next }] },
//            e1: { lines, ending: "E1" }, a9: { lines, done: true } },          // exactly one exit per node
//   endings: { E1: { name, type, epilogue, hint, after: { when, date, tab, lines, summary } } },
//   afterStories: { s1: { title, date, unlock: "E1|E2", start: "a1" } } }       // unlocked by seen endings
// lines: a string (one item per line) or an array of such strings / item objects ({ who, text, t, media, if }).
//   [club]                        switch tab                  == 10月16日（金） ==       date separator
//   21:02 美月：text              message (time optional)     21:02 ［システム：text］   system line
//   美月：［画像#key：caption］    image (also 写真) / ［ボイス#key：caption 6秒］ voice / ［動画#key：… 8秒］ video
//   美月：［スタンプ：…］  ［ファイル：name］   ?flag line / ?!flag line (conditional)   // comment
//   @typing 美月 2  @pause 1.5  @read  @read off|on  @sfx sting  @vibe scare  @fx garble  @notice text  @title name
//   @fx is always the app itself going wrong (FX_IN_APP below): dup / loadfail [text] / imgfail / garble [keep] / jump /
//   dim [text] / clear. Nothing moves, tints or vignettes the screen from outside the phone.
// Choices: the player's bubble is `say` ?? `label`, unless say === false, the label is an action "［…］", or the
// choice's first line is already spoken by the player. conditions: "a", "!a", "n>=2", "a&b|c" (& before |).

import { commandNames } from "./chat-ext.js";

export const MEDIA = {
  画像: "image", 写真: "image", スクショ: "image", スクリーンショット: "image", image: "image", 音声: "voice", ボイス: "voice", voice: "voice", audio: "voice",
  動画: "video", 映像: "video", video: "video", スタンプ: "stamp", stamp: "stamp", ファイル: "file", file: "file",
  位置情報: "location", location: "location", ウィジェット: "widget", widget: "widget", // widget: registerWidget() in chat-ext.js
};
export const COMMANDS = [
  "typing", "pause", "read", "sfx", "vibe", "fx", "notice", "title", "members", // playback
  "glitch", "dial", "hangup", "ambience", "silence", "timewarp", "rewrite", "alert", // the app misbehaving / calls / sound
  "ring", "readlabel", "sub", "unread", "draft", "selftype", // an incoming call / 既読 label / header sub line / unread divider / unsent draft / a reply typing itself
  "flow", "rumor", "aside", // writing tags: no effect on screen, counted by the checker (docs/standard-chat.md)
];
export const WRITING_TAGS = ["flow", "rumor", "aside"];
export const isCommand = (c) => COMMANDS.includes(c) || commandNames().includes(c);
// @flow stages (C2): 疑う → 否定する → 揺らぐ → 認める
export const FLOW = { doubt: "doubt", deny: "deny", waver: "waver", accept: "accept", 疑う: "doubt", 否定: "deny", 否定する: "deny", 揺らぐ: "waver", 認める: "accept" };
export const FLOW_ORDER = ["doubt", "deny", "waver", "accept"];
// channel type of a channel / tab: "talk" (default), "call", "board". kaidan's channel `skin` is accepted as a hint.
export const CHANNEL_SKIN_TYPE = { call: "call", board: "board", bbs: "board" };
export const channelType = (info) => (info && (info.type || CHANNEL_SKIN_TYPE[info.skin])) || "talk";
// @fx: what the messenger can do wrong (js/chat-ui.js). Off-app names are mapped (FX_ALIAS) or ignored (FX_OFF_APP),
// and chat-check warns about both.
export const FX_IN_APP = ["dim", "clear", "dup", "loadfail", "errorrow", "imgfail", "garble", "jump", "scrolljump", "stale", "rewrite", "time", "timewarp", "read", "ghost", "rename", "noname", "unsent", "freeze", "reload", "selftype"];
export const FX_ALIAS = { shake: "garble", flicker: "garble", wobble: "garble", tremble: "garble", jitter: "garble", glitch: "garble" };
export const FX_OFF_APP = ["vignette", "redflash", "red", "blood", "camshake", "zoom", "blur"];

// mojibake (文字化け) the way an app shows it: UTF-8 bytes read as Shift_JIS. Deterministic.
export function mojibake(text) {
  const s = String(text || "");
  try {
    const out = new TextDecoder("shift_jis").decode(new TextEncoder().encode(s));
    if (out && out !== s) return out;
  } catch {
    /* no shift_jis decoder */
  }
  const pool = "縺繧繝譁蟄鬘荳逕螟遘ｦｧｨ"; // wording-ok: mojibake detector
  return [...s].map((ch, i) => (/[\s。、！？]/.test(ch) ? ch : pool[(ch.codePointAt(0) + i * 7) % pool.length])).join("");
}

export function evalCond(expr, state) {
  if (expr == null || expr === "") return true;
  if (typeof expr === "function") return !!expr(state);
  return String(expr)
    .split("|")
    .some((alt) =>
      alt.split("&").every((raw) => {
        const t = raw.trim();
        const m = t.match(/^(\w+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
        if (m) {
          const v = Number(state[m[1]] || 0), n = Number(m[3]);
          return { ">=": v >= n, "<=": v <= n, "==": v === n, "!=": v !== n, ">": v > n, "<": v < n }[m[2]];
        }
        if (t.startsWith("!")) return !state[t.slice(1).trim()];
        return !!state[t];
      }),
    );
}
export const condNames = (expr) => (typeof expr === "string" ? expr.match(/[A-Za-z_]\w*/g) || [] : []);

export function applyEffects(state, o = {}) {
  const s = { ...state };
  for (const [k, v] of Object.entries(o.set || {})) s[k] = v;
  for (const [k, v] of Object.entries(o.add || {})) s[k] = (Number(s[k]) || 0) + v;
  return s;
}

// "…" or [{ if, text }, …, "fallback"] (first match wins)
export function pickText(v, state) {
  if (v == null) return null;
  if (!Array.isArray(v)) return typeof v === "string" ? v : v.text || null;
  for (const x of v) {
    if (typeof x === "string") return x;
    if (x && evalCond(x.if, state)) return x.text || null;
  }
  return null;
}

// ---- text-only screens and the ending photo (C6, C7, C16) -----------------------------------------------
// story.intro = string | { text, photo, place, button } before the talk; endings.X.outro | story.outro after the
// after-story. text may be [{ if, text }, …, "fallback"]. photo = a key of story.images (or story.media).
export const paragraphs = (text) => String(text || "").replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim().replace(/\s*\n\s*/g, "\n")).filter(Boolean);
export const endingPhoto = (e) => (e && (e.photo || (e.after && e.after.photo))) || null;
export function introOf(story, state = {}) {
  const v = story && story.intro;
  if (!v) return null;
  const o = typeof v === "string" || Array.isArray(v) ? { text: v } : v;
  const text = pickText(o.text, state);
  return text ? { text, photo: o.photo || null, place: o.place || "", button: o.button || "トークを開く", reveal: o.reveal } : null;
}
export function outroOf(story, endingId, state = {}) {
  const e = (story.endings || {})[endingId] || {};
  const v = e.outro != null ? e.outro : story.outro;
  if (!v) return null;
  const o = typeof v === "string" || Array.isArray(v) ? { text: v } : v;
  const text = pickText(o.text, state);
  if (!text) return null;
  const base = story.outro && typeof story.outro === "object" && !Array.isArray(story.outro) ? story.outro : {};
  return { text, photo: o.photo || (e.outro != null ? null : base.photo) || endingPhoto(e), place: o.place || "", button: o.button || base.button || "", chip: o.chip || base.chip || "［スマホを置く］", reveal: o.reveal ?? base.reveal };
}
// the image of a key: story.images[key] ?? story.media[key] -> { src, alt, ... } | {}
export const imageOf = (story, key) => (key && ((story.images || {})[key] || (story.media || {})[key])) || {};

function cue(text) {
  const m = text.match(/^［([^#：］]+)(?:#([\w-]+))?(?:：(.*))?］$/);
  if (!m) return null;
  const label = m[1].trim();
  if (label === "システム" || label === "system") return { sys: true, text: m[3] || "" };
  const kind = MEDIA[label];
  if (!kind) return null;
  const md = { kind, key: m[2] || null, cap: m[3] || "" };
  const d = (kind === "voice" || kind === "video") && md.cap.match(/^(.*?)[\s　]*(\d{1,3}(?:\.\d)?)秒$/);
  if (d) [md.cap, md.sec] = [d[1], Number(d[2])];
  return md;
}

function message(t, who, text) {
  const md = cue(String(text).trim());
  if (md && md.sys) return { k: "sys", t, text: md.text };
  if (!who) return { k: "sys", t, text };
  const it = { k: "msg", t, who, text };
  if (md) [it.media, it.text] = [md, md.cap];
  return it;
}

// one line -> item (throws on a line it cannot read)
export function parseLine(raw) {
  let line = String(raw).trim();
  let m;
  if ((m = line.match(/^\[([^\]]+)\]$/))) return { k: "tab", tab: m[1].trim() };
  if ((m = line.match(/^==\s*(.+?)\s*==$/))) return { k: "date", text: m[1] };
  if ((m = line.match(/^@(\w+)(?:\s+(.*))?$/))) return { k: "cmd", cmd: m[1], arg: (m[2] || "").trim() };
  let t = null;
  if ((m = line.match(/^(\d{1,2}:\d\d)\s+/))) [t, line] = [m[1], line.slice(m[0].length)];
  if (!line) throw new Error(`empty line after the time: ${raw}`);
  if (line.startsWith("［")) return message(t, null, line);
  // numbered posts of a board (no time): "12：207：text", "12 ham：text", "32-a：名無し：text"; "3：―― deleted ――" is a deleted post (no author)
  if (!t && (m = line.match(/^(\d+(?:-[a-z])?)(?:：|\s+)([^：]+?)：(.*)$/))) return { ...message(null, m[2].trim(), m[3]), no: m[1] };
  if (!t && (m = line.match(/^(\d+(?:-[a-z])?)：(.*)$/))) return { k: "msg", t: null, no: m[1], who: null, text: m[2], deleted: true };
  if ((m = line.match(/^([^：\s][^：]*?)：(.*)$/))) return message(t, m[1].trim(), m[2]);
  return { k: "sys", t, text: line };
}

function objItem(o) {
  if (o.tab) return { k: "tab", tab: o.tab };
  if (o.date) return { k: "date", text: o.date };
  if (o.cmd) return { k: "cmd", cmd: o.cmd, arg: String(o.arg ?? "") };
  if (o.sys != null) return { k: "sys", t: o.t || null, text: String(o.sys) };
  const it = { k: "msg", t: o.t || null, who: o.who, text: o.text || "" };
  if (o.media) it.media = { cap: o.text || "", key: null, ...o.media };
  return it;
}

// lines -> [{ cond, item, src }]
export function parseBlock(lines) {
  const out = [];
  if (!lines) return out;
  const list = Array.isArray(lines) ? lines : String(lines).split("\n");
  for (const raw of list) {
    if (raw && typeof raw === "object") {
      out.push({ cond: raw.if || null, item: objItem(raw), src: JSON.stringify(raw) });
      continue;
    }
    let line = String(raw).trim();
    if (!line || line.startsWith("//")) continue;
    let cond = null;
    const c = line.match(/^\?(\S+)\s+(.+)$/);
    if (c) [cond, line] = [c[1], c[2]];
    out.push({ cond, item: parseLine(line), src: line });
  }
  return out;
}

const cache = new WeakMap();
export function block(story, key, lines) {
  let m = cache.get(story);
  if (!m) cache.set(story, (m = new Map()));
  if (!m.has(key)) {
    try {
      m.set(key, parseBlock(lines));
    } catch (e) {
      throw new Error(`${story.id || "story"} ${key}: ${e.message}`);
    }
  }
  return m.get(key);
}

// every block of the story: { where, key, lines }
export function* allBlocks(story) {
  for (const [id, n] of Object.entries(story.nodes)) {
    yield { where: id, key: `n:${id}`, lines: n.lines };
    for (const c of n.choices || []) yield { where: `${id}/${c.id}`, key: `c:${id}:${c.id}`, lines: c.lines };
  }
  for (const [k, e] of Object.entries(story.endings)) if (e && e.after) yield { where: `${k}.after`, key: `a:${k}`, lines: e.after.lines };
}

// Pictures and sounds written with a file name (images.X.file / media.X.file / media.X.poster / stickers.X.file, characters.X.face) get their src:
// o.assets = "/assets/05/" is put in front, o.faces = "face_{face}.jpg" gives a character with `face` (a name, not an images key) its avatar picture.
// Returns a copy of the sections that changed; a story that already uses src is left as it is.
export function resolveAssets(def, o = {}) {
  const base = o.assets || "";
  const fix = (tbl, keys) => {
    if (!tbl) return tbl;
    const out = {};
    for (const [k, v] of Object.entries(tbl)) {
      const n = { ...v };
      if (n.file && !n.src) n.src = base + n.file;
      for (const f of keys) if (n[f] && !/^(https?:|\/|data:)/.test(n[f]) && base) n[f] = base + n[f];
      out[k] = n;
    }
    return out;
  };
  const s = { ...def, images: fix(def.images, []), media: fix(def.media, ["poster"]), stickers: fix(def.stickers, []) };
  if (o.faces && def.characters) {
    s.characters = {};
    for (const [k, c] of Object.entries(def.characters)) {
      const bot = ["bot", "notice", "system"].includes(c.kind);
      s.characters[k] = c.face && !c.avatar && !(def.images || {})[c.face] && !bot ? { ...c, avatar: base + o.faces.replace("{face}", c.face) } : c;
    }
  }
  return s;
}

// fills defaults and parses every block once (throws with the place of a bad line)
export function loadStory(def, o = null) {
  if (!def || !def.nodes) throw new Error("a story needs nodes");
  if (o && (o.assets || o.faces)) def = resolveAssets(def, o);
  // standard names: characters (= speakers, plus voice / face / role), channels (= tabs; type talk | call | board)
  const s = { id: "story", tabs: {}, speakers: {}, endings: {}, afterStories: {}, media: {}, images: {}, stickers: {}, state: {}, ...def };
  if (def.channels) s.tabs = { ...(def.tabs || {}), ...def.channels };
  if (def.characters) s.speakers = { ...(def.speakers || {}), ...def.characters };
  s.channels = s.tabs;
  s.characters = s.speakers;
  for (const [k, ch] of Object.entries(s.tabs)) if (ch && !ch.type) s.tabs[k] = { ...ch, type: channelType(ch) };
  s.start = s.start || Object.keys(s.nodes)[0];
  if (!s.nodes[s.start]) throw new Error(`start node missing: ${s.start}`);
  for (const b of allBlocks(s)) block(s, b.key, b.lines);
  return s;
}

export const firstTab = (story) => Object.keys(story.tabs || {})[0] || "main";
export const isAction = (label) => /^［.*］$/.test(String(label || ""));

const nextTime = (blk, items) => {
  const b = blk.find((x) => x.item.t);
  if (b) return b.item.t;
  for (let i = items.length - 1; i >= 0; i--) if (items[i].t) return items[i].t;
  return null;
};

// history: chosen choice IDs in order. opts.start: play from another node (an after-story).
// -> { items, state, node, choices (visible) | null, prompt, ending, done, used, visited, tab }
export function build(story, history = [], opts = {}) {
  let state = { ...(story.state || {}) };
  let tab = firstTab(story);
  const items = [];
  const visited = [];
  const push = (blk, seg, old = false) => {
    for (const { cond, item } of blk) {
      if (cond && !evalCond(cond, state)) continue;
      const it = { ...item, seg, n: items.length };
      if (old) it.old = true; // a node with `backlog: true`: the earlier conversation, already read
      if (it.k === "tab") tab = it.tab;
      else it.tab = tab;
      if (it.k === "msg") it.mine = it.who === story.player;
      items.push(it);
    }
  };
  const add = (it) => items.push({ ...it, tab, n: items.length });
  const res = (o) => ({ items, state, node: id, choices: null, prompt: "", ending: null, done: false, used: h, visited, tab, ...o });
  let id = opts.start || story.start;
  let h = 0;
  for (let guard = 0; guard < 2000; guard++) {
    const node = story.nodes[id];
    if (!node) throw new Error(`unknown node: ${id}`);
    visited.push(id);
    state = applyEffects(state, node);
    push(block(story, `n:${id}`, node.lines), id, !!node.backlog);
    if (node.ending) {
      const e = story.endings[node.ending] || {};
      const a = e.after;
      if (a) {
        const at = a.tab || a.ch; // kaidan names the talk the after-story plays in "ch"
        if (at && at !== tab) add({ k: "tab", tab: (tab = at) });
        // the main story's in-app dim (@fx dim) and background sound (@ambience) end at the separator, unless the after-story sets its own (a.fx / a.sound: "keep")
        const ablk = block(story, `a:${node.ending}`, a.lines);
        const ownFx = a.fx === "keep" || ablk.some((x) => x.item.k === "cmd" && x.item.cmd === "fx");
        const ownBed = a.sound === "keep" || ablk.some((x) => x.item.k === "cmd" && (x.item.cmd === "ambience" || x.item.cmd === "silence"));
        add({ k: "after", text: a.when || "その後", date: a.date || null, clearFx: !ownFx, clearSound: !ownBed, seg: `@${node.ending}` });
        const from = items.length;
        push(ablk, `@${node.ending}`);
        if (a.date) for (let i = from; i < items.length; i++) items[i].date = a.date; // a board shows the after-story's own date on its posts
        const sum = pickText(a.summary, state);
        if (sum) add({ k: "summary", text: sum, seg: `@${node.ending}` });
      }
      add({ k: "end", id: node.ending, seg: id });
      return res({ ending: node.ending });
    }
    if (node.done) {
      add({ k: "done", seg: id });
      return res({ done: true });
    }
    if (node.choices) {
      const vis = node.choices.filter((c) => evalCond(c.if, state));
      const pick = history[h];
      if (pick === undefined) return res({ choices: vis, prompt: node.prompt || "" });
      const c = vis.find((x) => x.id === pick);
      if (!c) throw new Error(`choice ${pick} is not available at ${id}`);
      h++;
      state = applyEffects(state, c);
      const seg = `${id}:${c.id}`;
      const blk = block(story, `c:${id}:${c.id}`, c.lines);
      const first = blk.find((x) => !x.cond || evalCond(x.cond, state));
      const spoken = first && first.item.k === "msg" && first.item.who === story.player;
      if (isAction(c.label) && c.say == null) add({ k: "act", text: c.label, choice: c.id, seg });
      else if (c.say !== false && !spoken) add({ k: "msg", who: story.player, text: c.say ?? c.label, t: c.t || nextTime(blk, items), mine: true, choice: c.id, seg }); // c.t: the time of the player's bubble
      push(blk, seg);
      id = c.next;
      continue;
    }
    if (node.branch) {
      const b = node.branch.find((x) => evalCond(x.if, state));
      if (!b) throw new Error(`no branch matches at ${id}`);
      id = b.next;
      continue;
    }
    if (node.next) {
      id = node.next;
      continue;
    }
    throw new Error(`node without exit: ${id}`);
  }
  throw new Error("the story loops without a choice");
}

// ---- timing ---------------------------------------------------------------------------------------------
export const TIMING = { read: 700, perChar: 55, short: 500, maxText: 3400, media: 1600, mine: 450, sys: 1200, date: 600, after: 1400, summary: 2000 };

// ms before an item appears and how much of it shows "typing…" (scaled by the runner's speed)
export function delayOf(it, prev, T = TIMING) {
  if (it.k === "cmd" && it.cmd === "pause") return { ms: (Number(it.arg) || 1) * 1000, typing: 0 };
  if (it.k === "cmd" && it.cmd === "dial") return { ms: (Number(it.arg) || 3) * 1000, typing: 0, pre: true }; // shown now, rings for N seconds
  if (it.k === "cmd" && it.cmd === "typing") {
    const sec = Number(it.arg.split(/\s+/)[1]) || 2;
    return { ms: sec * 1000, typing: sec * 1000, who: it.arg.split(/\s+/)[0] };
  }
  if (it.k === "msg") {
    if (it.mine) return { ms: T.mine, typing: 0 };
    const read = prev && prev.k === "msg" && prev.who === it.who ? 150 : T.read;
    const n = (it.text || "").length;
    let ms = it.media ? T.media : n <= 6 ? T.short : 650 + Math.min(T.maxText, n * T.perChar);
    if (/[…？?]$/.test(it.text || "")) ms += 500;
    return { ms: read + ms, typing: ms, who: it.who };
  }
  const ms = { sys: T.sys, date: T.date, after: T.after, summary: T.summary }[it.k] || 0;
  return { ms, typing: 0 };
}

// ---- clocks ---------------------------------------------------------------------------------------------
export const realClock = () => ({ now: () => Date.now(), set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) });

// virtual time: flush() runs every pending timer (including ones scheduled while flushing) in time order
export function fakeClock() {
  let now = 0;
  let seq = 0;
  const q = [];
  return {
    now: () => now,
    set(fn, ms) {
      q.push({ id: ++seq, at: now + Math.max(0, ms || 0), fn });
      return seq;
    },
    clear(id) {
      const i = q.findIndex((x) => x.id === id);
      if (i >= 0) q.splice(i, 1);
    },
    flush(limit = 100000) {
      for (let n = 0; q.length && n < limit; n++) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        const t = q.shift();
        now = t.at;
        t.fn();
      }
      return now;
    },
    get pending() {
      return q.length;
    },
  };
}

// ---- endings registry -----------------------------------------------------------------------------------
export const memoryStorage = () => {
  const m = new Map();
  return { read: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), write: (k, v) => (m.set(k, JSON.stringify(v)), true) };
};

export class EndingBook {
  constructor(storage = memoryStorage(), key = "chat.endings") {
    this.storage = storage;
    this.key = key;
  }
  all() {
    return this.storage.read(this.key) || {};
  }
  // true when this ending is new
  record(storyId, endingId, at = Date.now()) {
    const d = this.all();
    const s = (d[storyId] = d[storyId] || {});
    if (s[endingId]) return false;
    s[endingId] = at;
    this.storage.write(this.key, d);
    return true;
  }
  seen(storyId) {
    return Object.keys(this.all()[storyId] || {});
  }
  has(storyId, endingId) {
    return !!(this.all()[storyId] || {})[endingId];
  }
  clear(storyId) {
    const d = this.all();
    delete d[storyId];
    this.storage.write(this.key, d);
  }
  // [{ id, name, type, hint, ..., seen, at }] in the story's order
  list(story) {
    const s = this.all()[story.id] || {};
    return Object.entries(story.endings).map(([id, e]) => ({ id, ...e, seen: !!s[id], at: s[id] || null }));
  }
  // unlock: an ending id, "E1|E2", "E1&E2", an array (any of) or a function(seenFlags)
  unlocked(story, unlock) {
    const flags = Object.fromEntries(this.seen(story.id).map((k) => [k, true]));
    if (Array.isArray(unlock)) return unlock.some((u) => flags[u]);
    return unlock == null ? true : evalCond(unlock, flags);
  }
  afterStories(story) {
    return Object.entries(story.afterStories || {}).map(([id, a]) => ({ id, ...a, unlocked: this.unlocked(story, a.unlock) }));
  }
}

// ---- runner ---------------------------------------------------------------------------------------------
// events: tab, date, typing {who, tab, on}, message {item, mine, speaker, instant}, read {tab, ns}, system,
// action, cmd {cmd, arg, instant}, after, summary, choices {choices, prompt, single}, ending {id, ending, newly},
// done, chose {id}, error. "*" receives (type, ev) for every event.
export class ChatRunner {
  constructor(story, o = {}) {
    this.story = story;
    this.clock = o.clock || realClock();
    this.speed = o.speed ?? 1;
    // tapMine: the player's own lines that are not a choice wait for a tap ("await" event, then send()), so the
    // reader moves the talk on at their own pace. The reply right after a choice (the line just picked) is not held.
    this.tapMine = !!o.tapMine;
    this.awaiting = -1; // index of the player's line waiting for send()
    this.freeTo = -1; // the player's lines up to this index go without a tap (the reply to a choice)
    this.timing = { ...TIMING, ...(o.timing || {}) };
    this.book = o.book || null;
    this.handlers = {};
    this.history = [];
    this.start = null;
    this.shown = 0;
    this.token = 0;
    this.timer = null;
    this.r = null;
    this.holds = 0; // hold() count: while > 0 the runner waits (a full-screen call, "open the talk first")
    this.meta = {}; // free-form results the UI keeps with the save (how a call was answered, ...)
  }
  on(type, fn) {
    (this.handlers[type] = this.handlers[type] || []).push(fn);
    return this;
  }
  emit(type, ev = {}) {
    for (const f of this.handlers[type] || []) f(ev);
    for (const f of this.handlers["*"] || []) f(type, ev);
  }
  // start over (or from an after-story with { start }), or resume with { history, shown }
  play({ history = [], shown = 0, start = null, meta = null } = {}) {
    this.stop();
    this.meta = meta && typeof meta === "object" ? { ...meta } : {};
    this.history = history.slice();
    this.start = start;
    this.shown = 0;
    this.instantTo = shown;
    this.freeTo = -1;
    this.chosen = false;
    this.pending = {};
    this.readOn = true;
    this.run();
  }
  playAfterStory(id) {
    const a = this.story.afterStories[id];
    if (!a) throw new Error(`no after-story ${id}`);
    this.play({ start: a.start });
  }
  choose(id) {
    if (!this.r || !this.r.choices || this.timer != null) return false;
    const c = this.r.choices.find((x) => x.id === id);
    if (!c) return false;
    this.history.push(id);
    this.emit("chose", { id, choice: c });
    this.chosen = true;
    this.run();
    return true;
  }
  // tapMine: send the player's line that is waiting (false when none is)
  send() {
    if (this.awaiting < 0 || this.awaiting !== this.shown) return false;
    this.passed = this.awaiting;
    this.awaiting = -1;
    this.step(this.token);
    return true;
  }
  save() {
    return { story: this.story.id, start: this.start, history: this.history.slice(), shown: this.shown, meta: { ...this.meta } };
  }
  restore(s) {
    if (!s || !Array.isArray(s.history) || (s.story && s.story !== this.story.id)) return false;
    try {
      build(this.story, s.history, { start: s.start });
    } catch {
      return false; // a save from an older version of the story
    }
    this.play(s);
    return true;
  }
  // show everything up to the next stop at once
  skip() {
    this.skipping = true;
    if (this.timer != null) {
      this.clock.clear(this.timer);
      this.timer = null;
      const fire = this.fire;
      this.fire = null;
      if (fire) fire();
    }
  }
  stop() {
    this.token++;
    if (this.timer != null) this.clock.clear(this.timer);
    this.timer = null;
    this.holds = 0;
    this.waiting = false;
    this.awaiting = -1;
    this.passed = -1;
  }
  // Pause the runner (from inside an event handler): returns release(). The runner shows nothing more, and offers no
  // choices / ending, until every hold is released. A release after stop() / play() is ignored.
  hold() {
    const tok = this.token;
    let done = false;
    this.holds++;
    return () => {
      if (done || tok !== this.token) return;
      done = true;
      this.holds--;
      if (!this.holds && this.waiting) {
        this.waiting = false;
        this.step(tok);
      }
    };
  }
  get state() {
    return this.r ? this.r.state : { ...this.story.state };
  }

  run() {
    try {
      this.r = build(this.story, this.history, { start: this.start });
    } catch (e) {
      this.emit("error", { error: e });
      return;
    }
    if (this.chosen) {
      // the player's lines that open the reply to a choice are the choice itself: they go without a tap
      this.chosen = false;
      let i = this.shown;
      while (i < this.r.items.length && !(this.r.items[i].k === "msg" && !this.r.items[i].mine)) i++;
      this.freeTo = i - 1;
    }
    this.step(this.token);
  }
  step(tok) {
    const items = this.r.items;
    for (;;) {
      if (this.holds) {
        this.waiting = true;
        return;
      }
      if (this.shown >= items.length) break;
      const it = items[this.shown];
      if (this.tapMine && it.k === "msg" && it.mine && !it.old && this.shown >= this.instantTo && this.shown > this.freeTo && this.passed !== this.shown) {
        if (this.awaiting !== this.shown) {
          this.awaiting = this.shown;
          this.skipping = false;
          this.emit("await", { item: it, tab: it.tab, text: it.text || "" });
        }
        return;
      }
      const instant = this.shown < this.instantTo || this.speed <= 0 || this.skipping || !!it.old;
      const d = instant ? { ms: 0 } : delayOf(it, items[this.shown - 1], this.timing);
      if (d.ms > 0) {
        const who = d.typing > 0 ? d.who : null;
        if (who) this.emit("typing", { who, tab: it.tab, on: true });
        if (d.pre) this.show(it, false);
        this.fire = () => {
          this.timer = null;
          this.fire = null;
          if (tok !== this.token) return;
          if (who) this.emit("typing", { who, tab: it.tab, on: false });
          if (!d.pre) this.show(it, false);
          else this.emit("cmd", { item: it, tab: it.tab, instant: false, cmd: "dial-end", arg: "" });
          this.shown++;
          this.step(tok);
        };
        this.timer = this.clock.set(this.fire, d.ms / this.speed);
        return;
      }
      this.show(it, instant);
      this.shown++;
    }
    this.skipping = false;
    const r = this.r;
    const instant = this.shown <= this.instantTo;
    if (r.choices) this.emit("choices", { choices: r.choices, prompt: r.prompt, single: r.choices.length === 1, node: r.node, instant });
    else if (r.ending) {
      const newly = this.book ? this.book.record(this.story.id, r.ending) : false;
      this.emit("ending", { id: r.ending, ending: this.story.endings[r.ending] || {}, newly, instant });
    } else if (r.done) this.emit("done", { instant });
  }
  markRead(tab) {
    const ns = this.pending[tab];
    if (ns && ns.length) this.emit("read", { tab, ns: ns.splice(0) });
  }
  show(it, instant) {
    const ev = { item: it, tab: it.tab, instant, replay: this.shown < this.instantTo }; // replay: shown again from a save (not just fast)
    switch (it.k) {
      case "tab":
        return this.emit("tab", { tab: it.tab, info: this.story.tabs[it.tab] || { name: it.tab }, instant });
      case "msg":
        if (it.mine && !it.old) (this.pending[it.tab] = this.pending[it.tab] || []).push(it.n);
        else if (!it.mine && this.readOn) this.markRead(it.tab);
        this.emit("message", { ...ev, mine: !!it.mine, speaker: this.story.speakers[it.who] || {} });
        if (it.mine && it.old) this.emit("read", { tab: it.tab, ns: [it.n], old: true }); // the earlier conversation was read long ago
        return;
      case "cmd":
        if (it.cmd === "read") {
          if (it.arg === "off") this.readOn = false;
          else if (it.arg === "on") this.readOn = true;
          else if (/^\d+$/.test(it.arg)) return this.emit("cmd", { ...ev, cmd: "read", arg: it.arg }); // @read N: N people have read what comes next (the UI keeps the number)
          else this.markRead(it.tab);
          return;
        }
        if (it.cmd === "pause" || it.cmd === "typing") return;
        return this.emit("cmd", { ...ev, cmd: it.cmd, arg: it.arg });
      case "sys":
        return this.emit("system", ev);
      case "act":
        return this.emit("action", ev);
      case "date":
      case "after":
      case "summary":
        return this.emit(it.k, ev);
      default:
    }
  }
}
