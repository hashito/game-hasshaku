/* game-kit 3f1a7d2: js/recipes.js — edit in game-kit and run tools/kit-sync.js */
// The recipes of the standard, switched on from game.json "recipes" (standard 1.5; pure side + docs in js/recipes-data.js):
//   props       plan.furniture[] { kind, x, z, rot, args, opts } -> js/props.js / js/env-props.js objects in the world, with colliders
//   openables   props with userData.drawers (lockers, fridges, cabinets): [E] opens / closes, the state is saved (ext.openables)
//   textures    js/texture-library.js: plan.rooms[].floorTex / wallTex dress the floors and walls
//   ambience    js/ambience.js: outdoor beds that go quiet and muffled behind doors (model from the plan), started with the first sound
// game-core imports this module only when game.json has "recipes" (loadGame), kit-sync copies what each switch needs (tools/kit-features.cjs).
import { PROP_KINDS, furnitureOf, ambienceModelFromPlan } from './recipes-data.js';

export async function installRecipes(ctx, cfg = {}) {
  const mods = {};   // the parts are imported only for the switches that are on
  if (cfg.props || cfg.openables) { mods.P = await import('./props.js'); mods.E = await import('./env-props.js'); mods.propColliders = (await import('./prop-batch.js')).propColliders; }
  if (cfg.openables) mods.Openables = (await import('./openables.js')).Openables;
  if (cfg.textures) mods.TextureLibrary = (await import('./texture-library.js')).TextureLibrary;
  if (cfg.ambience) mods.Ambience = (await import('./ambience.js')).Ambience;
  const { P, E, propColliders } = mods;
  const { world, bus, ext } = ctx;
  const plan = ctx.data.plan;
  const api = { props: new Map() };
  ctx.recipes = api;

  // ---- props ----
  if (cfg.props || cfg.openables) {
    const T = {};
    let op = null;
    if (cfg.openables && mods.Openables) op = api.openables = ctx.openables = new mods.Openables({ onChange: (id, open) => { const o = api.props.get(id); const pos = o && o.position; ctx.audio && ctx.audio.at && ctx.sound && ctx.audio.at(pos).lockerDoor && ctx.audio.at(pos).lockerDoor(pos, open); bus.emit('openable:change', { id, open }); } });
    for (const f of furnitureOf(plan)) {
      const k = PROP_KINDS[f.kind];
      if (!k) { console.warn(`recipes.props: unknown kind "${f.kind}" (${f.id})`); continue; }
      const fn = (k.from === 'P' ? P : E)[f.kind];
      if (typeof fn !== 'function') continue;
      let obj;
      try { obj = k.from === 'P' ? (k.t ? fn(T, ...(f.args || [])) : fn(...(f.args || []))) : fn({ w: f.w, d: f.d, ...(f.opts || {}) }); } catch (e) { console.warn(`recipes.props: ${f.id} (${f.kind}): ${e.message}`); continue; }
      obj.name = `prop:${f.id}`;
      obj.rotation.y = ((f.rot || 0) * Math.PI) / 180;
      world.place(obj, f.room, f.x, f.z);
      api.props.set(f.id, obj);
      if (cfg.props) world.colliders.push(...propColliders(obj));
      if (op && obj.userData && obj.userData.drawers && obj.userData.drawers.length) {
        try { op.add(f.id, obj); obj.userData.interact = { kind: 'openable', id: f.id }; world.interactables.push(obj); } catch { /* nothing opens */ }
      }
    }
    if (op) {
      ext.registerInteract('openable', { prompt: (o) => (op.isOpen(o.id) ? '[E] 閉める' : '[E] 開ける'), run: (o) => { const r = op.toggle(o.id); if (typeof r === 'string') ctx.ui.say(r); } });
      ext.registerPersist('openables', { serialize: () => op.state(), restore: (j) => op.restore(j || {}) });
      ctx.systems.push({ id: 'openables', def: { update: (dt) => op.update(dt) }, inst: null });
    }
  }

  // ---- textures ----
  if (cfg.textures && mods.TextureLibrary) {
    const base = typeof cfg.textures === 'string' ? cfg.textures : 'assets/textures/';
    try {
      const tex = api.textures = ctx.textures = await mods.TextureLibrary.load(base, { renderer: ctx.renderer });
      for (const r of plan.rooms || []) {
        if (r.floorTex) { const m = world.group.getObjectByName(`floor:${r.id}`); if (m) m.material = tex.material(r.floorTex, { size: [r.w, r.d] }); }
        if (r.wallTex) world.group.traverse((o) => { if (o.name && o.name.startsWith(`wall:${r.id}:`)) o.material = tex.material(r.wallTex, { triplanar: true }); });
      }
    } catch (e) { console.warn(`recipes.textures: ${e.message}`); }
  }

  // ---- ambience ----
  if (cfg.ambience && mods.Ambience) {
    const amb = api.ambience = ctx.ambience = new mods.Ambience(null, { volume: 1 });
    for (const b of cfg.ambience.beds || []) amb.addBed(b.name, { ...b });
    amb.setModel(ambienceModelFromPlan(plan, (id) => { const d = world.doors && world.doors.get(id); return d ? (d.isOpen ? 1 : 0) : 0; }));
    ctx.systems.push({ id: 'ambience', def: { update: (dt) => { if (!amb.ctx && ctx.audio && ctx.audio.ctx) amb.attach(ctx.audio.ctx, ctx.audio.master); amb.setMuted(ctx.settings.volume <= 0); amb.update(dt, { x: ctx.camera.position.x, y: ctx.camera.position.y, z: ctx.camera.position.z }); } }, inst: null });
  }
  return api;
}
