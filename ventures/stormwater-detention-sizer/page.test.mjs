import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, sampleInput, triangularUH, route, pondStorage, outletFlow } from "./detention.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "how-to-size-a-detention-pond.html"];

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not engineering, legal or code-compliance advice/, p);
    assert.match(html, /Not affiliated with any software maker/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
    assert.match(html, /illustrative and belong to no real place/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("JSON-LD blocks parse and the FAQ matches the visible questions", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("SEO basics on every page", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /<title>[^<]{20,}<\/title>/, p);
    assert.match(html, /<meta name="description" content="[^"]{80,320}"/, p);
    assert.match(html, new RegExp(`<link rel="canonical" href="\\./${p.replace(".", "\\.")}">`), p);
    assert.equal((html.match(/<h1>/g) || []).length, 1, p);
    assert.match(page("sitemap.xml"), new RegExp(p === "index.html" ? "stormwater-detention-sizer/<" : p.replace(".", "\\.")));
  }
});

test("every input has a label, the script's ids exist, and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const f of [...PAGES, "detention.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, f);
  assert.doesNotMatch(page("detention.mjs"), /^\s*import\s|import\(|Date\.now|Math\.random/m);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const keys = src.match(/const KEYS = \[([^\]]+)\]/)[1].match(/"(\w+)"/g).map((s) => s.replace(/"/g, ""));
  assert.deepEqual([...keys].sort(), Object.keys(sampleInput()).sort());
  for (const k of keys) assert.ok(ids.has(k), `field ${k}`);
  for (const m of src.matchAll(/\$\("#([\w-]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
  for (const e of ["pond_sized", "example_loaded", "report_downloaded"]) {
    assert.match(src, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
});

test("the guide's and FAQ's worked numbers are the engine's", () => {
  const a = analyze(sampleInput());
  const g = page("how-to-size-a-detention-pond.html"), faq = page("index.html");
  const f2 = (x) => x.toFixed(2);
  const fmt0 = (x) => Math.round(x).toLocaleString("en-US");
  const [s2, s100] = a.storms;
  for (const s of a.storms) {
    const row = `<tr><td>${s.label}</td><td class="n">${f2(s.depthIn)}</td><td class="n">${f2(s.preRunoffIn)} in</td><td class="n">${f2(s.postRunoffIn)} in</td><td class="n">${f2(s.prePeak)} cfs</td><td class="n">${f2(s.postPeak)} cfs</td></tr>`;
    assert.ok(g.includes(row), row);
  }
  const o = a.outlet;
  for (const t of [`a ${o.orificeDiameterIn.toFixed(1)} in orifice`, `a ${f2(o.weirLengthFt)} ft weir`, `crest at ${f2(o.weirCrestFt)} ft`, `<strong>${f2(s100.peakStage)} ft</strong>`, `<strong>${f2(a.requiredDepthFt)} ft deep</strong>`, `about ${fmt0(s2.peakStorageFt3)} cubic feet`, `about ${fmt0(s100.peakStorageFt3)} cubic feet stored`, `about ${a.topLengthFt.toFixed(0)} by ${a.topWidthFt.toFixed(0)} ft`, `fills the basin to ${f2(s2.peakStage)} ft`, `peak of ${f2(s100.prePeak)} cfs`]) assert.ok(g.includes(t), t);
  for (const t of [`from ${f2(s2.prePeak)} to ${f2(s2.postPeak)} cfs`, `from ${f2(s100.prePeak)} to ${f2(s100.postPeak)} cfs`, `A ${o.orificeDiameterIn.toFixed(1)} in orifice and a ${f2(o.weirLengthFt)} ft weir with its crest at ${f2(o.weirCrestFt)} ft`, `fills the basin to ${f2(s100.peakStage)} ft`, `it is ${f2(a.requiredDepthFt)} ft deep`]) assert.ok(faq.includes(t), t);
  // unit hydrograph figures in step 2
  const post = triangularUH(5, 0.2, 2), pre = triangularUH(5, 0.5, 2);
  assert.ok(g.includes(`${post.tp.toFixed(4)} hours to a peak of ${f2(post.qp)} cfs per inch`));
  assert.ok(g.includes(`${pre.tp.toFixed(4)} hours and ${f2(pre.qp)} cfs per inch`));
  // the orifice-only 100-year level
  const r = route(analyze(sampleInput()).storms[1].inflow, 2, (h) => pondStorage(h, a.input), (h) => outletFlow(h, { orificeDiameter: o.orificeDiameterFt }));
  assert.ok(g.includes(`back the water ${f2(r.peakStage)} ft up the bank`));
  // volume polynomial of the example basin: L W, (L + W) z, 4/3 z^2
  assert.ok(g.includes("6,000 h + 480 h² + 12 h³"));
});

test("robots, sitemap, README, llms.txt, LICENSE and VENTURE.yaml exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("llms.txt"), /^# Detention Pond Sizer/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: stormwater-detention-sizer$/m);
});
