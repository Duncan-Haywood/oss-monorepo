import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "solar-row-spacing-gcr.html"];

test("every page carries the no-warranty clause, independence line and sponsor link", () => {
  for (const p of PAGES) {
    const html = page(p);
    assert.match(html, /No warranty/, p);
    assert.match(html, /not engineering, electrical, financial, legal or code-compliance advice/, p);
    assert.match(html, /Not affiliated with any module, racking or tracker manufacturer/, p);
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
    assert.match(html, /<title>[^<]{20,80}<\/title>/, p);
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
  assert.ok(inputs.length >= 30);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && html.includes(`<label for="${id}">`), `unlabelled: ${tag}`);
  }
  for (const f of [...PAGES, "calc.mjs", "rows.mjs", "solar.mjs", "weather.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, f);
  for (const f of ["rows.mjs", "solar.mjs", "calc.mjs"]) assert.doesNotMatch(page(f), /Date\.now|Math\.random/, f);
});

test("the inline script imports only exported local names and every element it uses exists", async () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  const names = html.match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const calc = await import("./calc.mjs");
  for (const n of names) assert.equal(typeof calc[n], "function", n);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const keys = html.match(/const KEYS = \[([^\]]+)\]/)[1].match(/"(\w+)"/g).map((s) => s.replace(/"/g, ""));
  assert.deepEqual(keys.sort(), Object.keys(calc.sampleInput()).sort());
  for (const k of keys) assert.ok(ids.has(k), `field ${k}`);
  for (const m of html.matchAll(/\$\("#([\w-]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
});

test("the guide's worked example is the engine's answer", async () => {
  const { analyze, sampleInput } = await import("./calc.mjs");
  const a = analyze(sampleInput());
  const g = page("solar-row-spacing-gcr.html");
  const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const f = a.fixed.best;
  assert.ok(g.includes(`<strong>${f.tilt}° at GCR ${f.gcr.toFixed(2)}</strong>: a ${f.pitch.toFixed(1)} m pitch, ${f.gap.toFixed(1)} m clear`));
  assert.ok(g.includes(`${f.yield.toFixed(0)} kWh/kWp a year with ${(100 * f.rowLoss).toFixed(2)}% lost`));
  assert.ok(g.includes(`<strong>${usd(f.npv)}</strong>`));
  assert.ok(g.includes(`gives GCR ${a.rule.gcr.toFixed(2)} (a ${a.rule.pitch.toFixed(1)} m pitch)`));
  assert.ok(g.includes(`loses ${(100 * a.rule.rowLoss).toFixed(2)}% to the rows, and its net present value is <strong>${usd(a.rule.npv)}</strong>, ${usd(f.npv - a.rule.npv)} less`));
  const t = a.tracker.best;
  assert.ok(g.includes(`tracker at GCR ${t.gcr.toFixed(2)} (${t.pitch.toFixed(1)} m pitch`));
  assert.ok(g.includes(`<strong>${usd(t.npv)}</strong>`));
});

test("the guide's real-weather table is check/tmy3_results.json", () => {
  const d = JSON.parse(page("check/tmy3_results.json"));
  const g = page("solar-row-spacing-gcr.html");
  for (const s of d.sites) {
    const v = s.modes.land;
    assert.ok(g.includes(`${v.fixedBest.tilt}°, ${v.fixedBest.gcr.toFixed(2)}</td><td class="n">$${v.fixedBest.lcoe.toFixed(2)}`), s.file);
    assert.ok(g.includes(`+$${v.lcoeAddedByRule.toFixed(2)}`), s.file);
    assert.ok(g.includes(`+$${v.lcoeAddedByClearSky.toFixed(2)}`), s.file);
    assert.ok(g.includes(`${v.clearSkyChoice.yieldClaimed} vs ${v.fixedBest.yield}`), s.file);
    // Land-limited and capacity-limited sites rank the same by cost per MWh.
    assert.equal(s.modes.capacity.fixedBest.gcr, v.fixedBest.gcr);
  }
});
