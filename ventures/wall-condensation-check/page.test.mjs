import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "will-my-wall-condense.html"];

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not engineering, architectural, legal or code-compliance advice/, p);
    assert.match(html, /Not affiliated with any building-material manufacturer/, p);
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
  assert.ok(inputs.length >= 6);
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
});

test("the guide's worked numbers are the engine's", async () => {
  const c = await import("./calc.mjs");
  const g = page("will-my-wall-condense.html");
  const base = c.analyze(c.sampleInput());
  const jan = base.rows.find((r) => r.name === "Jan");
  const i = base.worst.index;
  assert.ok(g.includes(`${jan.pIn.toFixed(0)} Pa`));
  assert.ok(g.includes(`dew point is ${c.cToF(c.dewPoint(jan.pIn)).toFixed(0)} F`));
  assert.ok(g.includes(`sits at ${c.cToF(jan.interfaces[i].t).toFixed(0)} F (${jan.interfaces[i].t.toFixed(1)} C)`));
  assert.ok(g.includes(`only ${jan.interfaces[i].psat.toFixed(0)} Pa`));
  assert.ok(g.includes(`${jan.rates[i].toFixed(1)} g/m² per day`));
  assert.equal(base.start, "Nov");
  assert.ok(g.includes("after a dry month is November."));
  assert.ok(g.includes(`<strong>${base.worst.peak.toFixed(0)} g/m²</strong>`));
  assert.ok(g.includes(`wet for ${base.worst.wetMonths} months`));
  assert.equal(base.rows.find((r) => r.name === "Jun").moisture[i], 0);
  assert.ok(base.rows.find((r) => r.name === "May").moisture[i] > 0);
  const rowOf = (a) => `<td class="n">${a.worst ? a.worst.peak.toFixed(0) + " g/m²" : "none"}</td><td class="n">${a.worst ? a.worst.wetMonths : 0}</td><td class="n">${a.safeIndoorRh.toFixed(0)}%</td>`;
  const lay = c.sampleInput().layers;
  const xps2 = c.analyze({ layers: lay.replace("Polymer housewrap, 0, 50", "2 in XPS foam, 10, 0.55\nPolymer housewrap, 0, 50") });
  const poly = c.analyze({ layers: lay.replace("Latex primer and paint, 0, 5", "6 mil polyethylene, 0, 0.06") });
  for (const a of [base, c.analyze(c.sampleWithFoam()), xps2, poly]) assert.ok(g.includes(rowOf(a)), rowOf(a));
  assert.ok(xps2.rows.find((r) => r.name === "Jan").interfaces[i].t > 0, "2 in XPS: OSB face above freezing in January");
});

test("page documents the method, omissions and usage events", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  for (const e of ["wall_checked", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, llms.txt, LICENSE and VENTURE.yaml exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("llms.txt"), /^# Wall Condensation Check/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: wall-condensation-check$/m);
});
