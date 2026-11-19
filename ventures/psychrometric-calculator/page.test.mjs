import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "reading-a-cooling-coil.html"];

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not engineering, legal or code-compliance advice/, p);
    assert.match(html, /Not affiliated with any equipment manufacturer/, p);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, p);
  }
  assert.match(page("index.html"), /Everything runs in your browser/);
});

test("JSON-LD blocks parse and the FAQ matches the visible questions", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
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
    assert.match(html, /<meta property="og:title"/, p);
    assert.equal((html.match(/<h1>/g) || []).length, 1, p);
    assert.match(html, /<html lang="en">/, p);
    assert.match(page("sitemap.xml"), new RegExp(p.replace(".", "\\.")));
  }
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 15);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const f of [...PAGES, "calc.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  assert.doesNotMatch(page("calc.mjs"), /^\s*import\s|import\(|Date\.now|Math\.random/m);
});

test("the inline script imports only exported local names and every element it uses exists", async () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  const names = html.match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const calc = await import("./calc.mjs");
  for (const n of names) assert.ok(n in calc, n);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const keys = html.match(/const KEYS = \[([^\]]+)\]/)[1].match(/"(\w+)"/g).map((s) => s.replace(/"/g, ""));
  assert.deepEqual(keys.sort(), Object.keys(calc.sampleInput()).sort());
  for (const k of keys) assert.ok(ids.has(k), `field ${k}`);
  for (const m of html.matchAll(/\$\("#([\w-]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
  // every process the engine knows has its fields shown by data-for
  const shown = new Set([...html.matchAll(/data-for="([^"]+)"/g)].flatMap((m) => m[1].split(" ")));
  for (const p of Object.keys(calc.PROCESSES)) if (p !== "none") assert.ok(shown.has(p), p);
});

test("the guide's worked numbers are the engine's", async () => {
  const c = await import("./calc.mjs");
  const g = page("reading-a-cooling-coil.html");
  const r = c.analyze(c.sampleInput());
  const A = c.display(r.a, "IP"), B = c.display(r.b, "IP");
  const has = (s) => assert.ok(g.includes(s), s);
  has(`<strong>${A.W.toFixed(1)} gr/lb</strong>`);
  has(`at ${A.rh.toFixed(0)}% relative humidity`);
  has(`dew point of ${A.tdp.toFixed(1)} °F`);
  has(`<strong>${B.W.toFixed(1)} gr/lb</strong> at ${B.rh.toFixed(0)}% relative humidity`);
  for (const [s, d] of [[A, "Entering"], [B, "Leaving"]]) {
    has(`<td>${d}</td><td class="n">${s.t.toFixed(1)}</td><td class="n">${s.twb.toFixed(1)}</td><td class="n">${s.tdp.toFixed(1)}</td><td class="n">${s.W.toFixed(1)}</td><td class="n">${s.h.toFixed(2)}</td><td class="n">${s.v.toFixed(2)}</td>`);
  }
  const lbh = (1200 * 60) / A.v;
  has(`${Math.round(lbh).toLocaleString("en-US")} pounds an hour`);
  has(`${A.h.toFixed(2)} − ${B.h.toFixed(2)} = ${(A.h - B.h).toFixed(2)} Btu`);
  has(`<strong>${Math.round(r.coil.total.display).toLocaleString("en-US")} Btu/h, or ${r.coil.total.tons.toFixed(2)} tons</strong>`);
  const rule = 4.5 * 1200 * (A.h - B.h);
  has(`gives ${Math.round(rule).toLocaleString("en-US")} Btu/h here, <strong>${((rule / r.coil.total.display - 1) * 100).toFixed(1)}% high</strong>`);
  has(`Moisture fell by ${(A.W - B.W).toFixed(1)} gr/lb`);
  has(`${r.coil.condensate.toFixed(2)} gallons an hour`);
  has(`<strong>${Math.round(r.coil.latent.display).toLocaleString("en-US")} Btu/h</strong> of latent heat`);
  has(`remaining ${Math.round(r.coil.sensible.display).toLocaleString("en-US")} Btu/h`);
  has(`<strong>sensible heat ratio is ${r.coil.shr.toFixed(2)}</strong>`);
  has(`<strong>${r.coil.adp.t.toFixed(1)} °F</strong>, the apparatus dew point`);
  has(`(${B.t.toFixed(1)} − ${r.coil.adp.t.toFixed(1)}) / (${A.t.toFixed(1)} − ${r.coil.adp.t.toFixed(1)}) = <strong>${r.coil.bypass.toFixed(2)}</strong>`);
  const back = c.analyze({ process: "adp", adpT: r.coil.adp.t.toFixed(1), bypass: r.coil.bypass.toFixed(2) });
  assert.ok(Math.abs(back.b.t - r.b.t) < 0.2 && Math.abs(back.b.twb - r.b.twb) < 0.2, "the rounded ADP and bypass give back the same leaving air");
  const d = c.analyze({ ...c.sampleInput(), altitude: "5280" });
  has(`(${d.pDisplay.toFixed(2)} psia)`);
  has(`<strong>${c.display(d.a, "IP").W.toFixed(1)} gr/lb</strong>, not ${A.W.toFixed(1)}`);
  has(`leaving air ${c.display(d.b, "IP").W.toFixed(1)}`);
  has(`falls to ${Math.round(d.coil.total.display).toLocaleString("en-US")} Btu/h`);
  has(`${Math.round(d.coil.latent.display).toLocaleString("en-US")} Btu/h latent and ${Math.round(d.coil.sensible.display).toLocaleString("en-US")} sensible, an <strong>SHR of ${d.coil.shr.toFixed(2)}</strong>`);
  assert.ok(c.display(d.a, "IP").W / A.W > 1.2, "more than a fifth");
  // the guide's FAQ answers repeat the worked numbers and are visible on the page
  const faq = JSON.parse(g.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(faq["@type"], "FAQPage");
  for (const q of faq.mainEntity) { has(`<h3>${q.name}</h3>`); has(`<p>${q.acceptedAnswer.text}</p>`); }
  const faqText = faq.mainEntity.map((q) => q.acceptedAnswer.text).join(" ");
  assert.ok(faqText.includes(`overstates the load by ${((rule / r.coil.total.display - 1) * 100).toFixed(1)}%`));
  assert.ok(faqText.includes(`takes up ${A.v.toFixed(2)} cubic feet`));
  assert.ok(faqText.includes(`${c.display(d.a, "IP").W.toFixed(1)} instead of ${A.W.toFixed(1)} grains`));
  assert.ok(faqText.includes(`from ${r.coil.shr.toFixed(2)} to ${d.coil.shr.toFixed(2)}`));
  // "a 1 °F wet-bulb error here moves the load by several percent"
  const wb68 = c.analyze({ ...c.sampleInput(), v2: "68" });
  const shift = wb68.coil.total.display / r.coil.total.display - 1;
  assert.ok(shift > 0.03 && shift < 0.15, `wet-bulb sensitivity ${shift}`);
});

test("index links one hop to the hvac-load-calc and wall-condensation-check siblings", () => {
  assert.match(page("index.html"), /href="\.\.\/hvac-load-calc\/"/);
  assert.match(page("index.html"), /href="\.\.\/wall-condensation-check\/"/);
  assert.match(page("index.html"), /href="reading-a-cooling-coil\.html"/);
});

test("page documents the method, omissions and usage events", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  for (const e of ["point_calculated", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, llms.txt, LICENSE and VENTURE.yaml exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("llms.txt"), /^# Psychrometric Calculator/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: psychrometric-calculator$/m);
});
