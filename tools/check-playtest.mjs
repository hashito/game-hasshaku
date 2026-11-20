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
//   P10 a flat paper / charm / poster whose middle is inside a wall, a post or a door frame (札の家 #2 #4 #14): use js/wall-paste.js
//   P11 a plain box with no texture, 0.25-2.4 m (札の家 #9)    P12 something standing in a doorway (札の家 #3)
//   P13 a thing to look at with nothing under it: floating (札の家 #1 #6)
//   P14 a paper high on a wall (a doc at 1 m or more) still lying flat: a sheet sticking out of the plaster (鏡屋 #1; the kit stands it since 1.18.0)
//   P15 a reason the game passes to ctx.die / ctx.hurt with no card of its own in game.json "deaths" (鏡屋: the hands and the woman of the
//       washroom said the same words)    P16 a room on the map too small for three characters of its name (鏡屋: 地下室 clipped)
// Exit 1 on an error (P4, P7, P9) or, with --strict, on a warning. The play scripts of a game check the rest (contact, speed, softlocks).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
  for (const t of (Array.isArray(things) ? things : (things && things.things) || [])) {   /* 1.17.2: things.json may be { photos, things } */ const tx = [].concat(t.text || []); if (t.feeling && tx.some((x) => n(x) && (n(x) === n(t.feeling) || (n(t.feeling).length > 8 && n(x).includes(n(t.feeling)))))) Wn('P8', `thing "${t.id}": ひとこと repeats the text`); }
}

// P15: every death reason in the game's code has its own card (the default card says nothing about what caught you)
if (game.deaths) {
  const reasons = new Map(), walkJs = (d) => { for (const f of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { const q = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'kit' && f.name !== 'vendor') walkJs(q); } else if (/\.m?js$/.test(f.name)) { const src = fs.readFileSync(q, 'utf8'); for (const m of src.matchAll(/\b(?:die|hurt)\(\s*['"]([\w-]+)['"]/g)) reasons.set(m[1], path.relative(dir, q)); } } };
  walkJs(path.join(dir, 'js'));
  for (const [r, f] of reasons) if (!game.deaths[r]) Wn('P15', `death reason "${r}" (${f}) has no card in game.json "deaths": the player is not told what caught them`);
}
// P16: room names that do not fit their room on the map
{
  const plan = data.plan ? readJson(data.plan) : null;
  const ms = [path.join(dir, 'js', 'kit', 'map-svg.js'), path.join(import.meta.dirname, '..', 'js', 'map-svg.js')].find((f) => fs.existsSync(f));
  if (plan && ms) {
    const { fitLabel, roomSpan } = await import(pathToFileURL(ms).href);
    // a game whose js/kit/map-svg.js is kept older (edited in the game, skipped by kit-sync) has no fitLabel: P16 is left out there
    if (typeof fitLabel === 'function' && typeof roomSpan === 'function') for (const r of plan.rooms || []) { const name = String(r.name || ''), fit = fitLabel(name, roomSpan(r, 16), 12); if ([...name].length > 3 && [...fit].length < 4) Wn('P16', `room "${r.id}" (${name}) shows as 「${fit}」 on the map: too small for its name (a shorter name, or "mapName")`); }
  }
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
    // 1.17.3 (札の家 #1 #2 #3 #4 #6 #9 #14): what the eye found wrong in a built house
    const axisOk = (m) => { const e = m.matrixWorld.elements; for (const c of [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]]) { const L = Math.hypot(...c) || 1; if (Math.max(...c.map((v) => Math.abs(v) / L)) < 0.995) return false; } return true; };
    const solid = meshes.filter(({ m, s }) => !m.isSprite && !m.isInstancedMesh && Math.min(s.x, s.y, s.z) > 0.04 && axisOk(m) && ![].concat(m.material).some((mt) => mt && (mt.transparent || mt.visible === false || mt.colorWrite === false)));
    const near = (a, b) => { for (let x = a; x; x = x.parent) if (x === b) return true; for (let x = b; x; x = x.parent) if (x === a) return true; return a.parent && a.parent === b.parent && a.parent !== W.group && a.parent !== g.scene; };
    out.p10 = []; out.p11 = []; out.p12 = []; out.p13 = [];
    // P10: a paper / charm / poster (a flat mesh) with something right in front of its face (within 3 cm): it is inside a wall, a post or a door
    // frame, or another paper lies on it (#2 #4 #14). Five points of the face are tried from the front (+Z of a plane; both sides of a thin box).
    const rc10 = new T.Raycaster(), tg10 = meshes.filter(({ m }) => !m.isSprite && !m.isInstancedMesh).map(({ m }) => m);
    for (const { m, s, b } of meshes) {
      if (m.isSprite || m.isInstancedMesh || !m.geometry) continue;
      const dims = [s.x, s.y, s.z], plane = m.geometry.type === 'PlaneGeometry';
      if (!plane && (Math.min(...dims) > 0.02 || dims.filter((v) => v > 0.05 && v < 1.6).length < 2)) continue;
      if (plane && (dims.filter((v) => v > 0.05 && v < 1.6).length < 2 || dims.some((v) => v > 1.6))) continue;
      const q = new T.Quaternion(); m.getWorldQuaternion(q); const n = new T.Vector3(0, 0, 1).applyQuaternion(q).normalize();
      if (Math.abs(n.y) > 0.7) continue;   // papers on a wall; a mat or a ceiling board is not one
      const u = new T.Vector3(1, 0, 0).applyQuaternion(q), v = new T.Vector3(0, 1, 0).applyQuaternion(q), c = b.getCenter(new T.Vector3());
      const pp = m.geometry.parameters || {}, hw = (pp.width || s.x) * m.getWorldScale(new T.Vector3()).x * 0.35, hh = (pp.height || s.y) * m.getWorldScale(new T.Vector3()).y * 0.35;
      const pts = [c, c.clone().addScaledVector(u, hw).addScaledVector(v, hh), c.clone().addScaledVector(u, -hw).addScaledVector(v, hh), c.clone().addScaledVector(u, hw).addScaledVector(v, -hh), c.clone().addScaledVector(u, -hw).addScaledVector(v, -hh)];
      const others = tg10.filter((o) => o !== m && !near(m, o));
      const covered = (side) => pts.filter((pt) => { rc10.set(pt.clone().addScaledVector(n, side * 0.3), n.clone().multiplyScalar(-side)); rc10.far = 0.3 - 0.0005; const h = rc10.intersectObjects(others, false)[0]; return h && h.distance > 0.27; }).length;
      const k = plane ? covered(1) : Math.min(covered(1), covered(-1));
      if (k >= 2) out.p10.push((m.name || m.parent && m.parent.name || m.geometry.type) + ' at ' + c.x.toFixed(2) + ',' + c.y.toFixed(2) + ',' + c.z.toFixed(2) + ' (' + k + '/5 of the face covered)');
    }
    // P11: a plain box with no picture on it, bigger than a hand and smaller than a wall: reads as a placeholder (#9)
    for (const { m, s, b } of solid) {
      const grp = m.parent; if (grp && grp !== W.group && grp !== g.scene && grp.children.filter((x) => x.isMesh).length > 1) continue;   // a part of a made prop (a chest of drawers with its drawers): not a placeholder
      if (m.geometry.type !== 'BoxGeometry' || Math.min(s.x, s.y, s.z) < 0.25 || Math.max(s.x, s.y, s.z) > 2.4 || (m.userData && (m.userData.plainOk || m.userData.interact))) continue;
      const mats = [].concat(m.material); if (mats.some((mt) => mt.map || mt.isShaderMaterial || mt.isMeshBasicMaterial)) continue;
      const c = b.getCenter(new T.Vector3()); out.p11.push((m.name || 'box') + ' ' + s.x.toFixed(2) + 'x' + s.y.toFixed(2) + 'x' + s.z.toFixed(2) + ' at ' + c.x.toFixed(1) + ',' + c.z.toFixed(1));
    }
    // P12: something standing in a doorway: the middle of the opening, 0.7 m either side of the door (#3)
    const allCols = (W.colliders || []).filter((c) => c.box && !c.off && !c.low && !c.gate);
    for (const [id, d] of W.doors || new Map()) {
      if (!d.col || !d.col.box) continue; const B = d.col.box, sx = B.max.x - B.min.x, sz = B.max.z - B.min.z, alongX = sx > sz, w = Math.max(sx, sz);
      const cx = (B.min.x + B.max.x) / 2, cz = (B.min.z + B.max.z) / 2;
      const way = new T.Box3(new T.Vector3(alongX ? cx - w * 0.3 : cx - 0.7, B.min.y + 0.3, alongX ? cz - 0.7 : cz - w * 0.3), new T.Vector3(alongX ? cx + w * 0.3 : cx + 0.7, B.min.y + 1.6, alongX ? cz + 0.7 : cz + w * 0.3));
      const doorColsAll = new Set([...W.doors.values()].map((x) => x.col).filter(Boolean));
      const blk = allCols.find((c) => !doorColsAll.has(c) && c.box.intersectsBox(way) && (c.box.max.x - c.box.min.x) < 3 && (c.box.max.z - c.box.min.z) < 3);
      if (blk) out.p12.push(id + ' at ' + cx.toFixed(1) + ',' + cz.toFixed(1) + ' (something ' + (blk.box.max.x - blk.box.min.x).toFixed(2) + 'x' + (blk.box.max.z - blk.box.min.z).toFixed(2) + ' at ' + ((blk.box.min.x + blk.box.max.x) / 2).toFixed(1) + ',' + ((blk.box.min.z + blk.box.max.z) / 2).toFixed(1) + ')');
    }
    // P13: a thing to look at hanging in the air: nothing within 6 cm under it (#1 #6). userData.hangs = true for a thing that hangs on purpose.
    const rc = new T.Raycaster(); const targets = meshes.filter(({ m }) => !m.isSprite).map(({ m }) => m);
    for (const it of W.interactables || []) {
      const u = it.userData && it.userData.interact; if (!u || !shown(it) || it.userData.off || it.userData.hangs || u.kind === 'door' || u.kind === 'hide') continue;
      const b = new T.Box3().setFromObject(it); if (!isFinite(b.min.y) || floorYs.some((y) => b.min.y - y < 0.06)) continue;
      const vis = []; it.traverse((m) => { if (m !== it && targets.includes(m)) vis.push(m); }); if (!vis.length && !(it.isMesh && drawn(it))) continue; const body = vis.length ? vis : [it];   // an invisible hit box (a station, a look) is not the thing itself
      const bb = new T.Box3(); for (const m of body) bb.union(new T.Box3().setFromObject(m)); if (!isFinite(bb.min.y) || bb.max.y - bb.min.y < 0.005) continue;
      const c = bb.getCenter(new T.Vector3()); rc.set(new T.Vector3(c.x, bb.min.y + 0.002, c.z), new T.Vector3(0, -1, 0)); rc.far = 3;
      const others = targets.filter((m) => !body.includes(m) && m !== it);
      const onWall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => { rc.set(c.clone(), new T.Vector3(dx, 0, dz)); rc.far = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 0.08; return rc.intersectObjects(others, false).length > 0; });
      if (onWall) continue;   // a notice, a sign, a calendar: hung on the wall
      rc.set(new T.Vector3(c.x, bb.min.y + 0.002, c.z), new T.Vector3(0, -1, 0)); rc.far = 3;
      const h = rc.intersectObjects(others, false)[0];
      if (h && h.distance > 0.06 && !(h.object.userData && h.object.userData.interact)) out.p13.push(u.kind + ':' + u.id + ' ' + h.distance.toFixed(2) + ' m above ' + (h.object.name || h.object.geometry.type) + ' at ' + c.x.toFixed(1) + ',' + c.z.toFixed(1));
    }
    // P14: a paper above 1 m lying flat (a doc pickup whose model is a horizontal sheet)
    out.p14 = [];
    for (const it of W.interactables || []) {
      const u = it.userData && it.userData.interact, def = it.userData && it.userData.def; if (!u || u.kind !== 'doc' || !def || !(def.y >= 1) || def.wall === false) continue;
      const md = it.userData.model || it, b = new T.Box3().setFromObject(md), s = b.getSize(new T.Vector3());
      if (isFinite(s.y) && s.y < 0.05 && Math.max(s.x, s.z) > 0.1) out.p14.push(u.id + ' at ' + it.position.x.toFixed(1) + ',' + it.position.y.toFixed(1) + ',' + it.position.z.toFixed(1));
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
  for (const x of audit.p10.slice(0, 20)) Wn('P10', `a paper / charm with something on its face (inside a wall / a frame, or under another paper): ${x}`);
  for (const x of audit.p11.slice(0, 20)) Wn('P11', `a plain untextured box (a placeholder look; userData.plainOk if meant): ${x}`);
  for (const x of audit.p12) Wn('P12', `a doorway half blocked: ${x}`);
  for (const x of audit.p14) Wn('P14', `a paper on the wall lies flat (sticks out of the plaster): ${x}`);
  for (const x of audit.p13.slice(0, 20)) Wn('P13', `a thing floating in the air: ${x}`);
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
