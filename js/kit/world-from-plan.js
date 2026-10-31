/* game-kit 3f1a7d2: js/world-from-plan.js — edit in game-kit and run tools/kit-sync.js */
// The standard world builder (docs/standard-3d.md, layer "world"): plan.json (rooms, corridors, doors, stations) -> THREE objects,
// colliders, doors that open and a room lookup. Boxes only: floors, ceilings, walls with door gaps and lintels, door panels, task
// stations. The look is a flat palette per room kind + the preset lighting; richer looks (texture-library, props, env-props) are added
// by the game through the 'world:built' hook (ctx.world.group) or the room `look` key.
// Floors (standard 1.1): a room's `floor` (0, 1, ...) stands floorH (3.4 m) higher per floor; world.floorY(floor) gives the height and
// the controller's floorY follows it. A door of kind 'stairs' | 'lift' joins two rooms on different floors: each end gets a stair block
// you walk up to ([E]); door.ends = { a: { x, z, arrive: [x, z], yaw }, b: { ... } } places the blocks and where you arrive (default: the room's middle,
// 1.2 m from the block). world.useStairs(o, ctx) is the core's ctx.useStairs: a short fade, then ctx.setFloor(floor, { x, z, yaw }).
//
//   const world = buildWorld(plan, { isUnlocked: (key) => prog.isUnlocked(key) });
//   scene.add(world.group);  fp = new FirstPersonController(camera, canvas, { colliders: world.colliders, bounds: world.bounds });
//   world.roomAt(x, z) -> room id | null      world.spawn -> { x, z, yaw }      world.doors.get(id).open()
//   world.place(mesh, roomId, x?, z?)         puts a pickup / station mesh in a room (default: spread around the middle)
//   world.interactables                        meshes with userData.interact = { kind, id } (the raycast targets)
// Pure geometry helpers (wallSpans, doorEdge) are exported and tested in Node; buildWorld needs THREE (import map or test/three-hook.mjs).
import * as THREE from 'three';
import { selectInteractable, selectAtScreen, rayBox } from './interact-select.js';

export const DEFAULTS = { wallH: 3, wallT: 0.16, floorH: 3.4, doorH: 2.2, doorW: 1.0, roomLights: true };
export const PALETTE = {
  room: { floor: 0x6b6f6c, wall: 0xb9b6a8, ceil: 0xd8d6cc }, corridor: { floor: 0x57605b, wall: 0xa7ada3, ceil: 0xc8cbc3 },
  outdoor: { floor: 0x3d4a3a, wall: 0x6b7466, ceil: null }, stairs: { floor: 0x5a5a5a, wall: 0xa0a0a0, ceil: 0xc0c0c0 },
};

// which wall of room r a door at (x, z) is on: 'n' (z = r.z) | 's' | 'w' | 'e', and the position along that wall
export function doorEdge(r, x, z) {
  const d = { n: Math.abs(z - r.z), s: Math.abs(z - (r.z + r.d)), w: Math.abs(x - r.x), e: Math.abs(x - (r.x + r.w)) };
  const edge = Object.keys(d).sort((a, b) => d[a] - d[b])[0];
  return { edge, t: edge === 'n' || edge === 's' ? x : z, dist: d[edge] };
}

// solid spans of a wall from t0 to t1 with gaps [{c, w}] cut out -> [[from, to], ...]
export function wallSpans(t0, t1, gaps) {
  const cuts = gaps.map((g) => [Math.max(t0, g.c - g.w / 2), Math.min(t1, g.c + g.w / 2)]).sort((a, b) => a[0] - b[0]);
  const out = []; let at = t0;
  for (const [a, b] of cuts) { if (a > at + 1e-3) out.push([at, a]); at = Math.max(at, b); }
  if (t1 > at + 1e-3) out.push([at, t1]);
  return out;
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...o });

export function buildWorld(plan, o = {}) {
  const K = { ...DEFAULTS, ...o };
  const group = new THREE.Group(); group.name = 'world';
  const colliders = [], interactables = [], roomsById = new Map(), doors = new Map();
  const isUnlocked = o.isUnlocked || (() => true);
  const rooms = plan.rooms || [];
  const mats = {};
  const m = (k, c) => (mats[`${k}${c}`] ||= mat(c));
  const box = (w, h, d, material, x, y, z, collide = true, name = '') => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true;
    group.add(mesh);
    let col = null;
    if (collide) { col = { box: new THREE.Box3(new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)), off: false }; colliders.push(col); }
    return { mesh, col };
  };
  const yOf = (r) => (r.floor || 0) * K.floorH;
  const floorY = (floor) => (floor || 0) * K.floorH;
  const byId = new Map(rooms.map((r) => [r.id, r]));

  // doors per room (non-vertical ones that have a position)
  const gapsOf = new Map(rooms.map((r) => [r.id, []]));
  for (const d of plan.doors || []) {
    const a = byId.get(d.a), b = byId.get(d.b);
    if (!a || !b || d.x == null || d.kind === 'stairs' || d.kind === 'lift' || (a.floor || 0) !== (b.floor || 0)) continue;
    for (const r of [a, b]) { const e = doorEdge(r, d.x, d.z); gapsOf.get(r.id).push({ ...e, w: d.width ?? K.doorW, id: d.id }); }
  }

  for (const r of rooms) {
    const pal = PALETTE[r.kind || 'room'] || PALETTE.room, y0 = yOf(r), H = K.wallH, T = K.wallT;
    const tint = (c) => { const k = 1 + ((r.id.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0) % 7) - 3) * 0.03; return new THREE.Color(c).multiplyScalar(k).getHex(); };
    const cx = r.x + r.w / 2, cz = r.z + r.d / 2;
    box(r.w, 0.1, r.d, m('f' + r.kind, tint(pal.floor)), cx, y0 - 0.05, cz, false, `floor:${r.id}`);
    if (pal.ceil != null) box(r.w, 0.1, r.d, m('c' + r.kind, pal.ceil), cx, y0 + H + 0.05, cz, false, `ceil:${r.id}`);
    const wallM = m('w' + r.kind, tint(pal.wall));
    const edges = { n: [r.x, r.x + r.w, r.z, 'x'], s: [r.x, r.x + r.w, r.z + r.d, 'x'], w: [r.z, r.z + r.d, r.x, 'z'], e: [r.z, r.z + r.d, r.x + r.w, 'z'] };
    for (const [edge, [t0, t1, fixed, axis]] of Object.entries(edges)) {
      const gaps = gapsOf.get(r.id).filter((g) => g.edge === edge).map((g) => ({ c: g.t, w: g.w }));
      for (const [a, b] of wallSpans(t0, t1, gaps)) {
        const len = b - a, mid = (a + b) / 2;
        if (axis === 'x') box(len, H, T, wallM, mid, y0 + H / 2, fixed, true, `wall:${r.id}:${edge}`);
        else box(T, H, len, wallM, fixed, y0 + H / 2, mid, true, `wall:${r.id}:${edge}`);
      }
      for (const g of gaps) { // lintel above each opening
        const lh = H - K.doorH;
        if (lh > 0.05) { if (axis === 'x') box(g.w, lh, T, wallM, g.c, y0 + K.doorH + lh / 2, fixed, false); else box(T, lh, g.w, wallM, fixed, y0 + K.doorH + lh / 2, g.c, false); }
      }
    }
    if (K.roomLights && pal.ceil != null && rooms.length <= 16) {
      const l = new THREE.PointLight(0xfff1d6, Math.min(30, 4 + r.w * r.d * 0.12), Math.max(r.w, r.d) * 1.8, 1.6);
      l.position.set(cx, y0 + H - 0.4, cz); l.name = `lamp:${r.id}`; group.add(l);
    }
    roomsById.set(r.id, { room: r, y: y0, cx, cz, slots: 0 });
  }

  // door panels (one per door, in the gap of room a); a locked door stays shut until its unlock key is unlocked
  const doorM = m('door', 0x6a4b32);
  for (const d of plan.doors || []) {
    const a = byId.get(d.a);
    if (!a || d.x == null || d.kind === 'stairs' || d.kind === 'lift') continue;
    const { edge } = doorEdge(a, d.x, d.z), w = d.width ?? K.doorW, y0 = yOf(a), alongX = edge === 'n' || edge === 's';
    const fixed = alongX ? (edge === 'n' ? a.z : a.z + a.d) : edge === 'w' ? a.x : a.x + a.w;
    const { mesh, col } = alongX ? box(w, K.doorH, 0.08, doorM, d.x, y0 + K.doorH / 2, fixed, true, `door:${d.id}`) : box(0.08, K.doorH, w, doorM, fixed, y0 + K.doorH / 2, d.z, true, `door:${d.id}`);
    mesh.userData.interact = { kind: 'door', id: d.id };
    interactables.push(mesh);
    const api = {
      def: d, mesh, col, isOpen: false,
      locked: () => !!d.unlock && !isUnlocked(d.unlock),
      open() { if (api.isOpen || api.locked()) return false; api.isOpen = true; mesh.visible = false; col.off = true; return true; },
      close() { api.isOpen = false; mesh.visible = true; col.off = false; },
    };
    doors.set(d.id, api);
  }

  // room under a point (y = the eye height; floors are told apart by it)
  const roomAt = (x, z, y = 1.6) => {
    for (const { room: r, y: ry } of roomsById.values()) if (x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d && Math.abs(y - ry - 1.6) < K.floorH / 2) return r.id;
    return null;
  };

  // station consoles
  const stationM = mat(0x23302c, { emissive: 0x2a8a5a, emissiveIntensity: 0.55 });
  function place(mesh, roomId, x, z) {
    const R = roomsById.get(roomId);
    if (!R) throw new Error(`world.place: unknown room ${roomId}`);
    if (x == null || z == null) { const k = R.slots++, ang = k * 2.4 + 0.6, rad = Math.min(R.room.w, R.room.d) * 0.28; x = R.cx + Math.cos(ang) * rad; z = R.cz + Math.sin(ang) * rad; }
    mesh.position.x = x; mesh.position.z = z; mesh.position.y += R.y;
    group.add(mesh);
    return mesh;
  }
  for (const s of plan.stations || []) {
    if (!roomsById.has(s.room)) continue;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.5), stationM);
    mesh.position.y = 0.55; mesh.name = `station:${s.id}`; mesh.userData.interact = { kind: 'station', id: s.id, label: s.label };
    place(mesh, s.room, s.x, s.z);
    colliders.push({ box: new THREE.Box3().setFromObject(mesh), off: false });
    interactables.push(mesh);
  }

  // stairs / lifts: a block at each end, [E] to go to the other floor
  const stairM = mat(0x3a3f44, { emissive: 0x1a3a2a, emissiveIntensity: 0.4 });
  const stairs = new Map();
  for (const d of plan.doors || []) {
    const a = byId.get(d.a), b = byId.get(d.b);
    if (!a || !b || !(d.kind === 'stairs' || d.kind === 'lift' || (a.floor || 0) !== (b.floor || 0))) continue;
    const locked = () => !!d.unlock && !isUnlocked(d.unlock);
    const mkEnd = (from, to, key) => {
      const E = (d.ends && d.ends[key]) || {}, F = roomsById.get(from.id), T = roomsById.get(to.id);
      const ex = E.x ?? F.cx, ez = E.z ?? F.cz, y0 = F.y;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.6), stairM);
      mesh.position.set(ex, y0 + 1.0, ez); mesh.name = `stairs:${d.id}:${key}`;
      const arrive = (d.ends && d.ends[key === 'a' ? 'b' : 'a'] && d.ends[key === 'a' ? 'b' : 'a'].arrive) || [T.cx, T.cz + 1.2];
      mesh.userData.interact = { kind: 'stairs', id: d.id, label: d.label || (d.kind === 'lift' ? 'エレベーターに乗る' : (T.room.floor || 0) > (from.floor || 0) ? '上の階へ' : '下の階へ'), to: { x: arrive[0], z: arrive[1], floor: to.floor || 0, yaw: ((d.ends && d.ends[key === 'a' ? 'b' : 'a']) || {}).yaw ?? 0 }, locked };
      group.add(mesh); interactables.push(mesh);
      colliders.push({ box: new THREE.Box3().setFromObject(mesh), off: false });
      stairs.set(`${d.id}:${key}`, mesh);
    };
    mkEnd(a, b, 'a'); mkEnd(b, a, 'b');
  }

  // bounds and spawn
  const xs = rooms.flatMap((r) => [r.x, r.x + r.w]), zs = rooms.flatMap((r) => [r.z, r.z + r.d]);
  const bounds = [Math.min(...xs) - 0.5, Math.min(...zs) - 0.5, Math.max(...xs) + 0.5, Math.max(...zs) + 0.5];
  const S = roomsById.get(plan.start);
  let spawn = plan.spawn ? { yaw: 0, ...plan.spawn } : null;
  if (!spawn && S) {
    const d0 = (plan.doors || []).find((d) => (d.a === plan.start || d.b === plan.start) && d.x != null);
    const yaw = d0 ? Math.atan2(-(d0.x - S.cx), -(d0.z - S.cz)) : 0;
    spawn = { x: S.cx, z: S.cz, yaw };
  }
  const spawnRoom = S && S.room;
  if (spawn && spawn.floor == null && spawnRoom) spawn.floor = spawnRoom.floor || 0;
  return { group, colliders, interactables, rooms: roomsById, doors, stairs, roomAt, place, bounds, spawn, floorY, yOf: (id) => roomsById.get(id)?.y || 0, K };
}

// the interaction pick (rule W18, js/interact-select.js): the thing the camera looks at, with a cone assist, a 15 cm margin around the
// visible mesh, a reach of >= 2.2 m and hysteresis. opts: { reach, touch, viewH, colliders: [{ box, off }] (walls: a thing behind one is not selected),
// prev (the id shown last frame; kept in the module otherwise) }. Returns null or { object, ...userData.interact, distance, via }.
const _bx = new THREE.Box3(), _q = new THREE.Vector3();
let lastPick = null;
function candidatesOf(camera, interactables, reach) {
  const out = [];
  for (const o of interactables) {
    if (!o.visible) continue;
    if (Math.abs(o.position.x - camera.position.x) > reach + 3 || Math.abs(o.position.z - camera.position.z) > reach + 3) continue;
    _bx.setFromObject(o);
    if (_bx.isEmpty()) continue;
    out.push({ id: o.id, min: [_bx.min.x, _bx.min.y, _bx.min.z], max: [_bx.max.x, _bx.max.y, _bx.max.z], obj: o });
  }
  return out;
}
const blockedBy = (colliders, eye) => (cand) => {
  // a wall (a tall collider box) that the line from the eye to the thing's visible surface enters more than 10 cm before the surface hides it
  // (a terminal mounted on the near face of a wall is entered at the surface itself: not hidden)
  const e = [eye.x, eye.y, eye.z], q = [Math.max(cand.min[0], Math.min(e[0], cand.max[0])), Math.max(cand.min[1], Math.min(e[1], cand.max[1])), Math.max(cand.min[2], Math.min(e[2], cand.max[2]))];
  const dx = q[0] - e[0], dy = q[1] - e[1], dz = q[2] - e[2], L = Math.hypot(dx, dy, dz);
  if (L < 0.3) return false;
  const d = [dx / L, dy / L, dz / L];
  for (const k of colliders) {
    if (k.off) continue;
    const b = k.box;
    if (b.max.y - b.min.y < 1.0 || b.max.y < eye.y - 0.4 || b.min.y > eye.y + 0.4) continue;
    const t = rayBox(e, d, { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] }, L);
    if (t != null && t < L - 0.1) return true;
  }
  return false;
};
// every visible interactable with its visible bounds (the sweep of tools/check-select-range.mjs, tests): [{ id, kind, min, max }]
export function selectablesOf(interactables) {
  return candidatesOf({ position: { x: 0, z: 0 } }, interactables, 1e9).map((c) => ({ id: `${c.obj.userData.interact.kind}:${c.obj.userData.interact.id}`, kind: c.obj.userData.interact.kind, min: c.min, max: c.max }));
}
export function pickInteractable(camera, interactables, reach = 2.4, ray, opts = {}) {
  void ray;
  const cands = candidatesOf(camera, interactables, reach);
  if (!cands.length) return (lastPick = null);
  camera.updateMatrixWorld();
  const dir = camera.getWorldDirection(_q.clone());
  const eye = camera.position;
  const sel = selectInteractable({ eye: [eye.x, eye.y, eye.z], dir: [dir.x, dir.y, dir.z], candidates: cands, prev: opts.prev ?? lastPick, touch: !!opts.touch, viewH: opts.viewH || 720, fovDeg: camera.fov || 70,
    blocked: opts.colliders ? blockedBy(opts.colliders, eye) : null, opts: { reach } });
  lastPick = sel ? sel.id : null;
  return sel ? { object: sel.cand.obj, ...sel.cand.obj.userData.interact, distance: sel.dist, via: sel.via } : null;
}
// a tap on the screen at (x, y) in CSS px of the w x h view: the thing under the finger (touch radius >= 44 px), or null
export function pickInteractableAt(camera, interactables, x, y, w, h, reach = 2.4, opts = {}) {
  const cands = candidatesOf(camera, interactables, reach);
  if (!cands.length) return null;
  camera.updateMatrixWorld();
  const m = camera.matrixWorld.elements;
  const basis = { right: [m[0], m[1], m[2]], up: [m[4], m[5], m[6]], fwd: [-m[8], -m[9], -m[10]] };
  const eye = camera.position;
  const sel = selectAtScreen({ x, y, w, h, fovDeg: camera.fov || 70, eye: [eye.x, eye.y, eye.z], basis, candidates: cands, blocked: opts.colliders ? blockedBy(opts.colliders, eye) : null, opts: { reach } });
  return sel ? { object: sel.cand.obj, ...sel.cand.obj.userData.interact, distance: sel.dist, via: sel.via } : null;
}
