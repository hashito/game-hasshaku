#!/usr/bin/env node
// Playtest findings as checks (standard 1.17.0, docs/playtest-findings.md). What players found by playing, looked for in every game, headless:
//   node tools/check-playtest.mjs [game-dir] [--scene <id>] [--json] [--strict]
// Opens the game in test mode (?test: no save is touched), starts it, closes the opening windows, and audits the built world:
//   P1  an [E] target (a thing to look at, a station) with nothing visible in its box: you can read a notice that is not there (#3) or
//       talk to someone who has left (#2)
//   P2  a flat rectangle lying on the floor that is see-through or glossy: a square puddle / a square hand print (#4, #19). Not flagged:
//       a material with an alphaMap (the map gives the shape), a mesh with userData.rectOk = true (a rectangle on purpose: a tank, a mat)
//   P3  a corridor narrowed below 1.2 m, or by more than 30 %, by furniture or a hiding place, away from its ends (#14)
//   P4  a low zone a standing body can walk into (#18)
//   P5  a person who jumped more than 1.2 m between two frames while visible (a teleport, #13): window.__gfNpcJumps (js/character.js)
//   P6  an item with no picture; a speaker of the talks with no portrait (#8, #9)
//   P7  the death card of each game.json "deaths" reason: it must cover the screen, have its button, and give play back (#23)
//   P8  a things.json ひとこと that repeats the text (#6)
//   P9  the menu has 操作方法 (#16)
// Exit 1 on an error (P4, P7, P9) or, with --strict, on a warning. The play scripts of a game check the rest (contact, speed, softlocks).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './cdp.mjs';

const args = process.argv.slice(2), arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const dir = path.resolve(args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && ['--scene'].includes(args[i - 1]))) || '.');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [], warns = [];
const E = (id, m) => errors.push(`${id} ${m}`), Wn = (id, m) => warns.push(`${id} ${m}`);
const game = JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8'));
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8')); } catch { return null; } };
const data = game.data || {};

// ---- static (no browser) ----
{
  const items = data.items ? readJson(data.items) : null;
  for (const it of (Array.isArray(items) ? items : (items && items.items) || [])) if (!it.photo && !it.img && !it.image) Wn('P6', `item "${it.id}" (${it.name || ''}) has no picture`);
  const talk = data.talk ? readJson(data.talk) : null, portraits = game.portraits || {};
  const who = new Set();
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (typeof v.who === 'string') who.add(v.who); Object.values(v).forEach(walk); } };
  walk(talk);
  const self = new Set(['私', '僕', '俺', 'わたし', '', game.player || '', ...(game.selfNames || [])]);
  for (const w of who) { const base = w.replace(/[（(].*$/, '').trim(); if (!self.has(w) && !self.has(base) && !portraits[w] && !portraits[base] && !/声|放送|無線の雑音|アナウンス|？/.test(w)) Wn('P6', `speaker "${w}" has no portrait (game.json portraits)`); }
  const things = data.things ? readJson(data.things) : null;
  const n = (x) => String(x || '').replace(/[\s「」『』（）()、。・…！？!?\-ー―*]/g, '');
  for (const t of things || []) { const tx = [].concat(t.text || []); if (t.feeling && tx.some((x) => n(x) && (n(x) === n(t.feeling) || (n(t.feeling).length > 8 && n(x).includes(n(t.feeling)))))) Wn('P8', `thing "${t.id}": ひとこと repeats the text`); }
}

// ---- in the page ----
const port = 47900 + Math.floor(Math.random() * 90);
const serve = path.join(dir, 'tools', 'serve.js');
const server = spawn(process.execPath, [fs.existsSync(serve) ? serve : path.join(import.meta.dirname, 'serve.js'), '--port', String(port), '--root', dir], { stdio: 'ignore', cwd: dir });
const base = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 60; i++) { if (await fetch(base).then((r) => r.ok).catch(() => false)) break; await sleep(100); }
const p = await launch({ width: 1280, height: 720 });
const G = async (expr) => { const s = await p.eval(`(async () => { const g = window.__game; return JSON.stringify(await (${expr})); })()`); return s === undefined ? undefined : JSON.parse(s); };
try {
  const sc = arg('--scene', null);
  await p.goto(`${base}?test=1${sc ? `&scene=${sc}` : ''}`);
  await p.waitFor("window.__game && document.getElementById('start-btn') && !document.getElementById('start-btn').disabled || (window.__game && window.__game.state && window.__game.state.started)", 120000);
  if (!(await G('g.state.started'))) await G(`(document.getElementById('start-btn').click(), 1)`);
  for (let i = 0; i < 40 && !(await G('g.state.started')); i++) { await G(`([...document.querySelectorAll('button')].filter((b) => b.offsetParent && /始める|はじめる|タップ|クリック|OK|わかった/.test(b.textContent)).slice(0, 1).forEach((b) => b.click()), 1)`); await sleep(300); }
  await sleep(2000);
  for (let i = 0; i < 30 && (await G('g.blocked ? g.blocked() : false')); i++) { await G(`([...document.querySelectorAll('.wm-layer .btn.primary, .wm-layer button, [role=dialog] .btn.primary')].filter((b) => b.offsetParent).slice(0, 1).forEach((b) => b.click()), 1)`); await sleep(350); }
  const audit = await G(`(() => {
    const T = g.THREE, W = g.world, out = { p1: [], p2: [], p3: [], p4: [] };
    const shown = (o) => { for (let x = o; x; x = x.parent) if (x.visible === false) return false; return true; };
    const drawn = (m) => { const mats = [].concat(m.material || []); return mats.some((mt) => mt && mt.visible !== false && mt.colorWrite !== false && !(mt.opacity === 0 && mt.transparent)); };
    const meshes = []; g.scene.updateMatrixWorld(true);
    g.scene.traverse((m) => {
      if (!(m.isMesh || m.isInstancedMesh || m.isSprite) || !shown(m) || !drawn(m)) return;
      if (m.isInstancedMesh && m.count > 0 && m.count < 20000) {   // batched props (racks, cabinets): one box per instance
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const M4 = new T.Matrix4(); for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, M4); M4.premultiply(m.matrixWorld); const b = m.geometry.boundingBox.clone().applyMatrix4(M4), s = b.getSize(new T.Vector3()); if (isFinite(s.x)) meshes.push({ m, b, s, inst: true }); }
        return;
      }
      const b = new T.Box3().setFromObject(m); const s = b.getSize(new T.Vector3()); if (!isFinite(s.x)) return; meshes.push({ m, b, s });
    });
    const floorYs = [...new Set(((g.data.plan && g.data.plan.rooms) || []).map((r) => (W.floorY ? W.floorY(r.floor || 0) : 0)))]; if (!floorYs.length) floorYs.push(0);
    // P1: an [E] target with nothing visible inside its box (walls, floors and ceilings - anything over 2.5 m in two directions - do not count)
    for (const it of W.interactables || []) {
      const u = it.userData && it.userData.interact; if (!u || !shown(it) || it.userData.off) continue;
      if (u.kind === 'door' || u.kind === 'hide' || u.kind === 'pickup' || u.kind === 'item') continue;
      const b = new T.Box3().setFromObject(it).expandByScalar(0.12);
      const own = meshes.some(({ m, b: mb, s }) => m !== it && !it.children.includes(m) && [s.x, s.y, s.z].filter((v) => v > 2.5).length < 2 && mb.intersectsBox(b));
      const self = drawn(it) && it.material && it.material.visible !== false && it.material.colorWrite !== false;
      if (!own && !self) out.p1.push(u.kind + ':' + u.id + ' at ' + [b.getCenter(new T.Vector3())].map((c) => c.x.toFixed(1) + ',' + c.y.toFixed(1) + ',' + c.z.toFixed(1)));
    }
    // P2: flat see-through / glossy rectangles on the floor
    for (const { m, s, b } of meshes) {
      const geo = m.geometry; if (!geo || m.isInstancedMesh || !floorYs.some((y) => Math.abs(b.min.y - y) < 0.12)) continue;   // on a floor, not a shelf
      const mt = [].concat(m.material)[0]; if (!mt) continue;
      const flatFloor = s.y < 0.03 && s.x > 0.08 && s.z > 0.08 && s.x < 4 && s.z < 4;
      const rect = geo.type === 'PlaneGeometry' || (geo.type === 'BoxGeometry' && s.y < 0.03);
      if (flatFloor && rect && (mt.transparent || (mt.roughness != null && mt.roughness < 0.25)) && !mt.alphaMap && !(m.userData && m.userData.rectOk) && !(mt.map && mt.transparent && mt.map.image)) out.p2.push((m.name || geo.type) + ' ' + s.x.toFixed(2) + 'x' + s.z.toFixed(2) + ' at ' + b.min.x.toFixed(1) + ',' + b.min.z.toFixed(1));
    }
    // P3: corridors narrowed below 1.2 m or to less than 70 % of their width (away from their ends)
    const cols = (W.colliders || []).filter((c) => c.box && !c.off && !c.low && c.box.max.y > 0.5);
    // hiding places count by what you see (a locker narrows the way whether or not its walls are colliders)
    for (const it of W.interactables || []) { const u = it.userData && it.userData.interact; if (!u || !/hide/.test(u.kind || '')) continue; const grp = it.parent && it.parent !== W.group && it.parent !== g.scene ? it.parent : it; const box = new T.Box3().setFromObject(grp); if (isFinite(box.min.x)) cols.push({ box }); }
    for (const r of (g.data.plan && g.data.plan.rooms) || []) {
      const narrow = Math.min(r.w, r.d), long = Math.max(r.w, r.d); if (narrow > 3.2 || long < narrow * 3) continue;
      const fy = W.floorY ? W.floorY(r.floor || 0) : 0, alongX = r.w > r.d;
      for (let t = Math.max(0.5, narrow); t < long - Math.max(0.5, narrow); t += 0.25) {   // the ends (one width) are the corners: a locker belongs there
        const x = alongX ? r.x + t : null, z = alongX ? null : r.z + t; let free = narrow;
        for (const c of cols) { const B = c.box; if (B.min.y > fy + 1.6 || B.max.y < fy + 0.3) continue;
          if (alongX ? (x < B.min.x || x > B.max.x) : (z < B.min.z || z > B.max.z)) continue;
          const a0 = alongX ? r.z : r.x, a1 = a0 + narrow, lo = Math.max(a0, alongX ? B.min.z : B.min.x), hi = Math.min(a1, alongX ? B.max.z : B.max.x);
          if (hi > lo && hi - lo < narrow * 0.95) free -= hi - lo; }
        if (free < Math.max(1.2, narrow * 0.7)) { out.p3.push(r.id + ' (' + (r.name || '') + ') free ' + free.toFixed(2) + ' m at ' + (alongX ? 'x ' + x.toFixed(1) : 'z ' + z.toFixed(1))); t += 2; }
      }
    }
    // P4: low zones
    for (const Z of g.lowZones || []) if (!Z.standingBlocked()) out.p4.push(Z.id);
    out.jumps = window.__gfNpcJumps || [];
    out.menu = !!(g.pm && document) ; out.zones = (g.lowZones || []).length;
    return out;
  })()`);
  for (const x of audit.p1) Wn('P1', `[E] target with nothing visible: ${x}`);
  for (const x of audit.p2) Wn('P2', `flat rectangle on the floor (puddle / print?): ${x}`);
  for (const x of audit.p3) Wn('P3', `corridor narrowed: ${x}`);
  for (const x of audit.p4) E('P4', `low zone "${x}" lets a standing body in`);
  for (const j of audit.jumps) Wn('P5', `person jumped: ${j.name} ${j.from} -> ${j.to}`);
  // P9: 操作方法 in the menu
  const ctl = await G(`(async () => { if (!g.pm) return 'no menu'; g.pm.open(); await new Promise((r) => setTimeout(r, 400)); const ok = [...document.querySelectorAll('.wm-layer button, .pm button')].some((b) => /操作方法/.test(b.textContent)); g.pm.close && g.pm.close(); return ok; })()`);
  if (ctl !== true) E('P9', `the menu has no 操作方法 (${ctl})`);
  // P7: each death card
  for (const reason of Object.keys(game.deaths || {})) {
    await G(`(g.die(${JSON.stringify(reason)}), 1)`);
    let seen = null;
    for (let i = 0; i < 40 && !seen; i++) { await sleep(150); seen = await G(`(() => { const c = document.querySelector('.gf-mo-card'); if (!c) return null; const r = c.getBoundingClientRect(), top = document.elementFromPoint(innerWidth / 2, innerHeight / 2); const b = c.querySelector('button'); return { covers: r.width >= innerWidth * 0.95 && r.height >= innerHeight * 0.95, onTop: !!(top && c.contains(top)), button: !!(b && b.offsetParent) }; })()`); }
    if (!seen) { Wn('P7', `death "${reason}": no death card showed (the game's own death sequence?)`); continue; }
    if (!seen.covers || !seen.onTop || !seen.button) E('P7', `death "${reason}": the card is not on screen (covers ${seen.covers}, on top ${seen.onTop}, button ${seen.button}) - play is held behind an invisible card`);
    await sleep(500); await G(`((document.querySelector('.gf-mo-card button') || { click() {} }).click(), 1)`); await sleep(1200);
    if (await G('g.blocked ? g.blocked() : false')) { await G(`([...document.querySelectorAll('.wm-layer .btn.primary')].filter((b) => b.offsetParent).forEach((b) => b.click()), 1)`); await sleep(800); }
    if (await G('g.blocked ? g.blocked() : false')) E('P7', `death "${reason}": still held after the retry button`);
  }
  if (p.errors.length) for (const e of [...new Set(p.errors)].filter((x) => !/favicon/.test(x)).slice(0, 5)) Wn('P0', `page error: ${e.slice(0, 200)}`);
} catch (e) { E('P0', `the check could not run: ${e.message}`); }
finally { await p.close(); server.kill(); }
if (args.includes('--json')) console.log(JSON.stringify({ errors, warns }, null, 1));
else { for (const w of warns) console.log(`WARN  ${w}`); for (const e of errors) console.log(`ERROR ${e}`); console.log(`check-playtest: ${errors.length} error(s), ${warns.length} warning(s) (docs/playtest-findings.md)`); }
process.exit(errors.length || (args.includes('--strict') && warns.length) ? 1 : 0);
