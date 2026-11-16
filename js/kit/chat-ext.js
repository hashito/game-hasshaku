/* game-kit 9638d82: js/chat-ext.js — edit in game-kit and run tools/kit-sync.js */
// Extension points of the chat standard (docs/standard-chat.md). Pure registries (no DOM needed), so a game
// registers what it needs once at start-up and the engine / UI / checker look it up by name.
//
//   registerSkin("night", { label, tokens: { bg: "#111", "bubble-me": "#2a6" }, css: ".cx-bubble{...}" })   // bubble style pack
//   registerChannelType("board", { label, row: (ctx) => html })      // how a channel (talk / call / board / yours) is drawn
//   registerCue("knock", (synth, t) => synth.tone({ at: t, freq: 90, dur: 0.2 }))   // @sfx knock
//   registerCommand("nodding", { run(ctx, arg) { ... }, check(arg) { return "message" | null } })   // @nodding …
//   registerWidget("vote", { render(ctx) -> HTMLElement | html, ... })   // ［ウィジェット#key］ bubble: in-chat vote form, map or photo card
//   registerSpeakerKind("comment", { row: (ctx) => html | null, groups?, cue? })    // characters.X.kind: draw that speaker's lines yourself
//   registerRecordTab("map", { label, render: (ctx) => html | element })    // a tab of the 記録 sheet (next to エンディング / 写真)
//   on("message" | "choice" | "ending" | "call" | "skin" | "widget" | "endcard" | "profile" | "viewer-click" | "unread" | "*", fn)    // hooks; emit() is used by chat-ui.js
//
// Every register* returns the entry, throws on a bad id, and `reset()` clears everything (tests).
const ID = /^[a-z][\w-]*$/i;
const reg = { skins: new Map(), channelTypes: new Map(), cues: new Map(), commands: new Map(), widgets: new Map(), kinds: new Map(), records: new Map(), glitches: new Map(), cueLabels: new Map() };
export const CHAT_STANDARD_VERSION = "1.3.2"; // 1.0 (#34) 1.1 (tokens + embed) 1.2 (#35: home / title / call / backlog / drafts / album, see docs/standard-chat.md §12) 1.3 (#35 kaidan: story library, talk tools, glitch registry, per-cue sound off, §13; 1.3.2 copy rules §14)
const hooks = new Map();
const need = (kind, id) => {
  if (!ID.test(String(id))) throw new Error(`${kind}: bad id "${id}" (letters, digits, - and _)`);
};

export const BUILTIN_SKINS = ["line-like", "work-chat", "bbs", "dm-dark"];
export const BUILTIN_CHANNEL_TYPES = ["talk", "call", "board"];
// token name -> CSS custom property (--gfc-<name>). Everything a skin may set.
export const SKIN_TOKENS = ["bg", "header", "header-text", "text", "meta", "bubble-me", "bubble-me-text", "bubble-other", "accent", "radius", "avatar-size", "avatar-radius", "ring-width", "ring-style", "font", "font-size", "bar", "chip", "sys", "sys-text",
  "bg-text", "panel", "panel-text", "panel-alt", "input", "input-text", "choice", "choice-text", "line", "text-screen", "text-screen-ink", "title-font"];

// tokens -> CSS rule text for [data-chat-skin="id"]
export function skinCss(id, def = {}) {
  const t = typeof def === "string" ? {} : def.tokens || {};
  const props = Object.entries(t).map(([k, v]) => {
    if (!SKIN_TOKENS.includes(k)) throw new Error(`skin ${id}: unknown token "${k}" (${SKIN_TOKENS.join(", ")})`);
    return `--gfc-${k}: ${v};`;
  });
  const extra = typeof def === "string" ? def : def.css || "";
  return `${props.length ? `.cx-app[data-chat-skin="${id}"], [data-chat-skin="${id}"] .cx-app { ${props.join(" ")} }\n` : ""}${extra}`;
}

export function registerSkin(id, def = {}) {
  need("skin", id);
  const entry = { id, label: (def && def.label) || id, css: skinCss(id, def), tokens: (def && def.tokens) || {} };
  reg.skins.set(id, entry);
  const doc = globalThis.document;
  if (doc && doc.head) {
    let el = doc.getElementById(`gfc-skin-${id}`);
    if (!el) {
      el = doc.createElement("style");
      el.id = `gfc-skin-${id}`;
      doc.head.appendChild(el);
    }
    el.textContent = entry.css;
  }
  return entry;
}
export const getSkin = (id) => reg.skins.get(id) || null;
export const skinIds = () => [...BUILTIN_SKINS, ...reg.skins.keys()];

export function registerChannelType(id, def = {}) {
  need("channelType", id);
  const entry = { id, label: def.label || id, ...def };
  reg.channelTypes.set(id, entry);
  return entry;
}
export const getChannelType = (id) => reg.channelTypes.get(id) || null;
export const channelTypeIds = () => [...BUILTIN_CHANNEL_TYPES, ...reg.channelTypes.keys()];

export function registerCue(name, fn, label = "") {
  need("cue", name);
  if (typeof fn !== "function") throw new Error(`cue ${name}: needs a function (synth, t, gain)`);
  reg.cues.set(name, fn);
  if (label) reg.cueLabels.set(name, label); // a label puts the sound in the menu's list of sounds a reader can switch off
  return fn;
}
export const cueDefs = () => [...reg.cues.entries()].map(([n, fn]) => [n, fn, reg.cueLabels.get(n) || null]);

// registerGlitch("rename", { run(ctx, arg) }) - a kind of `@glitch kind arg` (the app itself misbehaving, C13). ctx = { ui, tab, log, instant, live, words, key, keep, calm }
// (live: the talk is really being played, not redrawn from a save; calm: reduced effects). Tried before the built-in kinds, so a game can override one.
export function registerGlitch(kind, def) {
  need("glitch", kind);
  const d = typeof def === "function" ? { run: def } : def || {};
  if (typeof d.run !== "function") throw new Error(`glitch ${kind}: needs run(ctx, arg)`);
  reg.glitches.set(kind, d);
  return d;
}
export const getGlitch = (kind) => reg.glitches.get(kind) || null;

// registerVoicePlayer(({ el, sec, text, style, cues, done }) => stop | null) - plays a voice message that has no audio file (a synthesized voice). Return null when it cannot.
let voicePlayer = null;
export const registerVoicePlayer = (fn) => (voicePlayer = fn);
export const getVoicePlayer = () => voicePlayer;
export const glitchNames = () => [...reg.glitches.keys()];

export function registerCommand(tag, def) {
  need("command", tag);
  const d = typeof def === "function" ? { run: def } : def || {};
  if (typeof d.run !== "function") throw new Error(`command @${tag}: needs run(ctx, arg)`);
  reg.commands.set(tag, d);
  return d;
}
export const getCommand = (tag) => reg.commands.get(tag) || null;
export const commandNames = () => [...reg.commands.keys()];

export function registerWidget(id, def) {
  need("widget", id);
  if (!def || typeof def.render !== "function") throw new Error(`widget ${id}: needs render(ctx)`);
  reg.widgets.set(id, def);
  return def;
}
export const getWidget = (id) => reg.widgets.get(id) || null;
export const widgetIds = () => [...reg.widgets.keys()];

export function registerSpeakerKind(kind, def) {
  need("speakerKind", kind);
  if (!def || typeof def.row !== "function") throw new Error(`speaker kind ${kind}: needs row(ctx)`);
  reg.kinds.set(kind, def);
  return def;
}
export const getSpeakerKind = (kind) => (kind ? reg.kinds.get(kind) || null : null);

export function registerRecordTab(id, def) {
  need("recordTab", id);
  if (!def || typeof def.render !== "function") throw new Error(`record tab ${id}: needs render(ctx)`);
  const e = { id, label: def.label || id, ...def };
  reg.records.set(id, e);
  return e;
}
export const recordTabs = () => [...reg.records.values()];

export function on(event, fn) {
  if (!hooks.has(event)) hooks.set(event, new Set());
  hooks.get(event).add(fn);
  return () => hooks.get(event).delete(fn);
}
export function emit(event, data = {}) {
  for (const k of [event, "*"]) for (const f of hooks.get(k) || []) { try { f(event, data); } catch (e) { globalThis.console && console.error(`hook ${event}:`, e); } }
}
export const HOOK_EVENTS = ["story", "message", "choice", "call", "ending", "intro", "outro", "skin", "widget", "glitch", "endcard", "profile", "viewer-click", "unread", "home", "title", "talk", "library", "after", "custom"];

export function reset() {
  for (const m of Object.values(reg)) m.clear();
  voicePlayer = null;
  hooks.clear();
}
