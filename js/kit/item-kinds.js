/* game-kit 08f1905: js/item-kinds.js — edit in game-kit and run tools/kit-sync.js */
// Item kinds (standard 1.7, "置くだけ"): an item or a document with a `kind` is shown as a model of that thing instead of a coloured box,
// resting on what is under it (a desk, a shelf board, the floor; W3), slightly larger than life so it reads from 1-3 m (W11).
//   items.json  { "id": "I1", "kind": "key", "room": "R1", "x": 2, "z": 3 }              -> a key on the desk at (2, 3)
//   docs.json   { "id": "N1", "room": "R1", "x": 1, "z": 1 }                            -> a sheet of paper (docs default to "paper")
//   either: "y" (the support height) and "scale" override; ext can still replace the look (the pickup mesh is named item:<id> / doc:<id>).
// makeItemModel(kind, o) -> THREE.Group with its origin at the bottom centre (y = 0 rests on the surface); ITEM_KINDS lists the kinds.
// supportY(colliders, x, z, floorY, maxH) is pure: the highest collider top under (x, z) that a hand could reach (default <= 1.4 m).
import * as THREE from 'three';
import * as IM from './item-models.js';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
const box = (g, w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); b.castShadow = true; g.add(b); return b; };
const cyl = (g, r0, r1, h, m, x = 0, y = 0, z = 0, seg = 16) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); c.position.set(x, y + h / 2, z); c.castShadow = true; g.add(c); return c; };
const grp = (f) => (o = {}) => { const g = new THREE.Group(); f(g, o); return g; };

// each: a function (o) -> Group (origin at the bottom) and a label (for docs / tools)
export const ITEM_KINDS = {
  key: { label: '鍵', make: (o) => IM.key(o) },
  card: { label: 'カード・社員証', make: (o) => IM.idCard(o) },
  paper: { label: '紙・メモ・手紙', make: (o) => IM.paperSheet(o) },
  clipboard: { label: '書類ばさみ', make: (o) => IM.clipboard(o) },
  book: { label: '本・帳面・日誌', make: (o) => IM.book(o) },
  photo: { label: '写真立て', make: (o) => IM.photoFrame(o) },
  tag: { label: '札・タグ', make: (o) => IM.tag(o) },
  tape: { label: 'テープ・ロール', make: (o) => IM.roll(o) },
  talisman: { label: 'お札', make: grp((g, o) => { for (let i = 0; i < (o.n ?? 1); i++) { const p = box(g, 0.07, 0.003, 0.2, mat(o.color ?? 0xdccfa6, { roughness: 1 }), i * 0.085 - (o.n ? 0.04 : 0), i * 0.003); p.rotation.y = i * 0.08; } }) },
  bag: { label: '袋（塩・米）', make: grp((g, o) => { const b = box(g, 0.24, 0.3, 0.14, mat(o.color ?? 0xe8e2d0, { roughness: 1 })); b.scale.set(1, 1, 1); box(g, 0.2, 0.04, 0.12, mat(o.color ?? 0xe0d8c4, { roughness: 1 }), 0, 0.3); }) },
  bottle: { label: '瓶', make: grp((g, o) => { const m = mat(o.color ?? 0x3a2a1c, { roughness: 0.2, metalness: 0.1 }); cyl(g, 0.04, 0.04, 0.2, m); cyl(g, 0.015, 0.04, 0.06, m, 0, 0.2); cyl(g, 0.016, 0.016, 0.03, mat(0xa83a2a), 0, 0.26); }) },
  box: { label: '箱', make: grp((g, o) => { box(g, o.w ?? 0.16, o.h ?? 0.12, o.d ?? 0.16, mat(o.color ?? 0x5a4030)); }) },
  phone: { label: '携帯電話', make: grp((g, o) => { box(g, 0.05, 0.016, 0.1, mat(o.color ?? 0x2a2c30, { roughness: 0.4 })); }) },
  flashlight: { label: '懐中電灯', make: grp((g, o) => { const c = cyl(g, 0.022, 0.022, 0.18, mat(o.color ?? 0x2a2a2a, { metalness: 0.5 }), 0, 0.022); c.rotation.z = Math.PI / 2; c.position.y = 0.022; const h = cyl(g, 0.032, 0.026, 0.05, mat(0x444444, { metalness: 0.6 }), 0.1, 0.022); h.rotation.z = Math.PI / 2; h.position.y = 0.032; }) },
  tool: { label: '工具', make: grp((g, o) => { box(g, 0.2, 0.02, 0.03, mat(o.color ?? 0x7a7e84, { metalness: 0.7, roughness: 0.4 })); box(g, 0.04, 0.02, 0.06, mat(o.color ?? 0x7a7e84, { metalness: 0.7, roughness: 0.4 }), 0.1); }) },
  cloth: { label: '布', make: grp((g, o) => { box(g, 0.3, 0.03, 0.22, mat(o.color ?? 0xd8d2c0, { roughness: 1 })); }) },
  jar: { label: '壺・缶', make: grp((g, o) => { cyl(g, 0.06, 0.07, 0.14, mat(o.color ?? 0x8a7a60, { roughness: 0.6 }), 0, 0, 0, 18); }) },
  battery: { label: '電池', make: grp((g, o) => { for (let i = 0; i < (o.n ?? 4); i++) { const c = cyl(g, 0.007, 0.007, 0.05, mat(i % 2 ? 0x2a2a2a : 0xb08a3a, { metalness: 0.5 }), i * 0.016 - 0.024, 0.007); c.rotation.z = Math.PI / 2; } }) },
};
export const DOC_KIND = 'paper';

// a model of the kind, origin at the bottom centre, scaled up a little (W11: small things are placed larger than life)
export function makeItemModel(kind, o = {}) {
  const k = ITEM_KINDS[kind];
  if (!k) return null;
  const g = k.make(o);
  const b = new THREE.Box3().setFromObject(g);
  if (!b.isEmpty()) { const c = b.getCenter(new THREE.Vector3()); g.children.forEach((ch) => { ch.position.x -= c.x; ch.position.z -= c.z; ch.position.y -= b.min.y; }); }
  const s = o.scale ?? 1.35;
  const wrap = new THREE.Group(); wrap.add(g); g.scale.setScalar(s); wrap.name = `kind:${kind}`;
  wrap.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return wrap;
}

// the surface a thing at (x, z) rests on: the highest collider top under it at most maxH above the floor (desks, tables, shelf tops), else the floor (pure)
export function supportY(colliders, x, z, floorY = 0, maxH = 1.4) {
  let y = floorY;
  for (const c of colliders || []) {
    if (c.off) continue;
    const b = c.box, mn = b.min, mx = b.max;
    if (x < mn.x || x > mx.x || z < mn.z || z > mx.z) continue;
    const top = mx.y;
    if (top > floorY + 0.02 && top <= floorY + maxH && top > y && mn.y <= floorY + 0.3) y = top;
  }
  return y;
}

// table and desk tops in a room (pure): low colliders (0.5-1.2 m above the floor) at least 0.3 m wide, inside the room, largest first
export function topsIn(colliders, room, floorY = 0) {
  const out = [];
  for (const c of colliders || []) {
    if (c.off) continue;
    const b = c.box, h = b.max.y - floorY, w = b.max.x - b.min.x, d = b.max.z - b.min.z;
    if (h < 0.5 || h > 1.2 || w < 0.3 || d < 0.3 || b.min.y > floorY + 0.3) continue;
    const x = (b.min.x + b.max.x) / 2, z = (b.min.z + b.max.z) / 2;
    if (x < room.x || x > room.x + room.w || z < room.z || z > room.z + room.d) continue;
    out.push({ x, z, y: b.max.y, area: w * d });
  }
  return out.sort((a, b) => b.area - a.area);
}
