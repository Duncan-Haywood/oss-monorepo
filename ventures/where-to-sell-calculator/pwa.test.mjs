import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { webFiles } from "./mobile/sync-web.mjs";

const read = (n) => readFileSync(new URL(`./${n}`, import.meta.url), "utf8");

test("manifest is installable and every icon exists", () => {
  const m = JSON.parse(read("manifest.webmanifest"));
  assert.equal(m.display, "standalone");
  assert.ok(m.name && m.short_name && m.start_url && m.theme_color);
  assert.ok(m.icons.some((i) => i.sizes === "512x512"));
  assert.ok(m.icons.some((i) => i.purpose === "maskable"));
  for (const i of m.icons) assert.ok(existsSync(new URL(`./${i.src}`, import.meta.url)), i.src);
});

test("index links the manifest and registers the worker", () => {
  const html = read("index.html");
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /serviceWorker\.register\("sw\.js"\)/);
});

test("worker precaches only files that exist and stays same-origin", () => {
  const sw = read("sw.js");
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
  for (const f of shell) {
    if (f === "./") continue;
    assert.ok(existsSync(new URL(f, import.meta.url)), f);
  }
  assert.match(sw, /origin !== self\.location\.origin/);
  assert.doesNotMatch(sw, /https?:\/\//);
});

test("the mobile bundle ships the app but not tests or build scripts", () => {
  const f = webFiles();
  for (const need of ["index.html", "calc.mjs", "sw.js", "manifest.webmanifest", "icons"]) assert.ok(f.includes(need), need);
  assert.ok(!f.some((n) => /\.test\.mjs$|^build-/.test(n)));
});
