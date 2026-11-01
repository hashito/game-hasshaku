/* game-kit 26c9b87: js/mg-library.js — edit in game-kit and run tools/kit-sync.js */
// The mini game LIBRARY: the mini games a game made for itself, kept in the kit so the next game can use them as they are
// (a game is not stuck with the standard set of js/task-minigames.js; each one it adds stays reusable).
//   import pour from './kit/mg-pour.js';
//   import turnDials from './kit/mg-turn-dials.js';
//   import { useMinigames } from './kit/mg-library.js';
//   useMinigames(ext, [pour, [turnDials, { type: 'gate', hooks: { get: () => st.gate, set: (v) => (st.gate = v) } }]]);
//   // a task then says { minigame: { type: 'pour', cfg: { title, lo, hi, ... } } } and game-core opens it (ext.registerMinigame)
// Each library module js/mg-<type>.js exports default { type, about, mount(host, cfg, ctx, hooks) -> Promise<boolean> } and draws in
// js/mg-frame.js (one look, top-anchored, Esc / close = no penalty, ctx.qa = done at once). To add one: write js/mg-<name>.js the
// same way, list it in LIBRARY and in docs/minigame-library.md; a game takes it with `node tools/kit-sync.js <game> mg-<name>`.
export const LIBRARY = [
  { module: 'mg-pour', type: 'pour', from: '八尺様 ― 境の夜（塩を盛る）', about: '押している間だけ注ぎ、線の高さで離す' },
  { module: 'mg-turn-dials', type: 'turn-dials', from: '八尺様 ― 境の夜（車止めの回し金）', about: '一段ずつ回る金具を手がかりの向きにそろえる' },
];

/** register library mini games with the game's ext: an entry is a module's default, or [default, { type, hooks }] to rename / hook it */
export function useMinigames(ext, list) {
  const out = {};
  for (const e of list) {
    const [m, o = {}] = Array.isArray(e) ? e : [e];
    const type = o.type || m.type, hooks = o.hooks || {};
    const def = { mount: (host, cfg, ctx) => m.mount(host, cfg, ctx, hooks) };
    ext.registerMinigame(type, def);
    out[type] = def;
  }
  return out;
}
