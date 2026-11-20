/* game-kit 2e206ef: js/wall-paste.js — edit in game-kit and run tools/kit-sync.js */
// Pasting a flat thing (a charm, a notice, a poster, a calendar) on a wall, a post or a door frame (standard 1.17.3, 札の家 #2 #4 #14).
// Hand-typed coordinates put papers inside walls, inside the frame posts of a door, or 5 cm in the air. pasteOn() finds the surface
// itself: it casts a ray from a point in the room toward the wall, sits the paper on the first surface it meets (a frame post in front of
// the wall counts), a hair off it, facing out, and moves it sideways off another paper already there (no two papers in one spot).
//   import { pasteOn } from '../kit/wall-paste.js';
//   pasteOn(ctx, mesh, { from: { x, y, z }, dir: { x: 0, z: -1 }, gap: 0.004, avoid: true });   // -> { ok, point, normal, moved }
// `from` is a point in front of the wall (in the room), `dir` the way to the wall. The mesh is a PlaneGeometry (its face is +Z) or a group
// whose front is +Z. Not found (no surface within `far`, default 2 m) -> { ok: false } and the mesh stays where it was.
// tools/check-playtest.mjs P10 finds papers that are still inside something.
const pasted = new WeakMap();   // scene -> [{ p, n, r }]: what is on the walls already

export function pasteOn(ctx, mesh, o = {}) {
  const T = ctx.THREE, scene = ctx.scene, from = o.from || mesh.position, d = o.dir || { x: 0, z: -1 };
  const dir = new T.Vector3(d.x || 0, d.y || 0, d.z || 0).normalize();
  const rc = new T.Raycaster(new T.Vector3(from.x, from.y, from.z), dir, 0, o.far ?? 2);
  scene.updateMatrixWorld(true);
  const skip = new Set(); mesh.traverse((m) => skip.add(m));
  const targets = []; scene.traverse((m) => { if ((m.isMesh || m.isInstancedMesh) && !skip.has(m)) targets.push(m); });   // no sprites: a Raycaster needs a camera for them
  const hits = rc.intersectObjects(targets, false).filter((h) => h.object.visible !== false && h.face
    && ![].concat(h.object.material).some((mt) => mt && (mt.visible === false || mt.colorWrite === false || (mt.transparent && (mt.opacity ?? 1) < 0.5))));
  const h = hits[0]; if (!h) return { ok: false };
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (n.dot(dir) > 0) n.negate();
  const gap = o.gap ?? 0.004, p = h.point.clone().addScaledVector(n, gap);
  // no two papers in one spot: slide along the wall past one already there
  let moved = 0; const list = pasted.get(scene) || []; pasted.set(scene, list);
  if (o.avoid !== false) {
    const side = new T.Vector3(-n.z, 0, n.x).normalize(), r = o.radius ?? 0.06;
    for (let k = 0; k < 6; k++) { const q = list.find((x) => x.n.dot(n) > 0.9 && x.p.distanceTo(p) < x.r + r); if (!q) break; p.addScaledVector(side, q.r + r + 0.01 - Math.max(0, p.clone().sub(q.p).dot(side))); moved++; }
    list.push({ p: p.clone(), n: n.clone(), r });
  }
  const parent = mesh.parent; const wp = p.clone(); if (parent) parent.worldToLocal(wp);
  mesh.position.copy(wp);
  const look = p.clone().add(n); if (parent) { mesh.lookAt(look); } else mesh.lookAt(look);
  if (o.roll) mesh.rotateZ(o.roll);
  mesh.updateMatrixWorld(true);
  return { ok: true, point: p, normal: n, moved, on: h.object };
}

// forget what was pasted (a rebuilt house)
export function resetPasted(scene) { pasted.delete(scene); }
