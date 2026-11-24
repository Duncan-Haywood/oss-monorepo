import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stripTags = (s) => { let p; do { p = s; s = s.replace(/<[^>]+>/g, ""); } while (s !== p); return s; };

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const NETWORK = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/;

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /a flagged shift or outlier is not proof that anything happened, and a forecast is not a promise/);
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
  assert.match(html, /<title>Kalman Smoother Online/);
  assert.match(html, /<meta name="description" content="Free online Kalman filter and smoother[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !t.includes("${"));
  assert.ok(inputs.length >= 9);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    const wrapped = id && new RegExp(`<label[^>]*>${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(html);
    assert.ok(/aria-label=/.test(tag) || wrapped || (id && new RegExp(`<label[^>]*\\sfor="${id}"`).test(html)), `unlabelled: ${tag}`);
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
  const used = [...html.matchAll(/\$\("#([\w-]+)(?:[ "])|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 15);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the example buttons load the bundled datasets, verbatim", async () => {
  const { EXAMPLE_CSV, EXAMPLE_UK_CSV } = await import("./example-data.mjs");
  assert.equal(EXAMPLE_CSV, page("data/nile.csv"));
  assert.equal(EXAMPLE_UK_CSV, page("data/uk-driver-deaths.csv"));
  assert.equal(EXAMPLE_CSV.trim().split("\n").length, 101);
  assert.equal(EXAMPLE_UK_CSV.trim().split("\n").length, 193);
  assert.match(page("index.html"), /\$\("#csv"\)\.value = EXAMPLE_CSV;/);
  assert.match(page("index.html"), /\$\("#csv"\)\.value = EXAMPLE_UK_CSV;/);
  const source = page("data/SOURCE.md");
  for (const s of ["public domain", "10.1093/biomet/65.2.243", "Harvey, A. C. & Durbin, J. (1986)", "88e97bea", "2aada4ec"]) assert.ok(source.includes(s), s);
});

test("the page's claims about the examples are what the engine finds", async () => {
  const { analyze } = await import("./engine.mjs");
  const { EXAMPLE_CSV, EXAMPLE_UK_CSV } = await import("./example-data.mjs");
  const nile = analyze({ csv: EXAMPLE_CSV });
  assert.equal(`${nile.shifts[0].from}-${nile.shifts[0].to}`, "1898-1899");
  assert.ok(Math.abs(nile.shifts[0].tStat + 3) < 0.3);
  assert.equal(nile.outliers[0].label, "1913");
  const uk = analyze({ csv: EXAMPLE_UK_CSV, log: true, season: 12 });
  assert.equal(`${uk.shifts[0].from}-${uk.shifts[0].to}`, "1983-01-1983-02");
  assert.ok(Math.abs(uk.shifts[0].tStat + 3.8) < 0.1);
  const level = analyze({ csv: EXAMPLE_CSV, slope: "none" });
  assert.equal(Math.round(level.model.variances.irregular * 10) / 10, 15098.5);
  assert.equal(Math.round(level.model.variances.level * 10) / 10, 1469.2);
});

test("page cites the papers with BibTeX and states its limits", () => {
  const html = page("index.html");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  for (const key of ["durbin2012time", "koopman1997exact", "harvey1989forecasting", "harvey1992diagnostic", "dejong1998diagnosing"]) assert.match(html, new RegExp(`@\\w+\\{${key},`));
  assert.match(html, /<strong>Equally spaced periods\.<\/strong>/);
  assert.match(html, /<strong>A flag is a lead, not a verdict\.<\/strong>/);
  assert.match(html, /Not modelled:/);
  assert.match(html, /statsmodels 0\.15\.0/);
  assert.ok(page("eval/reference.json").includes('"statsmodels":"0.15.0"'));
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(page("usage.mjs"), /"kalman-smoother-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/kalman-smoother\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: kalman-smoother$/m);
  assert.match(page("llms.txt"), /Kalman/);
});

test("footer links the sibling research-algorithm tools", () => {
  const html = page("index.html");
  for (const s of ["changepoint-detector", "stl-decomposition", "mann-kendall-trend", "lomb-scargle-periodogram", "gaussian-process-regression", "spc-control-charts", "conformal-prediction-intervals", "matrix-profile-explorer"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
});
