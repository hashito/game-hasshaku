// Browser smoke test of the built site: node tools/smoke.mjs [dir=public]
// Loads the page on a desktop and a phone viewport, starts the game, walks a little and fails on any page error.
import fs from "node:fs";
import path from "node:path";
import { launch } from "./browser.mjs";
import { serve } from "./serve.mjs";

const root = path.resolve(import.meta.dirname, "..");
const dir = process.argv[2] || "public";
const shots = path.join(root, "shots");
fs.mkdirSync(shots, { recursive: true });
const s = await serve(0, dir);
const browser = await launch();
const failures = [];
try {
  for (const [name, opts] of [["desktop", { viewport: { width: 1280, height: 720 } }], ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const page = await browser.newPage(opts);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/googletagmanager|gtag/.test(m.text())) errors.push(m.text()); });
    // analytics is not reachable from CI; keep the run offline
    await page.route(/googletagmanager\.com/, (r) => r.fulfill({ status: 204, body: "" }));
    await page.goto(`http://127.0.0.1:${s.port}/`);
    await page.waitForSelector("#start-button", { state: "visible", timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(shots, `${name}-title.png`) });
    if (name === "phone") await page.tap("#start-button"); else await page.click("#start-button");
    await page.waitForTimeout(4000);
    if (name === "desktop") {
      for (let i = 0; i < 6; i++) { await page.keyboard.press("Enter"); await page.waitForTimeout(400); }
      await page.keyboard.down("w"); await page.waitForTimeout(3000); await page.keyboard.up("w");
    }
    await page.screenshot({ path: path.join(shots, `${name}-play.png`) });
    const hud = await page.evaluate(() => document.body.innerText.includes("段階"));
    if (!hud) failures.push(`${name}: HUD (段階) not shown after start`);
    for (const e of errors) failures.push(`${name}: ${e}`);
    console.log(`${name}: ${errors.length} errors, HUD ${hud ? "ok" : "missing"}`);
    await page.close();
  }
} finally {
  await browser.close();
  s.srv.close();
}
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("smoke ok");
