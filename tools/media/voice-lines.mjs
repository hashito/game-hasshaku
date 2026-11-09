// The spoken lines of data/talk.json and the cast that voices them, shared by gen-voices.mjs and audit-voice.mjs.
// CAST: who -> VOICEVOX style + delivery. Credits go to ASSETS.md as 「VOICEVOX:キャラ名」.
import fs from 'node:fs';
import path from 'node:path';
import { root } from './lib.mjs';

export const CAST = {
  '祖父': { speaker: 42, name: 'ちび式じい', speed: 0.9, pitch: -0.02, intonation: 0.9 },
  // the fake grandfather behind the door: the same voice, a touch lower and flatter (the wall filter does the rest)
  '戸の向こう': { speaker: 42, name: 'ちび式じい', speed: 0.86, pitch: -0.05, intonation: 0.55, preset: 'wall' },
  'Ｋさん': { speaker: 109, name: '東北イタコ', speed: 0.9, pitch: -0.06, intonation: 0.85 },
  // the thing behind the sliding door in Ｋさん's voice (the night): flatter, a touch lower, through the wall
  'Ｋさんの声': { speaker: 109, name: '東北イタコ', speed: 0.86, pitch: -0.09, intonation: 0.5, preset: 'wall' },
  '店のおばさん': { speaker: 20, name: 'もち子さん', speed: 0.95, pitch: -0.04, intonation: 1.0 },
  // 八尺様: a low female voice, slow and flat (compare with the synthesised po in js/ext/sound.js)
  '窓の外': { speaker: 14, name: '冥鳴ひまり', speed: 0.7, pitch: -0.12, intonation: 0.3, preset: 'wall' },
};
// the speaker of a line through a sliding door / window gets the wall preset even when they are friendly
const THROUGH = new Set(['襖の外', '戸の外']);
// a few lines of 窓の外 are the fake grandfather (ride 1): voice them as him
const FAKE_GRANDPA = /忘れ物|こっちを向いて/;
// who stays silent, and why (the audit reports these instead of flagging them)
export const SILENT = { '私': '主人公の声は出さない決まり（字幕と独白の帯で読ませる）' };

// every line that names a speaker: { id, key, index, who, text, preset, cast (null = not voiced) }
export function spokenLines() {
  const talk = JSON.parse(fs.readFileSync(path.join(root, 'data/talk.json'), 'utf8'));
  const lines = [];
  for (const [key, v] of Object.entries(talk)) {
    if (!Array.isArray(v)) continue;
    v.forEach((L, index) => {
      const o = Array.isArray(L) ? { who: L[1], text: L[2], at: L[0] } : L;
      let who = o.who;
      if (who === '窓の外' && FAKE_GRANDPA.test(o.text)) who = '戸の向こう';
      const cast = CAST[who] || null;
      const text = o.text.replace(/[「」]/g, '').replace(/\n/g, '');
      const preset = cast ? cast.preset || (THROUGH.has(o.where) ? 'wall' : null) : null;
      lines.push({ id: `v-${key}-${index}`.replace(/_/g, '-'), key, index, who: o.who, cast, text, preset, at: o.at, raw: o.text });
    });
  }
  if (talk.door_choice?.who) lines.push({ id: 'v-door-choice', key: 'door_choice', index: 0, who: talk.door_choice.who, cast: CAST['戸の向こう'], text: talk.door_choice.text.split('\n')[0].replace(/[「」]/g, ''), preset: 'wall', raw: talk.door_choice.text.split('\n')[0] });
  return lines;
}

export const QUEUE = process.env.MEDIA_QUEUE_URL || 'http://127.0.0.1:8765';
// one line through the local queue API (never VOICEVOX directly): returns the wav bytes. The API takes speaker and speed only; the pitch is put on afterwards
export async function queueVoice(text, c) {
  const r = await fetch(`${QUEUE}/v1/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'voice', params: { text, speaker: c.speaker, speed: c.speed } }) });
  if (!r.ok) throw new Error(`queue ${r.status} ${await r.text()}`);
  const { id } = await r.json();
  for (let i = 0; i < 600; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    const s = await (await fetch(`${QUEUE}/v1/jobs/${id}`)).json();
    if (s.status === 'done') {
      const b = Buffer.from(await (await fetch(s.files[0].download_url)).arrayBuffer());
      await fetch(`${QUEUE}/v1/jobs/${id}`, { method: 'DELETE' }).catch(() => {});
      return b;
    }
    if (s.status !== 'queued' && s.status !== 'running') throw new Error(`job ${s.status}: ${JSON.stringify(s).slice(0, 300)}`);
  }
  throw new Error('queue timeout');
}
