// The story of 『八尺様 ― 境の夜』 on top of the standard (docs/standard-3d.md in game-kit). The standard runs the stages, tasks,
// items, records, things, map, menus, saves and the monster's chase (data/monsters.json, from L4). This module adds what is
// particular to this night:
//   L1 異影    the errand, the first sight of her over the hedge (scripted, she never comes near: S2 / S8)
//   L2 四隅    the conversation with the grandfather; salt, newspaper and talisman (tasks with mini games)
//   L3 呼び声  the night in the sealed room: a clock 01:00 -> 07:00, the salt turns black and must be changed, voices at the door;
//              answering (opening the door) before seven kills (S12)
//   L4 迎えの道 the chase in the morning (standard monster, early preset: running escapes, standing still is caught, S20)
//   L5 境越え  the van to the village border: hold the talisman and do not keep looking at the window
// Conversations use the one standard window (win-manager); the protagonist's thoughts use the thought band (ctx.monologue).
import * as THREE from 'three';
import { register as mgRegister } from '../kit/task-minigames.js';
import { dressVillage } from './village.js';
import { makeHasshaku } from './hasshaku.js';
import { createSound } from './sound.js';
import pour from '../kit/mg-pour.js';
import turnDials from '../kit/mg-turn-dials.js';
import { useMinigames } from '../kit/mg-library.js';
import { prewarm } from '../kit/frame-guard.js';
import { createFear } from '../kit/fear-fx.js';
import { showEndingScene } from '../kit/ending-scene.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const NIGHT_SEC = 150;          // 01:00 -> 07:00 in 150 s of play
export const RIDE_SEC = 30;            // the van from the gate to the border
export const SALT_START = { NW: 22, NE: 75, SW: 108, SE: 48 };   // when each plate starts to turn black (s into the night)
export const SALT_RATE = 0.022;        // per second; 0.85 = the warning, 1.35 = the room's guard breaks (death)
export const BOWLS = ['NW', 'NE', 'SW', 'SE'];
export const BOWL_NAMES = { NW: '北西', NE: '北東', SW: '南西', SE: '南東' };
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
export function nightClock(t) { const m = 60 + Math.floor((clamp(t, 0, NIGHT_SEC) / NIGHT_SEC) * 360); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
// in the van: looking at the side window raises the pull, holding the talisman lowers it (rates per second)
export function curseStep(curse, { grip, yaw, pitch }, dt) {
  const atWindow = Math.abs(Math.sin(yaw)) > 0.58 && pitch > -0.3;
  return clamp(curse + dt * (grip ? -0.19 : atWindow ? 0.2 : 0.012), 0, 1);
}

export default function story(ext) {
  const kw = { node: 'IMA', path: null, t: 0, walking: false, talking: null };
  const st = { seen: false, genkan: false, zashiki: false, morning: false, gate: [0, 0, 0], deaths: 0, night: 0, dark: { NW: 0, NE: 0, SW: 0, SE: 0 }, warned: false, fired: [], ride: 0, curse: 0, startedAt: 0, played: 0, first: { road: false, po: false } };
  const NO_GATE_KEY = '車止めに錠が下りている。鍵は、勝手口の柱に掛けてあると祖父が言っていた。';
  let ctx = null, V = null, T = null, snd = null, H = null, light = null, dying = false, gripKey = false, gripTouch = false, fear = null;
  // behind the title (the start button waits): wait for the textures, then compile the shaders of every stage's lights and upload
  // the textures, so pressing start does not freeze for seconds while the GPU driver links the programs (GPU perf, Issue #3)
  ext.registerBoot('hk-prewarm', async (c, report) => {
    if (!V) return;
    report(0, '村を準備中…');
    await Promise.race([V.ready, new Promise((r) => setTimeout(r, 15000))]);
    await V.dressOuterWalls();
    const real = Object.getOwnPropertyDescriptor(c.prog, 'index');
    // the look's post pass draws the scene into its own target (no tone mapping, linear output): compile for that target, as play does
    const warm = async () => { const rt = c.look && c.look.post && c.look.post.rt; const was = c.renderer.getRenderTarget(); if (rt) c.renderer.setRenderTarget(rt);
      try { await prewarm(c.renderer, c.scene, c.camera, { render: true }); } finally { c.renderer.setRenderTarget(was); } };
    try {
      for (let i = 0; i < STAGE_SKY.length; i++) {
        Object.defineProperty(c.prog, 'index', { get: () => i, configurable: true }); applyStage();
        // the flashlight on and off (F): a light appearing / disappearing changes every lit program
        for (const on of [false, true]) { if (light) light.visible = on; await warm(); }
        report((i + 1) / STAGE_SKY.length, '村を準備中…');
      }
    } finally {
      if (real) Object.defineProperty(c.prog, 'index', real); else delete c.prog.index;
      applyStage(); if (light) light.visible = lvl() >= 1 && lvl() !== 4;
    }
  });
  const lvl = () => (ctx && ctx.prog ? ctx.prog.index : 0);
  const done = (id) => ctx.state.tasks.includes(id);
  const say = (text, sec) => ctx.monologue(text, sec ?? Math.min(9, 2.4 + String(text).length * 0.09));
  // spoken lines (Issue #1): assets/voice/manifest.json maps a voice to its line of data/talk.json; the talk window plays line.voice,
  // the timed lines of the night and the ride play through spoken() (S15: through a door / window = the wall preset)
  const voiced = new Map();
  const spoken = (text) => { const v = voiced.get(text); return v && ctx.voiceLine ? ctx.voiceLine(v.src, v.vfx) : null; };
  const voice = (who, text, sec) => { spoken(text); return ctx.ui.say(`<span class="hk-who">${esc(who)}</span>${esc(text)}`, sec ?? Math.min(8, 2.6 + String(text).length * 0.1)); };
  async function loadVoices() {
    let m = {}; try { m = await (await fetch('assets/voice/manifest.json')).json(); } catch (e) { return; }
    for (const [id, v] of Object.entries(m)) {
      const src = `assets/voice/${id}.mp3`, list = T[v.key];
      if (v.key === 'door_choice') { voiced.set(T.door_choice.text, { src, vfx: v.preset }); continue; }
      const L = Array.isArray(list) && list[v.index]; if (!L) continue;
      if (Array.isArray(L)) voiced.set(L[2], { src, vfx: v.preset }); else Object.assign(L, { voice: src, vfx: v.preset });
    }
  }

  // our two mini games live in the kit's library now (pour, turn-dials), named salt / gate here
  const MGX = useMinigames(ext, [
    [pour, { type: 'salt', hooks: { sound: () => snd && snd.salt() } }],
    [turnDials, { type: 'gate', hooks: { get: () => st.gate, set: (v) => (st.gate = v), sound: (n) => snd && snd.knock(n === 'bad' ? { n: 2, vol: 0.4 } : { n: 1, vol: 0.25, pan: 0 }) } }],
  ]);
  ext.registerUi('title', {
    kicker: 'HASSHAKU ／ A FIRST-PERSON FOLK HORROR',
    tagline: '祖父に頼まれた、夕暮れの買い物。店までの地図をたどった帰り道で、見てはいけないものを見た。',
    meta: '五つの段階 ・ 約25分 ・ PC・スマートフォン ・ ヘッドホン推奨',
    note: '怪異の姿、追われて捕まる場面、驚かせる表現があります（設定の「おだやか」で弱められます）。ネット怪談「八尺様」を題材にした創作です。',
  });
  ext.registerPersist('hasshaku', {
    serialize: () => ({ seen: st.seen, genkan: st.genkan, zashiki: st.zashiki, morning: st.morning, gate: st.gate, deaths: st.deaths, played: st.played }),
    restore: (j) => { Object.assign(st, { seen: false, genkan: false, zashiki: false, morning: false, gate: [0, 0, 0], deaths: 0, played: 0 }, j || {}); resetStageLocal(); },
  });
  function resetStageLocal() { faceT = 0; darkT = 0; handsK = 0; if (hands) hands.material.opacity = 0; fear && fear.reset(); st.fakeClock = false; st.fakeEndAt = 0; kw.path = null; kw.t = 0; st.night = 0; st.dark = { NW: 0, NE: 0, SW: 0, SE: 0 }; st.warned = false; st.fired = []; st.ride = 0; st.curse = 0; }

  // ---------------------------------------------------------------- conversations: the standard window (ctx.talk / ctx.choose, standard 1.7)
  const talk = (lines, o = {}) => ctx.talk(lines, o);
  const wait = (sec) => new Promise((r) => setTimeout(r, sec * 1000));
  // a found picture at the top of the screen (U14: things above, thoughts below)
  function flashPhoto(src, caption, sec = 5) {   // long enough to read (feedback 2026-11-02 "画像が一瞬で切り替わる")
    const el = document.getElementById('hk-photo'); if (!el) return;
    el.innerHTML = `<img src="${esc(src)}" alt="">${caption ? `<p>${esc(caption)}</p>` : ''}`;
    el.hidden = false; clearTimeout(flashPhoto.t); flashPhoto.t = setTimeout(() => { el.hidden = true; }, sec * 1000);
  }
  const choose = (c) => ctx.choose({ who: c.who, title: c.who, text: c.text, options: [{ id: 'open', label: c.open }, { id: 'keep', label: c.keep, primary: true }] });
  // a kit mini game (align / wipe ...) or one of ours, inside a task's own run()
  async function playMG(task) {
    const mg = task.minigame; if (!mg) return true;
    if (mg.type === 'salt' || mg.type === 'gate') {
      if (ctx.qa) return true;
      const host = document.createElement('div'); host.id = 'mg-custom'; host.className = 'gf-overlay'; document.body.appendChild(host);
      ctx.fp.release();
      try { return !!(await MGX[mg.type].mount(host, mg.cfg || {}, ctx)); } finally { host.remove(); }
    }
    mgRegister(task.id, mg.type, { title: task.title, help: task.hint || '', ...(mg.cfg || {}) });
    return ctx.minigame(task.id);
  }

  // ---------------------------------------------------------------- tasks
  ext.registerTask('T_SHOP', { run: async (c, task) => {
    await talk(T.shop.slice(0, 2), { title: '夕霧商店' });
    if (!(await playMG(task))) return false;
    await talk(T.shop.slice(2), { title: '夕霧商店' });
    snd.po({ vol: 0.12, pan: 0.85 });
    return true;
  }, onDone: () => { say('醤油と電池を受け取った。来た道を戻って、祖父の家へ。', 5); showSighting(); } });
  ext.registerTask('T_REPORT', { run: async () => {
    if (!st.seen) { st.seen = true; snd.sting(); flashPhoto('assets/photos/encounter.webp', '帰ってきた道の向こう。白い帽子が、塀の上を通り過ぎた。', 5); }
    if (H) H.root.visible = false;
    await talk(T.report, { title: '居間' });
    // Issue #4: Ｋさん does not just appear. The grandfather shuts the front door first (the knock must come at a closed door), the po
    // right outside the window, the lamp flickers, a long silence, my eyes go to the front door, a knock; he opens it for her and shuts it
    const genkan = ctx.world.doors.get('D_GENKAN'), G = { x: -4, y: 1.2, z: 15.6 };
    if (genkan) { genkan.close(); snd.scrape({ vol: 0.25, pan: -0.3 }); say(T.gp_shut, 4); }
    if (!ctx.qa) {
      await wait(1.8);
      const lamp = ctx.world.group.getObjectByName('lamp:IMA'), i0 = lamp ? lamp.intensity : 0;
      snd.po({ vol: 0.7, pan: -0.6 }); say(T.scare_window, 6);
      for (const [ms, k] of [[0, 0.15], [140, 1], [260, 0.05], [520, 0.8], [700, 0.1], [1100, 0.6], [1500, 1]]) setTimeout(() => { if (lamp) lamp.intensity = i0 * k; }, ms);
      await wait(3.2); lookAt = { ...G, t: 2.4 }; snd.knock({ n: 3, vol: 0.55, pan: 0.3 }); await wait(1.6);
    }
    await talk(T.k_arrive.slice(0, 3), { title: '玄関' });
    // she is seen coming in: standing just inside the front door, then (the talk over) at her place in the living room for the night's preparations
    const K = V && V.people.k, GPa = V && V.people.grandpa;
    if (GPa) { GPa.root.position.set(-4.9, 0, 16.5); GPa.root.rotation.y = Math.PI / 2; }   // he goes to the door himself
    if (genkan) { genkan.open(); snd.scrape({ vol: 0.3, pan: -0.3 }); lookAt = { ...G, t: 2.2 }; say(T.k_enter, 5); if (!ctx.qa) await wait(1.0); if (K) { K.root.position.set(-4.7, 0, 15.6); K.root.rotation.y = -Math.PI / 2; K.root.visible = true; } if (!ctx.qa) await wait(1.4); genkan.close(); snd.scrape({ vol: 0.3, pan: -0.3 }); }
    lookAt = null;   // the glance is over: nothing turns the head while the player walks off (under ?qa there are no waits, so it used to run on after the talks)
    await talk(T.k_arrive.slice(3), { title: '玄関' });
    await talk(T.report_after, { title: '居間' });
    if (K) { K.root.position.set(-10.6, 0, 15.0); K.root.rotation.y = Math.PI / 2; }
    if (GPa) { GPa.root.position.set(-6.4, 0, 16.6); GPa.root.rotation.y = -Math.PI / 2; }
    return true;
  } });
  for (const k of BOWLS) ext.registerTask(`T_SALT_${k}`, {
    canStart: (c) => (c.state.inv.includes('I_SALT') ? true : '塩が必要だ。台所の作業台にある袋を取りに行こう。'),
    onDone: () => { V.parts.plates[k].salt.visible = true; const n = BOWLS.filter((b) => done(`T_SALT_${b}`)).length; if (n === 4) say('四隅に塩を盛った。次は、窓と札だ。'); },
  });
  ext.registerTask('T_WINDOW', {
    canStart: (c) => (c.state.inv.includes('I_PAPER') ? true : '窓の全面をふさぐ新聞紙が要る。納戸の机にあったはずだ。'),
    onDone: () => { V.parts.windowPapers.visible = true; snd.scrape({ vol: 0.12 }); say('新聞の端まで押さえた。外が見えなくなって、少しだけ息ができる。', 5); },
  });
  ext.registerTask('T_SEAL', {
    canStart: (c) => (!c.state.inv.includes('I_OFUDA') ? 'Ｋさんの札がまだ手元にない。居間の仏壇の横にあるはずだ。' : c.state.room !== 'ZASHIKI' ? '座敷の中に入って、内側から襖に札を貼ろう。' : true),
    run: async (c, task) => {
      if (!(await playMG(task))) return false;
      V.parts.sealPaper.visible = true;
      await talk(T.prepared, { title: '北の座敷' });
      return true;
    },
  });
  ext.registerTask('T_DAWN', { canStart: () => `時計はまだ ${hhmm(shownMinutes())}。七時まで、戸は開けない。` });
  // the key of the gate, on the post by the back door (feedback 2026-11-07). The map's pin and the guide come from this task; before the morning its station is not there (prune)
  ext.registerTask('T_KEY', {
    canStart: () => (lvl() === 3 ? true : '今は、まだ要らない。'),
    run: async () => { await morningTalk(); return true; },
    onDone: () => { if (V.parts.gateKey) V.parts.gateKey.visible = false; snd.knock({ n: 1, vol: 0.12, pan: 0 }); prune(); say('鍵を取った。村道を北へ、車止めまで。', 5); },
  });
  ext.registerTask('T_GATE', { canStart: (c) => (c.state.inv.includes('I_GATEKEY') ? true : NO_GATE_KEY), run: async (c, task) => {
    if (!(await playMG(task))) return false;
    snd.knock({ n: 1, vol: 0.5, pan: 0 });
    if (V.parts.gateLock) V.parts.gateLock.visible = false;
    await talk(T.gate_opened, { title: '農道の車止め' });
    return true;
  }, onDone: () => { const d = ctx.world.doors.get('D_GATE'); d && d.open(); if (V.parts.gate) V.parts.gate.target = 1; snd.scrape({ vol: 0.45 }); ctx.audio && ctx.audio.noise && ctx.audio.noise('scrape', { gain: 0.6 }); prune(); say('重い木の門が、軋みながら左右に開いていく。', 4.5); } });   // feedback 2026-11-01: the gate was not seen to open (only the plan's door opened; the leaves waited for the next stage)
  ext.registerTask('T_CAR', { run: async () => { await talk(T.boarded, { title: '迎えの車' }); return true; }, onDone: () => { if (V.parts.boarding) V.parts.boarding.visible = false; } });
  ext.registerTask('T_RIDE', { canStart: () => '村境まで、札を握って待つ。' });

  // ---------------------------------------------------------------- interactions of the night (L3)
  ext.registerInteract('hk-salt', {
    prompt: (o) => (st.dark[o.id] > 0.12 ? `[E] ${BOWL_NAMES[o.id]}の黒ずんだ塩を替える` : `[E] ${BOWL_NAMES[o.id]}の塩を見る`),
    run: (o) => {
      if (st.dark[o.id] > 0.12) { st.dark[o.id] = 0; st.warned = false; snd.salt(); ctx.ui.toast('白い塩に替えた。'); if (!ctx.calm) flashPhoto('assets/photos/salt-scene.webp', '', 0.9); }
      else say('まだ白い。今は替えなくていい。');
    },
  });
  ext.registerInteract('hk-voice', {
    prompt: () => '[E] 戸の外の声を確かめる',
    run: async () => {
      const c = T.door_choice, h = spoken(c.text), v = await choose(c); h && h.stop && h.stop();
      if (v === 'open') { snd.sting(); const d = ctx.world.doors.get('D_FUSUMA'); d && (d.mesh.visible = false); setTimeout(() => ctx.die('door'), 350); }
      else if (v === 'keep') say(c.kept, 4);
    },
  });
  ext.registerInteract('hk-hold', { prompt: () => '', run: () => {} });

  // ---------------------------------------------------------------- death: a face, what went wrong, try this stage again
  ext.registerDeath({ run: (c, reason) => {
    if (dying) return; dying = true; st.deaths++;
    c.bus.emit('player:dead', { reason });
    snd.sting();
    const [dTitle, dKicker] = (T.deathTitles || {})[reason] || ['声の向こう', 'THE VOICE WAS NOT HIS'];   // each way of dying has its own words
    const dText = (c.isTouch && (T.deathsTouch || {})[reason]) || (T.deaths || {})[reason] || T.deaths.monster;   // the advice names the controls the player has
    const show = () => c.wm.open('death', { title: dTitle, size: 's', locked: true, render: (el) => {
      el.innerHTML = `<div class="hk-death"><p class="hk-death-kicker">${esc(dKicker)}</p>${c.calm ? '' : '<img class="hk-death-img" src="assets/photos/face.webp" alt="">'}<p class="hk-death-text">${esc(dText)}</p><div class="hk-choices"><button type="button" class="btn primary" data-retry>この段階からやり直す</button></div></div>`;
      const b = el.querySelector('[data-retry]'); b.onclick = () => { c.wm.close(); }; setTimeout(() => b.focus(), 30);
    }, onClose: () => {
      dying = false; resetStageLocal(); applyStage();
      c.setFloor(c.checkpoint.floor || 0, c.checkpoint); c.fp.yaw = c.checkpoint.yaw || 0;
      c.bus.emit('player:respawn', { room: c.world.roomAt(c.checkpoint.x, c.checkpoint.z, c.camera.position.y) });
      c.ui.toast(`第${['一', '二', '三', '四', '五'][lvl()]}段階の区切りから、やり直します。`);
    } });
    const el = document.getElementById('hk-jump');
    if (el && !c.calm) { el.classList.add('long'); el.hidden = false; setTimeout(() => { el.hidden = true; el.classList.remove('long'); show(); }, c.qa ? 50 : 2400); } else show();   // the face stays long enough to be seen (feedback 2026-11-02), then heads the window
  } });
  // the ending (feedback 2026-11-01 "最後にも写真を置いて手前に文字"): the kit's ending scene - the picture fills the screen, the kicker, the title
  // and the epilogue appear in front of it a line at a time, then how the night went
  ext.registerScreen('ending', { keepSave: false, open: (c, e) => {
    const sec = Math.round(st.played), recs = ['N_LETTER', 'N_PHOTO', 'N_DIARY'].filter((d) => c.state.docsRead.includes(d)).length;
    if (fear) fear.reset();
    snd.silence();
    showEndingScene(c, { photo: e.photo, kicker: e.kicker, title: e.title, text: e.text,
      stats: `5 / 5 段階 ・ 記録 ${recs} / 3 ・ やり直し ${st.deaths} 回 ・ ${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒`,
      buttons: [{ label: 'タイトルに戻る', primary: true, fn: () => location.reload() }] });
  } });

  // ---------------------------------------------------------------- stage looks and who is where
  const STAGE_SKY = [
    { color: 0x455b57, density: 0.02, light: 1.0 },   // dusk
    { color: 0x23393a, density: 0.03, light: 0.62 },  // evening
    { color: 0x0f2120, density: 0.034, light: 0.42 }, // deep night
    { color: 0x6d817b, density: 0.034, light: 0.95 }, // morning mist
    { color: 0x7a8c86, density: 0.03, light: 1.05 },  // morning
  ];
  let baseLights = null;
  function applyStage() {
    if (!ctx || !V) return;
    const i = lvl(), sky = STAGE_SKY[i] || STAGE_SKY[0], scene = ctx.scene;
    if (scene.fog) { scene.fog.color.setHex(sky.color); if (scene.fog.density != null) scene.fog.density = sky.density; }
    if (scene.background && scene.background.isColor) scene.background.setHex(sky.color);
    if (!baseLights) { baseLights = []; scene.traverse((o) => { if (o.isHemisphereLight || o.isDirectionalLight) baseLights.push([o, o.intensity]); }); }
    for (const [o, k] of baseLights) o.intensity = k * sky.light;
    const P = V.people;
    // the morning (feedback 2026-11-07): the two of them are in the living room when the fusuma opens; Ｋさん then walks to the van with me (updateEscort)
    P.grandpa.root.visible = i <= 1 || i === 3;
    P.k.root.visible = i === 1 || i === 3;
    if (i === 3) placeMorning();
    else if (i <= 1) { P.grandpa.root.position.set(-6.4, 0, 16.6); P.grandpa.root.rotation.y = -Math.PI / 2; P.k.root.position.set(-10.6, 0, 15); P.k.root.rotation.y = Math.PI / 2; }
    P.lady.root.visible = i <= 1;
    P.driver.root.visible = i === 4;
    if (V.parts.boarding) V.parts.boarding.visible = i === 3 && !done('T_CAR');
    V.parts.van.visible = i >= 3; V.parts.vanLight.visible = i >= 3; V.parts.vanInside.visible = i === 4; for (const m of V.parts.vanShell) m.visible = i !== 4;   // in the van: the inside instead of the shell
    V.parts.shopLight.intensity = i === 2 ? 4 : 10;
    for (const k of BOWLS) V.parts.plates[k].salt.visible = done(`T_SALT_${k}`);
    V.parts.windowPapers.visible = done('T_WINDOW');
    V.parts.sealPaper.visible = done('T_SEAL');
    const fus = ctx.world.doors.get('D_FUSUMA');
    if (fus) { if (i === 2) { fus.close(); fus.def.hint = '七時までは、開けない。'; } else fus.def.hint = '北の座敷は閉め切ってある。今は、居間の祖父に話すのが先だ。'; if (i >= 3) fus.open(); fus.mesh.visible = !fus.isOpen; }   // in the morning the grandfather opens it from the living room
    if (i >= 1 && light) light.userData.auto && (light.visible = true);
    for (const k of BOWLS) nightMarks[k].visible = i === 2;
    voiceMark.visible = i === 2;
    const g = ctx.world.doors.get('D_GATE'); if (g && done('T_GATE')) g.open();
    const katte = ctx.world.doors.get('D_KATTE'); if (katte && i >= 3) katte.open();   // at dawn the grandfather unbolts the back door
    const kdoor = ctx.world.doors.get('D_DAIDOKORO'); if (kdoor && i >= 3) kdoor.open();
    if (V.parts.gateKey) V.parts.gateKey.visible = !done('T_KEY');
    if (V.parts.gateLock) V.parts.gateLock.visible = !done('T_GATE');
    if (V.parts.roadBar) V.parts.roadBar.visible = i !== 4;
    { const base = [18 * 60 + 40, 19 * 60 + 10, null, 7 * 60, 7 * 60 + 8][i]; if (base != null && V.parts.clock) V.parts.clock.set(base); }   // the clock's hands: the stage's time
    if (V.parts.gate) V.parts.gate.target = done('T_GATE') ? 1 : 0;
    prune();
    el('hk-night').hidden = i !== 2; el('hk-ride').hidden = i !== 4;
    if (H) H.root.visible = i === 0 && done('T_SHOP') && !done('T_REPORT');
  }
  // stations whose tasks are all done are no longer things to use (U: no button that does nothing)
  function prune() {
    for (const s of ctx.data.plan.stations) {
      const ts = ctx.data.tasks.filter((t) => t.station === s.id);
      const m = ctx.world.group.getObjectByName(`station:${s.id}`); if (!m) continue;
      const idx = ctx.world.interactables.indexOf(m), over = (ts.length && ts.every((t) => done(t.id))) || (s.id === 'S_KEY' && lvl() !== 3);
      if (over && idx >= 0) ctx.world.interactables.splice(idx, 1); else if (!over && idx < 0) ctx.world.interactables.push(m);
    }
  }
  const el = (id) => document.getElementById(id) || {};

  // ---------------------------------------------------------------- L1: the sighting
  // she walks behind the empty house's board fence across the rice field (1.7 m: only the hat and the top of the head show over it)
  const SIGHT = { x: 18.95, z0: 3.0, z1: 21.5 };
  function showSighting() { if (!H) return; H.root.visible = true; H.root.position.set(SIGHT.x, 0, SIGHT.z0); H.root.rotation.y = -Math.PI / 2; H.walk = 0; H.seenT = 0; H.cued = false; }
  // a pale wash of moonlight over the fence onto her (feedback 2026-11-08: she was lost in the cedars' shade): the white dress and the hat
  // stand out from the dark boards and the empty house's wall; it stays in the scene at 0 when she is gone (no shader rebuild)
  let moon = null;
  function moonOn(k) { if (!moon) return; moon.intensity = k; if (k > 0) moon.position.set(H.root.position.x - 1.4, 3.4, H.root.position.z); }
  const tmpV = new THREE.Vector3();
  let lookAt = null;   // { x, y, z, t }: a staged glance (the knock at the front door)
  // the moment she is seen (Issue #4 follow-up: "where is she?"): my head turns to the hat on the fence and the eyes fix on it (the view
  // narrows to a zoom for about 2.5 s), then it lets go. The mouse can't fight it until it lets go.
  let baseFov = 0;
  // turn my eyes towards a point (k: 0..1 of the way this frame)
  function turnTo(x, y, z, k) {
    const cam = ctx.camera, fp = ctx.fp; if (!fp) return;
    const dx = x - cam.position.x, dz = z - cam.position.z, ty = Math.atan2(-dx, -dz), tp = Math.atan2(y - cam.position.y, Math.hypot(dx, dz));
    fp.yaw += Math.atan2(Math.sin(ty - fp.yaw), Math.cos(ty - fp.yaw)) * k; fp.pitch += (tp - fp.pitch) * k;
  }
  function noticeZoom(t, dt) {
    const cam = ctx.camera;
    if (!baseFov) baseFov = cam.fov;
    if (t < 2.6) turnTo(H.root.position.x, 2.55, H.root.position.z, Math.min(1, dt * (t < 0.7 ? 6 : 12)));
    const want = t > 0.5 && t < 2.6 ? baseFov * 0.32 : baseFov;
    const f = cam.fov + (want - cam.fov) * Math.min(1, dt * (t < 2.6 ? 5 : 4));
    if (Math.abs(f - cam.fov) > 0.01) { cam.fov = t > 3.6 ? baseFov : f; cam.updateProjectionMatrix(); }
  }
  function updateSighting(dt) {
    if (!H || !H.root.visible || lvl() !== 0) { moonOn(0); return; }
    const cam = ctx.camera, p = cam.position;
    moonOn(H.root.position.y < -0.5 ? 0 : 4);
    // once seen (Issue #4: the first meeting must frighten): she stops and stares, then hurries along the fence towards you, sinks
    // behind it (the hat goes), and a moment later the po sounds close by, from where nothing can be seen
    if (st.seen) {
      const t = (H.seenT += dt);
      noticeZoom(t, dt);
      if (t < 2.6) { H.character.setSpeed(0); H.character.lookAt(cam); if (!H.glitched && t > 1.2) { H.glitched = true; ctx.fx && ctx.fx.glitch && ctx.fx.glitch(0.35, 0.4); } }
      else if (t < 4.2) { H.root.position.z += clamp(p.z - H.root.position.z, -1, 1) * dt * 2.4; H.character.setSpeed(1.2); }
      else if (t < 5.0) { H.root.position.y = Math.max(-1.6, H.root.position.y - dt * 2.2); H.character.setSpeed(0); }
      else if (!H.near) { H.near = true; H.root.visible = false; H.root.position.y = 0; ctx.fx && ctx.fx.spook && ctx.fx.spook(0.6); snd.po({ vol: 0.85, pan: clamp((SIGHT.x - p.x) / 6, -1, 1) * 0.4 }); snd.sting(); say(T.seen_near, 6); }
      H.character.update(dt);
      return;
    }
    // a cue before the sight (feedback 2026-11-08): walking home down the road, a low po from across the field turns the head even if the
    // eyes are elsewhere; the staged glance below then finds her
    if (!H.cued && p.z > 2.5 && p.x < 8) { H.cued = true; snd.po({ vol: 0.38, pan: clamp((H.root.position.x - p.x) / 8, -1, 1) }); say(T.seen_cue, 4.5); }
    H.root.position.z = Math.min(SIGHT.z1, H.root.position.z + dt * 0.22); H.character.setSpeed(0.22); H.character.update(dt);
    if (H.root.position.z >= SIGHT.z1) { H.root.position.z = SIGHT.z0; }
    const head = tmpV.copy(H.root.position).setY(2.6), d = head.distanceTo(p);
    const look = new THREE.Vector3(); cam.getWorldDirection(look);
    const dot = look.dot(head.clone().sub(p).normalize());
    H.gaze = (H.gaze || 0) + (d < 26 && dot > 0.8 ? dt : -dt * 0.5); H.gaze = Math.max(0, H.gaze);
    if (H.gaze > 0.6 || (p.z > 8.5 && p.x > -4.2 && p.x < 5)) {
      st.seen = true; H.seenT = 0; snd.po({ vol: 0.55, pan: clamp((H.root.position.x - p.x) / 8, -1, 1) }); snd.sting();
      H.character.lookAt(cam);
      say(T.seen, 8);
    }
  }

  // ---------------------------------------------------------------- L3: the night
  const nightMarks = {}; let voiceMark = null;
  // what the room's clock claims (the HUD and the hands of the wall clock read the same): the false seven, then back to 6:58 and on to the real seven
  function shownMinutes() {
    if (st.fakeClock) return 7 * 60;
    if (st.fakeEndAt) return 6 * 60 + 58 + clamp((st.night - st.fakeEndAt) / Math.max(1, NIGHT_SEC - st.fakeEndAt), 0, 1) * 2;
    return 60 + (clamp(st.night, 0, NIGHT_SEC) / NIGHT_SEC) * 360;
  }
  function updateNight(dt) {
    if (lvl() !== 2 || dying) return;
    st.night += dt;
    for (const [t, who, text, fx] of T.night) {
      if (st.night >= t && !st.fired.includes(t)) {
        st.fired.push(t);
        if (who === '私') say(text, 5.5); else voice(who, text, 5.5);
        if (fx === 'knock') { snd.knock({ pan: 0.2 }); shake(1.6); }
        if (fx === 'knockFinal') { snd.knock({ n: 5, vol: 0.9, pan: 0.1 }); snd.sting(); shake(3.5); fear && fear.kick(0.9); }
        if (fx === 'fakeDawn') { st.fakeClock = true; snd.knock({ n: 2, vol: 0.3 }); }   // the HUD clock shows 07:00 until fakeEnd
        if (fx === 'fakeEnd') { st.fakeClock = false; st.fakeEndAt = st.night; snd.po({ vol: 0.7, pan: 0.1 }); snd.sting(); shake(2.5); fear && fear.kick(0.8); }
        if (fx === 'po') { snd.po({ vol: 0.5, pan: -0.2 }); shadow(7); flashPhoto('assets/photos/ph-window-shadow.webp', '', 4); }
      }
    }
    let worst = 0;
    for (const k of BOWLS) {
      if (st.night > SALT_START[k] && !(ctx.qa && !window.__hkSalt)) st.dark[k] = Math.min(1.4, st.dark[k] + dt * SALT_RATE);   // ?qa: the smoke does not tend the salt (window.__hkSalt = true turns it back on)
      worst = Math.max(worst, st.dark[k]);
      const s = V.parts.plates[k].salt, v = clamp(st.dark[k] / 1.0, 0, 1);
      const maps = V.saltMaps;
      if (maps) { const m = maps[v < 0.35 ? 0 : v < 0.7 ? 1 : 2]; if (s.material.map !== m) { s.material.map = m; s.material.needsUpdate = true; } s.material.color.setScalar(1 - v * 0.35); }
      else s.material.color.setRGB(0.95 - v * 0.9, 0.93 - v * 0.89, 0.88 - v * 0.85);
      s.scale.setScalar(1 + v * 0.35);
    }
    if (worst > 0.85 && !st.warned) { st.warned = true; snd.po({ vol: 0.4, pan: 0 }); ctx.ui.toast(`塩が黒くなっている。黒ずんだ皿に近づいて、${ctx.isTouch ? '皿をタップして' : '[E] で'}替えよう。`); flashPhoto('assets/photos/salt-scene.webp', '', 3); }
    if (worst >= 1.35) return ctx.die('salt');
    // the HUD: the clock and the four plates
    const c = el('hk-night-clock'), shown = `午前 ${hhmm(shownMinutes())}`; if (c.textContent !== shown) c.textContent = shown;
    for (const k of BOWLS) { const b = el(`hk-pip-${k}`); if (b.dataset) b.dataset.state = st.dark[k] > 0.9 ? 'critical' : st.dark[k] > 0.35 ? 'tainted' : 'ok'; }
    el('hk-night-help').textContent = worst > 0.6 ? `黒くなった皿に近づいて、${ctx.isTouch ? 'タップで' : '[E] で'}塩を替える` : '誰の声でも、七時までは戸を開けない';
    if (V.parts.clock) V.parts.clock.set(shownMinutes());
    if (st.night >= NIGHT_SEC && !done('T_DAWN') && !st.dawning) {
      st.dawning = true;
      (async () => { snd.knock({ n: 2, vol: 0.3 }); await talk(T.dawn, { title: '午前七時' }); st.dawning = false; ctx.completeTask('T_DAWN'); })();
    }
  }
  let shakeT = 0, shadowT = 0;
  const shake = (s) => { shakeT = Math.max(shakeT, s); };
  const shadow = (s) => { shadowT = Math.max(shadowT, s); };
  function updateHouseFx(dt, t) {
    const fus = ctx.world.doors.get('D_FUSUMA');
    if (fus && fus.mesh) { shakeT = Math.max(0, shakeT - dt); fus.mesh.position.z = 11 + (shakeT > 0 && !ctx.calm ? Math.sin(t * 40) * 0.02 * Math.min(1, shakeT) : 0); }
    const w = V.parts.windowShadow; shadowT = Math.max(0, shadowT - dt);
    w.group.visible = shadowT > 0 || (lvl() === 1 && st.zashikiShadow > 0);
    w.mat.opacity = Math.min(0.55, shadowT * 0.3 + (st.zashikiShadow > 0 ? 0.3 : 0)) * (0.7 + 0.3 * Math.sin(t * 2.3) ** 2);
    if (st.zashikiShadow > 0) st.zashikiShadow -= dt;
    if (V.parts.pendulum) V.parts.pendulum.rotation.z = Math.sin(t * 2.4) * 0.18;
  }

  // ---------------------------------------------------------------- L4: the morning in the living room, and Ｋさん walking with me to the van
  // She keeps a few metres from me along a small graph of the paths through the house and the village, catches up off screen when I have run ahead, and never blocks anything
  const ESC_N = { ZASH: [-8, 8.5, 'ZASHIKI'], IMA: [-8, 13.5, 'IMA'], DOOR: [-12, 15, 'IMA'], GEN: [-5, 15.6, 'IMA'], KIT: [-14, 16.6, 'DAIDOKORO'], NAN: [-16, 9, 'NANDO'], KAT: [-19, 16.6, 'DAIDOKORO'],
    BACK: [-23, 16.6, 'O_BACK'], BACKN: [-23, 0.5, 'O_BACK'], NORTH: [-12, 0.5, 'O_NORTH'], JUNC: [0.5, 0.5, 'O_FRONT'], FRONT: [-2, 15.6, 'O_FRONT'], GAF: [-3, 22, 'O_FRONT'], GA: [-15, 22, 'O_GARDEN'], GAB: [-23, 21, 'O_GARDEN'],
    FI: [9, 12, 'O_FIELD'], ROADM: [0.5, -13, 'O_ROAD'], SF: [-8, -13.5, 'O_SHOPFRONT'], SR: [9, -12, 'O_SHRINE'], GATEB: [1.5, -22.5, 'O_ROAD'], GATEF: [1.5, -25.5, 'O_GATE'], CAR: [3.2, -31, 'O_GATE'] };
  const ESC_E = [['ZASH', 'IMA'], ['IMA', 'DOOR'], ['IMA', 'GEN'], ['GEN', 'FRONT', 'genkan'], ['DOOR', 'KIT'], ['KIT', 'NAN'], ['KIT', 'KAT'], ['KAT', 'BACK'], ['BACK', 'BACKN'], ['BACK', 'GAB'], ['GAB', 'GA'], ['GA', 'GAF'], ['GAF', 'FRONT'],
    ['BACKN', 'NORTH'], ['NORTH', 'JUNC'], ['JUNC', 'FRONT'], ['FRONT', 'FI'], ['JUNC', 'ROADM'], ['ROADM', 'SF'], ['ROADM', 'SR'], ['ROADM', 'GATEB'], ['GATEB', 'GATEF', 'gate'], ['GATEF', 'CAR']];
  function placeMorning() {
    const P = V.people, seen = st.morning;
    P.k.root.position.set(-9.6, 0, 12.8); P.k.root.rotation.y = Math.PI * 0.8; P.k.set('idle');
    kw.node = 'IMA'; kw.path = null; kw.walking = false;
    if (seen) { P.grandpa.root.position.set(-6.4, 0, 16.6); P.grandpa.root.rotation.y = Math.atan2(-1.6, -5.6); }   // he stays, watching that door
    else { P.grandpa.root.position.set(-6.4, 0, 12.8); P.grandpa.root.rotation.y = -Math.PI * 0.8; }
  }
  async function morningTalk() {
    if (st.morning) return;
    if (kw.talking) return kw.talking;
    kw.talking = (async () => {
      await talk(T.morning, { title: '居間' });
      st.morning = true; kw.talking = null; placeMorning();
      say('鍵は、台所の勝手口の柱。走ると足音で気づかれる。見つかったら立ち止まらず、生垣の陰か家の中へ。', 7);
    })();
    return kw.talking;
  }
  function escRoute(from, to) {
    const open = (g) => (g === 'genkan' ? (() => { const d = ctx.world.doors.get('D_GENKAN'); return d && d.isOpen; })() : g === 'gate' ? done('T_GATE') : true);
    const prev = { [from]: null }, q = [from];
    while (q.length) { const n = q.shift(); if (n === to) break; for (const [a, b, g] of ESC_E) { const m = a === n ? b : b === n ? a : null; if (m && !(m in prev) && open(g)) { prev[m] = n; q.push(m); } } }
    if (!(to in prev)) return null;
    const path = []; for (let n = to; n && n !== from; n = prev[n]) path.unshift(n); return path;
  }
  function updateEscort(dt, c) {
    if (lvl() !== 3 || !st.morning || !V) return;
    const K = V.people.k, R = K.root, p = c.camera.position, d = Math.hypot(R.position.x - p.x, R.position.z - p.z), room = c.state.room;
    const line = (i, cond) => { const id = `e${i}`; if (cond && !st.fired.includes(id)) { st.fired.push(id); const L = T.escort[i]; voice(L[1], L[2], 4.5); } };
    line(0, room !== 'IMA' && d < 9);
    line(1, d > 13);
    line(2, room === 'O_ROAD' && p.z < -17 && !done('T_GATE'));
    if ((kw.t -= dt) <= 0) {
      kw.t = 0.5;
      const near = (ok) => { let best = null, bd = 1e9; for (const [id, n] of Object.entries(ESC_N)) if (ok(n)) { const v = Math.hypot(n[0] - p.x, n[1] - p.z); if (v < bd) { bd = v; best = id; } } return best; };
      const goal = near((n) => n[2] === room) || near(() => true);
      kw.path = goal ? escRoute(kw.node, goal) : null;
      // far behind and out of sight: she has caught up by another way
      if (d > 16 && kw.path && kw.path.length) {
        const dir = new THREE.Vector3(); c.camera.getWorldDirection(dir);
        const unseen = (x, z) => { const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz) || 1; return (dir.x * dx + dir.z * dz) / l < 0.2; };
        if (unseen(R.position.x, R.position.z)) { let jump = null; for (const id of kw.path) { const n = ESC_N[id]; if (Math.hypot(n[0] - p.x, n[1] - p.z) > 5 && unseen(n[0], n[1])) jump = id; } if (jump) { const n = ESC_N[jump]; R.position.set(n[0], 0, n[1]); kw.node = jump; kw.path = escRoute(jump, goal); } }
      }
    }
    const next = kw.path && kw.path[0], tx = d < 2.6 ? null : next ? ESC_N[next][0] : (ESC_N[kw.node] && ESC_N[kw.node][2] === room ? p.x : null), tz = tx == null ? null : next ? ESC_N[next][1] : p.z;
    const walk = tx != null;
    if (walk !== kw.walking) { kw.walking = walk; K.set(walk ? 'walk' : 'idle'); }
    if (!walk) return;
    const dx = tx - R.position.x, dz = tz - R.position.z, l = Math.hypot(dx, dz), step = (d > 7 ? 4.4 : 2.7) * dt;
    if (l <= step) { R.position.x = tx; R.position.z = tz; if (next) { kw.node = next; kw.path.shift(); } return; }
    R.position.x += (dx / l) * step; R.position.z += (dz / l) * step;
    const want = Math.atan2(dx, dz); R.rotation.y += Math.atan2(Math.sin(want - R.rotation.y), Math.cos(want - R.rotation.y)) * Math.min(1, dt * 8);
  }

  // ---------------------------------------------------------------- L5: the van to the border
  const RIDE_Z0 = -34.6, RIDE_Z1 = -72;
  function updateRide(dt) {
    if (lvl() !== 4 || dying || done('T_RIDE')) return;
    st.ride = Math.min(RIDE_SEC, st.ride + dt);
    const k = st.ride / RIDE_SEC, vz = RIDE_Z0 + (RIDE_Z1 - RIDE_Z0) * k;
    V.parts.van.position.z = vz; V.parts.vanLight.position.z = vz - 2.4; V.parts.vanLight.target.position.z = vz - 18;
    const seat = (id) => { const s0 = V.parts.vanSeats.find((x) => x.id === id) || V.parts.vanSeats[0]; return V.parts.van.localToWorld(new THREE.Vector3(s0.x, s0.y, s0.z)); };
    V.parts.van.updateMatrixWorld();
    const D = V.people.driver.root, ds = seat('driver'); D.position.set(ds.x, 0.25, ds.z - 0.2); D.rotation.y = Math.PI;
    const fp = ctx.fp, cam = ctx.camera, grip = gripKey || gripTouch;
    if (grip) { fp.yaw += (0 - fp.yaw) * Math.min(1, dt * 5); fp.pitch += (-0.62 - fp.pitch) * Math.min(1, dt * 5); }
    fp.yaw = clamp(fp.yaw, -1.35, 1.35);
    const me = seat('rear1-right'); cam.position.set(me.x, me.y + 0.25, me.z + Math.sin(st.ride * 9) * 0.004);
    st.curse = curseStep(st.curse, { grip, yaw: fp.yaw, pitch: fp.pitch }, dt);
    if (H) { H.root.visible = k < 0.87; H.root.position.set(3.3 + Math.sin(st.ride * 2) * 0.12, 0, vz - 0.3 - Math.sin(st.ride * 1.3) * 1.2); H.root.rotation.y = Math.PI / 2;
      if (faceT > 0) { H.root.visible = true; H.root.position.set(0.5 + vanHalf() + 0.42, cam.position.y - 2.88, cam.position.z + 0.3); H.root.rotation.y = -Math.PI / 2; }   // she stoops to the glass, her face filling the window
      H.character.lookAt(cam); H.character.setSpeed(0); H.character.update(dt); }
    for (const [t, who, text, fx] of T.ride) if (st.ride >= t && !st.fired.includes(`r${t}`)) { st.fired.push(`r${t}`); if (who === '私') say(text, 3.2); else voice(who, text, 3.2); rideFx(fx); }
    updateRideFx(dt);
    el('hk-ride-bar').style && (el('hk-ride-bar').style.width = `${Math.round(k * 100)}%`);
    el('hk-curse-bar').style && (el('hk-curse-bar').style.width = `${Math.round(st.curse * 100)}%`);
    const threat = el('hk-ride-threat'); const tt = grip ? '' : Math.abs(Math.sin(fp.yaw)) > 0.58 && fp.pitch > -0.3 ? '窓から、目が離せない。' : '窓を見続けない。札を握って、目を伏せる。'; if (threat.textContent !== tt) threat.textContent = tt;
    el('hk-grip').dataset && (el('hk-grip').dataset.on = grip ? '1' : '');
    if (st.curse >= 1) return ctx.die('window');
    if (st.ride >= RIDE_SEC) {
      const recs = ['N_LETTER', 'N_PHOTO', 'N_DIARY'].every((d) => ctx.state.docsRead.includes(d));
      if (recs) ctx.setFlag('records_all', { silent: true });
      snd.knock({ n: 1, vol: 0.2 });
      ctx.completeTask('T_RIDE');
    }
  }


  // the ride's frights (feedback 2026-11-01 "車に乗って行くシーンでもう少し怖いイベント"): steps on the roof, the radio switching itself on,
  // pale hand prints spreading over the right-hand glass from outside, the lights dying, and her face at the window
  let faceT = 0, darkT = 0, hands = null, handsK = 0;
  const vanHalf = () => { const s0 = V.parts.vanSeats.find((x) => x.id === 'rear1-right') || V.parts.vanSeats[0]; return Math.abs(s0.x) * 2; };
  function handPrints() {
    if (hands) return hands;
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    const hand = (x, y, r, k) => {
      g.save(); g.filter = 'blur(2.5px)'; g.translate(x, y); g.rotate(r); g.scale(k, k); g.fillStyle = 'rgba(236,232,220,0.34)';
      g.beginPath(); g.ellipse(0, 0, 21, 26, 0, 0, Math.PI * 2); g.fill();
      for (const [fx, fy, l, a] of [[-16, -19, 30, -0.35], [-6, -27, 40, -0.1], [5, -28, 43, 0.04], [15, -24, 37, 0.17], [23, 4, 25, 0.95]]) { g.save(); g.translate(fx, fy); g.rotate(a); g.beginPath(); g.ellipse(0, -l / 2, 5.5, l / 2, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      const gr = g.createLinearGradient(0, 18, 0, 92); gr.addColorStop(0, 'rgba(236,232,220,0.22)'); gr.addColorStop(1, 'rgba(236,232,220,0)'); g.fillStyle = gr; g.fillRect(-15, 16, 30, 76);
      g.restore();
    };
    [[70, 120, -0.25, 0.62], [150, 70, 0.08, 0.7], [250, 150, 0.22, 0.6], [330, 80, -0.06, 0.66], [420, 170, 0.5, 0.55], [470, 70, -0.4, 0.6], [200, 205, 0.1, 0.5]].forEach((a) => hand(...a));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    const s0 = V.parts.vanSeats.find((x) => x.id === 'rear1-right') || V.parts.vanSeats[0];
    m.position.set(-vanHalf() + 0.005, s0.y + 0.02, s0.z); m.rotation.y = Math.PI / 2; m.renderOrder = 3; m.name = 'hk-hands';
    V.parts.van.add(m); hands = m; return m;
  }
  const noise = (name, o) => ctx.audio && ctx.audio.noise && ctx.audio.noise(name, o);
  function rideFx(fx) {
    if (!fx) return;
    if (fx === 'po') { snd.po({ vol: 0.5, pan: 0.9 }); flashPhoto('assets/photos/ph-van-window.webp', '', 3.5); fear.kick(0.5); }
    if (fx === 'knock') { snd.knock({ pan: 0.9, vol: 0.6 }); fear.kick(0.45); }
    if (fx === 'roof') { noise('thud', { n: 1, gain: 0.9 }); setTimeout(() => noise('thud', { n: 1, gain: 0.8 }), 650); setTimeout(() => noise('thud', { n: 1, gain: 0.7 }), 1250); fear.kick(0.75); darkT = Math.max(darkT, 0.4); }
    if (fx === 'radio') { snd.radio({ sec: 3.2, vol: 0.24 }); fear.kick(0.5); }
    if (fx === 'hands') { handPrints(); handsK = 0.001; noise('tap', { n: 4, gap: 0.22, gain: 0.8 }); fear.kick(0.7); }
    if (fx === 'dark') { darkT = 1.8; noise('rattle', { gain: 0.5 }); fear.kick(0.7); }
    if (fx === 'face') { faceT = 2.4; const j = document.getElementById('hk-jump'); if (j && !ctx.calm) { j.hidden = false; setTimeout(() => { j.hidden = true; }, 700); } snd.po({ vol: 0.95, pan: 0.6 }); snd.sting(); ctx.fx && ctx.fx.spook && ctx.fx.spook(0.8); fear.kick(1); }
  }
  function updateRideFx(dt) {
    faceT = Math.max(0, faceT - dt); darkT = Math.max(0, darkT - dt);
    if (hands && handsK > 0) { handsK = Math.min(1, handsK + dt * 0.5); hands.material.opacity = handsK * 0.9; }
    const L = V.parts.vanLight; if (L) { L.userData.base = L.userData.base || L.intensity; const off = darkT > 0 && (darkT > 0.5 || Math.random() < 0.5); L.intensity = off ? (Math.random() < 0.15 ? L.userData.base * 0.3 : 0) : L.userData.base; }
  }

  // ---------------------------------------------------------------- set up once the world is built
  // the title music (Issue #1, ACE-Step, 32 s, once): browsers only play after a gesture, so it starts with the first touch / key on the
  // title screen and fades out when the game starts
  ext.on('game:booted', (c) => {
    let el = null;
    const go = () => {
      if (el || c.qa) return;
      el = new Audio('assets/audio/music-title.mp3'); el.volume = 0.35 * (c.settings ? c.settings.volume : 0.8);
      el.play().catch(() => {});
    };
    addEventListener('pointerdown', go, { once: true }); addEventListener('keydown', go, { once: true });
    ext.on('game:start', () => {
      removeEventListener('pointerdown', go); removeEventListener('keydown', go);
      if (!el) return; const a = el, v0 = a.volume; let k = 0;
      const t = setInterval(() => { k += 0.1; a.volume = Math.max(0, v0 * (1 - k)); if (k >= 1) { clearInterval(t); a.pause(); } }, 120);
    });
  });
  ext.on('game:ready', (c) => {
    ctx = c; T = c.data.talk; snd = createSound(c); loadVoices();
    // [E] at the gate without the key: that answer is what she needs to run for, so a chase hint ("走れ。") does not cut it off before it has been read
    const chaseHints = new Set(Object.values((c.data.monsters && c.data.monsters.hints) || {}));
    const uiSay = c.ui.say.bind(c.ui);
    let noKeyUntil = 0;
    c.ui.say = (html, sec, o) => {
      const now = performance.now();
      if (html === NO_GATE_KEY) noKeyUntil = now + 8000;
      else if (now < noKeyUntil && chaseHints.has(html)) return undefined;
      return uiSay(html, sec, o);
    };
    c.hk = { state: st, sound: snd };
    V = dressVillage(c);
    fear = createFear(c);   // tremble, heartbeat, the dark edges (kit js/fear-fx.js, feedback 2026-11-01)
    H = makeHasshaku({ detail: 1 }); H.root.visible = false; c.scene.add(H.root);
    moon = new THREE.PointLight(0xc4d2e4, 0, 9, 1); c.scene.add(moon);
    // the gate is held by its three turn-buttons until T_GATE is done (the standard door then opens)
    const gate = c.world.doors.get('D_GATE'); if (gate) { const base = gate.locked; gate.locked = () => !done('T_GATE') || base(); }
    // in the night the fusuma is shut from the inside; the voice is behind it
    const fus = c.world.doors.get('D_FUSUMA'); if (fus) { const base = fus.locked; fus.locked = () => lvl() === 2 || base(); }
    // night-only things to use: the four plates and the voice at the fusuma
    const mk = (name, x, y, z, s = [0.5, 0.5, 0.5]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(...s), new THREE.MeshBasicMaterial({ visible: false })); m.position.set(x, y, z); m.name = name; c.world.group.add(m); return m; };
    for (const k of BOWLS) { const p = V.parts.plates[k].group.position; const m = mk(`hk-salt:${k}`, p.x, 0.6, p.z); m.userData.interact = { kind: 'hk-salt', id: k }; c.world.interactables.push(m); nightMarks[k] = m; m.visible = false; }
    voiceMark = mk('hk-voice', -8.0, 1.3, 10.75, [1.6, 1.6, 0.3]); voiceMark.userData.interact = { kind: 'hk-voice', id: 'door' }; c.world.interactables.push(voiceMark); voiceMark.visible = false;
    // the flashlight (rule S3: the tool is in hand from the start; [F] or the touch button)
    light = new THREE.SpotLight(0xffefc7, 26, 22, Math.PI / 6.5, 0.7, 1.3); light.visible = false; light.userData.auto = true; c.scene.add(light, light.target);
    // HUD parts of this game
    document.body.insertAdjacentHTML('beforeend', `
      <div id="hk-photo" class="hk-photo" hidden></div>
      <div id="hk-jump" class="hk-jump" hidden><img src="assets/photos/face.webp" alt=""></div>
      <div id="hk-night" class="hk-panel" hidden><p class="hk-panel-cap">朝七時になるまで、開けない。</p><p id="hk-night-clock" class="hk-clock">午前 01:00</p><div class="hk-pips">${BOWLS.map((k) => `<span id="hk-pip-${k}" class="hk-pip" data-state="ok">${BOWL_NAMES[k]}</span>`).join('')}</div><p id="hk-night-help" class="hk-panel-help">誰の声でも、七時までは戸を開けない</p></div>
      <div id="hk-ride" class="hk-ride" hidden><p class="hk-panel-cap">村境まで</p><div class="hk-bar"><i id="hk-ride-bar"></i></div><p class="hk-panel-cap">引き寄せられる</p><div class="hk-bar hk-bar--curse"><i id="hk-curse-bar"></i></div><p id="hk-ride-threat" class="hk-ride-threat" aria-live="polite"></p><button type="button" id="hk-grip" class="btn primary hk-grip">押し続けて札を握る</button></div>
      <button type="button" id="hk-light" class="btn hk-light" aria-label="懐中電灯">灯り</button>`);
    c.registerHudPart && c.registerHudPart('hk-night', { slot: 'tr', order: 30 });
    const g = document.getElementById('hk-grip');
    const on = (e) => { e.preventDefault(); gripTouch = true; }, off = () => { gripTouch = false; };
    g.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) g.addEventListener(ev, off);
    document.getElementById('hk-light').onclick = () => toggleLight();
    if (c.isTouch) c.registerHudPart && c.registerHudPart('hk-light', { slot: 'br', order: 5 }); else document.getElementById('hk-light').hidden = true;
    addEventListener('keydown', (e) => { if (lvl() === 4 && (e.code === 'Space' || e.code === 'KeyE')) { gripKey = true; e.preventDefault(); } });
    addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'KeyE') gripKey = false; });
    c.hudStressHooks && c.hudStressHooks.push((onOff) => { el('hk-night').hidden = !onOff; });
    c.warmImages = [...(c.warmImages || []), 'assets/photos/face.webp', 'assets/photos/salt-scene.webp', 'assets/photos/encounter.webp'];
    // tests (window.__gf when ?qa / ?debug): jump the night or the ride, read the state
    if (window.__gf || c.qa || c.debug) window.__hk = { st, nightClock, applyStage, skipNight: () => { st.night = NIGHT_SEC - 0.1; }, skipRide: () => { st.ride = RIDE_SEC - 0.1; }, ride: () => ({ ride: st.ride, curse: st.curse }), H: () => H, V: () => V, kw };
  });
  function toggleLight(on) { if (!light) return; light.userData.auto = false; light.visible = on ?? !light.visible; ctx.ui.toast(light.visible ? '懐中電灯をつけた。' : '懐中電灯を消した。'); }
  ext.on('input:key', (k) => {
    if (k.code === 'KeyF') { toggleLight(); k.handled = true; }
    if (lvl() === 4 && (k.code === 'KeyE' || k.code === 'Space')) k.handled = true;   // in the van, E is "hold the talisman"
  });
  ext.on('game:start', async ({ resume }) => {
    resetStageLocal(); dying = false;
    applyStage();
    if (light) light.visible = lvl() >= 1 && lvl() !== 4;
    if (!resume) {
      await talk(T.opening, { title: '八月の夕方', last: '探索を始める' });
      say('まずは玄関の外の地図板を見よう。夕霧商店は、道を北へ。', 6);
    } else say(`第${['一', '二', '三', '四', '五'][lvl()]}段階から再開した。${ctx.isTouch ? '右上のメニューから手帳と地図を開ける' : 'Tab で手帳、M で地図を開ける'}。`, 5);
  });
  ext.on('stage:up', async () => {
    applyStage();
    const i = lvl();
    if (light) light.visible = i >= 1 && i !== 4;
    if (i === 1) setTimeout(() => say(T.hints.items_first, 7), 1500);
    if (i === 2) { resetStageLocal(); setTimeout(() => say(T.night_start, 6), 800); }
    if (i === 3) setTimeout(() => say('襖が開いた。居間へ出よう。', 5), 900);
    if (i === 4) { resetStageLocal(); ctx.fp.yaw = 0; ctx.fp.pitch = -0.4; setTimeout(() => say('札を握っていれば、目を伏せていられる。窓は見ない。', 6), 600); }   // the ride starts looking down at the hands, not at the window
  });
  ext.on('door:open', ({ id }) => {
    if (id === 'D_GENKAN' && !st.genkan && lvl() === 0) { st.genkan = true; snd.knock({ n: 1, vol: 0.15, pan: -0.6 }); say(T.genkan_first, 6); }
  });
  ext.on('player:room', ({ to }) => {
    if (to === 'ZASHIKI' && lvl() === 1 && !st.zashiki) { st.zashiki = true; snd.scrape({ vol: 0.3, pan: -0.4 }); st.zashikiShadow = 4; say('北の座敷だけ、空気がひどく冷たい。窓の外で、靴を擦る音が止まった。', 5.5); }
    if (to === 'IMA' && lvl() === 3) morningTalk();
    if (to === 'O_ROAD' && lvl() === 0 && !st.first.road) { st.first.road = true; setTimeout(() => snd.po({ vol: 0.12, pan: 0.9 }), 1500); }
  });
  ext.on('doc:read', ({ id }) => {
    const recs = ['N_LETTER', 'N_PHOTO', 'N_DIARY'];
    if (recs.includes(id)) { const n = recs.filter((d) => ctx.state.docsRead.includes(d)).length; ctx.ui.toast(`記録 ${n} / 3`); if (n === 1) setTimeout(() => say(T.hints.records, 6), 1200); }
  });
  ext.on('item:pickup', ({ id }) => { if (id === 'I_OFUDA') say('Ｋさんの札は二枚。一枚を戸に、もう一枚を手元に。', 5); });


  // fear on the body (feedback 2026-11-01 "八尺様にあった時ももう少し震えや心音"): how near and how much in view she is, 0..1
  function fearLevel() {
    if (dying) return 0;
    const i = lvl(), cam = ctx.camera;
    if (i === 0 && H && H.root.visible) {
      if (st.seen) return H.seenT < 6.5 ? Math.max(0.35, 1 - Math.max(0, H.seenT - 4) / 2.5) : 0;
      const d = H.root.position.distanceTo(cam.position); return Math.min(0.55, (H.gaze || 0) * 0.8 + Math.max(0, (30 - d) / 30) * 0.15);
    }
    if (i === 3) return (ctx.fxState && ctx.fxState.danger) || 0;
    if (i === 4 && st.ride > 0 && !done('T_RIDE')) return 0.22 + st.curse * 0.75;
    if (i === 2) return Math.min(0.5, Math.max(...Object.values(st.dark)) * 0.4);
    return 0;
  }
  function updateFear(dt) { if (fear) fear.update(dt, fearLevel(), { heart: !(lvl() === 3 && ctx.fxState && ctx.fxState.chasing) }); }   // in the chase the monster pack beats the heart

  // ---------------------------------------------------------------- per frame
  ext.registerSystem('hasshaku-story', { update: (dt, c, active) => {
    if (!V) return;
    const t = performance.now() / 1000;
    V.updatePeople(dt, c.camera);
    updateHouseFx(dt, t);
    if (light && light.visible) { light.position.copy(c.camera.position); const dir = new THREE.Vector3(); c.camera.getWorldDirection(dir); light.target.position.copy(c.camera.position).addScaledVector(dir, 6); }
    if (V.parts.gateDials) V.parts.gateDials.forEach((d, i) => { const want = -(st.gate[i] || 0) * Math.PI / 2; d.rotation.z += (want - d.rotation.z) * Math.min(1, dt * 8); });
    if (V.parts.gate) { const G = V.parts.gate; G.open += ((G.target || 0) - G.open) * Math.min(1, dt * 2); G.left.rotation.y = -G.open * 1.6; G.right.rotation.y = G.open * 1.6; }
    if (!active) { if (lvl() === 4 && !dying && c.state.started && !c.wm.isOpen) { /* keep the seat even when the pointer is free */ } return; }
    st.played += dt;
    // ?qa (the smoke test): the night and the ride follow the wall clock ten times faster (headless frames are slow and dt is capped)
    const now = performance.now(), wall = st.wallT ? Math.min(2, (now - st.wallT) / 1000) : dt; st.wallT = now;
    const qdt = c.qa && !window.__hkRealtime ? wall * 10 : dt;   // window.__hkRealtime: the playthrough test keeps game time
    updateSighting(dt);
    if (lookAt) { turnTo(lookAt.x, lookAt.y, lookAt.z, Math.min(1, dt * 4)); if ((lookAt.t -= dt) <= 0) lookAt = null; }
    updateNight(qdt);
    updateRide(qdt);
    updateEscort(dt, c);
    updateFear(dt);
    const room = c.data.plan.rooms.find((r) => r.id === c.state.room);
    if (V.prints) V.prints.visible = lvl() >= 3;   // W13: the footprints are there in the morning
    snd.update(dt, { level: lvl() === 4 && !st.ride ? 3 : lvl(), outdoor: !room || room.kind === 'outdoor' || lvl() === 4, insects: lvl() === 4 ? 0 : lvl() === 3 ? 0.3 : 1, wind: lvl() === 2 ? 0.2 : lvl() === 4 ? 0.04 : 0.12, engine: lvl() === 4 && !done('T_RIDE') });
  } });
}
