// Captures the title screen at 1200x630 and writes assets/og-image.jpg (site) and assets/og-image.png (portal card): node tools/make-og.mjs
import fs from "node:fs";
import path from "node:path";
import { launch } from "./browser.mjs";
import { serve } from "./serve.mjs";

const root = path.resolve(import.meta.dirname, "..");
const s = await serve(0, "dist");
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(`http://127.0.0.1:${s.port}/`);
  await page.waitForTimeout(6000);
  // keep the title, subtitle and scene; drop the buttons and small links
  await page.addStyleTag({ content: "#start-button,#title-help,#title-sources,#title-sound,.title-stage,.title-actions,.title-footer{visibility:hidden!important}" });
  await page.waitForTimeout(300);
  const jpg = path.join(root, "assets/og-image.jpg");
  await page.screenshot({ path: jpg, type: "jpeg", quality: 84 });
  await page.screenshot({ path: path.join(root, "assets/og-image.png") });
  console.log(`assets/og-image.jpg ${Math.round(fs.statSync(jpg).size / 1024)} KB`);
} finally {
  await browser.close();
  s.srv.close();
}
