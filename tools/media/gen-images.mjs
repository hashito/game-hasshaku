// Picture generator (Issue #1): node tools/media/gen-images.mjs [--only ph-] [--force] [--seed N] [--bump] [--post-only]
// ComfyUI flux1-dev-fp8 at 127.0.0.1:8188, one job at a time (waits for an empty queue). Raw PNG -> tools/_raw/img/<id>.png
// (+ <id>.s<seed>.png of every try); then tools/media/post-images.py finishes it (look, size, seamless tile, webp under a byte limit).
// Chosen seeds: tools/media/seeds.json. A new try for one picture: --only <id> --force --bump (or --seed N).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { IMAGES } from './spec-image.mjs';
import { root, RAW, ensure, log, hash, val, seeds, saveSeeds, comfyRun, lock } from './lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force'), only = val(args, '--only'), postOnly = args.includes('--post-only'), bump = args.includes('--bump');
const rawDir = path.join(RAW, 'img');

const flux = (prompt, [w, h], seed) => ({
  4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' } },
  6: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
  10: { class_type: 'FluxGuidance', inputs: { guidance: 3.0, conditioning: ['6', 0] } },
  7: { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
  5: { class_type: 'EmptySD3LatentImage', inputs: { width: w, height: h, batch_size: 1 } },
  3: { class_type: 'KSampler', inputs: { seed, steps: 24, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0, model: ['4', 0], positive: ['10', 0], negative: ['7', 0], latent_image: ['5', 0] } },
  12: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
  9: { class_type: 'SaveImage', inputs: { filename_prefix: 'hasshaku_flux', images: ['12', 0] } },
});

function post(id) {
  const out = execFileSync('python', ['-I', path.join(root, 'tools/media/post-images.py'), '--id', id], { encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop());
}

async function main() {
  lock('gen-images');
  ensure(rawDir); ensure(path.join(RAW, 'work'));
  fs.writeFileSync(path.join(RAW, 'work/image-spec.json'), JSON.stringify(IMAGES));
  const list = IMAGES.filter((it) => !only || only.split(',').some((o) => it.id.startsWith(o)));
  for (const it of list.filter((x) => !x.derive).concat(list.filter((x) => x.derive))) {
    const raw = path.join(rawDir, it.id + '.png');
    if (it.derive || postOnly) { if (it.derive || fs.existsSync(raw)) log('post', it.id, JSON.stringify(post(it.id))); continue; }
    if (fs.existsSync(raw) && !force) { log('skip', it.id); continue; }
    let seed = val(args, '--seed') ? Number(val(args, '--seed')) : seeds[it.id] ?? hash(it.id);
    if (bump) seed = (seeds[it.id] ?? hash(it.id)) + 1013;
    seeds[it.id] = seed; saveSeeds();
    const t0 = Date.now();
    try {
      const { buf } = await comfyRun(flux(it.prompt, it.gen, seed), 'images', it.id);
      fs.writeFileSync(raw, buf); fs.writeFileSync(path.join(rawDir, `${it.id}.s${seed}.png`), buf);
    } catch (e) { log('FAIL', it.id, e.message); continue; }
    log('ok', it.id, `seed ${seed}`, ((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(post(it.id)));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
