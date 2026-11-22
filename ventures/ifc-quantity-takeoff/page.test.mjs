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
  const j = JSON.parse(page("eval/stored-vs-computed-2026-11-21-glazing.json"));
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
  assert.ok(html.includes(`${t.gross["simplified-section"]} Tekla steel parts whose stored volume comes from a simplified section`));
  const namedNet = Object.entries(t.net).filter(([k]) => k !== "agree" && k !== "unexplained").reduce((a, [, v]) => a + v, 0);
  assert.ok(html.includes(`Of the ${n(sum(t.net) - t.net.agree)} NetVolume disagreements, it names a cause for ${n(namedNet)}`));
  assert.ok(html.includes(`${t.net["simplified-section"]} Tekla steel parts stored from the section without its root fillets`));
  assert.ok(html.includes(`${t.net["assembly-total"]} stair stringers each carrying the whole stair's volume`));
  assert.ok(html.includes(`${t.net["not-stored"]} skylights and fittings that store 0`));
  assert.ok(html.includes(`${t.net["glazing-left-out"]} ArchiCAD windows and doors that store the frame and sash without their glass panes`));
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

test("the page has a model view drawn from the takeoff's own solids", () => {
  const html = page("index.html");
  assert.match(html, /<canvas id="view"/);
  assert.match(html, /import \{ ModelView \} from "\.\/viewer\.mjs"/);
  assert.match(html, /meshRows\(left, prep\.origin\)/);
  assert.match(page("view-worker.mjs"), /meshRows\(rows, origin\)/);
  // a bill-of-quantities line and a check row both select elements in the view
  assert.match(html, /record\("boq_line_shown"\)/);
  assert.match(html, /tr data-el=/);
  const viewer = page("viewer.mjs");
  assert.doesNotMatch(viewer, /from "https?:/, "the viewer loads no library");
});

test("the model view's worker exists, is browser-safe and falls back to the page", () => {
  const html = page("index.html");
  const m = html.match(/new Worker\(new URL\("\.\/([a-z0-9-]+\.mjs)", import\.meta\.url\), \{ type: "module" \}\)/);
  assert.ok(m, "the page starts a module worker");
  const src = page(m[1]);
  assert.doesNotMatch(src, /from "node:/);
  for (const d of src.matchAll(/from "\.\/([a-z0-9-]+\.mjs)"/g)) assert.doesNotMatch(page(d[1]), /from "node:/, d[1]);
  // no worker, or a failed one: the page meshes what is left itself
  assert.match(html, /typeof Worker === "undefined"/);
  assert.match(html, /drawn on the page instead/);
});

test("the drawn-volume agreement figure on the page and llms.txt matches the README", () => {
  // Quality audit 2026-11-22: the page and llms.txt kept "9,184 of 9,314" after the README moved on.
  const readme = page("README.md").replace(/\s+/g, " ");
  const m = readme.match(/enclose the computed volume within 0\.5% for ([\d,]+ of [\d,]+) elements/);
  assert.ok(m, "README states the figure");
  for (const f of ["index.html", "llms.txt"]) {
    const found = [...page(f).matchAll(/([\d,]+ of [\d,]+) elements drawn from their solids enclose|enclose the computed volume within 0\.5% for ([\d,]+ of [\d,]+)/g)].map((x) => x[1] || x[2]);
    assert.ok(found.length > 0, `${f} states the figure`);
    for (const v of found) assert.equal(v, m[1], f);
  }
});
