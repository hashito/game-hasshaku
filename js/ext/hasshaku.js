// 八尺様 built from the standard character (js/kit/character.js): a woman about 2.7 m tall in a long off-white dress,
// long black hair and a wide straw hat with a pale ribbon. The monster pack (js/kit/monster-std.js) creates its look by name;
// the plan's monster uses "dark-red-mist" (the only person look the schema allows), which this game replaces with this one.
// Kit feedback: a registerLook(name, fn) API so a game can add a look without replacing a built-in one (docs/kit-feedback.md).
import * as THREE from 'three';
import { makeCharacter } from '../kit/character.js';
import { LOOKS } from '../kit/monster-looks.js';

export const HEIGHT = 2.72;   // metres to the top of the head (the hat adds ~0.12)

export function makeHasshaku(o = {}) {
  const c = makeCharacter({
    female: true, scale: HEIGHT / 1.66, legs: 1.12, build: -0.85, detail: o.detail ?? 2,
    coat: 0xdcd9c8, shirt: 0xe4e1d2, skirt: 0xd5d2c0, stockings: 0xbfc2b4, shoes: 0x1b1a18,
    skin: 0xc9cbbd, hair: 0x0f1211, hairStyle: 'long', outfit: 'shirt', sleeves: 'long', lip: 0x5a4a48, eyes: 0x1a1a1a, blob: true,
  });
  const root = c.root;
  root.name = 'hasshaku';
  // the hat: a wide, slightly drooping brim, a low crown, a pale ribbon. Hung on the head bone so it follows every nod.
  const head = c.bones && c.bones.head;
  const hat = new THREE.Group(); hat.name = 'hat';
  const straw = new THREE.MeshStandardMaterial({ color: 0xe6e0c8, roughness: 0.95, side: THREE.DoubleSide });
  const ribbon = new THREE.MeshStandardMaterial({ color: 0xcfc9b4, roughness: 0.8 });
  const brimGeo = new THREE.CylinderGeometry(0.27, 0.3, 0.012, 40, 1, true);
  const brimTop = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.3, 40), straw); brimTop.rotation.x = -Math.PI / 2;
  const pos = brimTop.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); pos.setZ(i, -Math.max(0, r - 0.12) * 0.28); }   // the brim droops at the edge
  brimTop.geometry.computeVertexNormals();
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.088, 0.075, 28), straw); crown.position.y = 0.04;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.022, 28, 1, true), ribbon); band.position.y = 0.012;
  hat.add(brimTop, crown, band); void brimGeo;
  hat.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  if (head) { hat.position.set(0, 0.105, -0.005); hat.rotation.x = 0.08; head.add(hat); }
  else { hat.position.y = HEIGHT + 0.02; root.add(hat); }
  // the long off-white dress, from the waist to the ankles (the standard skirt stops at the knee); legs move inside it
  const dressMat = new THREE.MeshStandardMaterial({ color: 0xd8d5c4, roughness: 0.95, side: THREE.DoubleSide });
  const prof = [[0.2, 1.0], [0.21, 0.92], [0.25, 0.6], [0.3, 0.3], [0.33, 0.1], [0.34, 0.06]].map(([r, y]) => new THREE.Vector2(r, y));
  const dressGeo = new THREE.LatheGeometry(prof, 32);
  const dp = dressGeo.attributes.position;
  for (let i = 0; i < dp.count; i++) { const x = dp.getX(i), z = dp.getZ(i), y = dp.getY(i), a = Math.atan2(z, x), k = 1 + Math.sin(a * 11 + y * 3) * 0.035 * (1 - y); dp.setX(i, x * k); dp.setZ(i, z * k); }
  dressGeo.computeVertexNormals();
  const dress = new THREE.Mesh(dressGeo, dressMat); dress.name = 'dress'; dress.castShadow = true;
  dress.scale.set(1, 1, 0.82); root.add(dress);
  root.traverse((m) => { if (m.isMesh && m.name !== 'blob') m.castShadow = true; });
  return { root, character: c, hat, dress };
}

// the look contract of monster-std: { root, update(dt, st, cam), respawn(), dispose() }
export function hasshakuLook() {
  const h = makeHasshaku();
  const root = h.root, c = h.character;
  root.visible = false;
  const S = { t: 0 };
  return {
    kind: 'hasshaku', root, character: c,
    update(dt, st, cam) {
      root.visible = !!st.visible;
      if (!root.visible) return;
      S.t += dt;
      root.position.set(st.pos.x, st.floorY || 0, st.pos.z);
      let d = st.yaw - root.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      root.rotation.y += d * Math.min(1, dt * 4);
      // she looks at you once she has seen you, and the head leans a little too far
      c.lookAt(st.state === 'chase' || st.state === 'lose' || st.state === 'near' ? cam : null);
      if (!st.moving) c.setSpeed(0); else c.setSpeed(null);
      c.update(dt);
      if (c.bones && c.bones.head) c.bones.head.rotation.z += Math.sin(S.t * 0.9) * 0.12 + (st.state === 'chase' ? 0.22 : 0.06);
    },
    respawn() {},
    dispose() { root.removeFromParent(); },
  };
}

export function installLook() { LOOKS['dark-red-mist'] = hasshakuLook; }
