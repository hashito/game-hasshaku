#!/usr/bin/env node
// The share image (1200x630) and the portal card: the title screen over its key art, without the buttons.
//   node tools/make-og.mjs   -> assets/og-image.png (site og:image and the Game-fleet portal card)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './cdp.mjs';

const root = path.resolve(import.meta.dirname, '..');
const port = 20000 + Math.floor(Math.random() * 20000);
const server = spawn(process.execPath, [path.join(import.meta.dirname, 'serve.js'), '--port', String(port)], { stdio: 'ignore' });
const base = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 50; i++) { if (await fetch(base).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
const p = await launch({ width: 1200, height: 630 });
try {
  await p.goto(base);
  await p.waitFor("document.getElementById('start-btn') && !document.getElementById('start-btn').disabled", 90000);
  await p.eval(`(() => { const s = document.createElement('style'); s.textContent = '.gf-title-btns, .gf-boot-status, .gf-info, .gf-note, .gf-ver, .gf-meta { display: none !important; }'; document.head.appendChild(s); })()`);
  await p.sleep(800);
  const out = path.join(root, 'assets/og-image.png');
  await p.shot(out);
  console.log(`assets/og-image.png ${Math.round(fs.statSync(out).size / 1024)} KB`);
} finally { await p.close(); server.kill(); }
