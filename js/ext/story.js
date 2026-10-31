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
import { saltGame, gateGame } from './minigames.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const NIGHT_SEC = 150;          // 01:00 -> 07:00 in 150 s of play
export const RIDE_SEC = 30;            // the van from the gate to the border
export const SALT_START = { NW: 22, NE: 75, SW: 108, SE: 48 };   // when each plate starts to turn black (s into the night)
export const SALT_RATE = 0.022;        // per second; 0.85 = the warning, 1.35 = the room's guard breaks (death)
export const BOWLS = ['NW', 'NE', 'SW', 'SE'];
export const BOWL_NAMES = { NW: '北西', NE: '北東', SW: '南西', SE: '南東' };
export function nightClock(t) { const m = 60 + Math.floor((clamp(t, 0, NIGHT_SEC) / NIGHT_SEC) * 360); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
// in the van: looking at the side window raises the pull, holding the talisman lowers it (rates per second)
export function curseStep(curse, { grip, yaw, pitch }, dt) {
  const atWindow = Math.abs(Math.sin(yaw)) > 0.58 && pitch > -0.3;
  return clamp(curse + dt * (grip ? -0.19 : atWindow ? 0.2 : 0.012), 0, 1);
}

export default function story(ext) {
  const st = { seen: false, genkan: false, zashiki: false, gate: [0, 0, 0], deaths: 0, night: 0, dark: { NW: 0, NE: 0, SW: 0, SE: 0 }, warned: false, fired: [], ride: 0, curse: 0, startedAt: 0, played: 0, first: { road: false, po: false } };
  let ctx = null, V = null, T = null, snd = null, H = null, light = null, dying = false, gripKey = false, gripTouch = false;
  const lvl = () => (ctx && ctx.prog ? ctx.prog.index : 0);
  const done = (id) => ctx.state.tasks.includes(id);
  const say = (text, sec) => ctx.monologue(text, sec ?? Math.min(9, 2.4 + String(text).length * 0.09));
  const voice = (who, text, sec) => ctx.ui.say(`<span class="hk-who">${esc(who)}</span>${esc(text)}`, sec ?? Math.min(8, 2.6 + String(text).length * 0.1));

  ext.registerMinigame('salt', saltGame);
  ext.registerMinigame('gate', gateGame);
  ext.registerUi('title', {
    kicker: 'HASSHAKU ／ A FIRST-PERSON FOLK HORROR',
    tagline: '祖父に頼まれた、夕暮れの買い物。店までの地図をたどった帰り道で、見てはいけないものを見た。',
    meta: '五つの段階 ・ 約25分 ・ PC・スマートフォン ・ ヘッドホン推奨',
    note: '怪異の姿、追われて捕まる場面、驚かせる表現があります（設定の「おだやか」で弱められます）。ネット怪談「八尺様」を題材にした創作です。',
  });
  ext.registerPersist('hasshaku', {
    serialize: () => ({ seen: st.seen, genkan: st.genkan, zashiki: st.zashiki, gate: st.gate, deaths: st.deaths, played: st.played }),
    restore: (j) => { Object.assign(st, { seen: false, genkan: false, zashiki: false, gate: [0, 0, 0], deaths: 0, played: 0 }, j || {}); resetStageLocal(); },
  });
  function resetStageLocal() { st.night = 0; st.dark = { NW: 0, NE: 0, SW: 0, SE: 0 }; st.warned = false; st.fired = []; st.ride = 0; st.curse = 0; }

  // ---------------------------------------------------------------- conversation window (one window, tap / Enter to go on: S11)
  function talk(lines, o = {}) {
    st.talkLog = [...(st.talkLog || []), o.title || '会話'];
    if (ctx.qa) return Promise.resolve(true);   // ?qa (the tests): no conversation window, like the kit's mini games
    return new Promise((resolve) => {
      let i = 0;
      const render = (el) => {
        const L = lines[i], last = i === lines.length - 1;
        const me = L.who === '私';
        el.innerHTML = `<div class="hk-talk${me ? ' hk-talk--me' : ''}">${L.img ? `<img class="hk-talk-img" src="${esc(L.img)}" alt="">` : ''}<p class="hk-talk-who">${esc(L.who)}${L.where ? `<span>（${esc(L.where)}）</span>` : ''}</p><p class="hk-talk-text">${esc(L.text)}</p><div class="hk-talk-foot"><span class="hk-talk-n">${i + 1} / ${lines.length}</span><button type="button" class="btn primary hk-talk-next">${last ? esc(o.last || '閉じる') : '次へ'}</button></div></div>`;
        const b = el.querySelector('.hk-talk-next'); b.onclick = () => { if (last) { ctx.wm.close(); } else { i++; render(el); } }; setTimeout(() => b.focus(), 30);
        el.querySelector('.hk-talk-text').onclick = () => b.click();
      };
      ctx.wm.open('talk', { title: o.title || '会話', size: lines.some((l) => l.img) ? 'm' : 's', locked: true, render, onClose: () => resolve(true) });
    });
  }
  // a found picture at the top of the screen (U14: things above, thoughts below)
  function flashPhoto(src, caption, sec = 2.2) {
    const el = document.getElementById('hk-photo'); if (!el) return;
    el.innerHTML = `<img src="${esc(src)}" alt="">${caption ? `<p>${esc(caption)}</p>` : ''}`;
    el.hidden = false; clearTimeout(flashPhoto.t); flashPhoto.t = setTimeout(() => { el.hidden = true; }, sec * 1000);
  }
  function choose(c) {
    if (ctx.qa && window.__hkChoice) return Promise.resolve(window.__hkChoice);
    return new Promise((resolve) => {
      ctx.wm.open('choice', { title: c.who, size: 's', locked: true, render: (el) => {
        el.innerHTML = `<div class="hk-talk"><p class="hk-talk-text">${esc(c.text).replace(/\n/g, '<br>')}</p><div class="hk-choices"><button type="button" class="btn hk-choice" data-v="open">${esc(c.open)}</button><button type="button" class="btn primary hk-choice" data-v="keep">${esc(c.keep)}</button></div></div>`;
        el.querySelectorAll('.hk-choice').forEach((b) => { b.onclick = () => { ctx.wm.close(); resolve(b.dataset.v); }; });
        setTimeout(() => el.querySelector('[data-v="keep"]').focus(), 30);
      }, onClose: () => resolve(null) });
    });
  }
  // a kit mini game (align / wipe ...) or one of ours, inside a task's own run()
  async function playMG(task) {
    const mg = task.minigame; if (!mg) return true;
    if (mg.type === 'salt' || mg.type === 'gate') {
      if (ctx.qa) return true;
      const host = document.createElement('div'); host.id = 'mg-custom'; host.className = 'gf-overlay'; document.body.appendChild(host);
      ctx.fp.release();
      try { return !!(await (mg.type === 'salt' ? saltGame : gateGame).mount(host, mg.cfg || {}, ctx)); } finally { host.remove(); }
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
    if (!st.seen) { st.seen = true; snd.sting(); flashPhoto('assets/photos/encounter.webp', '帰ってきた道の向こう。白い帽子が、生垣の上を通り過ぎた。', 3); }
    if (H) H.root.visible = false;
    await talk(T.report, { title: '居間' });
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
  ext.registerTask('T_DAWN', { canStart: () => `時計はまだ ${nightClock(st.night)}。七時まで、戸は開けない。` });
  ext.registerTask('T_GATE', { run: async (c, task) => {
    if (!(await playMG(task))) return false;
    snd.knock({ n: 1, vol: 0.5, pan: 0 });
    await talk(T.gate_opened, { title: '農道の車止め' });
    return true;
  }, onDone: () => { const d = ctx.world.doors.get('D_GATE'); d && d.open(); } });
  ext.registerTask('T_CAR', { run: async () => { await talk(T.boarded, { title: '迎えの車' }); return true; } });
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
      const c = T.door_choice, v = await choose(c);
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
    const show = () => c.wm.open('death', { title: '声の向こう', size: 's', locked: true, render: (el) => {
      el.innerHTML = `<div class="hk-death"><p class="hk-death-kicker">THE VOICE WAS NOT HIS</p>${c.calm ? '' : '<img class="hk-death-img" src="assets/photos/face.webp" alt="">'}<p class="hk-death-text">${esc((T.deaths || {})[reason] || T.deaths.monster)}</p><div class="hk-choices"><button type="button" class="btn primary" data-retry>この段階からやり直す</button></div></div>`;
      const b = el.querySelector('[data-retry]'); b.onclick = () => { c.wm.close(); }; setTimeout(() => b.focus(), 30);
    }, onClose: () => {
      dying = false; resetStageLocal(); applyStage();
      c.setFloor(c.checkpoint.floor || 0, c.checkpoint); c.fp.yaw = c.checkpoint.yaw || 0;
      c.bus.emit('player:respawn', { room: c.world.roomAt(c.checkpoint.x, c.checkpoint.z, c.camera.position.y) });
      c.ui.toast(`第${['一', '二', '三', '四', '五'][lvl()]}段階の区切りから、やり直します。`);
    } });
    const el = document.getElementById('hk-jump');
    if (el && !c.calm) { el.hidden = false; setTimeout(() => { el.hidden = true; show(); }, 900); } else show();
  } });
  // the ending: the kicker, the picture, the epilogue and how the night went
  ext.registerScreen('ending', { keepSave: false, open: (c, e) => {
    const sec = Math.round(st.played), recs = ['N_LETTER', 'N_PHOTO', 'N_DIARY'].filter((d) => c.state.docsRead.includes(d)).length;
    c.wm.open('ending', { title: e.title, size: 'm', locked: true, render: (el) => {
      el.innerHTML = `<div class="hk-ending"><p class="hk-death-kicker">${esc(e.kicker || '')}</p>${e.photo ? `<img class="hk-talk-img" src="${esc(e.photo)}" alt="">` : ''}${e.text.split('\n').map((p) => `<p>${esc(p)}</p>`).join('')}<p class="hk-ending-stats">5 / 5 段階 ・ 記録 ${recs} / 3 ・ やり直し ${st.deaths} 回 ・ ${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒</p><div class="hk-choices"><button type="button" class="btn primary" data-title>タイトルに戻る</button></div></div>`;
      el.querySelector('[data-title]').onclick = () => location.reload();
    } });
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
    P.grandpa.root.visible = i <= 1;
    P.k.root.visible = i === 1;
    P.lady.root.visible = i <= 1;
    P.driver.root.visible = i >= 3;
    V.parts.van.visible = i === 3; V.parts.vanLight.visible = i >= 3; V.parts.vanInside.visible = i === 4;   // in the van: the inside instead of the shell
    V.parts.shopLight.intensity = i === 2 ? 4 : 10;
    for (const k of BOWLS) V.parts.plates[k].salt.visible = done(`T_SALT_${k}`);
    V.parts.windowPapers.visible = done('T_WINDOW');
    V.parts.sealPaper.visible = done('T_SEAL');
    const fus = ctx.world.doors.get('D_FUSUMA');
    if (fus) { if (i === 2) { fus.close(); fus.def.hint = '七時までは、開けない。'; } else fus.def.hint = '北の座敷は閉め切ってある。今は、居間の祖父に話すのが先だ。'; fus.mesh.visible = !fus.isOpen; }
    if (i >= 1 && light) light.userData.auto && (light.visible = true);
    for (const k of BOWLS) nightMarks[k].visible = i === 2;
    voiceMark.visible = i === 2;
    const g = ctx.world.doors.get('D_GATE'); if (g && done('T_GATE')) g.open();
    const katte = ctx.world.doors.get('D_KATTE'); if (katte && i >= 3) katte.open();   // at dawn the grandfather unbolts the back door
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
      const idx = ctx.world.interactables.indexOf(m), over = ts.length && ts.every((t) => done(t.id));
      if (over && idx >= 0) ctx.world.interactables.splice(idx, 1); else if (!over && idx < 0) ctx.world.interactables.push(m);
    }
  }
  const el = (id) => document.getElementById(id) || {};

  // ---------------------------------------------------------------- L1: the sighting
  function showSighting() { if (!H) return; H.root.visible = true; H.root.position.set(6.3, 0, 12.5); H.root.rotation.y = -Math.PI / 2; H.walk = 0; }
  const tmpV = new THREE.Vector3();
  function updateSighting(dt) {
    if (!H || !H.root.visible || lvl() !== 0) return;
    const cam = ctx.camera, p = cam.position;
    H.root.position.z = Math.min(21.5, H.root.position.z + dt * 0.22); H.character.setSpeed(0.22); H.character.update(dt);
    if (st.seen) { if (ctx.state.room === 'IMA' || H.root.position.z >= 21.5) H.root.visible = false; return; }
    const head = tmpV.copy(H.root.position).setY(2.6), d = head.distanceTo(p);
    const look = new THREE.Vector3(); cam.getWorldDirection(look);
    const dot = look.dot(head.clone().sub(p).normalize());
    H.gaze = (H.gaze || 0) + (d < 24 && dot > 0.8 ? dt : -dt * 0.5); H.gaze = Math.max(0, H.gaze);
    if (H.gaze > 0.6 || (p.z > 8.5 && p.x > -4.2 && p.x < 5)) {
      st.seen = true; snd.po({ vol: 0.55, pan: clamp((H.root.position.x - p.x) / 8, -1, 1) }); snd.sting();
      H.character.lookAt(cam);
      say(T.seen, 8);
    }
  }

  // ---------------------------------------------------------------- L3: the night
  const nightMarks = {}; let voiceMark = null;
  function updateNight(dt) {
    if (lvl() !== 2 || dying) return;
    st.night += dt;
    for (const [t, who, text, fx] of T.night) {
      if (st.night >= t && !st.fired.includes(t)) {
        st.fired.push(t);
        if (who === '私') say(text, 5.5); else voice(who, text, 5.5);
        if (fx === 'knock') { snd.knock({ pan: 0.2 }); shake(1.6); }
        if (fx === 'knockFinal') { snd.knock({ n: 5, vol: 0.9, pan: 0.1 }); snd.sting(); shake(3.5); }
        if (fx === 'po') { snd.po({ vol: 0.5, pan: -0.2 }); shadow(7); }
      }
    }
    let worst = 0;
    for (const k of BOWLS) {
      if (st.night > SALT_START[k] && !(ctx.qa && !window.__hkSalt)) st.dark[k] = Math.min(1.4, st.dark[k] + dt * SALT_RATE);   // ?qa: the smoke does not tend the salt (window.__hkSalt = true turns it back on)
      worst = Math.max(worst, st.dark[k]);
      const s = V.parts.plates[k].salt, v = clamp(st.dark[k] / 1.0, 0, 1);
      s.material.color.setRGB(0.95 - v * 0.9, 0.93 - v * 0.89, 0.88 - v * 0.85); s.scale.setScalar(1 + v * 0.35);
    }
    if (worst > 0.85 && !st.warned) { st.warned = true; snd.po({ vol: 0.4, pan: 0 }); ctx.ui.toast('塩が黒くなっている。黒ずんだ皿に近づいて、[E] で替えよう。'); flashPhoto('assets/photos/salt-scene.webp', '', 1.2); }
    if (worst >= 1.35) return ctx.die('salt');
    // the HUD: the clock and the four plates
    const c = el('hk-night-clock'); if (c.textContent !== `午前 ${nightClock(st.night)}`) c.textContent = `午前 ${nightClock(st.night)}`;
    for (const k of BOWLS) { const b = el(`hk-pip-${k}`); if (b.dataset) b.dataset.state = st.dark[k] > 0.9 ? 'critical' : st.dark[k] > 0.35 ? 'tainted' : 'ok'; }
    el('hk-night-help').textContent = worst > 0.6 ? '黒くなった皿に近づいて、[E] で塩を替える' : '誰の声でも、七時までは戸を開けない';
    if (V.parts.clockHand) V.parts.clockHand.rotation.z = -(st.night / NIGHT_SEC) * Math.PI;
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
    if (fus && fus.mesh) { shakeT = Math.max(0, shakeT - dt); fus.mesh.position.z = 10.4 + (shakeT > 0 && !ctx.calm ? Math.sin(t * 40) * 0.02 * Math.min(1, shakeT) : 0); }
    const w = V.parts.windowShadow; shadowT = Math.max(0, shadowT - dt);
    w.group.visible = shadowT > 0 || (lvl() === 1 && st.zashikiShadow > 0);
    w.mat.opacity = Math.min(0.55, shadowT * 0.3 + (st.zashikiShadow > 0 ? 0.3 : 0)) * (0.7 + 0.3 * Math.sin(t * 2.3) ** 2);
    if (st.zashikiShadow > 0) st.zashikiShadow -= dt;
    if (V.parts.pendulum) V.parts.pendulum.rotation.z = Math.sin(t * 2.4) * 0.18;
  }

  // ---------------------------------------------------------------- L5: the van to the border
  const RIDE_Z0 = -34.6, RIDE_Z1 = -72;
  function updateRide(dt) {
    if (lvl() !== 4 || dying || done('T_RIDE')) return;
    st.ride = Math.min(RIDE_SEC, st.ride + dt);
    const k = st.ride / RIDE_SEC, vz = RIDE_Z0 + (RIDE_Z1 - RIDE_Z0) * k;
    V.parts.van.position.z = vz; V.parts.vanInside.position.z = vz; V.parts.vanLight.position.z = vz - 2.4; V.parts.vanLight.target.position.z = vz - 18;
    const D = V.people.driver.root; D.position.set(0.08, 0.2, vz - 0.85);
    const fp = ctx.fp, cam = ctx.camera, grip = gripKey || gripTouch;
    if (grip) { fp.yaw += (0 - fp.yaw) * Math.min(1, dt * 5); fp.pitch += (-0.62 - fp.pitch) * Math.min(1, dt * 5); }
    fp.yaw = clamp(fp.yaw, -1.35, 1.35);
    cam.position.set(0.92, 1.45, vz + 0.45 + Math.sin(st.ride * 9) * 0.004);
    st.curse = curseStep(st.curse, { grip, yaw: fp.yaw, pitch: fp.pitch }, dt);
    if (H) { H.root.visible = k < 0.87; H.root.position.set(3.3 + Math.sin(st.ride * 2) * 0.12, 0, vz - 0.3 - Math.sin(st.ride * 1.3) * 1.2); H.root.rotation.y = Math.PI / 2; H.character.lookAt(cam); H.character.setSpeed(0); H.character.update(dt); }
    for (const [t, who, text, fx] of T.ride) if (st.ride >= t && !st.fired.includes(`r${t}`)) { st.fired.push(`r${t}`); if (who === '私') say(text, 5); else voice(who, text, 5); if (fx === 'po') snd.po({ vol: 0.5, pan: 0.9 }); if (fx === 'knock') snd.knock({ pan: 0.9, vol: 0.6 }); }
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

  // ---------------------------------------------------------------- set up once the world is built
  ext.on('game:ready', (c) => {
    ctx = c; T = c.data.talk; snd = createSound(c);
    c.hk = { state: st, sound: snd };
    V = dressVillage(c);
    H = makeHasshaku({ detail: 1 }); H.root.visible = false; c.scene.add(H.root);
    // the gate is held by its three turn-buttons until T_GATE is done (the standard door then opens)
    const gate = c.world.doors.get('D_GATE'); if (gate) { const base = gate.locked; gate.locked = () => !done('T_GATE') || base(); }
    // in the night the fusuma is shut from the inside; the voice is behind it
    const fus = c.world.doors.get('D_FUSUMA'); if (fus) { const base = fus.locked; fus.locked = () => lvl() === 2 || base(); }
    // night-only things to use: the four plates and the voice at the fusuma
    const mk = (name, x, y, z, s = [0.5, 0.5, 0.5]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(...s), new THREE.MeshBasicMaterial({ visible: false })); m.position.set(x, y, z); m.name = name; c.world.group.add(m); return m; };
    for (const k of BOWLS) { const p = V.parts.plates[k].group.position; const m = mk(`hk-salt:${k}`, p.x, 0.6, p.z); m.userData.interact = { kind: 'hk-salt', id: k }; c.world.interactables.push(m); nightMarks[k] = m; m.visible = false; }
    voiceMark = mk('hk-voice', -8.0, 1.3, 10.15, [1.6, 1.6, 0.3]); voiceMark.userData.interact = { kind: 'hk-voice', id: 'door' }; c.world.interactables.push(voiceMark); voiceMark.visible = false;
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
    if (window.__gf || c.qa || c.debug) window.__hk = { st, nightClock, applyStage, skipNight: () => { st.night = NIGHT_SEC - 0.1; }, skipRide: () => { st.ride = RIDE_SEC - 0.1; }, ride: () => ({ ride: st.ride, curse: st.curse }) };
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
    } else say(`第${['一', '二', '三', '四', '五'][lvl()]}段階から再開した。Tab で手帳、M で地図を開ける。`, 5);
  });
  ext.on('stage:up', async () => {
    applyStage();
    const i = lvl();
    if (light) light.visible = i >= 1 && i !== 4;
    if (i === 1) setTimeout(() => say(T.hints.items_first, 7), 1500);
    if (i === 2) { resetStageLocal(); setTimeout(() => say(T.night_start, 6), 800); }
    if (i === 3) setTimeout(() => say('走ると、足音で気づかれる。見つかったら立ち止まらず、生垣の陰か家の中へ。', 7), 900);
    if (i === 4) { resetStageLocal(); setTimeout(() => say('札を握っていれば、目を伏せていられる。窓は見ない。', 6), 600); }
  });
  ext.on('door:open', ({ id }) => {
    if (id === 'D_GENKAN' && !st.genkan && lvl() === 0) { st.genkan = true; snd.knock({ n: 1, vol: 0.15, pan: -0.6 }); say(T.genkan_first, 6); }
  });
  ext.on('player:room', ({ to }) => {
    if (to === 'ZASHIKI' && lvl() === 1 && !st.zashiki) { st.zashiki = true; snd.scrape({ vol: 0.3, pan: -0.4 }); st.zashikiShadow = 4; say('北の座敷だけ、空気がひどく冷たい。窓の外で、靴を擦る音が止まった。', 5.5); }
    if (to === 'O_ROAD' && lvl() === 0 && !st.first.road) { st.first.road = true; setTimeout(() => snd.po({ vol: 0.12, pan: 0.9 }), 1500); }
  });
  ext.on('doc:read', ({ id }) => {
    const recs = ['N_LETTER', 'N_PHOTO', 'N_DIARY'];
    if (recs.includes(id)) { const n = recs.filter((d) => ctx.state.docsRead.includes(d)).length; ctx.ui.toast(`記録 ${n} / 3`); if (n === 1) setTimeout(() => say(T.hints.records, 6), 1200); }
  });
  ext.on('item:pickup', ({ id }) => { if (id === 'I_OFUDA') say('Ｋさんの札は二枚。一枚を戸に、もう一枚を手元に。', 5); });

  // ---------------------------------------------------------------- per frame
  ext.registerSystem('hasshaku-story', { update: (dt, c, active) => {
    if (!V) return;
    const t = performance.now() / 1000;
    V.updatePeople(dt, c.camera);
    updateHouseFx(dt, t);
    if (light && light.visible) { light.position.copy(c.camera.position); const dir = new THREE.Vector3(); c.camera.getWorldDirection(dir); light.target.position.copy(c.camera.position).addScaledVector(dir, 6); }
    if (V.parts.gate) { const G = V.parts.gate; G.open += ((G.target || 0) - G.open) * Math.min(1, dt * 2); G.left.rotation.y = -G.open * 1.6; G.right.rotation.y = G.open * 1.6; }
    if (!active) { if (lvl() === 4 && !dying && c.state.started && !c.wm.isOpen) { /* keep the seat even when the pointer is free */ } return; }
    st.played += dt;
    // ?qa (the smoke test): the night and the ride follow the wall clock ten times faster (headless frames are slow and dt is capped)
    const now = performance.now(), wall = st.wallT ? Math.min(2, (now - st.wallT) / 1000) : dt; st.wallT = now;
    const qdt = c.qa && !window.__hkRealtime ? wall * 10 : dt;   // window.__hkRealtime: the playthrough test keeps game time
    updateSighting(dt);
    updateNight(qdt);
    updateRide(qdt);
    const room = c.data.plan.rooms.find((r) => r.id === c.state.room);
    snd.update(dt, { outdoor: !room || room.kind === 'outdoor' || lvl() === 4, insects: lvl() === 3 || lvl() === 4 ? 0.3 : 1, wind: lvl() === 2 ? 0.2 : 0.12 });
  } });
}
