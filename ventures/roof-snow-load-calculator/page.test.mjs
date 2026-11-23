import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "snow-drift-at-a-roof-step.html"];

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not engineering, legal or code-compliance advice/, p);
    assert.match(html, /Not affiliated with ASCE/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("JSON-LD parses and every FAQ answer is visible on its page", () => {
  for (const p of PAGES) {
    const html = page(p);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 2, p);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
      assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
    }
  }
  const app = JSON.parse(page("index.html").match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
});

test("SEO basics on every page", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /<title>[^<]{20,}<\/title>/, p);
    assert.match(html, /<meta name="description" content="[^"]{80,320}"/, p);
    assert.match(html, new RegExp(`<link rel="canonical" href="\\./${p.replace(".", "\\.")}">`), p);
    assert.match(html, /<meta property="og:title"/, p);
    assert.equal((html.match(/<h1>/g) || []).length, 1, p);
    assert.match(html, /<html lang="en">/, p);
    assert.match(page("sitemap.xml"), new RegExp(p.replace(".", "\\.")));
  }
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 19);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const f of [...PAGES, "calc.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  assert.doesNotMatch(page("calc.mjs"), /^\s*import\s|import\(|Date\.now|Math\.random/m);
});

test("the inline script imports exported names and every field it reads exists", async () => {
  const html = page("index.html");
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  const names = html.match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const calc = await import("./calc.mjs");
  for (const n of names) assert.ok(n in calc, n);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const keys = html.match(/const KEYS = \[([^\]]+)\]/)[1].match(/"(\w+)"/g).map((s) => s.replace(/"/g, ""));
  assert.deepEqual([...keys].sort(), Object.keys(calc.sampleInput()).sort());
  for (const k of keys) assert.ok(ids.has(k), `field ${k}`);
  for (const m of html.matchAll(/\$\("#([\w-]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
});

test("the guide's and FAQ's worked numbers are the engine's", async () => {
  const c = await import("./calc.mjs");
  const g = page("snow-drift-at-a-roof-step.html");
  const idx = page("index.html");
  const has = (s, h = g) => assert.ok(h.includes(s), s);
  const r = c.analyze(c.sampleInput());
  const s = r.step, d = s.drift;
  has(`<strong>${r.pf.toFixed(1)} psf</strong>`);
  has(`<strong>${s.gamma.toFixed(1)} pcf</strong>`);
  has(`hb = ${r.pf.toFixed(1)} / ${s.gamma.toFixed(1)} = <strong>${s.hb.toFixed(2)} ft</strong>`);
  has(`hc = 9 − ${s.hb.toFixed(2)} = <strong>${s.hc.toFixed(2)} ft</strong>`);
  has(`− 1.5 = <strong>${s.leeward.hdRaw.toFixed(2)} ft</strong>`);
  has(`<strong>${s.windward.hd.toFixed(2)} ft</strong>. The leeward drift governs`);
  assert.equal(s.governing, "leeward");
  has(`w = 4 hd = <strong>${d.w.toFixed(1)} ft</strong>`);
  has(`= <strong>${d.pd.toFixed(1)} psf</strong>`);
  has(`<strong>${s.maxLoad.toFixed(1)} psf</strong> in all, ${(s.maxLoad / r.pf).toFixed(1)} times`);
  has(`<strong>${Math.round(0.5 * d.pd * d.w)} lb</strong>`);
  has(`the ${Math.round(r.pf * d.w)} lb the balanced load`);
  has(`${s.maxLoad.toFixed(1)} psf on the lower roof at the wall, ${(s.maxLoad / r.pf).toFixed(1)} times the ${r.pf.toFixed(0)} psf`, idx);
  has(`tapering to the balanced load ${d.w.toFixed(1)} ft out`, idx);
  has(`that is ${r.unbalanced.leeward} psf on one side against a ${r.pf.toFixed(0)} psf balanced load`, idx);
  const long = c.analyze({ ...c.sampleInput(), upperLength: "80" }).step;
  has(`<td>An 80 ft long building above</td><td class="n">${long.drift.hd.toFixed(2)}</td><td class="n">${long.drift.w.toFixed(1)}</td><td class="n">${long.maxLoad.toFixed(1)}</td>`);
  const low = c.analyze({ ...c.sampleInput(), stepHeight: "3" }).step;
  assert.equal(low.drift.capped, true);
  has(`<td>A 3 ft step (capped)</td><td class="n">${low.drift.hd.toFixed(2)}</td><td class="n">${low.drift.w.toFixed(1)}</td><td class="n">${low.maxLoad.toFixed(1)}</td>`);
  has(`caps the drift at ${low.drift.hd.toFixed(2)} ft but widens it from ${d.w.toFixed(1)} to ${low.drift.w.toFixed(1)} ft`);
  const narrow = c.analyze({ ...c.sampleInput(), lowerLength: "6" }).step;
  assert.equal(narrow.drift.truncated, true);
  has(`still carries ${narrow.drift.edge.toFixed(1)} psf of drift surcharge`);
  has(`a 6 ft porch roof against the same wall still carries ${narrow.drift.edge.toFixed(1)} psf`);
});

test("links one hop to siblings and the guide", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/shed-designer\/"/);
  assert.match(html, /href="\.\.\/continuous-beam-calculator\/"/);
  assert.match(html, /href="snow-drift-at-a-roof-step\.html"/);
});

test("page documents the method, omissions and usage events", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  for (const e of ["loads_calculated", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, llms.txt, LICENSE and VENTURE.yaml exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("llms.txt"), /^# Roof Snow Load Calculator/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: roof-snow-load-calculator$/m);
});
