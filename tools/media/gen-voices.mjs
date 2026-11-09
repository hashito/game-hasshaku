// Voices of Issue #1, through the local queue API (http://127.0.0.1:8765, never VOICEVOX directly): node tools/media/gen-voices.mjs [--only v-report] [--force]
// Reads data/talk.json (tools/media/voice-lines.mjs: who is voiced and how; the protagonist 私 stays silent), writes assets/voice/<id>.mp3
// (mono 44.1 kHz, loudness-matched) and assets/voice/manifest.json { id: { key, index, who, preset } }.
// A line whose text changed keeps its old mp3 unless --only / --force names it: tools/audit-voice.mjs finds those.
// The words stay the subtitles; voices heard through a door / window are degraded at run time by js/kit/voice-fx.js (rule S15):
// manifest `preset` = 'wall' for them, null for voices in the same room.
// The API takes speaker and speed; the cast's pitch goes on here (VOICEVOX pitchScale p is a factor of e^p), the intonation setting of the older takes cannot be asked for.
import fs from 'node:fs';
import path from 'node:path';
import { root, ensure, log, ff, loudness, duration } from './lib.mjs';
import { spokenLines, queueVoice } from './voice-lines.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force'), only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const OUT = path.join(root, 'assets/voice');
const lines = spokenLines().filter((L) => L.cast);

ensure(OUT); ensure(path.join(root, 'tools/_raw/voice'));
const manifest = {};
for (const L of lines) {
  manifest[L.id] = { key: L.key, index: L.index, who: L.who, preset: L.preset };
  if (only && !L.id.startsWith(only)) continue;
  const mp3 = path.join(OUT, L.id + '.mp3');
  if (fs.existsSync(mp3) && !force && !only) continue;
  const wav = path.join(root, 'tools/_raw/voice', L.id + '.wav');
  fs.writeFileSync(wav, await queueVoice(L.text, L.cast));
  const pitch = `rubberband=pitch=${Math.exp(L.cast.pitch).toFixed(4)}`;
  // a gentle high-pass and loudness to -18 LUFS (dialogue level); mono mp3 for every browser
  ff(['-i', wav, '-af', `${pitch},highpass=f=70,loudnorm=I=-18:TP=-2:LRA=9`, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '5', mp3]);
  let lv = loudness(mp3);
  // loudnorm misjudges very short clips: correct those with a plain gain (and a limiter for the peaks)
  if (lv.lufs !== null && Math.abs(lv.lufs + 18) > 1.5) {
    ff(['-i', wav, '-af', `${pitch},highpass=f=70,volume=${(-18 - loudness(wav).lufs).toFixed(1)}dB,alimiter=limit=0.7:level=disabled`, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '5', mp3]);
    lv = loudness(mp3);
  }
  log('ok', L.id, L.cast.name, L.preset || '-', JSON.stringify(lv));
}
for (const [id, m] of Object.entries(manifest)) { const f = path.join(OUT, id + '.mp3'); if (fs.existsSync(f)) m.sec = +duration(f).toFixed(2); }   // sec: how long the subtitle has to stay (js/ext/story.js)
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
log(`${lines.length} lines, manifest written`);
