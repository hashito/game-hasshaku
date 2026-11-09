// Voice audit (feedback 2026-11-09「音声がない部分の音声を作るなどのヌケモレのチェック」): every line that names a speaker against the recordings.
//   node tools/audit-voice.mjs [--resynth] [--json out.json]
// (a) a voiced character's line without a recording  (b) a manifest entry / file that does not exist, or a file nobody uses
// (c) the words and the recording disagree: the line changed after the recording's commit, or (--resynth) a fresh take through the queue API
//     runs very differently long  (d) a recording close to silence  (e) timed lines: a line starts while the voice before it is still speaking (a thought line replaces the subtitle too).
// Exit 1 when something is wrong.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, duration, loudness } from './media/lib.mjs';
import { spokenLines, SILENT, queueVoice } from './media/voice-lines.mjs';

const args = process.argv.slice(2);
const resynth = args.includes('--resynth');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const dir = path.join(root, 'assets/voice');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const lines = spokenLines();
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const norm = (s) => String(s || '').replace(/[「」\s]/g, '');
const talkAt = new Map();
const talkOf = (rev) => { if (!talkAt.has(rev)) { let t = null; try { t = JSON.parse(git('show', `${rev}:data/talk.json`)); } catch {} talkAt.set(rev, t); } return talkAt.get(rev); };
const textAt = (t, L) => { if (!t) return null; if (L.key === 'door_choice') return (t.door_choice?.text || '').split('\n')[0]; const o = Array.isArray(t[L.key]) ? t[L.key][L.index] : null; return Array.isArray(o) ? o[2] : o?.text ?? null; };

const rows = [], problems = [], silent = [];
for (const L of lines) {
  if (!L.cast) { silent.push({ id: L.id, who: L.who, text: L.text, why: SILENT[L.who] || '未定義の話者（要確認）' }); if (!SILENT[L.who]) problems.push(`[a] ${L.id} 話者「${L.who}」の声の指定がない`); continue; }
  const row = { id: L.id, who: L.who, text: L.text, status: 'ok', notes: [] };
  rows.push(row);
  const file = path.join(dir, L.id + '.mp3');
  const bad = (tag, msg) => { row.status = tag; row.notes.push(msg); problems.push(`[${tag}] ${L.id}（${L.who}）${msg}：${L.text.slice(0, 30)}`); };
  if (!fs.existsSync(file)) { bad('a', '録音がない'); continue; }
  if (!manifest[L.id]) bad('b', 'manifest に載っていない');
  else if (manifest[L.id].key !== L.key || manifest[L.id].index !== L.index) bad('b', 'manifest の行番号がずれている');
  row.sec = duration(file);
  const lv = loudness(file); row.lufs = lv.lufs; row.peak = lv.peak;
  if (lv.lufs === null || lv.lufs < -38 || lv.peak < -30 || row.sec < 0.3) bad('d', `無音に近い（${lv.lufs} LUFS / peak ${lv.peak} / ${row.sec}s）`);
  const rev = git('log', '-1', '--format=%h', '--', `assets/voice/${L.id}.mp3`).trim();
  row.rev = rev;
  const then = textAt(talkOf(rev), L);
  if (then !== null && norm(then) !== norm(L.raw)) bad('c', `録音時の文と違う（${rev} の文「${then.slice(0, 40)}」）`);
  if (resynth) {
    const tmp = path.join(os.tmpdir(), `audit-${process.pid}-${L.id}.wav`);
    fs.writeFileSync(tmp, await queueVoice(L.text, L.cast));
    row.fresh = duration(tmp); fs.unlinkSync(tmp);
    row.ratio = +(row.sec / row.fresh).toFixed(2);
    if (Math.abs(row.fresh - row.sec) > Math.max(0.8, row.fresh * 0.2)) bad('c', `録り直しと長さが違う（録音 ${row.sec.toFixed(1)}s / 文面 ${row.fresh.toFixed(1)}s）`);
  }
  if (!manifest[L.id]?.sec) bad('e', 'manifest に長さ sec がない（字幕が声より先に消える）');
}
// a file nobody uses
const want = new Set(lines.map((L) => L.id));
for (const f of fs.readdirSync(dir)) if (f.endsWith('.mp3') && !want.has(f.slice(0, -4))) problems.push(`[b] ${f} はどの行からも使われていない`);
for (const id of Object.keys(manifest)) if (!fs.existsSync(path.join(dir, id + '.mp3'))) problems.push(`[b] manifest の ${id} のファイルがない`);
// timed lines: a voice still speaking when the next one starts
for (const key of ['night', 'ride']) {
  const timed = lines.filter((L) => L.key === key).sort((a, b) => a.at - b.at);
  timed.forEach((L, i) => { const r = rows.find((x) => x.id === L.id), n = timed[i + 1]; if (r && r.sec && n && L.at + r.sec > n.at) problems.push(`[e] ${L.id}（${r.sec.toFixed(1)}s, ${L.at}秒から）が次の声 ${n.id}（${n.at}秒）にかぶる`); });
}
const count = (t) => rows.filter((r) => r.status === t).length;
console.log(`声のある行 ${rows.length}（問題なし ${count('ok')}）／ 声なしの行 ${silent.length}（すべて ${[...new Set(silent.map((s) => s.who))].join('・')}）`);
for (const r of rows) console.log(`${r.status.padEnd(2)} ${r.id.padEnd(18)} ${String(r.who).padEnd(7)} ${r.sec ? r.sec.toFixed(1).padStart(5) + 's' : '  なし'} ${r.lufs ?? ''} ${r.ratio ?? ''} ${r.rev || ''} ${r.text.slice(0, 24)} ${r.notes.join(' / ')}`);
if (problems.length) console.log('\n問題 ' + problems.length + ' 件\n' + problems.join('\n'));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ rows, silent, problems }, null, 1));
process.exit(problems.length ? 1 : 0);
