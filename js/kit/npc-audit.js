/* game-kit 1d506003: js/npc-audit.js — edit in game-kit and run tools/kit-sync.js */
// People in walls, on desks, in the air (standard 1.20.0, from 水無瀬病院 2nd play test #4 #6 #11: 「下に行く部屋の前で待つ日向がかべに
// 埋まっています」「他の場所でも日向が埋まっています」「日向が机の上に登って、その後空中を歩きます」).
// A person (js/character.js) is checked by its bones, not its box: the lean pose puts the head 18 cm behind the feet, so a spot "0.28 m off the
// wall" left half the head in the plaster. Three problems:
//   wall    a bone (with its radius: head 11 cm, chest 13 cm, hands 4 cm) inside a collider (a wall, a shelf, a desk) by more than 3 cm
//   float   the feet more than 8 cm above what is under them (a floor of the plan, the top of a collider)
//   perch   standing on furniture (the top of a collider 30 cm or more above the floor); root.userData.perch = true when meant (on a desk to
//           keep out of the water) - a person on a perch must step down before walking (the walk is checked as it happens)
// Use:
//   bodyProblems(c, { colliders, floorAt })        pure-ish: a list of { what, detail } for one person now
//   pathProblems(pts, { colliders, floorAt, r })   a walking route [{ x, z, y }] sampled every 20 cm: a body of radius r (22 cm) from the knee to
//                                                   the head must fit; returns [{ at, what, detail }]
//   installNpcAudit(ctx, { systems }) -> ctx.npcAudit = { now(), path(pts, floor), people() }; every 0.3 s each visible person is checked and a new
//   problem is written to window.__gfNpcBad (tools/check-playtest.mjs P17 and the play scripts read it).
export const BONE_R = { head: 0.11, neck: 0.06, chest: 0.13, waist: 0.12, hips: 0.12, pelvis: 0.11, base: 0, shL: 0.06, shR: 0.06, elL: 0.05, elR: 0.05, wrL: 0.04, wrR: 0.04, thighL: 0.07, thighR: 0.07, shinL: 0.05, shinR: 0.05, footL: 0.04, footR: 0.04 };
const TOL = 0.03;

/** how deep a sphere (p, r) goes into a box (0 = outside or only touching within tol) */
export function sphereIn(p, r, B) {
  const dx = Math.max(B.min.x - p.x, 0, p.x - B.max.x), dy = Math.max(B.min.y - p.y, 0, p.y - B.max.y), dz = Math.max(B.min.z - p.z, 0, p.z - B.max.z);
  const out = Math.hypot(dx, dy, dz);
  if (out > 0) return Math.max(0, r - out);
  return r + Math.min(p.x - B.min.x, B.max.x - p.x, p.y - B.min.y, B.max.y - p.y, p.z - B.min.z, B.max.z - p.z);   // centre inside
}
const solidCols = (colliders, skip) => colliders.filter((c) => c && c.box && !c.off && !c.npcOk && !(skip && skip(c)));
/** the highest surface under (x, z) at or below y + 0.1: the floor of the plan there, or a collider top */
export function supportAt(x, z, y, { colliders = [], floorAt = () => 0, skip } = {}) {
  let s = floorAt(x, z, y), top = null;
  for (const c of solidCols(colliders, skip)) { const B = c.box; if (x < B.min.x + 0.02 || x > B.max.x - 0.02 || z < B.min.z + 0.02 || z > B.max.z - 0.02) continue; if (B.max.y <= y + 0.1 && B.max.y > s) { s = B.max.y; top = c; } }
  return { y: s, col: top };
}
/** points: [{ name, p: {x,y,z} }] (bone positions in the world), root: {x,y,z}; perch: allowed on furniture */
export function bodyProblems({ points = [], root, perch = false, name = 'person' }, { colliders = [], floorAt = () => 0, skip } = {}) {
  const out = [], cols = solidCols(colliders, skip);
  for (const { name: bn, p } of points) {
    const r = BONE_R[bn] ?? 0.06; if (!r) continue;
    for (const c of cols) { const d = sphereIn(p, r, c.box); if (d > TOL) { out.push({ what: 'wall', detail: `${name} ${bn} ${(d * 100).toFixed(0)} cm into a collider ${[c.box.min.x, c.box.min.z, c.box.max.x, c.box.max.z].map((v) => v.toFixed(2)).join(',')}${c.low ? ' (low)' : ''}` }); break; } }
  }
  if (root) {
    const fl = floorAt(root.x, root.z, root.y), sup = supportAt(root.x, root.z, root.y, { colliders, floorAt, skip });
    if (root.y - sup.y > 0.08) out.push({ what: 'float', detail: `${name} ${(root.y - sup.y).toFixed(2)} m above what is under the feet at ${root.x.toFixed(1)},${root.z.toFixed(1)}` });
    else if (sup.col && sup.y - fl > 0.3 && !perch) out.push({ what: 'perch', detail: `${name} stands on furniture ${(sup.y - fl).toFixed(2)} m up at ${root.x.toFixed(1)},${root.z.toFixed(1)} (root.userData.perch if meant)` });
  }
  return out;
}
/** a walking route: pts [{ x, z, y? }] (y = the floor height there); a body of radius r between 0.35 and 1.55 m must fit at every 20 cm */
export function pathProblems(pts, { colliders = [], floorAt = () => 0, r = 0.22, skip, step = 0.2 } = {}) {
  const out = [], cols = solidCols(colliders, skip);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n, fy = a.y ?? floorAt(x, z, 99);
      for (const c of cols) { const B = c.box; if (B.max.y < fy + 0.35 || B.min.y > fy + 1.55) continue; const dx = Math.max(B.min.x - x, 0, x - B.max.x), dz = Math.max(B.min.z - z, 0, z - B.max.z); if (Math.hypot(dx, dz) < r - TOL) { out.push({ at: [+x.toFixed(2), +z.toFixed(2)], what: 'wall', detail: `segment ${i} (${a.x},${a.z})->(${b.x},${b.z}) through a collider ${[B.min.x, B.min.z, B.max.x, B.max.z].map((v) => v.toFixed(2)).join(',')}` }); k = n; break; } }
    }
  }
  return out;
}

export function installNpcAudit(ctx, { systems }) {
  const THREE = ctx.THREE, v = new THREE.Vector3(), W = ctx.world;
  const rooms = (ctx.data && ctx.data.plan && ctx.data.plan.rooms) || [];
  const floorAt = (x, z, y) => { let best = null; for (const r of rooms) { if (x < r.x || x > r.x + r.w || z < r.z || z > r.z + r.d) continue; const fy = W.floorY ? W.floorY(r.floor || 0) : 0; if (fy <= y + 0.15 && (best == null || fy > best)) best = fy; } return best ?? (W.floorY ? W.floorY(0) : 0); };
  const doorCols = () => new Set([...(W.doors ? W.doors.values() : [])].map((d) => d.col).filter(Boolean));
  const people = () => [...(globalThis.__gfPeople || [])].filter((c) => { for (let o = c.root; o; o = o.parent) if (o.visible === false) return false; return c.root.parent; });
  const check = (c, extra = []) => {
    c.root.updateMatrixWorld(true);
    // a seated person rests on the chair: the hips and legs are not checked (a chair seat is under them by design)
    const st = (c.motion && c.motion.state) || '', seated = /sit|seat|kneel|lie/i.test(st) || c.seated;
    const points = Object.entries(c.bones || {}).filter(([n, b]) => b && b.getWorldPosition && !(seated && /hips|pelvis|waist|thigh|shin|foot|base/.test(n))).map(([name, b]) => ({ name, p: b.getWorldPosition(new THREE.Vector3()) }));
    c.root.getWorldPosition(v);
    const dc = doorCols();
    return bodyProblems({ points, root: v.clone(), perch: seated || !!(c.root.userData && c.root.userData.perch), name: c.root.name || 'person' }, { colliders: [...(W.colliders || []), ...extra], floorAt, skip: (col) => dc.has(col) || col.person === c || (col.mesh && /^(lamp|stair|door|wall|ceil|floor|puddle)/.test(col.name)) });
  };
  // furniture drawn without a collider (a rack of boxes, a cabinet of the plan's dressing) counts too: every visible mesh smaller than a room
  // (under 2.6 m in two directions), by its box - one box per instance of a batched prop
  const furniture = () => {
    const out = [], M4 = new THREE.Matrix4(), mine = new Set(); for (const c of people()) c.root.traverse((o) => mine.add(o));
    const shown = (o) => { for (let x = o; x; x = x.parent) if (x.visible === false) return false; return true; };
    ctx.scene.updateMatrixWorld(true);
    ctx.scene.traverse((m) => {
      if (!(m.isMesh || m.isInstancedMesh) || mine.has(m) || !shown(m) || (m.userData && m.userData.npcOk)) return;
      const mats = [].concat(m.material || []); if (!mats.length || mats.every((mt) => !mt || mt.visible === false || mt.colorWrite === false || (mt.transparent && mt.opacity < 0.3))) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const push = (b) => { const sz = b.getSize(new THREE.Vector3()); if ([sz.x, sz.y, sz.z].filter((x) => x > 2.6).length < 2 && Math.min(sz.x, sz.y, sz.z) > 0.015 && Math.max(sz.x, sz.z) < 6) out.push({ box: b, mesh: true, name: m.name || (m.parent && m.parent.name) || m.geometry.type }); };
      if (m.isInstancedMesh) { if (m.count > 4000) return; for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, M4); M4.premultiply(m.matrixWorld); push(m.geometry.boundingBox.clone().applyMatrix4(M4)); } }
      else push(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
    });
    return out;
  };
  ctx.npcAudit = {
    people, furniture,
    now: (o = {}) => { const extra = o.meshes === false ? [] : furniture(); return people().flatMap((c) => check(c, extra)); },
    path: (pts, floor = 0) => { const fy = W.floorY ? W.floorY(floor) : 0, dc = doorCols(); return pathProblems(pts.map((p) => ({ x: p.x ?? p[0], z: p.z ?? p[1], y: fy })), { colliders: W.colliders || [], floorAt, skip: (col) => dc.has(col) }); },
  };
  const seen = new Set(); let t = 0;
  systems.push({ id: 'npc-audit', def: { update: (dt) => {
    t += dt; if (t < 0.3) return; t = 0;
    for (const c of people()) for (const pr of check(c)) {
      const key = `${pr.what}:${c.root.name}:${Math.round(c.root.position.x * 2)}:${Math.round(c.root.position.z * 2)}`; if (seen.has(key)) continue; seen.add(key);
      const list = (window.__gfNpcBad = window.__gfNpcBad || []); if (list.length < 60) list.push({ ...pr, at: Math.round(performance.now()) });
    }
  } }, inst: null });
  return ctx.npcAudit;
}
