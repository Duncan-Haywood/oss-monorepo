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
  const j = JSON.parse(page("eval/stored-vs-computed-2026-11-21.json"));
  const t = { gross: {}, net: {} };
  for (const f of j) for (const w of ["gross", "net"]) for (const [k, v] of Object.entries(f.classes[w])) t[w][k] = (t[w][k] || 0) + v;
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const n = (x) => x.toLocaleString("en-US");
  assert.ok(html.includes(`${n(t.gross.agree)} of ${n(sum(t.gross))}`));
  assert.ok(html.includes(`${n(t.net.agree)} of ${n(sum(t.net))}`));
  assert.ok(html.includes(`${t.gross["net-as-gross"]} GrossVolumes that already exclude openings`));
  assert.ok(html.includes(`${t.gross["unit-slip"]} slab volumes written in the wrong unit`));
  assert.ok(html.includes(`${t.gross.split + t.gross.repeated} split-by-level pieces`));
  assert.ok(html.includes(`${t.gross["own-dimensions"]} stored volumes that contradict`));
  assert.ok(html.includes(`${t.gross["body-is-net"]} walls and slabs whose geometry already has the openings cut out`));
  const named = Object.entries(t.gross).filter(([k]) => k !== "agree" && k !== "unexplained").reduce((a, [, v]) => a + v, 0);
  assert.ok(html.includes(`Of the ${n(sum(t.gross) - t.gross.agree)} GrossVolume disagreements, the page names a cause for ${n(named)}`));
});

test("the page's area numbers match the committed area eval", () => {
  const html = page("index.html");
  const j = JSON.parse(page("eval/areas-vs-stored-2026-11-19.json"));
  let pairs = 0, agree = 0;
  const why = {};
  for (const v of Object.values(j.total)) { pairs += v.pairs; agree += v.agree; for (const [k, n] of Object.entries(v.reasons)) why[k] = (why[k] || 0) + n; }
  const n = (x) => x.toLocaleString("en-US");
  const named = Object.entries(why).filter(([k]) => k !== "unexplained").reduce((a, [, v]) => a + v, 0);
  assert.ok(html.includes(`${n(agree)} of ${n(pairs)} stored areas`));
  assert.ok(html.includes(`every one of ${n(j.total.GrossFootprintArea.pairs)} wall footprints`));
  assert.equal(j.total.GrossFootprintArea.agree, j.total.GrossFootprintArea.pairs);
  assert.ok(html.includes(`Of the ${n(pairs - agree)} that did not, the page names a cause for ${n(named)}`));
  assert.ok(html.includes(`${why["scales-with-length"]} "cross-section areas"`));
  assert.ok(html.includes(`${why["gross-as-net"]} net footprints`));
  assert.ok(html.includes(`${why["on-a-face"]} side areas measured on a wall face`));
  assert.ok(html.includes(`${why["unit-slip"]} written in the wrong unit`));
  assert.ok(html.includes(`${why.split + why.repeated} split-by-level pieces`));
});
