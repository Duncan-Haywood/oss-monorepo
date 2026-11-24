import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Remove every tag, repeating until no tag-shaped text is left.
const stripTags = (s, sub = "") => { let p; do { p = s; s = s.replace(/<[^>]*>/g, sub); } while (s !== p); return s; };

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const NETWORK = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/;

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /not public-health, epidemiological, planning/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with the authors of the cited papers/);
});

test("JSON-LD blocks parse and the FAQ matches the page", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
  const text = stripTags(html).replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  for (const q of blocks[1].mainEntity) {
    assert.ok(text.includes(q.name), q.name);
    assert.ok(text.includes(q.acceptedAnswer.text), `answer to "${q.name}" is not shown on the page`);
  }
  assert.doesNotMatch(html, /AggregateRating|"Review"/);
});

test("SEO basics, in a searcher's words", () => {
  const html = page("index.html");
  assert.match(html, /<title>Moran's I Calculator: Spatial Autocorrelation, LISA Clusters and Gi\* Hot Spots/);
  assert.match(html, /<meta name="description" content="Free Moran's I calculator for spatial autocorrelation[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 14);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html.replace('import("./example-data.mjs")', ""), NETWORK);
  for (const f of ["engine.mjs", "example-data.mjs", "usage.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), NETWORK, f);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(src|href)=["']https?:/);
});

test("the module script imports only local files and parses", async () => {
  const html = page("index.html");
  const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]), ["./engine.mjs", "./usage.mjs"]);
  assert.doesNotMatch(page("engine.mjs"), /^\s*import\s/m);
  assert.doesNotThrow(() => new Function(scripts[0][1].replace(/^\s*import .*$/gm, "")));
  for (const m of html.matchAll(/import \{([^}]+)\} from "\.\/([\w-]+\.mjs)"/g)) {
    const mod = await import(`./${m[2]}`);
    for (const name of m[1].split(",").map((s) => s.trim())) assert.notEqual(mod[name], undefined, `${m[2]} ${name}`);
  }
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 25);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the example button loads the bundled data, verbatim", async () => {
  const { US_INCOME_CSV, US_NEIGHBORS_CSV } = await import("./example-data.mjs");
  assert.equal(US_INCOME_CSV, page("data/us-state-income.csv"));
  assert.equal(US_NEIGHBORS_CSV, page("data/us-state-neighbors.csv"));
  assert.equal(US_INCOME_CSV.trim().split("\n").length, 49);
  assert.match(page("data/SOURCE.md"), /Bureau of Economic\s+Analysis/);
  assert.match(page("data/SOURCE.md"), /build-example\.py/);
});

test("page cites the papers with BibTeX and its numbers are the engine's and the simulation's", () => {
  const html = page("index.html");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  for (const key of ["moran1950notes", "geary1954contiguity", "cliff1981spatial", "getis1992analysis", "ord1995local", "anselin1995local", "sokal1998local", "benjamini1995controlling", "rey1999us"]) assert.match(html, new RegExp(`@\\w+\\{${key},`));
  assert.match(html, /esda 2\.9\.0, libpysal 4\.14\.1/);
  // engine.test.mjs pins these to the engine
  for (const s of ["0.429 (expected -0.021 with no pattern, z = 4.65)", "0.667 in 1934", "0.248, in 1981", "z = -0.89, analytic p = 0.374", "only New York and Rhode Island remain", "214 links"]) assert.ok(html.includes(s), s);
  const cal = page("eval/calibration-output.txt");
  // FAQ claims: one-sided 9-12%, two-sided 4-6%, maps with any local cluster 89-90% / 99%, FDR 4.5-9%
  const rows = cal.trim().split("\n").slice(2).map((l) => l.split(","));
  const col = (name) => cal.trim().split("\n")[1].split(",").indexOf(name);
  assert.ok(rows.every((r) => r.length === cal.trim().split("\n")[1].split(",").length));
  const vals = (name) => rows.map((r) => Number(r[col(name)]));
  for (const v of [...vals("moran_perm_one"), ...vals("geary_perm_one")]) assert.ok(v >= 9 && v <= 12, `one-sided ${v}`);
  for (const v of [...vals("moran_perm_two"), ...vals("geary_perm_two")]) assert.ok(v >= 3.5 && v <= 6.5, `two-sided ${v}`);
  assert.deepEqual(vals("local_maps_any_two").map(Math.round), [89, 90, 99, 99]);
  for (const v of vals("local_fdr_maps_any")) assert.ok(v >= 4.5 && v <= 9, `fdr ${v}`);
  for (const s of ["9% to 12%", "4% to 6%", "89% to 90%", "99% of runs", "between 4.5% and 9%"]) assert.ok(html.includes(s), s);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(page("usage.mjs"), /"spatial-autocorrelation-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/spatial-autocorrelation\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: spatial-autocorrelation$/m);
  assert.match(page("llms.txt"), /Moran/);
});

test("footer links sibling tools that exist", () => {
  const html = page("index.html");
  for (const s of ["kriging-interpolation", "fdr-multiple-testing", "gaussian-process-regression"]) {
    assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
    assert.ok(readFileSync(new URL(`../${s}/index.html`, import.meta.url)), s);
  }
});

test("the example data loads on the first example press, and every name a handler takes exists", async () => {
  const html = page("index.html");
  assert.doesNotMatch(html, /from "\.\/example-data\.mjs"/, "example-data.mjs stays out of the page's static import graph");
  assert.equal(html.split("import(").length - 1, 1, "the only dynamic import is the local example data");
  assert.ok(html.includes('import("./example-data.mjs")'));
  const data = await import("./example-data.mjs");
  const taken = [...html.matchAll(/const \{([^}]+)\} = await exampleData\(\);/g)];
  assert.ok(taken.length >= 1);
  for (const m of taken) for (const name of m[1].split(",").map((s) => s.trim())) assert.notEqual(data[name], undefined, `example-data.mjs ${name}`);
});
