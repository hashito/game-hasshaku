// The village and the grandfather's house, dressed on top of the standard world (js/kit/world-from-plan.js builds the rooms,
// walls, doors, stations and pickups from data/plan.json). This module only adds looks and a few colliders:
//   - outdoor rooms keep their wall colliders (the plan stays the truth for the monster's sight lines) but show a hedge,
//     a stone wall or a row of cedars instead of a plaster wall; doubled walls between two rooms are removed (W6)
//   - openings between outdoor rooms (doors with "open": true) have no panel
//   - the house (roof, engawa, shoji / fusuma, furniture against the walls W1), the shop, the shrine, the north gate,
//     the van, utility poles, lanterns, jizo, the rice field and the forest
//   - people from the standard character (grandfather, Ｋさん, the shop keeper)
// Everything stands on the floor it belongs to (W3): the y of each thing is its support height.
import { dressOuterWalls } from '../kit/outer-walls.js';
import * as THREE from 'three';
import * as E from '../kit/env-props.js';
import * as P from '../kit/props.js';
import { makeCharacter } from '../kit/character.js';
import { TextureLibrary, trailSteps } from '../kit/texture-library.js';
import { finishInterior } from '../kit/interior-finish.js';
import { mergePlaced } from '../kit/prop-batch.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
const M = {
  wood: mat(0x5b4633), darkWood: mat(0x33281f), beam: mat(0x2c231b), straw: mat(0x8f8a63), stone: mat(0x6f7368), moss: mat(0x46553c),
  hedge: mat(0x2c4428), paper: mat(0xe6dfc8, { roughness: 1 }), salt: mat(0xf2eee2, { roughness: 1 }), plate: mat(0xd6d0c0, { roughness: 0.5 }),
  red: mat(0xa8452f), roof: mat(0x2f3836, { roughness: 0.8 }), water: new THREE.MeshStandardMaterial({ color: 0x2c3b3a, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 }),
  rice: mat(0x4f6b35), bark: mat(0x3a2f26), cedar: mat(0x1f3326), pole: mat(0x6a645a), wire: new THREE.LineBasicMaterial({ color: 0x1a1a1a }),
  futon: mat(0xc9c2ad), futonCover: mat(0x5d5a50), cloth: mat(0x5a3428), brass: mat(0xb08a4a, { metalness: 0.6, roughness: 0.4 }), lampGlow: new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc070, emissiveIntensity: 1.6 }),
  hidden: new THREE.MeshBasicMaterial({ visible: false }),
};

export function canvasTexture(lines, o = {}) {
  const w = o.w || 512, h = o.h || 256, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = o.bg || '#2a2420'; g.fillRect(0, 0, w, h);
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); }
  g.fillStyle = o.fg || '#e8e0c8'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const vertical = !!o.vertical;
  if (vertical) {
    const chars = [...lines.join('')]; const fs = o.size || Math.floor(h / (chars.length + 1));
    g.font = `${o.weight || 600} ${fs}px "Yu Mincho","Hiragino Mincho ProN","Noto Serif CJK JP",serif`;
    chars.forEach((ch, i) => g.fillText(ch, w / 2, fs * (i + 1)));
  } else {
    const fs = o.size || Math.floor(h / (lines.length + 1) * 0.8);
    lines.forEach((t, i) => { g.font = `${i === 0 && o.head ? 700 : 500} ${i === 0 && o.head ? fs * 1.25 : fs}px "Yu Mincho","Hiragino Mincho ProN","Noto Serif CJK JP",serif`; g.fillText(t, w / 2, (h / (lines.length + 1)) * (i + 1)); });
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function dressVillage(ctx) {
  const { world, scene } = ctx;
  const plan = ctx.data.plan;
  const G = new THREE.Group(); G.name = 'village'; world.group.add(G);
  const colliders = world.colliders;
  const addCol = (x0, z0, x1, z1, y0 = 0, y1 = 2.5, o = {}) => { const c = { box: new THREE.Box3(V3(Math.min(x0, x1), y0, Math.min(z0, z1)), V3(Math.max(x0, x1), y1, Math.max(z0, z1))), off: false, ...o }; colliders.push(c); return c; };
  const box = (w, h, d, m, x, y, z, parent = G) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b; };
  const cyl = (r0, r1, h, m, x, y, z, seg = 12, parent = G) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); c.position.set(x, y, z); c.castShadow = true; parent.add(c); return c; };
  const at = (obj, x, y, z, ry = 0, parent = G) => { obj.position.set(x, y, z); obj.rotation.y = ry; parent.add(obj); return obj; };
  const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
  const roomOf = (x, z) => plan.rooms.find((r) => x > r.x + 0.01 && x < r.x + r.w - 0.01 && z > r.z + 0.01 && z < r.z + r.d - 0.01);
  const api = { group: G, people: {}, parts: {}, tex: null };

  // ---------------------------------------------------------------- walls: outdoor looks, no doubles (W6)
  const colOf = (mesh) => { const b = new THREE.Box3().setFromObject(mesh); return colliders.find((c) => c.box.min.distanceTo(b.min) < 1e-3 && c.box.max.distanceTo(b.max) < 1e-3); };
  const dropCol = (c) => { const i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1); };
  const walls = []; world.group.traverse((o) => { if (o.isMesh && /^wall:/.test(o.name)) walls.push(o); });
  const edgeRuns = [];   // outdoor wall runs to dress: { x0, z0, x1, z1, kind }
  for (const w of walls) {
    const [, rid, edge] = w.name.split(':');
    const r = rooms.get(rid); if (!r) continue;
    const b = new THREE.Box3().setFromObject(w);
    const mx = (b.min.x + b.max.x) / 2, mz = (b.min.z + b.max.z) / 2;
    const out = { n: [0, -0.4], s: [0, 0.4], w: [-0.4, 0], e: [0.4, 0] }[edge];
    const other = roomOf(mx + out[0], mz + out[1]);
    const c = colOf(w);
    const indoor = (x) => x && x.kind !== 'outdoor';
    if (other && (r.kind === 'outdoor' ? indoor(other) : (indoor(other) && other.id < r.id))) { w.removeFromParent(); if (c) dropCol(c); continue; }   // the other room's wall stands here
    if (r.kind === 'outdoor') {
      if (other && other.kind === 'outdoor' && other.id < r.id) { w.removeFromParent(); if (c) dropCol(c); continue; }   // one run per shared edge
      w.material = M.hidden;   // the collider stays: the plan is what the monster sees with
      if (b.max.y - b.min.y < 1) continue;   // a lintel
      edgeRuns.push({ x0: b.min.x, z0: b.min.z, x1: b.max.x, z1: b.max.z, shared: !!other, room: r.id, edge });
    }
  }
  // lintels over the openings between two outdoor rooms: nothing to show. A lintel stands on the line between two rooms, so look
  // half a metre to each side: one indoor room there keeps it (the wall above a house or shop door, Issue #4)
  const indoorNear = (x, z) => [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].some(([dx, dz]) => { const r = roomOf(x + dx, z + dz); return r && r.kind !== 'outdoor'; });
  world.group.traverse((o) => { if (o.isMesh && !o.name && o.material && o.material.color && o.geometry && o.geometry.parameters && o.geometry.parameters.height < 1 && o.position.y > 2 && !indoorNear(o.position.x, o.position.z)) o.visible = false; });

  // openings between outdoor rooms: no panel, always open, not something to interact with
  for (const d of plan.doors) {
    const api0 = world.doors.get(d.id); if (!api0) continue;
    if (d.open && api0.mesh) { api0.open(); api0.mesh.visible = false; const i = world.interactables.indexOf(api0.mesh); if (i >= 0) world.interactables.splice(i, 1); }   // older kits built a panel for openings
  }

  // ---------------------------------------------------------------- textures (loaded once; the recipes paint floors and walls)
  const texReady = TextureLibrary.load('assets/textures/', { renderer: ctx.renderer }).then((tex) => { api.tex = tex; return tex; }).catch(() => null);
  // the game's own textures (Issue #1, assets/textures-game/catalog.json): roof tiles, the paddy, the levee, rutted gravel, cedar foliage,
  // shoji and fusuma, the salt turning black. Applied over the kit's look once loaded; anything missing keeps the kit's material.
  const ownReady = TextureLibrary.load('assets/textures-game/', { renderer: ctx.renderer }).then((t) => { api.own = t; return t; }).catch(() => null);
  const own = (id, o, fn) => ownReady.then((t) => { if (t && (t.catalog.textures || []).some((e) => e.id === id)) fn(t.material(id, o)); });

  // ---------------------------------------------------------------- ground, road, forest, mountains
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 420), mat(0x26301f)); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.12, -100); ground.receiveShadow = true; G.add(ground);
  const ROADLEN = 260, ROADZ = 31 - ROADLEN / 2;   // from the house (z 31) on past the border into the fog (feedback 2026-11-01: the road ended just past the van's stop)
  const road = new THREE.Mesh(new THREE.PlaneGeometry(5.6, ROADLEN), mat(0x77756a)); road.rotation.x = -Math.PI / 2; road.position.set(0.5, 0.006, ROADZ); road.receiveShadow = true; G.add(road);
  const tracks = [-1.0, 2.0].map((x) => { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.4, ROADLEN), mat(0x55534b)); t.rotation.x = -Math.PI / 2; t.position.set(x, 0.008, ROADZ); G.add(t); return t; });
  texReady.then((tex) => { if (!tex) return; road.material = tex.material('gravel', { size: [5.6, ROADLEN] }); own('road_gravel_ruts', { size: [5.6, ROADLEN] }, (m) => { road.material = m; }); ground.material = tex.material('grass_dry', { size: [260, 420] }); void tracks; });

  // trees: instanced cedars (trunk + three tiers) outside the walkable area, and a row along every outer edge
  const treeSpots = [];
  const rnd = (() => { let s = 20080815; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const inWalk = (x, z, pad = 1.2) => plan.rooms.some((r) => x > r.x - pad && x < r.x + r.w + pad && z > r.z - pad && z < r.z + r.d + pad) || (Math.abs(x - 0.5) < 5 && z < -40 && z > -230);
  for (const run of edgeRuns.filter((e) => !e.shared)) {
    const len = Math.hypot(run.x1 - run.x0, run.z1 - run.z0);
    const n = Math.max(1, Math.round(len / 2.6));
    const out = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[run.edge];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = run.x0 + (run.x1 - run.x0) * t + out[0] * (1.4 + rnd() * 1.6), z = run.z0 + (run.z1 - run.z0) * t + out[1] * (1.4 + rnd() * 1.6);
      if (!inWalk(x, z, 0.6)) treeSpots.push([x, z, 0.8 + rnd() * 0.5]);
    }
  }
  for (let i = 0; i < 900 && treeSpots.length < 620; i++) { const x = -70 + rnd() * 140, z = -200 + rnd() * 245; if (!inWalk(x, z, 3.5)) treeSpots.push([x, z, 0.7 + rnd() * 0.7]); }
  {
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1, 6); trunk.translate(0, 0.5, 0);
    const tiers = [[1.6, 3.2, 2.6], [1.25, 2.8, 4.2], [0.8, 2.4, 5.6]].map(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, 7); g.translate(0, y, 0); return g; });
    const tm = new THREE.InstancedMesh(trunk, M.bark, treeSpots.length);
    const cm = tiers.map((g) => new THREE.InstancedMesh(g, M.cedar, treeSpots.length));
    own('cedar_foliage_far', { triplanar: true }, (m) => { m.color.set(0x8a9a8a); cm.forEach((x) => { x.material = m; }); });
    const m4 = new THREE.Matrix4();
    treeSpots.forEach(([x, z, s], i) => { m4.compose(V3(x, -0.1, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rnd() * 6), V3(s, s * 2.6, s)); tm.setMatrixAt(i, m4); m4.compose(V3(x, -0.1, z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rnd() * 6), V3(s, s, s)); cm.forEach((c) => c.setMatrixAt(i, m4)); });
    tm.castShadow = true; cm.forEach((c) => { c.castShadow = true; G.add(c); }); G.add(tm);
    texReady.then((tex) => { if (!tex) return; tm.material = tex.material('jashi_cedar_bark', { size: [0.6, 1.2] }); });
  }
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, r = 105 + rnd() * 20; const h = 34 + rnd() * 26; const m = new THREE.Mesh(new THREE.ConeGeometry(30 + rnd() * 14, h, 6), mat(0x1c2a27)); m.position.set(Math.cos(a) * r, h / 2 - 2, -20 + Math.sin(a) * r); G.add(m); }

  // hedges / stone walls on the shared edges between outdoor rooms (the collider is the plan's wall); nothing pokes into a building
  const nearIndoor = (x, z, pad) => plan.rooms.some((r) => r.kind !== 'outdoor' && x > r.x - pad && x < r.x + r.w + pad && z > r.z - pad && z < r.z + r.d + pad);
  for (const run of edgeRuns.filter((e) => e.shared)) {
    const len = Math.hypot(run.x1 - run.x0, run.z1 - run.z0), cx = (run.x0 + run.x1) / 2, cz = (run.z0 + run.z1) / 2, alongX = run.x1 - run.x0 > run.z1 - run.z0;
    const stone = (run.room === 'O_ROAD' || run.room === 'O_SHOPFRONT' || run.room === 'O_GATE') && !(run.room === 'O_ROAD' && run.edge === 'e');
    const h = stone ? 1.15 : 1.9, m = stone ? M.stone : M.hedge;
    const b = box(alongX ? len : 0.9, h, alongX ? 0.9 : len, m, cx, h / 2, cz);
    if (!stone) addCol(cx - (alongX ? len : 0.6) / 2, cz - (alongX ? 0.6 : len) / 2, cx + (alongX ? len : 0.6) / 2, cz + (alongX ? 0.6 : len) / 2, 0, h);   // thick enough that the view (body radius + this) stops outside it (Issue #4)
    if (!stone) for (let i = 0; i < len / 0.7; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.42 + rnd() * 0.2, 6, 5), M.hedge); const t = (i + 0.5) / (len / 0.7); s.position.set(alongX ? run.x0 + (run.x1 - run.x0) * t : cx + (rnd() - 0.5) * 0.3, h - 0.05 + rnd() * 0.2, alongX ? cz + (rnd() - 0.5) * 0.3 : run.z0 + (run.z1 - run.z0) * t); if (!nearIndoor(s.position.x, s.position.z, 0.7)) G.add(s); }
    texReady.then((tex) => { if (tex && stone) b.material = tex.material('block_wall_old', { triplanar: true }); });
  }

  // the outer edge of the map: a low old stone wall along every edge that leads nowhere (Issue #4: make the border plain to see), the cedars
  // behind it; the empty houses' board fences take the east of the field and the south of the back garden
  for (const run of edgeRuns.filter((e) => !e.shared && !(e.room === 'O_FIELD' && e.edge === 'e') && !(e.room === 'O_GARDEN' && e.edge === 's'))) {
    const len = Math.hypot(run.x1 - run.x0, run.z1 - run.z0), alongX = run.x1 - run.x0 > run.z1 - run.z0;
    const out = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[run.edge], cx = (run.x0 + run.x1) / 2 + out[0] * 0.3, cz = (run.z0 + run.z1) / 2 + out[1] * 0.3;
    box(alongX ? len : 0.6, 0.85, alongX ? 0.6 : len, M.stone, cx, 0.42, cz);
    addCol(cx - (alongX ? len : 0.6) / 2, cz - (alongX ? 0.6 : len) / 2, cx + (alongX ? len : 0.6) / 2, cz + (alongX ? 0.6 : len) / 2, 0, 0.85);   // as high as it looks (the plan's wall keeps the player in)
  }

  // ---------------------------------------------------------------- the rice field (x 6.6..16.2, z 1..23): water, rice, the levee path around it;
  // open to the road on the west (Issue #4: no hedge round the field), the empty house's board fence on the east
  {
    const fx0 = 6.6, fx1 = 16.2, fz0 = 1.2, fz1 = 23.4;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(fx1 - fx0, fz1 - fz0), M.water); water.rotation.x = -Math.PI / 2; water.position.set((fx0 + fx1) / 2, 0.02, (fz0 + fz1) / 2); G.add(water); own('paddy_water', { size: [fx1 - fx0, fz1 - fz0] }, (m) => { m.transparent = false; m.roughness = 0.25; water.material = m; });
    const rice = new THREE.ConeGeometry(0.05, 0.62, 4); rice.translate(0, 0.31, 0);
    const pts = []; for (let x = fx0 + 0.3; x < fx1 - 0.2; x += 0.5) for (let z = fz0 + 0.3; z < fz1 - 0.2; z += 0.55) pts.push([x + (rnd() - 0.5) * 0.08, z + (rnd() - 0.5) * 0.08]);
    const im = new THREE.InstancedMesh(rice, M.rice, pts.length); const m4 = new THREE.Matrix4();
    pts.forEach(([x, z], i) => { m4.compose(V3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.25, rnd() * 3, (rnd() - 0.5) * 0.25)), V3(1, 0.8 + rnd() * 0.5, 1)); im.setMatrixAt(i, m4); });
    G.add(im);
    // the levee rims (the player walks round, not through the paddy: a low collider that does not block sight)
    for (const [x0, z0, x1, z1] of [[fx0 - 0.25, fz0 - 0.25, fx1 + 0.25, fz0], [fx0 - 0.25, fz1, fx1 + 0.25, fz1 + 0.25], [fx0 - 0.25, fz0, fx0, fz1], [fx1, fz0, fx1 + 0.25, fz1]]) { const lv = box(x1 - x0, 0.16, z1 - z0, M.moss, (x0 + x1) / 2, 0.08, (z0 + z1) / 2); own('aze_grass', { triplanar: true }, (m) => { lv.material = m; }); }
    addCol(fx0, fz0, fx1, fz1, 0, 0.5, { low: true });
    // a small hut for tools in the corner (a hiding place, plan.hides H_FIELDHUT)
    hut(16.6, 25.6, 2.4, 1.6, Math.PI);
    // a stack of rice straw on the east path (a hiding place, plan.hides H_STRAW)
    { const g = new THREE.Group(); at(g, 17.35, 0, 10.4); cyl(0.62, 0.7, 1.5, M.straw, 0, 0.75, 0, 12, g); const top = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.7, 12), M.straw); top.position.y = 1.85; g.add(top); cyl(0.04, 0.04, 2.6, M.darkWood, 0, 1.3, 0, 6, g); addCol(16.85, 9.85, 17.85, 10.95, 0, 2.2); }
  }

  // ---------------------------------------------------------------- empty houses behind board fences (Issue #4): they close the map on the east of the
  // field and on the south of the back garden, so the edge reads as a place, not an invisible wall
  const boardFence = (x0, z0, x1, z1, h = 1.7, gap = null) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 0.9);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, cx = x0 + (x1 - x0) * (t0 + t1) / 2, cz = z0 + (z1 - z0) * (t0 + t1) / 2;
      if (gap && Math.hypot(cx - gap[0], cz - gap[1]) < gap[2]) continue;
      const b = box(alongX ? len / n - 0.02 : 0.05, h - (i % 3 === 1 ? 0.12 : 0), alongX ? 0.05 : len / n - 0.02, M.wood, cx, (h - (i % 3 === 1 ? 0.12 : 0)) / 2, cz); b.rotation.y = (rnd() - 0.5) * 0.03;
    }
    for (let i = 0; i <= n; i += 2) { const t = i / n; cyl(0.06, 0.07, h + 0.15, M.darkWood, x0 + (x1 - x0) * t, (h + 0.15) / 2, z0 + (z1 - z0) * t, 6); }
    for (const y of [0.35, h - 0.25]) box(alongX ? len : 0.06, 0.07, alongX ? 0.06 : len, M.beam, (x0 + x1) / 2 + (alongX ? 0 : 0.05), y, (z0 + z1) / 2 + (alongX ? 0.05 : 0));
    const segs = gap ? [[x0, z0, gap[0] - (alongX ? gap[2] : 0), gap[1] - (alongX ? 0 : gap[2])], [gap[0] + (alongX ? gap[2] : 0), gap[1] + (alongX ? 0 : gap[2]), x1, z1]] : [[x0, z0, x1, z1]];
    for (const [a, b, c, d] of segs) addCol(Math.min(a, c) - 0.15, Math.min(b, d) - 0.15, Math.max(a, c) + 0.15, Math.max(b, d) + 0.15, 0, h);
  };
  const akiya = (x0, z0, w, d) => {
    // a shut farmhouse: weathered board walls, rain shutters, a tiled roof with a sag, grass up to the sill
    const cx = x0 + w / 2, cz = z0 + d / 2, wall = 2.8;
    box(w, wall, d, M.wood, cx, wall / 2, cz);
    for (let i = 0; i < Math.floor(w / 1.8); i++) box(0.9, 1.7, 0.04, M.darkWood, x0 + 0.9 + i * 1.8, 1.15, z0 - 0.03);
    const half = d / 2 + 0.7, rise = 1.6, len = Math.hypot(half, rise), sl = Math.atan2(rise, half);
    for (const s of [-1, 1]) { const r = box(w + 1.0, 0.14, len, M.roof, cx, wall + rise / 2, cz + s * half / 2); r.rotation.x = s * sl; r.rotation.z = s * 0.015; }
    for (let i = 0; i < 26; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5 + rnd() * 0.4, 4), M.moss); t.position.set(x0 + rnd() * w, 0.25, z0 - 0.3 - rnd() * 0.6); G.add(t); }
  };
  akiya(19.5, 5.0, 8, 9); boardFence(18.35, -1.8, 18.35, 26.8);
  akiya(-19.0, 29.5, 10, 6); boardFence(-25.8, 27.35, -4.2, 27.35, 1.7, [-12.0, 27.35, 1.1]);
  // the gate of the empty house behind the garden: posts, a small roof and wing walls make a nook (a hiding place, plan.hides H_AKIYA)
  { for (const x of [-13.15, -10.85]) { box(0.16, 2.3, 0.16, M.darkWood, x, 1.15, 27.3); addCol(x - 0.12, 27.2, x + 0.12, 27.45, 0, 2.3); }
    const r = box(2.9, 0.1, 1.1, M.roof, -12.0, 2.38, 27.0); r.rotation.x = -0.1;
    for (const x of [-13.15, -10.85]) { box(0.05, 1.7, 1.0, M.wood, x, 0.85, 26.8); addCol(x - 0.05, 26.3, x + 0.05, 27.3, 0, 1.7); }
    const door = box(2.1, 1.9, 0.06, M.darkWood, -12.0, 0.95, 27.55); addCol(-13.0, 27.5, -11.0, 27.6, 0, 1.9); void door; }
  // a woodpile against the west edge of the back of the house (a hiding place, plan.hides H_WOODPILE)
  { const g = new THREE.Group(); at(g, -25.45, 0, 7.0); for (let y = 0; y < 6; y++) for (let k = 0; k < 9; k++) { const c = cyl(0.11, 0.11, 0.9, M.wood, 0, 0.12 + y * 0.21, -0.95 + k * 0.24 + (y % 2) * 0.1, 7, g); c.rotation.z = Math.PI / 2; }
    const r = box(1.2, 0.06, 2.6, M.roof, 0, 1.5, 0, g); r.rotation.z = 0.15; addCol(-26.0, 5.75, -24.95, 8.25, 0, 1.5); }
  function hut(x, z, w, d, ry) {
    const g = new THREE.Group(); at(g, x, 0, z, ry);
    const walls = [box(w, 2.1, 0.08, M.wood, 0, 1.05, -d / 2, g), box(0.08, 2.1, d, M.wood, -w / 2, 1.05, 0, g), box(0.08, 2.1, d, M.wood, w / 2, 1.05, 0, g)];
    g.updateMatrixWorld(true); for (const m of walls) { const b = new THREE.Box3().setFromObject(m); addCol(b.min.x - 0.04, b.min.z - 0.04, b.max.x + 0.04, b.max.z + 0.04, 0, 2.1); }   // every wall is solid (Issue #4)
    const roof = box(w + 0.5, 0.08, d + 0.6, M.roof, 0, 2.2, 0.1, g); roof.rotation.x = 0.12;
    return g;
  }

  // ---------------------------------------------------------------- utility poles and wires, lanterns along the road
  const poles = [[-3.0, 23], [-3.0, 0], [-3.0, -18], [-3.0, -40], [-3.0, -62], [-3.0, -84], [-3.0, -106], [-3.0, -128]];
  poles.forEach(([x, z], i) => { cyl(0.13, 0.16, 7.2, M.pole, x, 3.6, z, 8); box(1.6, 0.1, 0.1, M.darkWood, x, 6.6, z); addCol(x - 0.2, z - 0.2, x + 0.2, z + 0.2); if (i) { const [px, pz] = poles[i - 1]; for (const dx of [-0.7, 0.7]) { const curve = new THREE.QuadraticBezierCurve3(V3(px + dx, 6.6, pz), V3((px + x) / 2 + dx, 5.7, (pz + z) / 2), V3(x + dx, 6.6, z)); G.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(16)), M.wire)); } } });
  // a few lanterns (wooden post + paper light); only some carry a real light (lights cost)
  const lanterns = [[3.4, 21, true], [-3.6, 6, false], [3.4, -8, true], [-3.6, -21, false], [3.4, -28, true]];
  for (const [x, z, lit] of lanterns) {
    cyl(0.06, 0.07, 1.8, M.darkWood, x, 0.9, z, 6); box(0.32, 0.4, 0.32, M.lampGlow, x, 1.95, z); box(0.42, 0.06, 0.42, M.roof, x, 2.18, z);
    addCol(x - 0.15, z - 0.15, x + 0.15, z + 0.15);
    if (lit) { const l = new THREE.PointLight(0xffc98a, 9, 11, 1.6); l.position.set(x, 2.0, z); G.add(l); }
  }
  // the bus stop shelter on the road (a hiding place, plan.hides H_BUSSTOP): open towards the road (hut(): the back wall is local -z; ry +pi/2 puts it on the west)
  { const g = hut(-3.25, -6.5, 2.2, 1.3, Math.PI / 2); box(1.6, 0.08, 0.4, M.wood, 0, 0.45, -0.3, g); const bs = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: canvasTexture(['バス', '村口'], { w: 256, h: 256, bg: '#e8e2d0', fg: '#2a3a6a', head: true }) })); cyl(0.03, 0.03, 2.1, M.pole, -2.0, 1.05, -8.1, 6); bs.position.set(-2.0, 1.95, -8.07); G.add(bs); }
  // the straw shed by the gate (a hiding place, plan.hides H_GATESHED)
  { const g = hut(-3.3, -20.6, 2.0, 1.2, Math.PI / 2); for (let i = 0; i < 3; i++) cyl(0.3, 0.32, 0.7, M.straw, 0, 0.35, -0.2 + i * 0.01, 8, g).position.x = -0.6 + i * 0.6; }
  // signs on the road (text is HTML-free canvas, never inside generated pictures)
  const sign = (lines, x, z, ry, w = 1.1) => { const g = new THREE.Group(); cyl(0.04, 0.04, 1.6, M.darkWood, 0, 0.8, 0, 6, g); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.45), new THREE.MeshStandardMaterial({ map: canvasTexture(lines, { w: 512, h: 230, bg: '#2c2621', fg: '#e8e0c8', border: '#55493c' }), roughness: 0.9, side: THREE.DoubleSide })); p.position.set(0, 1.5, 0.03); g.add(p); return at(g, x, 0, z, ry); };
  sign(['← 祖父の家'], 3.6, 18.5, -Math.PI / 2);
  sign(['社 →'], 3.6, -10.0, -Math.PI / 2, 0.9);
  sign(['夕霧商店 ←'], 3.6, -15.0, -Math.PI / 2);

  // jizo: the south one by the house, the one on the village border (seen from the van)
  const jizo = (x, z, s = 1, ry = 0) => { const g = new THREE.Group(); box(0.6, 0.3, 0.5, M.stone, 0, 0.15, 0, g); cyl(0.2, 0.26, 0.55, M.stone, 0, 0.58, 0, 10, g); const h = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), M.stone); h.position.y = 0.98; g.add(h); const bib = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.3, 10, 1, true), M.red); bib.position.y = 0.72; g.add(bib); g.scale.setScalar(s); addCol(x - 0.35 * s, z - 0.3 * s, x + 0.35 * s, z + 0.3 * s); return at(g, x, 0, z, ry); };
  jizo(3.8, 26.2, 1.1, Math.PI);
  jizo(4.2, -66, 1.3, 0); jizo(-3.2, -66, 1.3, 0);
  { const g = new THREE.Group(); for (const x of [-3.9, 4.9]) cyl(0.14, 0.16, 3.1, M.darkWood, x, 1.55, 0, 8, g); const rope = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.07, 6, 30, Math.PI), M.straw); rope.rotation.z = Math.PI; rope.scale.y = 0.08; rope.position.set(0.5, 2.9, 0); g.add(rope); for (let i = 0; i < 5; i++) box(0.12, 0.35, 0.01, M.paper, -2.5 + i * 1.5 + 0.5, 2.55, 0, g); at(g, 0, 0, -66); }

  // ---------------------------------------------------------------- the grandfather's house
  const H = { x0: -20, x1: -4, z0: 3, z1: 19 };
  {
    // gable roof along x (ridge over z = 11), deep eaves. The slabs sit on a wall plate above the ceiling (3.05 m), so no tile
    // shows inside the rooms (Issue #4); a board closes the gap between the wall top and the roof on the long sides
    const ridgeY = 5.3, eave = 1.1, wallTop = 3.0, roofBase = 3.42, half = (H.z1 - H.z0) / 2 + eave, rise = ridgeY - roofBase + 0.3;
    const slope = Math.atan2(rise, half), len = Math.hypot(half, rise);
    for (const s of [-1, 1]) { const r = box(H.x1 - H.x0 + 2 * eave, 0.16, len, M.roof, (H.x0 + H.x1) / 2, (roofBase - 0.3 + ridgeY) / 2, 11 + s * half / 2); r.rotation.x = s * slope; }
    for (const z of [H.z0 - 0.06, H.z1 + 0.06]) box(H.x1 - H.x0 + 0.1, roofBase - wallTop + 0.1, 0.1, M.beam, (H.x0 + H.x1) / 2, (wallTop + roofBase) / 2, z);
    // gable ends (triangles)
    const tri = new THREE.Shape(); tri.moveTo(-8, 0); tri.lineTo(8, 0); tri.lineTo(0, ridgeY - wallTop); tri.closePath();
    for (const x of [H.x0, H.x1]) { const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), M.wood); m.rotation.y = Math.PI / 2; m.position.set(x, wallTop, 11); m.material = new THREE.MeshStandardMaterial({ color: 0x4e3d2c, side: THREE.DoubleSide, roughness: 0.95 }); G.add(m); }
    box(H.x1 - H.x0 + 2 * eave + 0.2, 0.22, 0.3, M.beam, (H.x0 + H.x1) / 2, ridgeY + 0.1, 11);
    // stone base and the engawa (veranda) on the east side by the entrance
    box(H.x1 - H.x0 + 0.4, 0.22, H.z1 - H.z0 + 0.4, M.stone, (H.x0 + H.x1) / 2, -0.125, 11);   // its top stays under the floors (it hid them, Issue #4)
    box(1.2, 0.3, 7.5, M.wood, -3.4, 0.15, 15.2); addCol(-4.0, 11.4, -2.8, 13.9, 0, 0.6, { low: true }); addCol(-4.0, 17.3, -2.8, 19, 0, 0.6, { low: true });
    for (const z of [11.6, 18.8]) { cyl(0.08, 0.08, 3.0, M.beam, -2.85, 1.5, z, 8); addCol(-3.0, z - 0.15, -2.7, z + 0.15); }
    // the step stone at the door
    box(1.0, 0.18, 0.7, M.stone, -3.3, 0.09, 15.6);
  }
  // interior doors: paper and wood looks on the standard door panels
  const doorLook = { D_GENKAN: 'wood_cedar_old', D_KATTE: 'wood_dark', D_DAIDOKORO: 'wood_dark', D_NANDO: 'shoji_paper', D_FUSUMA: 'fusuma_old', D_SHOP: 'wood_cedar_old' };
  texReady.then((tex) => { if (!tex) return; for (const [id, t] of Object.entries(doorLook)) { const d = world.doors.get(id); if (d) d.mesh.material = tex.material(t, { size: [1, 2.2] }); } });
  // own textures on the doors (shoji lit from behind, the old fusuma of the north room) and the roof tiles of every roof
  const ownDoor = { D_NANDO: 'shoji_lit', D_FUSUMA: 'fusuma_old_a' };
  Promise.all([texReady, ownReady]).then(() => {
    for (const [id, t] of Object.entries(ownDoor)) own(t, { size: [1, 2.2] }, (m) => { const d = world.doors.get(id); if (d) d.mesh.material = m; });
    own('roof_kawara_ibushi', { triplanar: true }, (m) => ctx.scene.traverse((o) => { if (o.isMesh && o.material === M.roof) o.material = m; }));
    // W13: very large bare footprints, a long stride: under the north window (it stood there all night) and up the morning road.
    // Hidden until the morning (story.js shows api.prints from L4).
    ownReady.then((t) => {
      if (!t || !(t.catalog.textures || []).some((e) => e.id === 'fp_bare_large')) return;
      api.prints = new THREE.Group(); api.prints.visible = false; G.add(api.prints);
      const walk = (path, seed) => { for (const p of trailSteps(path, { stride: 1.15, stepWidth: 0.34, seed })) api.prints.add(t.decal('fp_bare_large', { position: [p.x, 0.025, p.z], normal: [0, 1, 0], up: p.up, w: 0.24, h: 0.46, flip: !p.right })); };
      walk([[-15, -1.6], [-10, 2.2], [-7, 2.2], [-3.6, -1.4]], 13);
      walk([[2.3, 8], [1.5, -8], [2.4, -23]], 29);
    });
    // the salt goes white -> grey -> black (story.js picks the map by how dark a plate is)
    const sm = []; ['salt_white', 'salt_grey', 'salt_black'].forEach((id, i) => own(id, { size: [0.3, 0.3] }, (m) => { sm[i] = m.map; if (sm.filter(Boolean).length === 3) api.saltMaps = sm; }));
  });

  // ---- inside the house and the shop (Issue #4): the standard's look for old Japanese interiors (js/kit/interior-finish.js):
  // tatami with borders, board ceilings, kamoi / skirting / posts, lintels in the wall's clay, wooden shelves and tables, softer pendants
  const fin = finishInterior({ world, plan, tex: texReady });
  const shelf = (...a) => fin.woody(P.shelf({}, ...a)), table = (...a) => fin.woody(P.table({}, ...a));

  // ---- 北の座敷: four salt plates on stands, futon, the clock, the north lattice window
  const plates = {};
  for (const [k, x, z] of [['NW', -10.9, 4.1], ['NE', -5.1, 4.1], ['SW', -10.9, 9.9], ['SE', -5.1, 9.9]]) {
    const g = new THREE.Group(); box(0.42, 0.5, 0.42, M.darkWood, 0, 0.25, 0, g);
    const plate = cyl(0.2, 0.15, 0.04, M.plate, 0, 0.52, 0, 20, g);
    const salt = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.14, 16), M.salt.clone()); salt.position.y = 0.6; salt.visible = false; g.add(salt);
    plates[k] = { group: at(g, x, 0, z), salt, plate };
    addCol(x - 0.22, z - 0.22, x + 0.22, z + 0.22, 0, 0.55, { low: true });
  }
  api.parts.plates = plates;
  { const g = new THREE.Group(); box(1.0, 0.12, 2.0, M.futon, 0, 0.06, 0, g); box(1.0, 0.06, 1.3, M.futonCover, 0, 0.15, 0.3, g); box(0.5, 0.1, 0.28, M.paper, 0, 0.16, -0.75, g); at(g, -8.6, 0, 6.4); }
  {
    const g = new THREE.Group(); box(0.36, 0.6, 0.12, M.darkWood, 0, 0, 0, g);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.14, 24), new THREE.MeshStandardMaterial({ map: canvasTexture(['七'], { w: 256, h: 256, bg: '#e7dfc8', fg: '#8a2b20', size: 120 }) })); face.position.set(0, 0.12, 0.065); g.add(face);
    const hand = box(0.012, 0.1, 0.01, M.beam, 0, 0.16, 0.07, g); hand.geometry.translate(0, 0.04, 0);
    api.parts.clockHand = hand;
    const pend = box(0.03, 0.18, 0.01, M.brass, 0, -0.15, 0.07, g); api.parts.pendulum = pend;
    at(g, -4.12, 2.0, 6.6, -Math.PI / 2);
  }
  {
    // window in the north wall (z = 3): frame, lattice, glass; the newspaper sheets appear when the task is done
    const g = new THREE.Group(); at(g, -8.5, 0, 3.09);
    box(3.0, 0.1, 0.12, M.beam, 0, 0.9, 0, g); box(3.0, 0.1, 0.12, M.beam, 0, 2.3, 0, g);
    for (let i = 0; i <= 6; i++) box(0.05, 1.4, 0.06, M.beam, -1.45 + i * 0.483, 1.6, 0.01, g);
    for (let j = 0; j < 3; j++) box(2.9, 0.04, 0.06, M.beam, 0, 1.25 + j * 0.35, 0.01, g);
    const glass = box(2.9, 1.4, 0.01, new THREE.MeshStandardMaterial({ color: 0x9fb6b2, transparent: true, opacity: 0.25, roughness: 0.1 }), 0, 1.6, -0.02, g); glass.castShadow = false;
    const ptex = canvasTexture(['村の便り', '道路補修のお知らせ', '北の木戸は日没で閉鎖', '次回の集会は公民館'], { w: 512, h: 384, bg: '#d9d0b4', fg: '#3a342a', head: true });
    const papers = new THREE.Group(); papers.visible = false; g.add(papers);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.72), new THREE.MeshStandardMaterial({ map: ptex, roughness: 1 })); s.position.set(-0.98 + i * 0.98, 1.25 + j * 0.7, 0.05); s.rotation.z = (rnd() - 0.5) * 0.04; papers.add(s); }
    api.parts.windowPapers = papers;
    // a shadow behind the glass (a tall figure with a hat) for the night
    const sh = new THREE.Group(); sh.visible = false; g.add(sh);
    const shm = new THREE.MeshBasicMaterial({ color: 0x050707, transparent: true, opacity: 0.0, depthWrite: false });
    const body = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.6), shm); body.position.set(-0.3, 1.2, -0.12); sh.add(body);
    const brim = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), shm); brim.scale.y = 0.18; brim.position.set(-0.3, 2.18, -0.12); sh.add(brim);
    const headm = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), shm); headm.position.set(-0.3, 2.05, -0.12); sh.add(headm);
    api.parts.windowShadow = { group: sh, mat: shm };
  }
  // the talisman on the inside of the fusuma (shown from L3)
  { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.44), new THREE.MeshStandardMaterial({ map: canvasTexture(['身代守'], { w: 128, h: 352, bg: '#ddd0a8', fg: '#4b3025', vertical: true, border: '#7f4935', size: 80 }), roughness: 1 })); t.position.set(-7.6, 1.5, 10.93); t.rotation.y = Math.PI; t.visible = false; G.add(t); api.parts.sealPaper = t; }

  // ---- 居間: low table, cushions, butsudan against the south wall, tokonoma scroll, the pillar with height marks
  { const t = table(1.3, 0.85, 0.34, 0x5a4330); at(t, -8.4, 0, 16.4); addCol(-9.1, 16.0, -7.7, 16.85, 0, 0.4, { low: true });
    for (const [x, z] of [[-9.5, 16.4], [-7.3, 16.4], [-8.4, 17.4]]) box(0.55, 0.08, 0.55, M.cloth, x, 0.04, z); }
  { const g = new THREE.Group(); box(1.1, 1.6, 0.6, M.beam, 0, 0.8, 0, g); box(1.0, 0.04, 0.5, M.brass, 0, 1.0, 0.03, g); box(0.12, 0.3, 0.06, M.darkWood, -0.15, 1.2, 0.0, g); box(0.12, 0.3, 0.06, M.darkWood, 0.15, 1.2, 0.0, g); cyl(0.03, 0.03, 0.12, M.paper, -0.35, 1.08, 0.1, 6, g); cyl(0.03, 0.03, 0.12, M.paper, 0.35, 1.08, 0.1, 6, g); at(g, -11.3, 0, 18.65, Math.PI); addCol(-11.9, 18.3, -10.7, 19, 0, 1.7); }
  { box(0.5, 0.4, 0.4, M.beam, -10.3, 0.2, 18.5); addCol(-10.55, 18.3, -10.05, 18.7, 0, 0.45, { low: true }); }   // the low stand where Ｋさん left the talismans
  { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.4), new THREE.MeshStandardMaterial({ map: canvasTexture(['静'], { w: 180, h: 512, bg: '#ece4cc', fg: '#262018', vertical: true, size: 150, border: '#5c4632' }) })); s.position.set(-9.6, 1.6, 18.9); s.rotation.y = Math.PI; G.add(s); box(1.6, 0.12, 0.6, M.darkWood, -9.6, 0.06, 18.65); }
  { const c = canvasTexture([''], { w: 64, h: 512, bg: '#4b3b2b' }); const g = c.image.getContext('2d'); g.strokeStyle = '#d8c8a8'; g.lineWidth = 3; for (const y of [470, 440, 400, 360, 60]) { g.beginPath(); g.moveTo(8, y); g.lineTo(56, y); g.stroke(); } c.needsUpdate = true; const p = cyl(0.12, 0.12, 3, new THREE.MeshStandardMaterial({ map: c, roughness: 0.9 }), -4.25, 1.5, 12.65, 10); p.rotation.y = Math.PI / 2; addCol(-4.4, 12.5, -4.1, 12.8); }
  // ---- 台所: sink, kamado (stove), work table with the salt, shelves
  { box(1.4, 0.85, 0.6, M.stone, -19.6 + 0.3, 0.42, 14.4).rotation.y = Math.PI / 2; addCol(-19.95, 13.7, -19.35, 15.1, 0, 0.9); }
  { const g = new THREE.Group(); box(1.5, 0.75, 0.9, M.stone, 0, 0.37, 0, g); cyl(0.25, 0.2, 0.2, M.beam, -0.35, 0.85, 0, 12, g); cyl(0.25, 0.2, 0.2, M.beam, 0.35, 0.85, 0, 12, g); at(g, -15.6, 0, 18.5); addCol(-16.4, 18.0, -14.8, 19, 0, 0.9); }
  { const t = table(1.4, 0.7, 0.86, 0x6a5038); at(t, -17.0, 0, 15.2); addCol(-17.7, 14.85, -16.3, 15.55, 0, 0.9, { low: true }); }
  { const s = shelf(1.6, 1.8, 0.4, 3, 'boxes'); at(s, -14.2, 0, 12.65, 0); addCol(-15.0, 12.4, -13.4, 12.9, 0, 1.8); }   // clear of the doors to the store room and the living room (W1)
  // ---- 納戸: shelves of baskets, desks with the newspaper and the photo
  { const s = shelf(1.8, 2.0, 0.45, 5, 'boxes'); at(s, -18.4, 0, 3.3, 0); addCol(-19.3, 3.0, -17.5, 3.55, 0, 2.0); }
  { const t = table(1.2, 0.6, 0.76, 0x5a4330); at(t, -17.0, 0, 7.0); addCol(-17.6, 6.7, -16.4, 7.3, 0, 0.8, { low: true }); }
  { const t = table(0.9, 0.5, 0.76, 0x4e3b2a); at(t, -18.4, 0, 9.55); addCol(-18.85, 9.3, -17.95, 9.8, 0, 0.8, { low: true }); }
  { const g = new THREE.Group(); for (let i = 0; i < 3; i++) box(0.6, 0.45, 0.5, M.straw, (i - 1) * 0.7, 0.22, 0, g); at(g, -14.2, 0, 9.9); addCol(-15.3, 9.6, -13.2, 10.2, 0, 0.5, { low: true }); }

  // ---------------------------------------------------------------- the shed in the back garden (a hiding place)
  { const g = hut(-24.2, 23.4, 3.6, 3.0, Math.PI / 2); for (let i = 0; i < 4; i++) box(0.9, 0.3, 0.3, M.wood, 0.0, 0.15 + i * 0.3, -1.1, g); addCol(-26, 21.6, -25.8, 25.2); }

  // ---------------------------------------------------------------- 夕霧商店
  {
    // the shop and its earth-floored entrance hall (SHOP + SHOP_DOMA) under one roof; the front faces the road at x = -9
    const S0 = { x: -19, z: -18, w: 10, d: 9 }, FX = S0.x + S0.w;
    const half = S0.d / 2 + 0.8, len = Math.hypot(half, 1.4), sl = Math.atan2(1.4, half);
    for (const s of [-1, 1]) { const r = box(S0.w + 1.4, 0.14, len, M.roof, S0.x + S0.w / 2, 3.6, S0.z + S0.d / 2 + s * half / 2); r.rotation.x = s * sl; }
    // a self-lit signboard on the awning (it reads from the road at dusk), an awning, a standing sign and a paper lantern by the door
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshStandardMaterial({ map: canvasTexture(['夕霧商店', '酒・醤油・日用品'], { w: 640, h: 160, bg: '#7a2a20', fg: '#f1e4c4', head: true }), emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.8 }));
    board.material.emissiveMap = board.material.map;
    board.position.set(FX + 1.21, 2.62, -13.5); board.rotation.y = Math.PI / 2; G.add(board);
    box(1.2, 0.08, 4.4, M.roof, FX + 0.6, 2.45, -13.5);
    for (const z of [-15.6, -11.4]) { cyl(0.05, 0.05, 2.45, M.darkWood, FX + 1.15, 1.22, z, 6); addCol(FX + 1.05, z - 0.1, FX + 1.25, z + 0.1); }
    { const st = new THREE.Group(); box(0.5, 1.0, 0.06, M.darkWood, 0, 0.6, 0, st); const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.85), new THREE.MeshStandardMaterial({ map: canvasTexture(['醤油', 'あります'], { w: 160, h: 320, bg: '#e8dcc0', fg: '#6a2018', vertical: true, size: 56 }) })); sp.position.set(0, 0.6, 0.035); st.add(sp); at(st, FX + 2.2, 0, -15.9, Math.PI / 2); addCol(FX + 2.0, -16.2, FX + 2.4, -15.6, 0, 1.1, { low: true }); }
    { const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 14), M.lampGlow); ch.position.set(FX + 1.15, 2.05, -11.75); G.add(ch); const l = new THREE.PointLight(0xffc27a, 8, 9, 1.6); l.position.set(FX + 1.4, 2.0, -12.2); G.add(l); }
    // ---- inside: a village general store (Issue #4: "it did not look like a shop"). Wooden wall shelves full of goods (bottles,
    // cans, packets, boxes) with price strips, a glass showcase counter with the till, a lit drinks cooler by the door, an ice
    // chest, a low display of crates in the middle, things hanging from the beam, posters. The goods are merged into a few
    // meshes (js/kit/prop-batch.js); the labels with words are canvas textures (never inside a generated picture).
    {
      const R = (() => { let q = 9177; return () => ((q = (q * 1664525 + 1013904223) >>> 0) / 4294967296); })();
      const pick = (a) => a[Math.floor(R() * a.length)];
      const GM = [0x6a2a20, 0x2c3f5a, 0x3f5a33, 0xb08a3a, 0x8a7a60, 0x5a3a5a, 0xd8cfb8, 0xa04a2a, 0x2a5a5a].map((c) => mat(c, { roughness: 0.6 }));
      const glassG = mat(0x24361f, { roughness: 0.2, metalness: 0.1 }), glassB = mat(0x4a2a14, { roughness: 0.2, metalness: 0.1 }), tin = mat(0xa8a8a0, { metalness: 0.6, roughness: 0.35 });
      const goods = new THREE.Group();
      // one shelf board (width w, depth d) at local y: runs of one kind of thing, then the next
      const fillBoard = (g, w, d, y) => {
        let x = -w / 2 + 0.04;
        while (x < w / 2 - 0.12) {
          const kind = R(), n = 2 + Math.floor(R() * 4), m = pick(GM);
          for (let i = 0; i < n && x < w / 2 - 0.1; i++) {
            if (kind < 0.25) { const gl = R() < 0.5 ? glassG : glassB; cyl(0.045, 0.045, 0.26, gl, x + 0.05, y + 0.13, 0, 8, g); cyl(0.015, 0.025, 0.1, gl, x + 0.05, y + 0.31, 0, 6, g); box(0.07, 0.08, 0.005, M.paper, x + 0.05, y + 0.12, 0.046, g); x += 0.11; }
            else if (kind < 0.5) { for (let k = 0; k < 2; k++) cyl(0.034, 0.034, 0.12, R() < 0.3 ? tin : m, x + 0.04, y + 0.06 + k * 0.121, 0, 10, g); x += 0.08; }
            else if (kind < 0.75) { const pw = 0.13 + R() * 0.05; box(pw, 0.2 + R() * 0.06, 0.05, m, x + pw / 2, y + 0.12, d / 2 - 0.08, g).rotation.x = -0.12; x += pw + 0.02; }
            else { const bw = 0.16 + R() * 0.08, bh = 0.1 + R() * 0.1; box(bw, bh, d * 0.7, m, x + bw / 2, y + bh / 2, 0, g); x += bw + 0.02; }
          }
          x += 0.04;
        }
      };
      const priceTex = canvasTexture([''], { w: 512, h: 32, bg: '#ece6d4' });
      { const c2 = priceTex.image.getContext('2d'); c2.fillStyle = '#7a2a20'; c2.font = '600 20px serif'; for (let i = 0; i < 7; i++) c2.fillText(`${pick([98, 128, 150, 198, 240, 380, 680])}円`, 12 + i * 72, 23); priceTex.needsUpdate = true; }
      const priceM = new THREE.MeshStandardMaterial({ map: priceTex, roughness: 1 });
      const goodsShelf = (w, h, d, levels, x, z, ry) => {
        const g = new THREE.Group(); at(g, x, 0, z, ry, goods);
        box(w, h, 0.03, M.darkWood, 0, h / 2, -d / 2, g); for (const sx of [-1, 1]) box(0.04, h, d, M.darkWood, sx * (w / 2 - 0.02), h / 2, 0, g);
        for (let i = 0; i < levels; i++) { const y = 0.1 + i * (h - 0.15) / (levels - 1); box(w, 0.03, d, M.wood, 0, y, 0, g); if (i < levels - 1) fillBoard(g, w - 0.08, d, y + 0.015); }
        const tags = new THREE.Group(); at(tags, x, 0, z, ry);
        for (let i = 0; i < levels - 1; i++) { const pm = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, 0.04), priceM); pm.position.set(0, 0.1 + i * (h - 0.15) / (levels - 1), d / 2 + 0.002); tags.add(pm); }
      };
      goodsShelf(3.2, 1.9, 0.45, 5, -13.4, -17.5, 0); addCol(-15.0, -17.75, -11.8, -17.25, 0, 1.9);
      goodsShelf(3.2, 1.9, 0.45, 5, -13.4, -9.5, Math.PI); addCol(-15.0, -9.75, -11.8, -9.25, 0, 1.9);
      goodsShelf(4.6, 2.1, 0.4, 6, -18.75, -13.5, Math.PI / 2); addCol(-19.0, -15.8, -18.5, -11.2, 0, 2.1);   // behind the counter: sake and soy sauce
      // the showcase counter: a wooden base, small goods under a glass top, the till, the soy sauce and batteries put out
      { const g = new THREE.Group(); at(g, -15.9, 0, -13.5, Math.PI / 2, goods);
        box(2.4, 0.62, 0.62, M.darkWood, 0, 0.31, 0, g); box(2.4, 0.04, 0.66, M.wood, 0, 0.64, 0, g);
        for (let i = 0; i < 8; i++) box(0.18, 0.06, 0.12, pick(GM), -1.0 + i * 0.28, 0.69, 0.05, g);
        box(2.4, 0.04, 0.66, M.wood, 0, 0.98, 0, g);
        box(0.34, 0.14, 0.3, M.beam, 0.7, 1.07, 0, g); box(0.3, 0.1, 0.16, M.darkWood, 0.7, 1.18, 0.04, g).rotation.x = -0.5;
        cyl(0.04, 0.06, 0.28, M.cloth, -0.3, 1.14, 0.1, 8, g); box(0.12, 0.06, 0.08, M.brass, 0.3, 1.03, 0.1, g); }
      const glass = box(2.4, 0.28, 0.02, new THREE.MeshStandardMaterial({ color: 0x9fb6b2, transparent: true, opacity: 0.22, roughness: 0.05 }), -15.57, 0.82, -13.5); glass.rotation.y = Math.PI / 2; glass.castShadow = false;
      addCol(-16.25, -14.7, -15.55, -12.3, 0, 1.0);
      // a low display of crates in the middle (vegetables) and a sack of rice
      { const g = new THREE.Group(); at(g, -13.2, 0, -15.6, 0, goods);
        box(1.9, 0.3, 0.5, M.darkWood, 0, 0.15, 0, g);
        for (let i = 0; i < 3; i++) { box(0.55, 0.3, 0.4, M.wood, -0.6 + i * 0.6, 0.45, 0, g); for (let k = 0; k < 5; k++) { const v = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), pick([GM[0], GM[2], GM[3], GM[7]])); v.position.set(-0.6 + i * 0.6 + (R() - 0.5) * 0.36, 0.63, (R() - 0.5) * 0.24); g.add(v); } }
        box(0.45, 0.6, 0.3, M.straw, 1.3, 0.3, 0.05, g); }
      addCol(-14.25, -15.9, -11.75, -15.3, 0, 0.7, { low: true });
      // the ice chest by the entrance
      { const g = new THREE.Group(); at(g, -12.0, 0, -10.6, 0, goods); box(1.1, 0.8, 0.6, mat(0xd8d6cc, { roughness: 0.5 }), 0, 0.4, 0, g); box(1.0, 0.03, 0.5, mat(0x9fb6b2, { roughness: 0.1 }), 0, 0.81, 0, g); }
      addCol(-12.6, -10.95, -11.4, -10.25, 0, 0.85, { low: true });
      goods.removeFromParent(); G.add(mergePlaced([goods], { remove: true }));
      // the drinks cooler: a lit glass front with rows of bottles (kept apart: its glow is emissive)
      { const g = new THREE.Group(); at(g, -11.6, 0, -17.35, 0);
        box(0.8, 1.95, 0.6, mat(0xc8c4b8, { roughness: 0.5 }), 0, 0.975, 0, g);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.4), new THREE.MeshStandardMaterial({ color: 0xdfe8e6, emissive: 0xcfe0e0, emissiveIntensity: 0.55, roughness: 0.2 })); glow.position.set(0, 1.05, 0.301); g.add(glow);
        for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) cyl(0.035, 0.035, 0.22, pick([GM[0], GM[1], GM[2], GM[3], glassG]), -0.25 + i * 0.1, 0.5 + r * 0.33, 0.27, 8, g).castShadow = false;
        const top = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.2), new THREE.MeshStandardMaterial({ map: canvasTexture(['冷たい飲みもの'], { w: 320, h: 96, bg: '#2a4a6a', fg: '#f1e4c4', size: 40 }), emissive: 0xffffff, emissiveIntensity: 0.35 })); top.material.emissiveMap = top.material.map; top.position.set(0, 1.82, 0.302); g.add(top);
        addCol(-12.0, -17.65, -11.2, -17.05, 0, 2.0); }
      // hanging from the beam: brooms, a straw hat, a strip of flypaper; posters on the walls
      for (const [x, z, k] of [[-14.6, -11.0, 'broom'], [-14.2, -11.0, 'broom'], [-13.4, -11.1, 'hat'], [-12.6, -12.8, 'paper']]) {
        if (k === 'broom') { cyl(0.015, 0.015, 1.1, M.wood, x, 2.15, z, 6); cyl(0.1, 0.03, 0.35, M.straw, x, 1.45, z, 8); }
        else if (k === 'hat') { const h = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.14, 14), M.straw); h.position.set(x, 2.35, z); G.add(h); }
        else box(0.04, 0.5, 0.005, mat(0xb8a050), x, 2.5, z);
      }
      const poster = (lines, o, x, y, z, ry, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: canvasTexture(lines, o), roughness: 1 })); m.position.set(x, y, z); m.rotation.y = ry; G.add(m); };
      poster(['たばこ'], { w: 128, h: 320, bg: '#b8302a', fg: '#f4ecdc', vertical: true, size: 80 }, -18.9, 2.5, -15.95, Math.PI / 2, 0.22, 0.55);
      poster(['氷'], { w: 256, h: 256, bg: '#f2efe6', fg: '#2a4a8a', size: 170 }, -12.0, 2.15, -9.27, Math.PI, 0.45, 0.45);
      poster(['お酒', '一升瓶', 'あります'], { w: 256, h: 340, bg: '#e8dcc0', fg: '#2a2018', head: true }, -17.4, 2.45, -17.9, 0, 0.4, 0.53);
    }
    const l = new THREE.PointLight(0xffc57a, 10, 12, 1.5); l.position.set(-14.5, 2.6, -13.5); G.add(l); api.parts.shopLight = l;
    // outside: a noren over the door and a drinks vending machine against the front wall (it glows at dusk)
    { const nm = new THREE.MeshStandardMaterial({ map: canvasTexture(['商'], { w: 256, h: 160, bg: '#26324a', fg: '#efe6d2', size: 110 }), side: THREE.DoubleSide, roughness: 1 });
      const plain = new THREE.MeshStandardMaterial({ color: 0x26324a, side: THREE.DoubleSide, roughness: 1 });
      for (let i = 0; i < 3; i++) { const n = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.55), i === 1 ? nm : plain); n.position.set(FX + 0.06, 1.95, -14.04 + i * 0.54); n.rotation.y = Math.PI / 2; G.add(n); } }
    { const vm = E.vendingMachine({}); at(vm, FX + 0.42, 0, -10.6, Math.PI / 2); addCol(FX + 0.05, -11.05, FX + 0.8, -10.15, 0, 1.9); }
    // barrels by the wall outside (a hiding place, plan.hides H_SHOPSIDE)
    for (const [x, z] of [[-6.9, -17.5], [-6.2, -17.6]]) { cyl(0.32, 0.3, 0.9, M.wood, x, 0.45, z, 12); }
    addCol(-7.25, -17.95, -5.85, -17.25, 0, 0.95, { low: true });
  }

  // ---------------------------------------------------------------- the roadside shrine and torii
  {
    const g = new THREE.Group(); at(g, 12, 0, -14.4);
    for (const x of [-1.6, 1.6]) for (const z of [-0.9, 0.9]) cyl(0.08, 0.08, 2.2, M.darkWood, x, 1.1, z, 8, g);
    box(3.4, 1.8, 0.1, M.wood, 0, 1.1, -0.9, g); const rf = box(4.0, 0.12, 2.6, M.roof, 0, 2.35, 0, g); rf.rotation.x = 0.05;
    box(0.9, 0.9, 0.6, M.darkWood, 0, 1.25, -0.5, g); box(0.4, 0.5, 0.02, M.paper, 0, 1.3, -0.19, g);
    box(1.4, 0.8, 0.6, M.wood, -0.4, 0.4, 1.35, g);
    addCol(10.2, -15.5, 13.8, -13.4, 0, 2.3); addCol(10.9, -13.35, 12.3, -12.75, 0, 0.9, { low: true });
    const t = new THREE.Group(); at(t, 12, 0, -8.2);
    for (const x of [-2.4, 2.4]) { cyl(0.16, 0.18, 3.3, M.red, x, 1.65, 0, 10, t); addCol(12 + x - 0.2, -8.4, 12 + x + 0.2, -8.0); }
    box(5.8, 0.2, 0.3, M.red, 0, 3.25, 0, t); box(5.2, 0.14, 0.2, M.red, 0, 2.7, 0, t); box(6.4, 0.12, 0.4, M.beam, 0, 3.42, 0, t);
    const rope = cyl(0.06, 0.06, 4.6, M.straw, 0, 2.5, 0, 8, t); rope.rotation.z = Math.PI / 2;
    for (let i = 0; i < 4; i++) box(0.1, 0.32, 0.01, M.paper, -1.5 + i, 2.25, 0.05, t);
  }

  // ---------------------------------------------------------------- the north gate of the farm road (D_GATE) and its notice
  {
    const d = world.doors.get('D_GATE'); if (d) d.mesh.material = M.hidden;
    const g = new THREE.Group(); at(g, 0.5, 0, -24);
    for (const x of [-3.3, 3.3]) { box(0.3, 2.6, 0.3, M.darkWood, x, 1.3, 0, g); addCol(0.5 + x - 0.2, -24.2, 0.5 + x + 0.2, -23.8); }
    box(7.2, 0.2, 0.3, M.darkWood, 0, 2.6, 0, g);
    const leaf = (sx) => { const pivot = new THREE.Group(); pivot.position.set(sx * 3.1, 0, 0); g.add(pivot); const w = 3.05; for (const y of [0.4, 1.4]) box(w, 0.1, 0.08, M.wood, -sx * w / 2, y, 0, pivot); for (let i = 0; i < 6; i++) box(0.08, 1.4, 0.06, M.wood, -sx * (0.25 + i * 0.52), 0.9, 0, pivot); return pivot; };
    api.parts.gate = { left: leaf(-1), right: leaf(1), open: 0 };
    // the box of the three turn-buttons on its post by the gate (feedback 2026-11-01: "put a box where it opens, so the gimmick reads"):
    // an iron box with three round dials and an arrow each (story.js turns the arrows with the puzzle), under a small lamp
    { const bx0 = new THREE.Group(); at(bx0, -1.6, 0, -23.45);
      cyl(0.06, 0.07, 1.1, M.darkWood, 0, 0.55, 0, 8, bx0);
      const iron = mat(0x3a3c3a, { metalness: 0.6, roughness: 0.45 });
      box(0.78, 0.36, 0.16, iron, 0, 1.22, 0, bx0); box(0.84, 0.05, 0.22, M.roof, 0, 1.43, 0, bx0);
      const dials = [];
      for (let i = 0; i < 3; i++) {
        const d = new THREE.Group(); d.position.set(-0.24 + i * 0.24, 1.22, 0.085); bx0.add(d);
        const face = cyl(0.085, 0.085, 0.03, M.brass, 0, 0, 0, 16, d); face.rotation.x = Math.PI / 2;
        const arrow = box(0.025, 0.11, 0.012, M.beam, 0, 0.035, 0.02, d); void arrow;
        dials.push(d);
      }
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.12), new THREE.MeshStandardMaterial({ map: canvasTexture(['東　南　北'], { w: 512, h: 88, bg: '#2a2622', fg: '#e8dcc0', size: 50 }), roughness: 0.9 }));
      tag.position.set(0, 1.07, 0.082); bx0.add(tag);
      const glow = new THREE.PointLight(0xffd8a0, 2.2, 3.2, 1.6); glow.position.set(0, 1.7, 0.5); bx0.add(glow);
      api.parts.gateDials = dials; }
    const notice = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), new THREE.MeshStandardMaterial({ map: canvasTexture(['三つの回し金', '朝日・正午・地蔵', '東・南・北'], { w: 256, h: 340, bg: '#ddd3b6', fg: '#2e2820', head: true }), roughness: 1 }));
    notice.position.set(-3.3 + 0.5, 1.5, -23.82); G.add(notice);
  }
  // fences along the far road (seen from the van) and the van itself
  for (const s of [-1, 1]) for (let z = -48; z > -140; z -= 6) { const f = E.fence({ kind: 'rail', len: 6, h: 0.8 }); at(f, 0.5 + s * 3.8, 0, z - 3, Math.PI / 2); }
  {
    // the kit's van with its inside for the ride (standard 1.7); turned to face north (-z), so its right-hand seats are on +x
    const van = E.car({ kind: 'van', color: 0x3a514a, interior: true }); van.name = 'van'; at(van, 0.5, 0, -34.6, Math.PI); api.parts.van = van;
    api.parts.vanInside = van.userData.interior; api.parts.vanShell = van.userData.shell; api.parts.vanSeats = van.userData.seats;
    addCol(-0.45, -37.0, 1.45, -32.2, 0, 2.0);
    // where to get in (feedback 2026-11-01: "hard to see where to board"): the side door slid open on the +x side, the lit inside showing
    // through it, a step, and a pale square on the ground where to stand (api.parts.boarding: hidden once aboard)
    { const bd = new THREE.Group(); bd.name = 'boarding'; G.add(bd); api.parts.boarding = bd;
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.25), new THREE.MeshStandardMaterial({ color: 0x1c1a16, emissive: 0x6a5232, emissiveIntensity: 0.55, roughness: 1 }));
      hole.position.set(1.37, 1.05, -34.2); hole.rotation.y = Math.PI / 2; bd.add(hole);
      box(0.04, 1.3, 0.95, mat(0x3a514a, { metalness: 0.5, roughness: 0.35 }), 1.42, 1.05, -33.1, bd);   // the slid-back door
      box(0.35, 0.12, 0.9, M.stone, 1.6, 0.06, -34.2, bd);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.22, depthWrite: false }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(2.1, 0.03, -34.2); bd.add(pad); api.parts.boardPad = pad;
      const inl = new THREE.PointLight(0xffc98a, 3.5, 4, 1.6); inl.position.set(0.9, 1.5, -34.2); bd.add(inl); }
    const hl = new THREE.SpotLight(0xffe2a4, 30, 30, 0.5, 0.6, 1.2); hl.position.set(0.5, 0.8, -37); hl.target.position.set(0.5, 0, -52); G.add(hl, hl.target); api.parts.vanLight = hl;
  }

  // the map board by the entrance (TH_MAPBOARD) and the shop's notice (TH_SHOPNOTE)
  { const g = new THREE.Group(); for (const dz of [-0.6, 0.6]) cyl(0.04, 0.04, 1.6, M.darkWood, 0, 0.8, dz, 6, g); const mp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.86), new THREE.MeshStandardMaterial({ map: new THREE.TextureLoader().load('assets/photos/route-map.webp', (t) => { t.colorSpace = THREE.SRGBColorSpace; }), roughness: 0.9 })); mp.position.set(0.03, 1.25, 0); mp.rotation.y = Math.PI / 2; g.add(mp); box(0.05, 0.95, 1.3, M.darkWood, -0.01, 1.25, 0, g); at(g, -2.45, 0, 17.6); addCol(-2.55, 16.9, -2.35, 18.3, 0, 1.7); }
  { const n = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), new THREE.MeshStandardMaterial({ map: canvasTexture(['お知らせ', '夕方以降、畑の先で', '妙な声を聞いた方は', '真似をせず、まっすぐ', '帰宅してください', '区長'], { w: 300, h: 400, bg: '#e2d9bd', fg: '#2e2820', head: true }), roughness: 1 })); n.position.set(-9.1, 1.35, -11.0); n.rotation.y = -Math.PI / 2; G.add(n); }
  // the village's missing (feedback 2026-11-01): a faded 尋ね人 poster on the shop front (TH_MISSING), a newspaper clipping inside the
  // doma (TH_CLIPPING), and a moss-grown memorial stone by the shrine with the years they went (TH_STONE)
  { const paper = (lines, o) => new THREE.MeshStandardMaterial({ map: canvasTexture(lines, o), roughness: 1 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.64), paper(['尋ね人', '佐伯みつ子（十六）', '昭和四十七年八月十四日', '北の農道付近で', '白い服の背の高い女の人と', 'お心当たりの方は駐在所へ'], { w: 300, h: 420, bg: '#cfc6a6', fg: '#3a2e24', head: true }));
    p.position.set(-8.9, 1.45, -17.0); p.rotation.y = Math.PI / 2; p.rotation.z = 0.03; G.add(p);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.3), paper(['帰省中の男児', '行方不明', '祖父母宅近くの農道で', '一九九八年八月'], { w: 300, h: 250, bg: '#d6cba8', fg: '#2a2420', head: true }));
    c.position.set(-10.0, 1.5, -17.88); c.rotation.y = 0; c.rotation.z = -0.04; G.add(c);
    const g = new THREE.Group(); at(g, 7.4, 0, -9.6, Math.PI * 0.85);
    box(1.1, 0.22, 0.7, M.stone, 0, 0.11, 0, g);
    const slab = box(0.55, 1.45, 0.2, M.stone, 0, 0.94, -0.05, g); slab.rotation.z = 0.025;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.2), new THREE.MeshStandardMaterial({ map: canvasTexture(['行方知れずの者之を祀る'], { w: 128, h: 400, bg: '#5d6258', fg: '#2a2c26', vertical: true, size: 34 }), roughness: 1 }));
    face.position.set(0, 0.98, 0.052); face.rotation.z = 0.025; g.add(face);
    box(0.57, 0.25, 0.22, M.moss, 0, 0.32, -0.05, g);   // moss creeping up the foot
    cyl(0.04, 0.04, 0.26, M.wood, 0.36, 0.35, 0.22, 8, g); for (let i = 0; i < 3; i++) box(0.05, 0.05, 0.05, mat([0xd8d4c0, 0x9a5a7a, 0xd0b050][i]), 0.34 + i * 0.03, 0.5, 0.2 + i * 0.02, g);
    addCol(6.85, -10.1, 7.95, -9.1, 0, 1.7); }

  // ---------------------------------------------------------------- people (standard characters)
  const person = (o, x, z, ry) => { const c = makeCharacter({ blob: true, ...o }); c.root.traverse((m) => { if (m.isMesh && m.name !== 'blob') m.castShadow = true; }); at(c.root, x, 0, z, ry); c.set('idle'); return c; };
  api.people.grandpa = person({ old: true, coat: 0x4c4a40, trousers: 0x3a3a36, shirt: 0xd8d4c4, hair: 0xb8b4a8, hairStyle: 'short', build: -0.3, outfit: 'shirt' }, -6.4, 16.6, -Math.PI / 2);
  api.people.k = person({ female: true, coat: 0x2f3438, skirt: 0x3a3a3e, shirt: 0xe0ddd2, hair: 0x2a2624, hairStyle: 'bob', build: -0.2, old: true }, -10.6, 15.0, Math.PI / 2);
  api.people.k.root.visible = false;
  api.people.lady = person({ female: true, old: true, coat: 0x6a5a48, shirt: 0xd8cdb0, skirt: 0x4a4038, hair: 0x5a5450, hairStyle: 'bob', build: 0.4 }, -17.2, -13.5, Math.PI / 2);
  api.people.driver = person({ female: true, coat: 0x2f3438, shirt: 0xe0ddd2, skirt: 0x3a3a3e, hair: 0x2a2624, hairStyle: 'bob', old: true, detail: 1 }, 0.05, -35.2, 0);
  api.people.driver.set('sit'); api.people.driver.root.position.y = 0.25; api.people.driver.root.visible = false;
  addCol(-6.75, 16.25, -6.05, 16.95, 0, 1.7).tag = 'grandpa';
  api.updatePeople = (dt, cam) => { for (const p of Object.values(api.people)) if (p.root.visible) { const d = p.root.position.distanceTo(cam.position); if (d < 6 && p !== api.people.driver) p.lookAt(cam); else p.lookAt(null); p.update(dt); } };

  // ---------------------------------------------------------------- stations and pickups: the console boxes become the things themselves
  for (const s of plan.stations) { const m = world.group.getObjectByName(`station:${s.id}`); if (!m) continue; const c = colOf(m); if (c) c.off = true; m.material = M.hidden; }
  // pickups are the kit's item models (items / docs "kind", resting on their "y"); the gate notice stands upright on its post
  for (const o of world.interactables) {
    const ui = o.userData && o.userData.interact;
    if (ui && ui.kind === 'doc' && ui.id === 'N_NOTICE') { o.rotation.x = Math.PI / 2; o.scale.setScalar(1.6); o.position.z = -23.72; }
  }
  // every plain material gets a light texture from the shared catalog (Issue #4: "put a texture on basically everything"): world-space
  // (triplanar) mapping, so the boxes and cylinders need no UVs; the colour stays as a tint
  texReady.then((tex) => {
    if (!tex) return;
    const has = (id) => (tex.catalog.textures || []).some((e) => e.id === id);
    const look = new Map([[M.wood, ['wood_cedar_old', 1.0, 0xc8b8a0]], [M.darkWood, ['wood_dark', 0.8, 0xb0a090]], [M.beam, ['wood_dark', 0.8, 0x908070]], [M.pole, ['wood_worn_grey', 1.2, 0xd0ccc4]],
      [M.stone, ['stone_wall', 1.2, 0xd8d8d0]], [M.moss, ['moss', 1.0, 0xffffff]], [M.hedge, ['moss', 0.8, 0x7a9a6a]], [M.straw, ['burlap', 0.5, 0xe8d49a]], [M.paper, ['washi_paper', 0.5, 0xffffff]], [M.red, ['wood_worn_grey', 1.0, 0xc05040]],
      [M.futon, ['linen_white', 0.6, 0xe8e0cc]], [M.futonCover, ['wool_grey', 0.6, 0x9a9488]], [M.cloth, ['wool_grey', 0.5, 0x9a5040]]]);   // the shared catalog (game-kit #2): stone wall, burlap, linen, wool
    const made = new Map();
    for (const [m0, [id, scale, tint]] of look) if (has(id)) { const m = tex.material(id, { triplanar: scale }); m.color.set(tint); made.set(m0, m); }
    ctx.scene.traverse((o) => { if (o.isMesh && made.has(o.material)) o.material = made.get(o.material); });
  });
  // the outside faces of the house and shop walls are charred cedar boards (yakisugi), the inside stays clay (feedback 2026-11-01:
  // "the house walls have no texture": clay_wall was nearly flat, and the outside showed the same plaster as the rooms)
  // (run once the recipes have put the room's clay on the walls: story.js calls api.dressOuterWalls() before the shaders are compiled)
  api.dressOuterWalls = () => texReady.then((tex) => {
    if (!tex || api.outerDone || !(tex.catalog.textures || []).some((e) => e.id === 'wall_yakisugi')) return;
    api.outerDone = true;
    const outM = tex.material('wall_yakisugi', { triplanar: 1 }); outM.color.set(0xffffff); if (outM.emissive) outM.emissive.set(0x0c0a08);
    dressOuterWalls(ctx, outM);   // kit js/outer-walls.js: the faces that look onto the yard
  });
  // every texture (the kit's and ours) is on its mesh: the boot step in story.js pre-compiles the shaders after this
  api.ready = Promise.all([texReady, ownReady]).then(() => new Promise((r) => setTimeout(r, 50)));
  return api;
}
