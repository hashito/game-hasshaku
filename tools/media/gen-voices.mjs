// Voices of Issue #1 (VOICEVOX at 127.0.0.1:50021, local only): node tools/media/gen-voices.mjs [--only v-report] [--force]
// Reads data/talk.json, voices every line whose speaker is in CAST (the protagonist 私 stays silent), writes assets/voice/<id>.mp3
// (mono 44.1 kHz, loudness-matched) and assets/voice/manifest.json { id: { key, index, who, preset } }.
// The words stay the subtitles; voices heard through a door / window are degraded at run time by js/kit/voice-fx.js (rule S15):
// manifest `preset` = 'wall' for them, null for voices in the same room.
import fs from 'node:fs';
import path from 'node:path';
import { root, ensure, log, ff, loudness } from './lib.mjs';

const VV = process.env.VOICEVOX_URL || 'http://127.0.0.1:50021';
const args = process.argv.slice(2);
const force = args.includes('--force'), only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const OUT = path.join(root, 'assets/voice');

// who -> VOICEVOX style + delivery. Credits go to ASSETS.md as 「VOICEVOX:キャラ名」.
const CAST = {
  '祖父': { speaker: 42, name: 'ちび式じい', speed: 0.9, pitch: -0.02, intonation: 0.9 },
  // the fake grandfather behind the door: the same voice, a touch lower and flatter (the wall filter does the rest)
  '戸の向こう': { speaker: 42, name: 'ちび式じい', speed: 0.86, pitch: -0.05, intonation: 0.55, preset: 'wall' },
  'Ｋさん': { speaker: 109, name: '東北イタコ', speed: 0.9, pitch: -0.06, intonation: 0.85 },
  '店のおばさん': { speaker: 20, name: 'もち子さん', speed: 0.95, pitch: -0.04, intonation: 1.0 },
  // 八尺様: a low female voice, slow and flat (compare with the synthesised po in js/ext/sound.js)
  '窓の外': { speaker: 14, name: '冥鳴ひまり', speed: 0.7, pitch: -0.12, intonation: 0.3, preset: 'wall' },
};
// the speaker of a line through a sliding door / window gets the wall preset even when they are friendly
const THROUGH = new Set(['襖の外', '戸の外']);
// a few lines of 窓の外 are the fake grandfather (ride 1): voice them as him
const FAKE_GRANDPA = /忘れ物|こっちを向いて/;

const talk = JSON.parse(fs.readFileSync(path.join(root, 'data/talk.json'), 'utf8'));
const lines = [];
for (const [key, v] of Object.entries(talk)) {
  if (!Array.isArray(v)) continue;
  v.forEach((L, index) => {
    const o = Array.isArray(L) ? { who: L[1], text: L[2] } : L;
    let who = o.who;
    if (who === '窓の外' && FAKE_GRANDPA.test(o.text)) who = '戸の向こう';
    const c = CAST[who];
    if (!c) return;
    const text = o.text.replace(/[「」]/g, '').replace(/\n/g, '');
    const preset = c.preset || (THROUGH.has(o.where) ? 'wall' : null);
    lines.push({ id: `v-${key}-${index}`.replace(/_/g, '-'), key, index, who: o.who, cast: c, text, preset });
  });
}
if (talk.door_choice?.who) lines.push({ id: 'v-door-choice', key: 'door_choice', index: 0, who: talk.door_choice.who, cast: CAST['戸の向こう'], text: talk.door_choice.text.split('\n')[0].replace(/[「」]/g, ''), preset: 'wall' });

async function synth(text, c) {
  const q = await (await fetch(`${VV}/audio_query?speaker=${c.speaker}&text=${encodeURIComponent(text)}`, { method: 'POST' })).json();
  Object.assign(q, { speedScale: c.speed, pitchScale: c.pitch, intonationScale: c.intonation, prePhonemeLength: 0.12, postPhonemeLength: 0.25, outputSamplingRate: 44100 });
  const r = await fetch(`${VV}/synthesis?speaker=${c.speaker}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) });
  if (!r.ok) throw new Error(`synthesis ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

ensure(OUT); ensure(path.join(root, 'tools/_raw/voice'));
const manifest = {};
for (const L of lines) {
  manifest[L.id] = { key: L.key, index: L.index, who: L.who, preset: L.preset };
  if (only && !L.id.startsWith(only)) continue;
  const mp3 = path.join(OUT, L.id + '.mp3');
  if (fs.existsSync(mp3) && !force) continue;
  const wav = path.join(root, 'tools/_raw/voice', L.id + '.wav');
  fs.writeFileSync(wav, await synth(L.text, L.cast));
  // a gentle high-pass and loudness to -18 LUFS (dialogue level); mono mp3 for every browser
  ff(['-i', wav, '-af', 'highpass=f=70,loudnorm=I=-18:TP=-2:LRA=9', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '5', mp3]);
  let lv = loudness(mp3);
  // loudnorm misjudges very short clips: correct those with a plain gain (and a limiter for the peaks)
  if (lv.lufs !== null && Math.abs(lv.lufs + 18) > 1.5) {
    ff(['-i', wav, '-af', `highpass=f=70,volume=${(-18 - loudness(wav).lufs).toFixed(1)}dB,alimiter=limit=0.7:level=disabled`, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '5', mp3]);
    lv = loudness(mp3);
  }
  log('ok', L.id, L.cast.name, L.preset || '-', JSON.stringify(lv));
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
log(`${lines.length} lines, manifest written`);
