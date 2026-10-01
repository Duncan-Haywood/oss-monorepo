import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { planMode, compareLayouts, sampleSpec, validateSpec, verifyLayout, tileableArea } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial or construction advice/i);
  assert.match(html, /not installation instructions or a material guarantee/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any tile maker/);
  assert.match(html, /no tile price is stated or implied/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  for (const q of blocks[1].mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Tile Layout Planner/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 14);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  const row = html.match(/function rowHtml[\s\S]*?<\/tr>`/)[0];
  const made = [...row.matchAll(/<(input|button)\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(made.length, 2); // the field template (called four times) and the remove button
  assert.equal([...row.matchAll(/\$\{f\("/g)].length, 4);
  for (const tag of made) assert.match(tag, /aria-label=/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module scripts import only local files, and the inline script parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(page("calc.mjs"), /^\s*import\s/m);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("every name the inline script imports is exported by calc.mjs", async () => {
  const names = page("index.html").match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const calc = await import("./calc.mjs");
  for (const name of names) assert.ok(name in calc, name);
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)|val\("([\w-]+)"\)/g)].map((m) => m[1] || m[2] || m[3]);
  assert.ok(used.length > 25);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
  for (const id of ["rW", "rH", "gap", "tW", "tH", "grout", "minCut", "perBox", "boxPrice", "over", "u-metric", "u-imperial"]) assert.ok(ids.has(id), id);
});

test("page documents the rules and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  assert.match(html, /Offcuts:/);
  assert.match(html, /Diagonal offcuts are not reused/);
  assert.match(html, /herringbone/);
  assert.match(html, /Metric \(m, cm, mm\)/);
  assert.match(html, /Imperial \(ft, in\)/);
  assert.match(html, /<canvas id="view"/);
  assert.match(html, /Compare starting positions/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["plan_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, LICENSE and VENTURE.yaml exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: tile-layout-planner$/m);
});

test("related-tool links point at ventures that exist", () => {
  const html = page("index.html");
  const links = [...html.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
  assert.ok(links.length >= 3);
  for (const l of links) assert.ok(existsSync(new URL(`../${l}/index.html`, import.meta.url)), l);
});

test("the example in the page is a real plan with a cut-out that verifies", () => {
  const spec = sampleSpec();
  assert.deepEqual(validateSpec(spec), []);
  assert.equal(spec.obstacles.length, 1);
  const r = planMode(spec, "best", true);
  assert.deepEqual(verifyLayout(spec, r), []);
  assert.ok(r.full > 0 && r.cutCount > 0);
  assert.ok(tileableArea(spec) < spec.roomW * spec.roomH);
});

test("the guide page carries the clauses, links both ways, and its worked example matches the planner", () => {
  const guide = page("how-many-tiles-do-i-need.html");
  assert.match(guide, /No warranty/);
  assert.match(guide, /not installation instructions or a material guarantee/i);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, /<link rel="canonical" href="\.\/how-many-tiles-do-i-need\.html">/);
  assert.match(guide, /href="\.\/"/);
  assert.match(page("index.html"), /href="\.\/how-many-tiles-do-i-need\.html"/);
  assert.match(page("sitemap.xml"), /how-many-tiles-do-i-need\.html/);
  const ld = JSON.parse(guide.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "FAQPage");
  for (const q of ld.mainEntity) assert.ok(guide.includes(`<h3>${q.name}</h3>`), q.name);
  for (const m of guide.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) assert.ok(existsSync(new URL(`../${m[1]}/index.html`, import.meta.url)), m[1]);

  const spec = {
    roomW: 3580, roomH: 2420, wallGap: 0, tileW: 300, tileH: 600, grout: 3, pattern: "grid", obstacles: [],
    minCut: 50, overagePct: 10, tilesPerBox: 6, reuse: true, swap: false,
  };
  assert.ok(Math.abs(tileableArea(spec) / 1e6 - 8.66) < 0.005);
  assert.equal(Math.round(tileableArea(spec) / (300 * 600)), 48);
  const row = (name) => compareLayouts(spec).find((r) => r.name === name);
  const corner = row("Start from a corner (best: top-left)");
  const centre = row("Centre a tile on the room");
  const best = row("Best found, either tile direction");
  const line = (r) => `<td class="n">${r.full}</td><td class="n">${r.cutCount}</td><td class="n">${r.tilesNoReuse}</td><td class="n">${r.tilesWithReuse}</td><td class="n">${r.slivers}</td>`;
  assert.ok(guide.includes(line(corner)), "corner row");
  assert.ok(guide.includes(line(centre)), "centre row");
  assert.ok(guide.includes(line(best)), "best row");
  assert.equal(Math.round(corner.smallest), 8);
  assert.equal(Math.floor(best.smallest) / 10, 29.9);
  assert.equal(best.lay.swap, true);
  assert.equal(best.orderTiles, 53);
  assert.equal(best.boxes, 9);
  assert.equal(planMode(spec, "best").tilesNoReuse, 48);
});
