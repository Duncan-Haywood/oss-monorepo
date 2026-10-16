import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { syntheticCsv } from "./engine.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /nothing you paste is uploaded/);
  assert.match(html, /no uptime or delivery guarantee/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every form control has a label and the page itself never calls the network", () => {
  const html = page("index.html");
  for (const id of ["list", "rules", "sname", "scompany", "soffer", "saddr", "prov", "model", "base", "key", "draft"]) assert.match(html, new RegExp(`<label for="${id}">`), id);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("the page imports modules that exist and never a Node-only one", () => {
  const html = page("index.html");
  const mods = [...new Set([...html.matchAll(/from "\.\/([a-z]+\.mjs)"/g)].map((m) => m[1]))];
  assert.deepEqual(mods.sort(), ["engine.mjs", "outreach.mjs", "usage.mjs"]);
  for (const m of [...mods, "byok.mjs"]) assert.doesNotMatch(page(m), /from "node:/, `${m} must run in a browser`);
});

test("the in-page FAQ matches the structured data", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = ld.find((x) => x["@type"] === "FAQPage");
  assert.ok(faq.mainEntity.length >= 4);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  for (const q of faq.mainEntity) { assert.ok(html.includes(`<h3>${esc(q.name)}</h3>`), q.name); assert.ok(html.includes(`<p>${esc(q.acceptedAnswer.text)}</p>`), q.name); }
});

test("the page never shows synthetic data as real", () => {
  assert.match(page("index.html"), /not real customers/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("index links one hop to its siblings and each sibling exists", () => {
  const html = page("index.html");
  for (const s of [...html.matchAll(/href="\.\.\/([a-z-]+)\/"/g)].map((m) => m[1])) assert.doesNotThrow(() => readFileSync(new URL(`../${s}/VENTURE.yaml`, import.meta.url)), s);
});

test("cli: CSV in, ranked JSON out, no raw rows echoed", () => {
  const f = join(mkdtempSync(join(tmpdir(), "icp-")), "leads.csv");
  writeFileSync(f, syntheticCsv(7, 120));
  try {
    const out = JSON.parse(execFileSync("node", [new URL("./cli.mjs", import.meta.url).pathname, f], { encoding: "utf8" }));
    assert.ok(out.learned); assert.ok(out.prospects.length > 0); assert.equal(out.prospects[0].raw, undefined);
  } finally { rmSync(dirname(f), { recursive: true, force: true }); }
});
