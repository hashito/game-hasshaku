// Plays every stage's required interactions in headless Edge / Chrome (tools/route.mjs).
// Guards against progression blockers such as 4.0.0's roadside fence that stopped players short of the shop door.
// Skipped when no Edge / Chrome is installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { serve } from "../tools/serve.mjs";
import { runRoute } from "../tools/route.mjs";

const EXES = [process.env.BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
const skip = EXES.some((b) => fs.existsSync(b)) ? false : "no Edge / Chrome";

for (const [name, opts] of [
  ["desktop: stages I→V and both endings are reachable", { width: 1280, height: 720 }],
  ["phone: the shop door and counter work with the 調べる button", { width: 390, height: 844, mobile: true, shopOnly: true }],
]) {
  test(name, { skip, timeout: 600000 }, async () => {
    const s = await serve(0, "dist");
    try {
      const r = await runRoute({ url: `http://127.0.0.1:${s.port}/?qa=1`, ...opts });
      assert.ok(r.ok, `${r.error}\nsteps: ${r.steps.map((x) => x.name).join(" → ")}`);
      assert.deepEqual(r.errors, [], "page errors");
      if (!opts.shopOnly) assert.ok(r.steps.filter((x) => x.name.startsWith("ending")).length === 2, "both endings");
    } finally {
      s.srv.close();
    }
  });
}
