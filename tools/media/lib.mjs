// Shared helpers of the media generators (tools/media/*). Node 18+, ffmpeg / ffprobe on PATH, local ComfyUI / VOICEVOX only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW = path.join(root, 'tools/_raw');          // git-ignored: raw renders, seeds of every try
export const COMFY = process.env.COMFY_URL || 'http://127.0.0.1:8188';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ensure = (d) => fs.mkdirSync(d, { recursive: true });
export const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
export const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) % 1000000000; };
export const val = (args, n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

export function ff(args) { return execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 1 << 28 }); }
export function duration(file) { return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim()); }
export function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const sum = (r.stderr || '').split('Summary:').pop();
  const lufs = /I:\s+(-?[\d.]+) LUFS/.exec(sum), peak = /Peak:\s+(-?[\d.]+) dBFS/.exec(sum);
  return { lufs: lufs ? Number(lufs[1]) : null, peak: peak ? Number(peak[1]) : null };
}

const seedFile = path.join(root, 'tools/media/seeds.json');
export const seeds = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : {};
export const saveSeeds = () => fs.writeFileSync(seedFile, JSON.stringify(Object.fromEntries(Object.entries(seeds).sort()), null, 1) + '\n');

// ComfyUI: wait for an empty queue (one generation at a time on this machine), run a workflow, return the first output file
export async function comfyIdle() {
  for (let i = 0; i < 2000; i++) {
    const q = await (await fetch(`${COMFY}/queue`)).json();
    if (!q.queue_running.length && !q.queue_pending.length) return;
    if (i % 24 === 0) log('waiting for the ComfyUI queue to be empty ...');
    await sleep(5000);
  }
  throw new Error('ComfyUI queue never became empty');
}
export async function comfyRun(workflow, kind = 'images', id = '') {
  await comfyIdle();
  const r = await (await fetch(`${COMFY}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: workflow }) })).json();
  if (!r.prompt_id) throw new Error('ComfyUI refused ' + id + ': ' + JSON.stringify(r).slice(0, 400));
  for (let i = 0; i < 3000; i++) {
    await sleep(2000);
    const o = (await (await fetch(`${COMFY}/history/${r.prompt_id}`)).json())[r.prompt_id];
    if (!o) continue;
    if (o.status?.status_str === 'error') throw new Error('ComfyUI error ' + JSON.stringify(o.status.messages).slice(0, 400));
    const f = Object.values(o.outputs || {}).flatMap((x) => x[kind] || [])[0];
    if (!f) { if (o.status?.completed) throw new Error('no output'); continue; }
    const d = await fetch(`${COMFY}/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder || '')}&type=${f.type}`);
    return { buf: Buffer.from(await d.arrayBuffer()), ext: path.extname(f.filename) };
  }
  throw new Error('timeout ' + id);
}

// one generator at a time (images / voices / audio)
export function lock(name) {
  ensure(RAW);
  const f = path.join(RAW, '.lock');
  if (fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < 6 * 3600e3) throw new Error(`another generation run holds ${f}: ${fs.readFileSync(f, 'utf8')}`);
  fs.writeFileSync(f, `${name} pid ${process.pid} ${new Date().toISOString()}`);
  const un = () => { try { fs.rmSync(f); } catch { /* gone */ } };
  process.on('exit', un); process.on('SIGINT', () => { un(); process.exit(1); });
}
