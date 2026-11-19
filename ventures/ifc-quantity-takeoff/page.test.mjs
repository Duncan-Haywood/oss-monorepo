import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("page carries the disclaimer, privacy line and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not a measured survey, a cost estimate, a design review or professional advice/);
  assert.match(html, /Everything on this page runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Don't count my usage/);
});

test("the page fetches only its own sample and imports browser-safe modules", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/fetch\(([^)]*)\)/g)) assert.match(m[1], /^"samples\//, m[1]);
  assert.doesNotMatch(html, /XMLHttpRequest|sendBeacon/);
  const seen = new Set();
  const walk = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const src = page(name);
    assert.doesNotMatch(src, /from "node:/, `${name} must run in a browser`);
    for (const m of src.matchAll(/from "\.\/([a-z0-9-]+\.mjs)"/g)) walk(m[1]);
  };
  for (const m of html.matchAll(/from "\.\/([a-z0-9-]+\.mjs)"/g)) walk(m[1]);
  assert.ok(seen.has("qto.mjs") && seen.has("geom.mjs") && seen.has("step.mjs"));
});

test("the in-page FAQ matches the structured data", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((j) => j["@type"] === "FAQPage");
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("the page's corpus numbers match the committed eval", () => {
  const html = page("index.html");
  const j = JSON.parse(page("eval/stored-vs-computed-2026-11-19.json"));
  const t = { gross: {}, net: {} };
  for (const f of j) for (const w of ["gross", "net"]) for (const [k, v] of Object.entries(f.classes[w])) t[w][k] = (t[w][k] || 0) + v;
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const n = (x) => x.toLocaleString("en-US");
  assert.ok(html.includes(`${n(t.gross.agree)} of ${n(sum(t.gross))}`));
  assert.ok(html.includes(`${n(t.net.agree)} of ${n(sum(t.net))}`));
  assert.ok(html.includes(`${t.gross["net-as-gross"]} GrossVolumes that already exclude openings`));
  assert.ok(html.includes(`${t.gross["unit-slip"]} slab volumes`));
  assert.ok(html.includes(`${t.gross.split + t.gross.repeated} split-by-level pieces`));
  assert.ok(html.includes(`${t.gross["own-dimensions"]} stored volumes that contradict`));
});
