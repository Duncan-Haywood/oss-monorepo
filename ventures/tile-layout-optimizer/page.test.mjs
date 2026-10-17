import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { SYSTEMS, buildProblem, planAll, sampleInput, verifyPlan, naiveLayout } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-lay-tile-with-less-waste.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, construction or installation advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any tile maker/);
  assert.match(html, /invented/);
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
  assert.match(html, /<title>Tile Layout Optimizer/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 20);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  const row = html.match(/function rowHtml[\s\S]*?<\/tr>`/)[0];
  const made = [...row.matchAll(/<(input|select)\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(made.length, 5);
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
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
  for (const id of ["roomW", "roomL", "gap", "grout", "kerf", "minCut", "spare", "ruleWaste", "b-straight", "b-half", "b-third"]) assert.ok(ids.has(id), id);
});

test("page documents the rules and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  assert.match(html, /guillotine/);
  assert.match(html, /lower bound/i);
  assert.match(html, /Metric \(cm, mm\)/);
  assert.match(html, /Imperial \(in\)/);
  assert.match(html, /Brick, half offset/);
  assert.match(html, /<canvas id="view"/);
  assert.match(html, /Independent check passed/);
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
  assert.match(page("VENTURE.yaml"), /^name: tile-layout-optimizer$/m);
});

test("related-tool links point at ventures that exist", () => {
  for (const file of ["index.html", GUIDE]) {
    for (const m of page(file).matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) {
      assert.ok(existsSync(new URL(`../${m[1]}/index.html`, import.meta.url)), m[1]);
    }
  }
});

test("the sample room in the page is a real plan with a shared tile and a cut-out", () => {
  const M = SYSTEMS.metric;
  const { problem, errors } = buildProblem(sampleInput(M), M);
  assert.deepEqual(errors, []);
  assert.equal(problem.cutouts.length, 1);
  const all = planAll(problem);
  for (const r of all.results) assert.ok(verifyPlan(problem, r.tile, r.best).ok, r.tile.name);
  assert.ok(all.results.some((r) => r.best.bins.some((b) => b.placed.length > 1)));
});

test("the guide page carries the clauses, links both ways, and its worked example matches the optimizer", () => {
  const guide = page(GUIDE);
  assert.match(guide, /No warranty/);
  assert.match(guide, /not legal, tax, financial, construction or installation advice/i);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, new RegExp(`<link rel="canonical" href="\\./${GUIDE.replace(".", "\\.")}">`));
  assert.match(guide, /href="\.\/"/);
  assert.match(page("index.html"), new RegExp(`href="\\./${GUIDE.replace(".", "\\.")}"`));
  assert.match(page("sitemap.xml"), new RegExp(GUIDE.replace(".", "\\.")));
  const ld = JSON.parse(guide.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "FAQPage");
  for (const q of ld.mainEntity) assert.ok(guide.includes(`<h3>${q.name}</h3>`), q.name);

  const M = SYSTEMS.metric;
  const { problem } = buildProblem(sampleInput(M), M);
  const all = planAll(problem);
  const by = (name) => all.results.find((r) => r.tile.name === name);
  const plank = by("Porcelain plank"), subway = by("Subway-size"), large = by("Large format");
  const row = (r, tiles, boxes, cost, thumbBoxes, thumbCost, naive) => {
    assert.equal(r.best.tiles, tiles);
    assert.equal(r.buy.boxes, boxes);
    assert.equal(r.buy.cost, cost);
    assert.equal(r.thumb.boxes, thumbBoxes);
    assert.equal(r.thumb.cost, thumbCost);
    assert.equal(r.naive.tiles, naive);
  };
  row(plank, 67, 12, 744, 13, 806, 82);
  row(subway, 90, 12, 852, 13, 923, 102);
  row(large, 46, 13, 884, 13, 884, 57);
  assert.equal(plank.best.lowerBound, 66);
  assert.equal(plank.thumb.tilesNeeded, 73);
  assert.equal(plank.naiveBuy.cost, 930);
  assert.equal(plank.best.layout.bond.id, "straight");
  assert.equal(large.best.layout.bond.id, "third");
  const fromLeftCm = plank.best.start.fromLeft / 1000;
  assert.ok(fromLeftCm > 19 && fromLeftCm < 21, String(fromLeftCm));
  assert.equal((problem.floor / 1e10).toFixed(1), "16.1");
  // the table in the guide quotes these
  for (const cell of ["<td class=\"n\">67</td><td class=\"n\">12</td><td class=\"n\">$744</td><td class=\"n\">13 / $806</td><td class=\"n\">82</td>",
    "<td class=\"n\">90</td><td class=\"n\">12</td><td class=\"n\">$852</td><td class=\"n\">13 / $923</td><td class=\"n\">102</td>",
    "<td class=\"n\">46</td><td class=\"n\">13</td><td class=\"n\">$884</td><td class=\"n\">13 / $884</td><td class=\"n\">57</td>"]) {
    assert.ok(guide.includes(cell), cell);
  }
  assert.equal(naiveLayout(problem, plank.tile).tiles, 82);
});
