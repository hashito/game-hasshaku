// Stage route check: plays stages I→V and both endings in a headless browser.
// Every required interaction is reached the way a player would: a flood fill over the walkable floor (the game's own
// collision test) from where the player stands must reach a spot from which the game itself shows the prompt; the bot
// then stands there and presses the real E key (held for long-press actions). Stage III's night and stage V's drive are
// fast-forwarded. Needs the page opened with ?qa=1 (window.__hasshakuQA).
// CLI: node tools/route.mjs [url]   (default: serves dist/ locally)
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./cdp.mjs";
import { serve } from "./serve.mjs";

// Runs in the page: breadth-first search over 0.25 m cells from the player's position.
// Returns the nearest reachable spot where the game's own interaction test (B1) selects `id`.
const FIND = `(id,goal)=>{const Q=window.__hasshakuQA,S=0.25,p0=Q.pos;
 const tp=id?Q.Le.objects[id]&&Q.Le.objects[id].position:{x:goal[0],y:1.65,z:goal[1]};if(!tp)return{ok:false,why:'no object '+id};
 const seen=new Set(),q=[[0,0]];seen.add('0,0');let n=0;
 while(q.length){const [i,j]=q.shift(),x=p0.x+i*S,z=p0.z+j*S;n++;
  const dx=tp.x-x,dz=tp.z-z,h=Math.hypot(dx,dz);
  if(id&&h<2.75){Q.place(x,z,Math.atan2(-dx,-dz),Math.atan2(tp.y-1.65,h));if(Q.prompt()===id)return{ok:true,x,z,yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(tp.y-1.65,h),cells:n};}
  if(!id&&h<0.3){Q.place(x,z,p0.yaw,0);return{ok:true,x,z,cells:n};}
  for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){const ni=i+a,nj=j+b,k=ni+','+nj;if(seen.has(k))continue;seen.add(k);
   const nx=p0.x+ni*S,nz=p0.z+nj*S;if(nx<-30||nx>30||nz<-79||nz>33||Q.blocked(nx,nz))continue;q.push([ni,nj]);}
 }
 Q.place(p0.x,p0.z,p0.yaw,p0.pitch);return{ok:false,why:'unreachable',cells:n};}`;

const KEYS = { KeyE: "e", Enter: "Enter", Escape: "Escape", Space: " " };
const VK = { KeyE: 69, Enter: 13, Escape: 27, Space: 32 };

export async function runRoute({ url, width = 1280, height = 720, mobile = false, shopOnly = false, log = () => {} } = {}) {
  const steps = [];
  const p = await launch({ width, height, mobile });
  const key = async (code, type) => p.send("Input.dispatchKeyEvent", { type, code, key: KEYS[code] || code, windowsVirtualKeyCode: VK[code] || 0 });
  // the game reads held keys once per frame: keep the key down for at least `ms` and two rendered frames
  const frames = (n = 2) => p.eval(`new Promise(r=>{let k=${n};const f=()=>--k<=0?r(1):requestAnimationFrame(f);requestAnimationFrame(f)})`);
  const press = async (code, ms = 90) => { await key(code, "keyDown"); await Promise.all([p.sleep(ms), frames(2)]); await key(code, "keyUp"); };
  const Q = (expr) => p.eval(`(()=>{const Q=window.__hasshakuQA;return ${expr}})()`);
  const mode = () => Q("Q.mode");
  const clickSel = async (sel) => {
    const r = await p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.hidden)return null;e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]})()`);
    if (!r) throw new Error(`no ${sel}`);
    if (mobile) {
      await p.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r[0], y: r[1], id: 1 }] });
      await p.sleep(60);
      await p.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else await p.click(r[0], r[1]);
    await p.sleep(150);
  };
  // advance dialogue with Enter, close map / documents with Esc, until play resumes
  const settle = async (want = "play") => {
    for (let i = 0; i < 60; i++) {
      const m = await mode();
      if (m === want) return;
      if (m === "dialogue") await press("Enter", 40);
      else if (m === "menu") await press("Escape", 40);
      else if (m === "dead" || m === "ending") throw new Error(`unexpected ${m}: ${await p.eval(`document.getElementById('death-text')?.textContent||''`)}`);
      await p.sleep(120);
    }
    throw new Error(`stuck in ${await mode()} (wanted ${want})`);
  };
  const step = (name, extra = {}) => { steps.push({ name, ...extra }); log(`  ok  ${name}`); };
  const reach = async (id) => {
    const r = await p.eval(`(${FIND})(${JSON.stringify(id)})`);
    if (!r.ok) throw new Error(`phase ${await Q("Q.D.phase")}: ${id} has no reachable spot with a prompt (${r.why}, ${r.cells} cells)`);
    let f = null, shown = false;
    for (let i = 0; i < 30 && !(f === id && shown); i++) {
      await frames(2);
      f = await Q("Q.focus");
      shown = await p.eval(`!document.getElementById('interaction').hidden`);
    }
    if (f !== id || !shown) throw new Error(`phase ${await Q("Q.D.phase")}: standing at ${r.x.toFixed(2)},${r.z.toFixed(2)} the prompt is ${f} (visible ${shown}), expected ${id}; now ${JSON.stringify(await Q("[Q.pos,Q.mode,Q.prompt()]"))} wanted ${JSON.stringify(r)}`);
    return r;
  };
  const use = async (id, { after = "play" } = {}) => {
    const r = await reach(id);
    const holdSec = await p.eval(`(()=>{const l=document.getElementById('interaction-label')?.textContent||'';return l.includes('長押し')?2.6:0})()`);
    if (mobile) {
      // phone: the 調べる button
      const b = await p.eval(`(()=>{const e=document.getElementById('mobile-interact');if(!e)return null;const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      await p.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b[0], y: b[1], id: 2 }] });
      await p.sleep(holdSec ? holdSec * 1000 : 120);
      await p.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else await press("KeyE", holdSec ? holdSec * 1000 : 120);
    await p.sleep(250);
    if (after) await settle(after);
    step(`${id}`, { at: [+r.x.toFixed(2), +r.z.toFixed(2)], cells: r.cells });
  };
  const walkTo = async (x, z, name) => {
    const r = await p.eval(`(${FIND})(null,${JSON.stringify([x, z])})`);
    if (!r.ok) throw new Error(`${name}: (${x},${z}) is not reachable on foot`);
    await p.sleep(400);
    step(name);
  };
  // Walk with the real W key along waypoints (turning in place between legs); fails if a collider stops the player.
  const walkRoute = async (points, name) => {
    for (const [x, z] of points) {
      // short bursts of W, re-aiming each time, so slow frames or slow polling never overshoot a waypoint
      let ok = false, stuck = 0;
      for (let i = 0; i < 300 && !ok && stuck < 4; i++) {
        const q = await Q("Q.pos");
        const d = Math.hypot(x - q.x, z - q.z);
        if (d < 0.4) { ok = true; break; }
        await Q(`(Q.place(${q.x},${q.z},${Math.atan2(-(x - q.x), -(z - q.z))},0),0)`);
        await key("KeyW", "keyDown");
        await Promise.all([p.sleep(Math.min(600, Math.max(60, (d / 2.6) * 600))), frames(2)]);
        await key("KeyW", "keyUp");
        await frames(1);
        const q2 = await Q("Q.pos");
        stuck = Math.hypot(q2.x - q.x, q2.z - q.z) < 0.02 ? stuck + 1 : 0;
      }
      if (!ok) { const q = await Q("Q.pos"); throw new Error(`${name}: blocked at ${q.x.toFixed(2)},${q.z.toFixed(2)} on the way to ${x},${z}`); }
    }
    step(name);
  };
  const phase = () => Q("Q.D.phase");
  const expectPhase = async (n) => {
    const ph = await phase();
    if (ph !== n) throw new Error(`expected stage ${n}, got ${ph}`);
    step(`stage ${n} reached`);
  };
  const openDoor = async (id, flag) => { if (!(await Q(`Q.D.flags.${flag}`))) await use(id); };

  try {
    await p.goto(url);
    await p.waitFor(`document.documentElement.dataset.ready==="true"`, 90000);
    await p.waitFor(`window.__hasshakuQA`, 5000);
    await p.eval(`localStorage.clear()`);
    await clickSel("#start-button");
    await settle();
    await expectPhase(1);
    // Stage I: errand
    await use("errandMap");
    // the route drawn on the map: porch → road → north → west along the walkway to the shop door
    await walkRoute([[-1.2, 16], [0, 15], [0, -13.6], [-8.0, -13.6]], "walk the map's route to the shop door");
    await use("shopDoor");
    if (!(await Q("Q.D.flags.shopOpen"))) throw new Error("shop door did not open");
    await use("shopCounter");
    if (!(await Q("Q.D.flags.shoppingDone"))) throw new Error("shopping not done");
    if (shopOnly) return { ok: true, steps, errors: p.errors.filter((e) => !/googletagmanager|gtag|analytics/i.test(e)) };
    await use("diary");
    await walkTo(-1, 15.5, "walk home (sighting)");
    await p.sleep(300);
    if (!(await Q("Q.D.flags.seen"))) throw new Error("sighting on the way home did not trigger");
    await settle();
    await openDoor("genkanDoor", "entryOpen");
    await use("letter");
    await openDoor("kitchenDoor", "kitchenOpen");
    await openDoor("storeDoor", "storeOpen");
    await use("photo");
    await use("grandpa");
    await settle();
    await expectPhase(2);
    // Stage II: preparing the room
    await openDoor("kitchenDoor", "kitchenOpen");
    await use("saltBag");
    await openDoor("storeDoor", "storeOpen");
    await use("newspaper");
    await use("amulet");
    for (let i = 0; i < 4; i++) await use("bowl" + i);
    await use("window");
    await use("roomDoor");
    await settle();
    await expectPhase(3);
    // Stage III: the night. The voice at the door, one blackened bowl, then dawn.
    await use("roomDoor", { after: "choice" });
    await clickSel("#dialogue-choice-2");
    await settle();
    step("refused to answer the voice");
    await Q("(Q.D.saltDark[1]=0.6,0)");
    await use("bowl1");
    if ((await Q("Q.D.saltDark[1]")) > 0.12) throw new Error("salt was not replaced");
    await Q("(Q.D.nightTime=59.8,0)");
    await p.sleep(600);
    await settle();
    await expectPhase(4);
    // Stage IV: north farm road
    await Q("(Q.calm(),0)");
    await openDoor("genkanDoor", "entryOpen");
    await use("gatePuzzle", { after: "menu" });
    const dials = [1, 2, 0];
    for (let d = 0; d < 3; d++) {
      for (let k = 0; k < 4 && (await Q(`Q.D.gateCode[${d}]`)) !== dials[d]; k++) await clickSel(`[data-dial="${d}"]`);
    }
    await clickSel("#puzzle-check");
    await settle();
    if (!(await Q("Q.D.flags.gate"))) throw new Error("gate puzzle did not open the gate");
    step("gate puzzle solved");
    await use("vanDoor", { after: null });
    await settle();
    await expectPhase(5);
    // Stage V: the drive. Hold the charm (Space) to the village border.
    await Q("(Q.D.vanTime=24,0)");
    await key("Space", "keyDown");
    for (let i = 0; i < 60 && (await mode()) === "play"; i++) await p.sleep(200);
    await key("Space", "keyUp");
    if ((await mode()) !== "ending") throw new Error(`drive ended in ${await mode()}`);
    const title = await p.eval(`document.getElementById('ending-title').textContent`);
    step("ending (all records)", { title });
    // Second ending: same drive restored from a save without the records
    await p.eval(`localStorage.setItem('hasshaku-boundary-v4',JSON.stringify({version:1,phase:5,flags:{seen:true,shoppingAccepted:true,shoppingDone:true,shopOpen:true,salt:true,newspaper:true,amulet:true,covered:true,sealed:false,gate:true,entryOpen:true,kitchenOpen:true,storeOpen:true},bowls:[true,true,true,true],collected:[],gateCode:[1,2,0],elapsed:600,deaths:0,log:[]}))`);
    await p.eval(`document.getElementById('ending-menu-button').click()`);
    await p.sleep(400);
    await clickSel("#continue-button");
    await settle();
    await Q("(Q.D.vanTime=24,0)");
    await key("Space", "keyDown");
    for (let i = 0; i < 60 && (await mode()) === "play"; i++) await p.sleep(200);
    await key("Space", "keyUp");
    const title2 = await p.eval(`document.getElementById('ending-title').textContent`);
    if ((await mode()) !== "ending" || title2 === title) throw new Error(`second ending not reached (${await mode()} ${title2})`);
    step("ending (no records)", { title: title2 });
    return { ok: true, steps, errors: p.errors.filter((e) => !/googletagmanager|gtag|analytics/i.test(e)) };
  } catch (e) {
    return { ok: false, error: e.message, steps, errors: p.errors };
  } finally {
    await p.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let s = null, url = process.argv[2];
  if (!url) { s = await serve(0, "dist"); url = `http://127.0.0.1:${s.port}/?qa=1`; }
  const r = await runRoute({ url, log: console.log, mobile: process.argv.includes("--phone"), width: process.argv.includes("--phone") ? 390 : 1280, height: process.argv.includes("--phone") ? 844 : 720 });
  s?.srv.close();
  console.log(JSON.stringify({ ok: r.ok, error: r.error, errors: r.errors }, null, 1));
  process.exit(r.ok ? 0 : 1);
}
