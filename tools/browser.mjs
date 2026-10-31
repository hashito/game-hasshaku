// Launches headless Chromium through Playwright (installed globally in CI and in the authoring container).
// BROWSER=<path> picks a specific Chrome/Chromium binary.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require("playwright"); } catch {}
  const root = execSync("npm root -g").toString().trim();
  return require(path.join(root, "playwright"));
}

export async function launch() {
  const { chromium } = loadPlaywright();
  const args = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"];
  return chromium.launch({ args, ...(process.env.BROWSER ? { executablePath: process.env.BROWSER } : {}) });
}
