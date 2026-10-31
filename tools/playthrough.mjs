#!/usr/bin/env node
// The rules of this game that the standard smoke does not reach (headless, no visible window, nothing outside the page):
//   S12  every way to die ends in the death window, and "try again" puts you back at the stage's start with the stage reset
//        L3: opening the door to the voice / leaving black salt, L4: the white figure catching you, L5: looking at the window
//   S2   answering "keep it shut" is safe
//   S18  both endings: 帰れない家 (records missing) and 写真を持って (all three records)
//   node tools/playthrough.mjs [--shots dir]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './cdp.mjs';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 20000 + Math.floor(Math.random() * 20000);
const server = spawn(process.execPath, [path.join(import.meta.dirname, 'serve.js'), '--port', String(port)], { stdio: 'ignore' });
const base = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 50; i++) { if (await fetch(base).then((r) => r.ok).catch(() => false)) break; await sleep(100); }
const p = await launch({ width: 1280, height: 720 });
const t0 = Date.now(), log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`, ...a);
let failed = 0;
const expect = (ok, m) => { if (!ok) failed++; log(ok ? 'ok  ' : 'FAIL', m); };
const G = (expr) => p.eval(`(() => { const g = window.__game, hk = window.__hk; return JSON.stringify(${expr}); })()`).then(JSON.parse);
const run = (body) => p.eval(`(async () => { const g = window.__game, hk = window.__hk; ${body} })()`);
const shot = async (name) => shots && p.shot(path.join(shots, `${name}.jpg`));
const frames = (n = 4) => run(`for (let i = 0; i < ${n}; i++) await new Promise((r) => requestAnimationFrame(r));`);
const deathText = () => p.eval("(document.querySelector('.hk-death-text') || {}).textContent || ''");
const retry = async () => { await p.eval("document.querySelector('.hk-death [data-retry]').click()"); await sleep(400); };
const toStage = (ids) => run(`for (const id of ${JSON.stringify(ids)}) if (!g.state.tasks.includes(id)) g.completeTask(id, { quiet: true }); for (let i = 0; i < 5 && (g.ui.open || g.wm.isOpen); i++) { g.ui.close && g.ui.close(); g.wm.isOpen && g.wm.close(); await new Promise((r) => setTimeout(r, 50)); }`);
const L2 = ['T_SHOP', 'T_REPORT'], L3 = [...L2, 'T_SALT_NW', 'T_SALT_NE', 'T_SALT_SW', 'T_SALT_SE', 'T_WINDOW', 'T_SEAL'];
const closeUi = () => run(`for (let i = 0; i < 5 && (g.ui.open || (g.wm.isOpen && g.wm.current !== 'death' && g.wm.current !== 'ending')); i++) { const b = document.querySelector('.win-foot button, .pg-levelup button'); if (b) b.click(); else if (g.ui.close) g.ui.close(); await new Promise((r) => setTimeout(r, 80)); }`);

async function start() {
  await p.goto(`${base}?qa=1&gftest=1`);
  await p.waitFor("window.__game && document.getElementById('start-btn') && !document.getElementById('start-btn').disabled", 90000);
  await p.eval("localStorage.clear()");
  const r = await p.eval("JSON.stringify(document.getElementById('start-btn').getBoundingClientRect())").then(JSON.parse);
  await p.click(r.x + r.width / 2, r.y + r.height / 2);
  await p.waitFor('__game.state.started && window.__hk', 15000);
  await p.eval('window.__hkRealtime = true');
  await sleep(300);
}

try {
  await start();
  await shot('01_start');
  // ---- L1: walk (real W key) from the road to the shop door along the map's route (the 4.0.1 blocker of the old version)
  await run(`g.teleport({ x: 0.5, z: -13.5, yaw: Math.PI / 2 }); g.fp.pitch = 0;`); await frames(4);
  const steer = () => run(`const p = g.camera.position, d = g.world.doors.get('D_SHOP').mesh.position; g.fp.yaw = Math.atan2(-(d.x + 0.6 - p.x), -(d.z - p.z));`);
  await p.key('KeyW', 'down');
  for (let i = 0; i < 150; i++) { await steer(); if (await G("g.target && g.target.kind === 'door' && g.target.id === 'D_SHOP'")) break; await sleep(200); }
  await p.key('KeyW', 'up');
  expect(await G("g.target && g.target.id === 'D_SHOP'"), 'walking from the road reaches the shop door and it can be used');
  await shot('01b_shop_front');
  // ---- L3: the night
  await toStage(L3); await closeUi();
  expect((await G('g.prog.index')) === 2, 'the night (L3) begins after the room is sealed');
  await run(`g.teleport({ x: -8.5, z: 6.5, yaw: Math.PI });`); await frames(6);
  expect(await G("g.world.doors.get('D_FUSUMA').locked() && !g.world.doors.get('D_FUSUMA').isOpen"), 'the fusuma is shut and cannot be opened in the night');
  await shot('02_night');
  // keep it shut: safe
  await run(`window.__gfChoice = 'keep'; g.teleport({ x: -8.0, z: 9.0, yaw: Math.PI }); g.fp.pitch = -0.1;`); await frames(6);
  expect((await G('g.target && g.target.kind')) === 'hk-voice', 'the voice behind the fusuma can be examined');
  await p.key('KeyE'); await sleep(500);
  expect(!(await deathText()), '"約束を守り、開けない" is safe');
  // answer and open: death
  await run(`window.__gfChoice = 'open';`); await frames(4); await p.key('KeyE'); await sleep(1600);
  expect((await deathText()).includes('戸を開けた'), 'opening the door to the voice before seven kills (S12)');
  await shot('03_death_door');
  await retry(); await frames(4);
  expect((await G('g.prog.index === 2 && hk.st.night < 3')), 'try again: back to the start of the night (L3, 01:00)');   // the clock may already have run a moment (a slow frame)
  // black salt: death
  await run(`window.__hkSalt = true; hk.st.night = 110; hk.st.dark.NW = 1.349;`);
  for (let i = 0; i < 40 && !(await deathText()); i++) await sleep(300);
  expect((await deathText()).includes('盛り塩'), 'leaving a plate black breaks the guard (death)');
  await retry();
  // changing black salt in time
  await run(`hk.st.night = 30; hk.st.dark.NW = 0.9; g.teleport({ x: -10.0, z: 5.2, yaw: Math.atan2(0.9, 1.1) }); g.fp.pitch = -0.5;`); await frames(6);
  const tgt = await G('g.target && g.target.kind + ":" + g.target.id');
  if (tgt === 'hk-salt:NW') { await p.key('KeyE'); await sleep(300); }
  expect(tgt === 'hk-salt:NW' && (await G('hk.st.dark.NW')) < 0.1, 'a black plate can be changed with [E] (it turns white)');
  await run('window.__hkSalt = false; hk.skipNight();'); await sleep(2500); await closeUi(); await sleep(500);
  expect((await G('g.prog.index')) === 3, 'seven o\'clock: the morning (L4)');
  // ---- L4: the chase (standard monster): standing still in the open is caught
  await run(`g.teleport({ x: 0.5, z: -14, yaw: 0 });`); await frames(4);
  await run(`const m = window.__gf.modules.monsterStd; m.drive('reset'); m.drive('place', { x: 1.5, z: -16.5, state: 'chase' }); m.drive('chase');`);
  await shot('04_morning_chase');
  for (let i = 0; i < 80 && !(await deathText()); i++) await sleep(300);
  expect((await deathText()).includes('白い姿'), 'standing still while she chases you: caught (S12 / S20)');
  await shot('05_death_monster');
  await retry(); await frames(4);
  expect((await G('g.prog.index')) === 3, 'try again from the start of the morning');
  // ---- L5: the van
  await toStage(['T_DAWN', 'T_GATE', 'T_CAR']); await closeUi(); await sleep(600);
  expect((await G('g.prog.index')) === 4, 'in the van (L5)');
  await shot('06_van');
  for (let i = 0; i < 160 && !(await deathText()); i++) { await run('g.fp.yaw = 1.3; g.fp.pitch = 0;'); await sleep(250); }
  expect((await deathText()).includes('窓の外'), 'keeping your eyes on the window: death');
  await retry(); await frames(4);
  expect((await G('hk.st.ride')) < 3, 'try again: the ride starts over');
  await p.key('Space', 'down');
  await run('hk.skipRide();');
  await p.waitFor("document.querySelector('.hk-ending')", 20000).catch(() => {});
  await p.key('Space', 'up');
  expect((await G('g.state.ended')) === 'E_SAFE', 'holding the talisman to the border: ending 帰れない家 (records missing)');
  await shot('07_ending_safe');
  // ---- the other ending: all three records read
  await start();
  await run(`g.state.docsRead.push('N_LETTER', 'N_PHOTO', 'N_DIARY');`);
  await toStage([...L3, 'T_DAWN', 'T_GATE', 'T_CAR']); await closeUi(); await sleep(600);
  await p.key('Space', 'down'); await run('hk.skipRide();');
  await p.waitFor("document.querySelector('.hk-ending')", 20000).catch(() => {});
  await p.key('Space', 'up');
  expect((await G('g.state.ended')) === 'E_REMEMBERED', 'with all three records: ending 写真を持って');
  await shot('08_ending_remembered');
  const errs = p.errors.filter((e) => !/favicon|googletagmanager/.test(e));
  expect(errs.length === 0, `no console errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
} catch (e) { failed++; log('FAIL', e.message); }
finally { await p.close(); server.kill(); }
console.log(failed ? `PLAYTHROUGH FAILED (${failed})` : 'PLAYTHROUGH OK');
process.exit(failed ? 1 : 0);
