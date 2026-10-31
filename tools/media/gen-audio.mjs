// Ambience loops and the title music of Issue #1: ACE-Step v1 (3.5B) in the local ComfyUI, one job at a time.
//   node tools/media/gen-audio.mjs [--only amb-] [--force] [--bump]
// Raw FLAC -> tools/_raw/audio/<id>.flac, then tools/media/make-loop.py makes a seamless loop (or a faded one-shot)
// -> assets/audio/<id>.mp3 (stereo 44.1 kHz, loudness-matched), listed in assets/audio/manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, RAW, ensure, log, hash, val, seeds, saveSeeds, comfyRun, ff, loudness, duration } from './lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force'), only = val(args, '--only'), bump = args.includes('--bump');
const OUT = path.join(root, 'assets/audio');
const INST = 'instrumental, no vocals, no singing, no speech';

// sec: length of the loop (the generation is longer: the loop tool picks the steadiest window); lufs: target level in the game
export const AUDIO = [
  { id: 'amb-dusk-village', sec: 45, lufs: -26, use: 'L1 夕暮れの山村',
    tags: `field recording, summer evening in a Japanese mountain village, higurashi cicadas calling in waves, distant dog barking once, soft wind in cedar trees, rice paddy frogs far away, ambient soundscape, ${INST}` },
  { id: 'amb-night-insects', sec: 45, lufs: -27, use: 'L2・L3 夜の虫と風（屋外）',
    tags: `field recording, late summer night in the Japanese countryside, crickets and bell crickets chirping steadily, gentle wind, very quiet, no music, ambient soundscape, ${INST}` },
  { id: 'amb-night-indoor', derive: 'amb-night-insects', sec: 45, lufs: -32, use: 'L2・L3 夜の虫と風（屋内でこもる）', muffle: true },
  { id: 'amb-dawn-fog', sec: 40, lufs: -30, use: 'L4 朝霧の村（鳥が鳴かない）',
    tags: `field recording, still foggy dawn in an empty mountain village, almost silent, faint low wind, distant dripping water, no birds, no insects, eerie quiet room tone, ambient drone, ${INST}` },
  { id: 'amb-van', sec: 40, lufs: -24, use: 'L5 車内',
    tags: `field recording inside an old van driving slowly on a narrow country road, low engine hum, tyre rumble, rhythmic bump over road joints, rattling interior, ambient, ${INST}` },
  { id: 'music-title', sec: 32, lufs: -22, loop: false, use: 'タイトル',
    tags: `dark ambient Japanese horror film score, slow, sparse shakuhachi breath, low taiko heartbeat, detuned koto plucks, deep drone, tense and quiet, minimal, ${INST}` },
];

const ace = (tags, seconds, seed) => ({
  1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'ace_step_v1_3.5b.safetensors' } },
  2: { class_type: 'ModelSamplingSD3', inputs: { model: ['1', 0], shift: 5.0 } },
  3: { class_type: 'TextEncodeAceStepAudio', inputs: { clip: ['1', 1], tags, lyrics: '[instrumental]', lyrics_strength: 0.99 } },
  4: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['3', 0] } },
  5: { class_type: 'EmptyAceStepLatentAudio', inputs: { seconds, batch_size: 1 } },
  6: { class_type: 'KSampler', inputs: { seed, steps: 50, cfg: 5, sampler_name: 'euler', scheduler: 'simple', denoise: 1, model: ['2', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0] } },
  7: { class_type: 'VAEDecodeAudio', inputs: { samples: ['6', 0], vae: ['1', 2] } },
  8: { class_type: 'SaveAudio', inputs: { audio: ['7', 0], filename_prefix: 'audio/hasshaku' } },
});

async function main() {
  ensure(OUT); ensure(path.join(RAW, 'audio'));
  const manifest = {};
  for (const a of AUDIO) {
    manifest[a.id] = { file: `assets/audio/${a.id}.mp3`, loop: a.loop !== false, use: a.use };
    if (only && !a.id.startsWith(only)) continue;
    const mp3 = path.join(OUT, a.id + '.mp3');
    if (fs.existsSync(mp3) && !force) { log('skip', a.id); continue; }
    const src = a.derive ? a.derive : a.id;
    const raw = path.join(RAW, 'audio', src + '.flac');
    if (!a.derive && (!fs.existsSync(raw) || force)) {
      let seed = seeds[a.id] ?? hash(a.id); if (bump) seed += 1013;
      seeds[a.id] = seed; saveSeeds();
      const t0 = Date.now();
      const { buf } = await comfyRun(ace(a.tags, a.sec + 20, seed), 'audio', a.id);
      fs.writeFileSync(raw, buf);
      log('gen', a.id, `seed ${seed}`, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    }
    const wav = path.join(RAW, 'audio', a.id + '.wav');
    const info = execFileSync('python', ['-I', path.join(root, 'tools/media/make-loop.py'), raw, wav, '--sec', String(a.sec), ...(a.loop === false ? ['--noloop'] : ['--pick'])], { encoding: 'utf8' }).trim();
    // muffled = the same bed heard through closed shoji / fusuma (a low-pass), the game cross-fades between the two
    const fx = (a.muffle ? 'lowpass=f=650,lowpass=f=900,' : '') + `loudnorm=I=${a.lufs}:TP=-3:LRA=11`;
    ff(['-i', wav, '-af', fx, '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '4', mp3]);
    log('ok', a.id, info, JSON.stringify(loudness(mp3)), duration(mp3).toFixed(1) + 's');
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
