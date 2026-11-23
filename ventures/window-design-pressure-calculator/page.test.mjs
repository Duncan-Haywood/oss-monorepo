import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "what-dp-rating-do-my-windows-need.html"];

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
  assert.ok(inputs.length >= 14);
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
  const g = page("what-dp-rating-do-my-windows-need.html");
  const idx = page("index.html");
  const has = (s, h = g) => assert.ok(h.includes(s), s);
  const s = c.sampleInput();
  const r = c.analyze(s);
  const part = c.analyze({ ...s, enclosure: "partial" });
  const b = c.analyze({ ...s, exposure: "B" });
  const neg = (v, n) => `−${Math.abs(v).toFixed(n)}`;
  const row = (label, res = r) => res.rows.find((x) => x.label === label);
  has(`= <strong>${r.Kh.toFixed(3)}</strong>`);
  has(`<strong>${r.qh.toFixed(2)} psf</strong>`);
  has(`Kh = ${b.Kh.toFixed(3)} and qh = ${b.qh.toFixed(2)} psf`);
  has(`by ${Math.round((1 - b.qh / r.qh) * 100)}%`);
  has(`<strong>a = ${r.a.toFixed(1)} ft</strong>`);
  const bed = row("Front bedroom window");
  has(`(GCp) = +${bed.gcpPos.toFixed(3)} and ${neg(bed.gcpNeg, 3)}`);
  has(`<strong>${neg(bed.pNeg, 1)} psf</strong> strength level, and 0.6 × that = ${(-bed.asdNeg).toFixed(2)} psf`);
  has(`needs <strong>DP ${bed.dpRequired.toFixed(1)}</strong>`);
  has(`needs only ${bed.asdPos.toFixed(1)}`);
  const gd = row("Garage door");
  has(`drops to +${gd.gcpPos.toFixed(3)} and ${neg(gd.gcpNeg, 3)}`);
  for (const x of r.rows) {
    const p = row(x.label, part);
    has(`<tr><td>${x.label}</td><td class="n">${x.area.toFixed(1)}</td><td class="n">${x.zone}</td><td class="n">${x.dpRequired.toFixed(1)}</td><td class="n">${p.dpRequired.toFixed(1)}</td></tr>`);
  }
  has(`highest need is DP ${r.worst.dpRequired.toFixed(1)}`);
  const least = r.rows.reduce((m, x) => (x.dpRequired < m.dpRequired ? x : m));
  has(`lowest DP ${least.dpRequired.toFixed(1)} for a sliding door`);
  assert.equal(least.label, "Sliding patio door");
  has(`from DP ${bed.dpRequired.toFixed(1)} to DP ${row("Front bedroom window", part).dpRequired.toFixed(1)}`);
  has(`needs DP ${bed.dpRequired.toFixed(1)}, and the same house's kitchen window away from the corners needs DP ${row("Kitchen window").dpRequired.toFixed(1)}`, idx);
  has(`In the example a is ${r.a.toFixed(1)} ft.`, idx);
});

test("links one hop to siblings and the guide", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/roof-snow-load-calculator\/"/);
  assert.match(html, /href="\.\.\/window-replacement-bid-calculator\/"/);
  assert.match(html, /href="what-dp-rating-do-my-windows-need\.html"/);
});

test("page documents the method, omissions and usage events", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  for (const e of ["pressures_calculated", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, llms.txt, LICENSE and VENTURE.yaml exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("llms.txt"), /^# Window and Door Design Pressure Calculator/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: window-design-pressure-calculator$/m);
});
