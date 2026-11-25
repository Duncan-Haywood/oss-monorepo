import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "what-size-wire-for-12-volts.html"];

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not engineering, electrical, legal or code-compliance advice/, p);
    assert.match(html, /Not affiliated with any wire or cable manufacturer/, p);
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
  assert.ok(inputs.length >= 20);
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
  for (const n of names) assert.ok(calc[n] !== undefined, n);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const keys = html.match(/const KEYS = \[([^\]]+)\]/)[1].match(/"(\w+)"/g).map((s) => s.replace(/"/g, ""));
  assert.deepEqual(keys.sort(), Object.keys(calc.sampleInput()).sort());
  for (const k of keys) assert.ok(ids.has(k), `field ${k}`);
  for (const m of html.matchAll(/\$\("#([\w-]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
  // the quick-pick options are the engine's presets
  const opts = [...html.match(/<select id="preset">([\s\S]*?)<\/select>/)[1].matchAll(/value="(\w*)"/g)].map((m) => m[1]).filter(Boolean);
  assert.deepEqual(opts, calc.VOLTAGE_PRESETS.map((p) => p.id));
});

test("the guide's worked numbers are the engine's", async () => {
  const { analyze, sampleInput } = await import("./calc.mjs");
  const a = analyze(sampleInput());
  const g = page("what-size-wire-for-12-volts.html");
  assert.equal(a.recommended.label, "4 AWG");
  for (const id of ["10", "8", "6", "4"]) {
    const r = a.rows.find((x) => x.id === id);
    const cells = `<tr><td>${id} AWG</td><td class="n">${r.dropV.toFixed(2)} V</td><td class="n">${r.dropPct.toFixed(2)} %</td><td class="n">${r.loadV.toFixed(2)} V</td><td class="n">${r.lossW.toFixed(1)} W</td><td class="n">${r.maxLength.toFixed(1)} ft</td></tr>`;
    assert.ok(g.includes(cells), cells);
  }
  assert.ok(g.includes(`${a.rows.find((x) => x.id === "10").rPerUnit.toFixed(3)} ohm per 1000 ft at 10 AWG`));
  assert.ok(g.includes(`${a.rows.find((x) => x.id === "4").rPerUnit.toFixed(3)} ohm per 1000 ft at 4 AWG`));
  const at = (volts) => analyze({ volts, load: "360", loadUnit: "W" }).recommended;
  assert.equal(at("24").label, "10 AWG");
  assert.equal(at("48").label, "16 AWG");
  assert.equal(at("120").label, "18 AWG");
  assert.ok(g.includes(`18 AWG drops only ${at("120").dropPct.toFixed(2)} %`));
  const faq = page("index.html");
  const r4 = a.rows.find((x) => x.id === "4");
  assert.ok(faq.includes(`it drops ${r4.dropV.toFixed(2)} V, ${r4.dropPct.toFixed(2)} percent`));
});

test("page documents the method, omissions and usage events", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  for (const e of ["drop_calculated", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, llms.txt, LICENSE and VENTURE.yaml exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("llms.txt"), /^# Voltage Drop Calculator/);
  assert.match(page("LICENSE"), /Functional Source License/);
  assert.match(page("VENTURE.yaml"), /^name: voltage-drop-calculator$/m);
});
