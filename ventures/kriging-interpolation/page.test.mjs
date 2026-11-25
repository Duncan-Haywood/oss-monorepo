import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stripTags = (s) => { let p; do { p = s; s = s.replace(/<[^>]+>/g, ""); } while (s !== p); return s; };

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const NETWORK = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/;

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not engineering, surveying, environmental or other professional advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /a regulator, standard or contract may require a different method/);
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
  const text = stripTags(html).replace(/&amp;/g, "&");
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(text.includes(q.acceptedAnswer.text), `answer to "${q.name}" is not shown on the page`);
  }
  assert.doesNotMatch(html, /AggregateRating|"Review"/);
});

test("SEO basics, in a searcher's words", () => {
  const html = page("index.html");
  assert.match(html, /<title>Kriging Interpolation Tool/);
  assert.match(html, /<meta name="description" content="Free online kriging tool[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 5);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*\\sfor="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, NETWORK);
  for (const f of ["engine.mjs", "example-data.mjs", "usage.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), NETWORK, f);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(src|href)=["']https?:/);
});

test("the module script imports only local files and parses", async () => {
  const html = page("index.html");
  const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]), ["./engine.mjs", "./example-data.mjs", "./usage.mjs"]);
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
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the examples are the data files, verbatim, and the page's worked example is the engine's", async () => {
  const { EXAMPLES, ERA5_WAVES } = await import("./example-data.mjs");
  const { analyze, SAMPLE_TEXT } = await import("./engine.mjs");
  assert.equal(ERA5_WAVES, page("data/era5-wave-height-2024-01.csv"));
  assert.equal(EXAMPLES.soil.text, SAMPLE_TEXT);
  assert.match(EXAMPLES.soil.label, /Made-up/);
  assert.match(EXAMPLES.waves.label, /Copernicus/);
  const html = page("index.html");
  for (const k of ["waves", "soil"]) assert.match(html, new RegExp(`loadExample\\("${k}"\\)`));
  const source = page("data/SOURCE.md");
  for (const s of ["CC BY 4.0", "Contains modified Copernicus Climate Change Service information", "era5_grid_2024.csv", "eb9ada685cf53d5e2c1dfc7424f5e554e7ec56100e3c4ce79a09f3122d1d6e99"]) assert.ok(source.includes(s), s);
  const r = analyze({ text: ERA5_WAVES, grid: false });
  const cv = r.crossValidation;
  const two = (v) => v.toFixed(2);
  assert.match(html, new RegExp(`root mean square error of ${two(cv.kriging.rmse)} m`));
  assert.match(html, new RegExp(`Inverse distance weighting misses by ${two(cv.idw.rmse)} m and the nearest point by ${two(cv.nearest.rmse)} m`));
  assert.match(html, new RegExp(`kriging misses by ${two(cv.kriging.rmse)} m root mean square against ${two(cv.idw.rmse)} m`));
  assert.match(html, new RegExp(`\\(${Math.round((100 * r.model.nugget) / r.model.sill)}% of the sill\\)`));
  assert.equal(r.n, 371);
  assert.match(html, /371 ocean points/);
  const o = cv.outliers[0];
  assert.deepEqual([o.x, o.y, o.value], [10, 60, 0.22]);
  assert.match(html, new RegExp(`had 0.22 m where the open-ocean neighbours imply ${o.looEstimate.toFixed(1)} m`));
});

test("the page's verification claims match the saved simulation", () => {
  const html = page("index.html");
  const sim = JSON.parse(page("eval/simulation.json"));
  assert.equal(sim.runs.length, 40);
  const cover = (100 * sim.summary.meanCoverage95).toFixed(1);
  assert.equal((html.match(new RegExp(`covered ${cover}% of`, "g")) || []).length, 3);
  assert.match(html, new RegExp(`On 40 simulated fields with a known truth it beat inverse distance on ${sim.summary.krigingBeatsIdw}`));
  assert.match(html, new RegExp(`${(sim.settings.fields * sim.settings.holdout).toLocaleString("en-US")} held-out values`));
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(html, /loadExample\("waves", true\)/, "the page's first render must not count as a use");
  assert.match(page("usage.mjs"), /"kriging-interpolation-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/kriging-interpolation\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /Functional Source License/);
  assert.match(page("VENTURE.yaml"), /^name: kriging-interpolation$/m);
  assert.match(page("llms.txt"), /Matheron/);
});

test("the page cites every paper the engine implements, with BibTeX", async () => {
  const { PAPERS } = await import("./engine.mjs");
  const html = page("index.html");
  for (const p of PAPERS) {
    if (!p.doi) { assert.ok(html.includes(p.title), p.title); continue; }
    assert.ok(html.includes(`doi={${p.doi}}`), p.doi);
    assert.ok(html.includes(`https://doi.org/${p.doi}`), p.doi);
  }
  for (const s of ["gaussian-process-regression", "hdbscan-clustering", "spatial-autocorrelation"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
});
