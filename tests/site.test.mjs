// Checks site.json and the built public/ (run `npm run build` first; the build is run here if missing).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const site = JSON.parse(fs.readFileSync(path.join(root, "site.json"), "utf8"));

test("site.json has the fields the portal and the build need", () => {
  for (const k of ["name", "domain", "firebaseProject", "description", "ogImage", "ogImageAlt", "genre", "noscript"]) assert.ok(site[k], k);
  assert.equal(site.domain, "hasshaku.autoarticles.net");
  const rc = JSON.parse(fs.readFileSync(path.join(root, ".firebaserc"), "utf8"));
  assert.equal(rc.projects.default, site.firebaseProject);
  assert.ok(fs.existsSync(path.join(root, "assets/og-image.jpg")));
  assert.ok(fs.existsSync(path.join(root, "assets/og-image.png")));
});

test("the game page is self-contained", () => {
  const html = fs.readFileSync(path.join(root, "dist/index.html"), "utf8");
  assert.doesNotMatch(html, /<script[^>]+src=/, "no external scripts");
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/, "no external stylesheets");
  assert.match(html, /id="start-button"/);
});

test("build injects unique SEO tags, sitemap and robots", () => {
  execFileSync(process.execPath, [path.join(root, "tools/build-site.js")], { cwd: root, stdio: "ignore" });
  const out = path.join(root, "public");
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  const url = `https://${site.domain}/`;
  assert.equal((html.match(/<meta name="description"/g) || []).length, 1);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.match(html, new RegExp(`<link rel="canonical" href="${url}">`));
  assert.match(html, /property="og:image" content="https:\/\/hasshaku\.autoarticles\.net\/og-image\.jpg"/);
  assert.match(html, /"@type":\["VideoGame","WebApplication"\]/);
  assert.match(html, /<noscript>/);
  if (site.gaId) assert.match(html, new RegExp(site.gaId));
  assert.match(fs.readFileSync(path.join(out, "sitemap.xml"), "utf8"), new RegExp(`<loc>${url}</loc>`));
  assert.match(fs.readFileSync(path.join(out, "robots.txt"), "utf8"), /Sitemap: https:\/\/hasshaku\.autoarticles\.net\/sitemap\.xml/);
  for (const f of ["og-image.jpg", "favicon.svg", "404.html"]) assert.ok(fs.existsSync(path.join(out, f)), f);
});
