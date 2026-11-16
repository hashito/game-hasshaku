#!/usr/bin/env node
// 文面の点検（公開の前に通す。docs/writing-style.md §7）: reads a 3D standard game's data as a director would, in play order.
// A player does not read like a robot: they keep the gist, forget the rest, and only know what the game has already shown them.
//   node tools/check-copy.mjs [game-dir] [--strict] [--json] [--sheet docs/copy-sheet.md] [--only 01,02]
// A chat game (chat-game.json, stories/*.js|json or story/story.js) gets the chat rules instead (below, §8); --only picks stories.
// Warn only by default; --strict exits 1 (run it strict before publishing, or say in the commit why a line stays). A string can opt out with a
// game.json "copy": { "ok": ["the exact text"] }.
//   next     a required task has no meaning (なぜ) or hint (どこで)
//   place    a hint does not name a place the player can find (a room name, or 〜の壁 / 台 / 扉 ...)
//   code     an internal id in player text (D08, R03, S_TABLE, T_WIRE; a doc may show one only next to its name)
//   key      a key written so the device text cannot change it (［E］ -> [E]; 「Eキー」 -> [E], or say both ways)
//   map      nothing near the start says the map exists and how to open it (ctx.mapTip(), or a first-stage text with 地図)
//   wait     a timed task with no "bar" (the player cannot see how long), or a task that says 待つ with no timer
//   em       a task's hint / meaning has no **emphasis** (the one thing to remember is not marked)
//   em-title **emphasis** in a title (titles go to the map labels and the task list, they are marked already)
//   recap    a level has no recap, or the game has no "facts" (nothing to read again)
//   repeat   a fact's marked words appear in fewer than 3 places (said once is forgotten)
//   spoiler  game.json "copy.terms": { "word": "G03" }: the word appears in the text of an earlier stage, or of an item owned from the start
//   gloss    game.json "copy.gloss": { "差圧": "水の圧力" }: the first use of the word in play order does not explain it
//   same     two words for one thing (私 / わたし, 地図 / マップ; add yours in game.json "copy.same": [["懐中電灯", "ハンドライト"]])
//   chapter  two stages with the same chapter name
//   long     a hint / meaning sentence over 50 characters
// --sheet writes the reading sheet: every text in play order with the director's questions, to read through once before publishing.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const J = (dir, f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
const SAME = [['私', 'わたし'], ['地図', 'マップ'], ['所持品', '持ち物'], ['懐中電灯', 'ハンドライト'], ['スマートフォン', 'スマホ']];
const PLACE = /室|階段|通路|ホール|壁|台|扉|戸|棚|机|箱|窓|盤|端末|電話|ロッカー|前|奥|横|先|裏|隣|入口|出口/;
const CODE = /(?<![A-Za-z0-9-])(?:[DRST]\d{1,2}[A-Z]?|[STRD]_[A-Z0-9_]+)(?![A-Za-z0-9-])/g;
const marks = (s) => [...String(s).matchAll(/\*\*([^*\n]+)\*\*/g)].map((m) => m[1]);
const plain = (s) => String(s ?? '').replace(/\*\*/g, '');

// every text the player reads, in play order: { stage, where, text, kind } (kind: 'guide' tells what to do, 'story' is the fiction)
export function playerTexts(dir) {
  const stages = J(dir, 'data/stages.json') || {}, tasks = J(dir, 'data/tasks.json') || [], items = J(dir, 'data/items.json') || [], docs = J(dir, 'data/docs.json') || [], thingsRaw = J(dir, 'data/things.json') || [], things = Array.isArray(thingsRaw) ? thingsRaw : thingsRaw.things || [], talk = J(dir, 'data/talk.json') || {};
  const levels = stages.levels || [], list = Array.isArray(tasks) ? tasks : tasks.tasks || [], out = [];
  const add = (stage, where, text, kind = 'guide') => { if (text) out.push({ stage, where, text: String(text), kind }); };
  for (const l of levels) {
    add(l.id, `段階 ${l.id} 題`, l.title); add(l.id, `段階 ${l.id} あらすじ`, l.recap); add(l.id, `段階 ${l.id} ひとこと`, l.remind);
    for (const u of l.unlocks || []) { const x = (stages.unlocks || {})[u]; if (x) add(l.id, `解放 ${u}`, x.desc); }
    for (const t of list.filter((x) => x.stage === l.id)) {
      add(l.id, `${t.id} 題`, t.title); add(l.id, `${t.id} なぜ`, t.meaning); add(l.id, `${t.id} どこで`, t.hint);
      for (const s of t.steps || []) { add(l.id, `${t.id} 手順`, s.text); add(l.id, `${t.id} 手順`, s.body); }
      if (t.minigame && t.minigame.cfg) { add(l.id, `${t.id} 作業`, t.minigame.cfg.title); add(l.id, `${t.id} 作業`, t.minigame.cfg.help); }
    }
    for (const f of (stages.facts || []).filter((x) => x.from === l.id)) add(l.id, '覚えておくこと', f.text);
    for (const i of items.filter((x) => (x.start ? levels[0].id : x.stage) === l.id)) { add(l.id, `持ち物 ${i.id}`, i.desc); add(l.id, `持ち物 ${i.id}`, i.why); }
    for (const d of docs.filter((x) => x.stage === l.id)) add(l.id, `資料 ${d.id}`, d.text, 'story');
  }
  for (const t of things) { const at = (t.stage || (levels[0] || {}).id); add(at, `調べ物 ${t.id}`, [].concat(t.text || []).join(' '), 'story'); add(at, `調べ物 ${t.id}`, t.feeling, 'story'); }
  for (const [k, lines] of Object.entries(talk)) if (Array.isArray(lines)) for (const L of lines) add('talk', `会話 ${k}`, L.text || L.t, 'story');
  return { out, levels, list, stages, items };
}
const jsStrings = (dir) => {
  const p = path.join(dir, 'js/ext'); if (!fs.existsSync(p)) return '';
  return fs.readdirSync(p).filter((f) => /\.js$/.test(f)).map((f) => fs.readFileSync(path.join(p, f), 'utf8')).join('\n');
};

export function checkCopy(dir) {
  const hits = [], manifest = J(dir, 'game.json') || {}, cfg = manifest.copy || {}, ok = new Set(cfg.ok || []);
  const { out, levels, list, stages, items } = playerTexts(dir);
  const hit = (rule, where, msg, text = '') => { if (!ok.has(text)) hits.push({ rule, where, msg, text: plain(text).slice(0, 60) }); };
  const js = jsStrings(dir), everything = `${out.map((x) => x.text).join('\n')}\n${js}`;
  for (const t of list) {
    if (!t.optional && !t.meaning) hit('next', t.id, 'なぜやるのか（meaning）がありません');
    if (!t.optional && !t.hint) hit('next', t.id, 'どこでやるのか（hint）がありません');
    if (t.hint && !PLACE.test(plain(t.hint))) hit('place', t.id, 'hint に場所の名前がありません', t.hint);
    for (const f of ['hint', 'meaning']) {
      if (t[f] && !t[f].includes('**')) hit('em', `${t.id} ${f}`, '覚えてほしい語を **…** で示します', t[f]);
      for (const s of plain(t[f] || '').split(/[。！？\n]+/)) if ([...s].length > 50) hit('long', `${t.id} ${f}`, `${[...s].length}字の文です。二つに分けます`, s);
    }
    if (String(t.title || '').includes('**')) hit('em-title', t.id, '題に **…** は使いません（地図の札にも出ます）', t.title);
    if (t.timer && t.timer.seconds > 0 && !t.timer.bar) hit('wait', t.id, '待つ時間が見えません（timer.bar: true）', t.title);
    if (!t.timer && /待つ/.test(t.title || '')) hit('wait', t.id, '「待つ」タスクに timer がありません', t.title);
  }
  for (const x of out) {
    if (x.kind === 'guide') {
      for (const m of plain(x.text).matchAll(CODE)) hit('code', x.where, `内部の番号「${m[0]}」が見えています。名前で書きます`, x.text);
      if (/［[A-Z]］|(?<![A-Za-z])[A-Z]キー/.test(x.text)) hit('key', x.where, '［E］ は端末ごとの言いかえが効きません。[E] と書くか、キーと画面の両方を書きます', x.text);
    } else if (/(?<![A-Za-z0-9-])R\d{2}[A-Z]?(?![A-Za-z0-9-])|(?<![A-Za-z0-9])[RST]_[A-Z]/.test(x.text)) hit('code', x.where, '部屋番号など内部の名前が見えています', x.text);
  }
  for (const m of js.matchAll(/['"`]([^'"`\n]*[぀-ヿ一-鿿][^'"`\n]*)['"`]/g)) if (/［[A-Z]］/.test(m[1])) hit('key', 'js/ext', '［E］ は端末ごとの言いかえが効きません', m[1]);
  // the map near the start
  const first = levels[0] ? out.filter((x) => x.stage === levels[0].id && x.kind === 'guide').map((x) => x.text).join('\n') : '';
  if (!/mapTip\(/.test(js) && !/地図/.test(first)) hit('map', '序盤', '迷ったら地図を開くことを、開きかたと一緒に伝えます（await ctx.mapTip()）');
  // recap + facts
  for (const l of levels) if (!l.recap) hit('recap', l.id, 'あらすじ（levels[].recap）がありません', l.title);
  if (levels.length && !(stages.facts || []).length) hit('recap', 'stages.json', '覚えておくこと（facts）がありません');
  for (const f of stages.facts || []) for (const w of marks(f.text)) { const n = everything.split(w).length - 1; if (n < 3) hit('repeat', `facts ${f.from}`, `「${w}」が ${n} か所でしか言われていません（3 か所以上で、場面に合わせて言い直します）`, f.text); }
  // spoilers: a word before its stage (items owned from the start count as the first stage)
  const idx = (id) => levels.findIndex((l) => l.id === id);
  for (const [w, from] of Object.entries(cfg.terms || {})) for (const x of out) if (x.stage !== 'talk' && x.kind === 'guide' && idx(x.stage) >= 0 && idx(x.stage) < idx(from) && plain(x.text).includes(w)) hit('spoiler', x.where, `「${w}」は ${from} までは出ないはずです`, x.text);
  // words that need saying what they are, the first time
  for (const [w, g] of Object.entries(cfg.gloss || {})) { const fx = out.find((x) => x.kind === 'guide' && plain(x.text).includes(w)); if (fx && !plain(fx.text).includes(g)) hit('gloss', fx.where, `「${w}」の最初の説明に「${g}」がありません`, fx.text); }
  // one word for one thing
  for (const group of [...SAME, ...(cfg.same || [])]) { const used = group.filter((w) => everything.includes(w)); if (used.length > 1) hit('same', 'all', `同じものに二つの言葉: ${used.join(' / ')}`); }
  const names = levels.map((l) => l.name).filter(Boolean); for (const n of new Set(names.filter((x, i) => names.indexOf(x) !== i))) hit('chapter', 'stages.json', `段階の名前「${n}」が重なっています`);
  void items;
  return hits;
}

export function sheet(dir) {
  const { out, levels } = playerTexts(dir), m = J(dir, 'game.json') || {};
  const L = [`# 文面の読み合わせ表：${m.title || ''} ${m.version || ''}`, '', '上から順に、はじめて遊ぶ人のつもりで一度だけ読みます。docs/writing-style.md §7。', '', '- この段階で、次に何をして、どこへ行くかが分かりますか。', '- 強調（**…**）だけ読んで、やることが分かりますか。', '- 前の段階の説明を忘れていても、ここだけで進めますか。大事なことは場面を変えて言い直していますか。', '- まだ見ていない出来事・物の名前を先に言っていませんか。', '- はじめて出る言葉に説明がありますか。番号や記号だけになっていませんか。', '- 怖さの説明をしすぎていませんか（案内は明るく、原因は語らない）。', ''];
  for (const l of levels) { L.push(`## ${l.id} ${l.name || ''}：${plain(l.title)}`, ''); for (const x of out.filter((y) => y.stage === l.id)) L.push(`- ${x.where}：${x.text.replace(/\n/g, ' / ')}`); L.push(''); }
  return L.join('\n');
}

// ---- chat games (docs/standard-chat.md §14, docs/writing-style.md §8) ------------------------------------------------------------------------------
// A chat game is a folder with chat-game.json + stories/*.json (standard-chat-site), stories/*.js (kaidan, futari) or
// story/story.js (henji, mikakunin). The rules of §7 read as their chat equivalents: the opening screen says whose story it
// is, a person who speaks for the first time has been named, a choice that decides the ending says what is at stake, one
// name for one thing inside a story, and nothing from the production notes reaches the screen.
//   who      the opening screen (intro) does not say whose story it is in its first two sentences (私 / 俺 / あなた / the player's name)
//   meet     a person speaks before the player has been told who they are (their name is not in the opening, the channel
//            name, or the talk before their first message or the two lines after it, and the message does not open with
//            who they are: 「702です」「管理人です」; a word of their role 「母」「消防団」 in the opening or around the first message
//            also says it). Posters on a board and handles (名無し, mod, 東＠駅員) are strangers by design and are not asked.
//   speaker  a message whose name tag is not in the cast, or a line with no name that quotes someone (「…」) in the talk
//   choice   choices that lead to different endings, with no prompt above them (what is decided here) and a label too short (< 12) to say it
//   same     two words for one thing in one story (copy.same adds pairs); one person who says 私 and わたし
//   memo     production notes on the screen (C12, §4, TODO, 仕様書, ゲーム化, @flow ...), also in the cast's role and the alt / caption of a picture
//   code     an internal id on the screen (n12, E3, a1, story ids like 05_xxx)
//   raw      markup that the chat does not draw (**…**, <b>, {{…}})
//   long     a sentence over 60 characters in a description, a prompt, a choice, an ending hint or a summary
//   gloss    copy.gloss: the first use of the word in the story does not explain it
// copy settings: chat-game.json "copy", or copy.json at the game root ({ ok, same, gloss }). An ok entry is the exact text, or
// "<rule> <where>" as the report prints it ("same 38 未央 の一人称") for a hit that has no text.
const CHAT_SAME = [['スマートフォン', 'スマホ'], ['携帯電話', 'ケータイ'], ['グループトーク', 'グループチャット']];
const SELF = [['私', 'わたし'], ['僕', 'ぼく'], ['俺', 'おれ']]; // one person, one way to say I (the player's lines and the narration count as one person)
// how many times w is used on its own (スマホ inside スマホケース still counts; メッセ inside メッセージ does not)
const uses = (all, w, group) => { let n = all.split(w).length - 1; for (const l of group) if (l !== w && l.includes(w)) n -= all.split(l).length - 1; return n; };
const FIRST_PERSON = /私|わたし|僕|ぼく|俺|おれ|あたし|あなた|自分/;
const MEMO = /(?<![A-Za-z0-9])C\d{1,2}(?![0-9])|§\s?\d|TODO|FIXME|XXX|仕様書|ゲーム化|制作メモ|分岐データ|@(?:flow|rumor|aside|typing|pause|sfx|vibe|glitch|fx|dial|hangup|notice|alert|read|title|members)\b/;
const CHAT_CODE = /(?<![A-Za-z0-9_#-])(?:n\d{1,3}[a-z]?|[a-z]\d{1,2}_\w+|E\d{1,2}(?:_\w+)?|S\d{2}|\d{2}_[a-z]\w*)(?![A-Za-z0-9_])/;
const RAW = /\*\*[^*\n]+\*\*|<\/?(?:b|i|em|strong|br|span|div)\b|\{\{|\}\}/;
const FAMILY = /^[母父兄姉弟妹夫妻娘孫叔伯祖]$/;
const PERSON = (c) => c && !['bot', 'notice', 'system', 'host', 'unknown'].includes(c.kind) && !c.minor && !c.secret;

const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
export function isChatGame(dir) {
  if (fs.existsSync(path.join(dir, 'chat-game.json')) || fs.existsSync(path.join(dir, 'story/story.js'))) return true;
  const s = path.join(dir, 'stories');
  return fs.existsSync(s) && fs.readdirSync(s).some((f) => /^[\w-]+\.(js|json)$/.test(f)) && !fs.existsSync(path.join(dir, 'data/stages.json'));
}
// [{ file, def }] in the order of the site (stories/ by name; chat-game.json "stories" when it lists them)
export async function loadChatStories(dir) {
  const files = [];
  const sd = path.join(dir, 'stories');
  if (fs.existsSync(sd)) for (const f of fs.readdirSync(sd).sort()) if (/^[\w-]+\.(js|json)$/.test(f)) files.push(path.join(sd, f));
  if (fs.existsSync(path.join(dir, 'story/story.js'))) files.push(path.join(dir, 'story/story.js'));
  const out = [];
  for (const f of files) {
    const def = f.endsWith('.json') ? readJ(f) : await import(pathToFileURL(f).href).then((m) => m.default || m.story);
    if (def && def.nodes) out.push({ file: path.relative(dir, f).replace(/\\/g, '/'), def });
  }
  return out;
}
export function chatConfig(dir) {
  const g = readJ(path.join(dir, 'chat-game.json')) || {}, site = readJ(path.join(dir, 'site.json')) || {};
  return { game: g, site, copy: { ...(readJ(path.join(dir, 'copy.json')) || {}), ...(g.copy || {}) } };
}

// every text of one story the player reads, in play order (nodes depth first from the start, choices in their order):
// { story, node, where, text, kind: 'guide' | 'talk' | 'end', who?, i }
export function chatTexts(def, parseBlock) {
  const s = def, id = s.id || '?', out = [], cast = s.characters || s.speakers || {};
  const add = (node, where, text, kind = 'guide', who = null) => { if (text != null && text !== '' && typeof text !== 'object') out.push({ story: id, node, where, text: String(text), kind, who, i: out.length }); };
  const many = (node, where, v, kind) => { if (Array.isArray(v)) v.forEach((x) => add(node, where, typeof x === 'string' ? x : x && x.text, kind)); else add(node, where, v, kind); };
  add('紹介', '題', s.title); add('紹介', '形式', s.format); add('紹介', '紹介文', s.description); add('紹介', '一行', s.teaser);
  const intro = s.intro && (typeof s.intro === 'string' || Array.isArray(s.intro) ? { text: s.intro } : s.intro);
  if (intro) { add('はじまり', '場所', intro.place); many('はじまり', 'はじまり', intro.text, 'intro'); add('はじまり', 'ボタン', intro.button); }
  for (const [k, ch] of Object.entries(s.channels || s.tabs || {})) { add('トーク', `トーク名 ${k}`, ch && ch.name, 'chan'); add('トーク', `トーク名 ${k}`, ch && ch.sub, 'chan'); }
  for (const [k, c] of Object.entries(cast)) if (c && c.role) add('人物', `人物 ${k}`, c.role, 'role');
  for (const [k, im] of Object.entries({ ...(s.images || {}), ...(s.media || {}) })) if (im) { add('画像', `画像 ${k}`, im.alt, 'alt'); if (typeof im.caption === 'string') add('画像', `画像 ${k}`, im.caption, 'alt'); }
  const chans = s.channels || s.tabs || {};
  const board = (k) => { const c = chans[k] || {}; return c.type === 'board' || c.skin === 'board'; };
  let tab = Object.keys(chans)[0] || null;
  const lines = (node, where, v) => {
    let blk = []; try { blk = parseBlock(v); } catch { return; }
    for (const { cond, item: it } of blk) {
      const from = out.length;
      if (it.k === 'tab') tab = it.tab;
      if (it.k === 'msg') { add(node, where, it.text, 'talk', it.who || null); { const last = out[out.length - 1]; if (last && last.who === (it.who || null) && last.text === String(it.text)) { if (board(tab)) last.board = true; if (it.media) last.media = it.media.kind; } } if (it.media && it.media.key) { const m = (s.media || {})[it.media.key] || (s.images || {})[it.media.key]; if (m && m.transcript) add(node, `${where} 声`, m.transcript, 'talk', it.who); } }
      else if (it.k === 'sys') add(node, where, it.text, 'sys');
      else if (it.k === 'date') add(node, where, it.text, 'sys');
      else if (it.k === 'cmd' && ['notice', 'alert', 'hangup'].includes(it.cmd) && it.arg) add(node, `${where} @${it.cmd}`, it.arg, 'sys');
      if (cond) for (let i = from; i < out.length; i++) out[i].cond = cond; // ?flag lines: shown only on some paths
    }
  };
  const seen = new Set(), stack = [s.start || Object.keys(s.nodes)[0]], order = [];
  while (stack.length) {
    const nid = stack.shift(); if (!nid || seen.has(nid) || !s.nodes[nid]) continue; seen.add(nid); order.push(nid);
    const n = s.nodes[nid], next = [];
    lines(nid, nid, n.lines);
    if (n.choices) { add(nid, `${nid} 問い`, n.prompt, 'prompt'); for (const c of n.choices) { add(nid, `${nid} 選択肢 ${c.id}`, c.label, 'choice'); if (typeof c.say === 'string') add(nid, `${nid}/${c.id}`, c.say, 'talk', s.player); lines(nid, `${nid}/${c.id}`, c.lines); if (c.next) next.push(c.next); } }
    for (const b of n.branch || []) next.push(b.next);
    if (n.next) next.push(n.next);
    if (n.ending) { const e = (s.endings || {})[n.ending]; if (e && !seen.has(`@${n.ending}`)) { seen.add(`@${n.ending}`); endingTexts(n.ending, e); } }
    stack.unshift(...next);
  }
  function endingTexts(k, e) {
    const at = `結末 ${k}`;
    if (e.after) { add(at, `${at} 区切り`, e.after.when, 'end'); lines(at, `${at} 後日`, e.after.lines); many(at, `${at} その後`, e.after.summary, 'end'); }
    add(at, `${at} 名前`, e.name, 'end'); add(at, `${at} 文`, e.epilogue, 'end'); add(at, `${at} まだのときの手がかり`, e.hint, 'end');
    const o = e.outro && (typeof e.outro === 'string' || Array.isArray(e.outro) ? { text: e.outro } : e.outro); if (o) many(at, `${at} あとがき`, o.text, 'end');
  }
  for (const [k, e] of Object.entries(s.endings || {})) if (!seen.has(`@${k}`)) { seen.add(`@${k}`); endingTexts(k, e); }
  return { out, order };
}

// which endings each choice can still reach (to find the choices that decide the ending)
function reach(s) {
  const memo = new Map();
  const go = (nid, path = new Set()) => {
    if (memo.has(nid)) return memo.get(nid);
    const n = s.nodes[nid]; const r = new Set(); if (!n || path.has(nid)) return r;
    path.add(nid);
    if (n.ending) r.add(n.ending);
    for (const t of [...(n.choices || []).map((c) => c.next), ...(n.branch || []).map((b) => b.next), n.next]) if (t) for (const e of go(t, path)) r.add(e);
    path.delete(nid); memo.set(nid, r); return r;
  };
  return (nid) => go(nid);
}
const sentences = (t) => plain(t).split(/(?<=[。！？!?])|\n+/).map((x) => x.trim()).filter(Boolean);
const nameForms = (k, c) => { const n = new Set([k]); if (c && c.name) n.add(c.name); for (const x of [...n]) { const sur = String(x).split(/[\s　・]/)[0]; if (sur.length >= 2) n.add(sur); } return [...n].filter((x) => x && x.length >= 1); };

export function checkChatStory(def, parseBlock, copy = {}) {
  const s = def, hits = [], ok = new Set(copy.ok || []), cast = s.characters || s.speakers || {};
  const hit = (rule, where, msg, text = '') => { const w = `${s.id || '?'} ${where}`; if (!ok.has(text) && !ok.has(`${rule} ${w}`)) hits.push({ rule, story: s.id || '?', where: w, msg, text: plain(text).slice(0, 60) }); };
  const { out } = chatTexts(s, parseBlock);
  const screen = out.filter((x) => x.kind !== 'role' && x.kind !== 'alt');
  // who: the first paragraph of the opening says whose story it is
  const intro = out.filter((x) => x.kind === 'intro');
  if (!intro.length) hit('who', 'はじまり', 'はじまりの画面（intro）がありません。誰の話か、なぜこのトークを開くのかを最初に書きます');
  else { const p1 = sentences(intro[0].text).slice(0, 2).join(''); if (!FIRST_PERSON.test(p1) && !(s.player && p1.includes(s.player))) hit('who', 'はじまり', 'はじまりの最初の二文で、誰の話かが分かりません（「私は〇〇」「あなたは〇〇」）', p1); }
  // meet: a person is named before (or right after) their first message
  const known = out.filter((x) => ['guide', 'intro', 'chan'].includes(x.kind)).map((x) => x.text).join('\n');
  const talk = out.filter((x) => ['talk', 'sys', 'choice', 'prompt'].includes(x.kind) && !/^結末/.test(x.node));
  const met = new Set([s.player, s.partner].filter(Boolean));
  talk.forEach((x, i) => {
    if (x.kind !== 'talk' || !x.who || met.has(x.who)) return;
    met.add(x.who);
    const c = cast[x.who]; if (!PERSON(c) || x.board || /[＠@]|名無し|^[!-~]+$/.test(x.who)) return; // board posters and handles are strangers by design
    const roleWords = String(c.role || '').replace(/あなた|プレイヤー/g, '').split(/[・、，,／/（）()「」\s]|の|で|と|が|は|に|を|へ|や/).filter((w) => w.length >= 2 || FAMILY.test(w));
    const forms = nameForms(x.who, c), near = talk.slice(0, i).map((y) => y.text).join('\n') + '\n' + talk.slice(i, i + 3).map((y) => y.text).join('\n');
    const selfIntro = /^(?:[^。、！？\s]{1,12}(?:です|っす|でございます|と申します|だよ|だ)(?:[。！!、]|$))/.test(plain(x.text).trim());
    if (!selfIntro && !forms.some((f) => known.includes(f) || near.includes(f)) && !roleWords.some((w) => known.includes(w) || near.includes(w))) hit('meet', x.where, `「${x.who}」が、誰なのか言われないまま話し始めます（はじまりの画面か、その前後の会話で、名前と関係を言います）`, x.text);
  });
  // speaker: a name tag that is not in the cast; narration that quotes someone in the talk
  for (const x of out) {
    if (x.kind === 'talk' && x.who && !cast[x.who] && x.who !== s.player) hit('speaker', x.where, `名前「${x.who}」が人物表にいません（誰の発言か分かりません）`, x.text);
    if (x.kind === 'sys' && /^「[^」]+」$/.test(x.text.trim())) hit('speaker', x.where, '名前のない行が、誰かの言葉だけを出しています（誰が言ったかを書きます）', x.text);
  }
  // choice: a choice that decides the ending has a prompt that says what is decided
  const ends = reach(s);
  for (const [nid, n] of Object.entries(s.nodes)) {
    if (!n.choices || n.choices.length < 2 || n.prompt || n.choices.every((c) => [...plain(c.label || '')].length >= 12)) continue; // long labels can say the stakes themselves
    const sets = n.choices.map((c) => [...ends(c.next)].sort().join(','));
    if (sets.every((x) => x) && new Set(sets).size === n.choices.length && sets.every((a, i) => sets.every((b, j) => i === j || !a.split(',').some((e) => b.split(',').includes(e))))) hit('choice', `${nid} 選択肢`, 'この選択で結末が分かれますが、何を決めるのかの問い（prompt）がありません。選ぶ前に、何を得て何を失うかが分かるようにします', n.choices.map((c) => c.label).join(' / '));
  }
  // same: one word for one thing, inside one story
  const all = screen.map((x) => x.text).join('\n');
  for (const group of [...CHAT_SAME, ...(copy.same || [])]) { const used = group.filter((w) => uses(all, w, group) > 0); if (used.length > 1) hit('same', '話全体', `同じものに二つの言葉: ${used.join(' / ')}`); }
  const bySpeaker = {};
  for (const x of screen) { const w = x.kind === 'talk' ? x.who : ['intro', 'end'].includes(x.kind) ? s.player : null; if (w) bySpeaker[w] = (bySpeaker[w] || '') + '\n' + plain(x.text).replace(/「[^」]*」/g, ''); }
  for (const [w, t] of Object.entries(bySpeaker)) for (const g of SELF) { const used = g.filter((x) => t.includes(x)); if (used.length > 1) hit('same', `${w} の一人称`, `「${w}」が自分を ${used.join(' と ')} の二通りで呼んでいます`); }
  // memo / code / raw / long
  for (const x of out) {
    const t = x.text;
    const m = t.match(MEMO); if (m) hit('memo', x.where, `制作メモ「${m[0]}」が画面に出ています${x.kind === 'role' ? '（人物の role はトーク情報に出ます）' : ''}`, t);
    if (x.kind !== 'role' && x.kind !== 'alt') { const c = plain(t).match(CHAT_CODE); if (c) hit('code', x.where, `内部の番号「${c[0]}」が画面に出ています。名前で書きます`, t); }
    const r = t.match(RAW); if (r) hit('raw', x.where, `チャットは「${r[0].slice(0, 12)}」を飾りとして描きません。そのまま文字で出ます`, t);
    if (['guide', 'prompt', 'choice'].includes(x.kind) && !/題|形式|場所|ボタン/.test(x.where) || /手がかり|その後/.test(x.where)) for (const z of sentences(t)) if ([...z].length > 60) hit('long', x.where, `${[...z].length}字の文です。二つに分けます`, z);
  }
  for (const [w, g] of Object.entries(copy.gloss || {})) { const fx = screen.find((x) => plain(x.text).includes(w)); if (fx && !plain(fx.text).includes(g)) hit('gloss', fx.where, `「${w}」の最初の説明に「${g}」がありません`, fx.text); }
  return hits;
}

export async function checkChatCopy(dir, { only = null } = {}) {
  const { parseBlock } = await import('../js/kit/chat.js');
  const { site, game, copy } = chatConfig(dir), hits = [];
  for (const [k, v] of [['name', game.name || site.name], ['description', game.description || site.description]]) if (v) {
    const m = String(v).match(MEMO); if (m) hits.push({ rule: 'memo', story: 'site', where: `サイト ${k}`, msg: `制作メモ「${m[0]}」が出ています`, text: String(v).slice(0, 60) });
    if (k === 'description') for (const z of sentences(v)) if ([...z].length > 80) hits.push({ rule: 'long', story: 'site', where: 'サイト description', msg: `${[...z].length}字の文です`, text: z.slice(0, 60) });
  }
  for (const { def } of await loadChatStories(dir)) if (!only || only.includes(def.id)) hits.push(...checkChatStory(def, parseBlock, copy));
  return hits.filter((h) => !(copy.ok || []).includes(h.text));
}

export async function chatSheet(dir, { only = null } = {}) {
  const { parseBlock } = await import('../js/kit/chat.js');
  const { site, game } = chatConfig(dir);
  const L = [`# 文面の読み合わせ表：${game.name || site.name || ''}`, '', '上から順に、はじめて遊ぶ人のつもりで一度だけ読みます。docs/standard-chat.md §14（チャット）。', '',
    '- はじまりの画面の最初の段落で、誰の話か（私は誰で、何をしている人か）、いつ・どこの話かが分かりますか。', '- 初めて話す人は、主人公とどんな関係か、その場か直前で分かりますか。',
    '- 「怖い」「おかしい」だけで終わらず、見て分かる様子と、いつもとの違いが書かれていますか。', '- 選ぶ前に、選択肢が何と何で、それぞれ何を得て何を失うかが分かりますか。',
    '- 同じ物を別の名前で呼んでいませんか。作り物の言葉に、架空だと分かる一言がありますか。', '- 最初の異変に、結末までに言葉で答えが返っていますか（正体は断定しなくてよい）。今が現実か記憶かを見失いませんか。',
    '- 制作メモ・仕様の言葉・番号が画面に出ていませんか。', ''];
  for (const { def } of await loadChatStories(dir)) {
    if (only && !only.includes(def.id)) continue;
    const { out } = chatTexts(def, parseBlock);
    L.push(`## ${def.id} ${plain(def.title || '')}`, '');
    let node = null;
    for (const x of out) {
      if (x.kind === 'role' || x.kind === 'alt') continue;
      if (x.node !== node) { node = x.node; L.push('', `### ${node}`); }
      const who = x.who ? `${x.who}：` : '';
      const tag = x.kind === 'choice' ? '▶ ' : x.kind === 'prompt' ? '問い：' : x.kind === 'sys' ? '［' : '';
      L.push(`- ${x.where.replace(/^\S+ /, '')}｜${x.cond ? `（${x.cond} のときだけ）` : ''}${tag}${who}${x.text.replace(/\n+/g, ' / ')}${x.kind === 'sys' ? '］' : ''}`);
    }
    L.push('');
  }
  return L.join('\n');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const a = process.argv.slice(2), val = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
  const dir = path.resolve(a.find((x, i) => !x.startsWith('--') && !['--sheet', '--only'].includes(a[i - 1])) || '.');
  const chat = isChatGame(dir) && !fs.existsSync(path.join(dir, 'data/stages.json'));
  const only = val('--only') ? val('--only').split(',') : null;
  const hits = chat ? await checkChatCopy(dir, { only }) : checkCopy(dir);
  if (a.includes('--json')) console.log(JSON.stringify(hits, null, 1));
  else for (const h of hits) console.log(`[${h.rule}] ${h.where}: ${h.msg}${h.text ? `  「${h.text}」` : ''}`);
  const by = {}; for (const h of hits) by[h.rule] = (by[h.rule] || 0) + 1;
  if (!a.includes('--json')) console.log(`copy: ${hits.length} (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}) — docs/${chat ? 'standard-chat.md §14' : 'writing-style.md §7'}${a.includes('--strict') ? '' : ' (warn only)'}`);
  if (val('--sheet')) { fs.mkdirSync(path.dirname(path.resolve(val('--sheet'))), { recursive: true }); fs.writeFileSync(val('--sheet'), chat ? await chatSheet(dir, { only }) : sheet(dir)); console.log(`sheet: ${val('--sheet')}`); }
  process.exit(hits.length && a.includes('--strict') ? 1 : 0);
}
