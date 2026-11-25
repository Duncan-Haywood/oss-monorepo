import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const NETWORK = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/;

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /not engineering advice/);
  assert.match(html, /Bulletin 17C/);
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
  const text = html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(text.includes(q.acceptedAnswer.text), `answer to "${q.name}" is not shown on the page`);
  }
});

test("SEO basics, in a searcher's words", () => {
  const html = page("index.html");
  assert.match(html, /<title>100-Year Flood and Return Level Calculator/);
  assert.match(html, /<meta name="description" content="Free return level calculator[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 13);
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
  assert.ok(used.length > 15);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the example buttons load the bundled USGS records, verbatim", async () => {
  const { ANNUAL_PEAKS_CSV, DAILY_FLOW_CSV } = await import("./example-data.mjs");
  assert.equal(ANNUAL_PEAKS_CSV, page("data/potomac-annual-peaks.csv"));
  assert.equal(DAILY_FLOW_CSV, page("data/potomac-daily-flow.csv"));
  assert.equal(ANNUAL_PEAKS_CSV.trim().split("\n").length, 97);
  assert.equal(DAILY_FLOW_CSV.trim().split("\n").length, 7306);
  assert.match(page("index.html"), /\$\("#csv"\)\.value = ANNUAL_PEAKS_CSV/);
  assert.match(page("index.html"), /\$\("#csv"\)\.value = DAILY_FLOW_CSV/);
  const source = page("data/SOURCE.md");
  assert.match(source, /01646500/);
  assert.match(source, /public domain/);
  assert.match(source, /2026-11-16/);
});

test("page cites the papers with BibTeX, states its limits, and its numbers match the evals", () => {
  const html = page("index.html");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  for (const key of ["coles2001introduction", "jenkinson1955frequency", "pickands1975statistical", "davison1990models", "hosking1985estimation", "usgs01646500"]) assert.match(html, new RegExp(`@\\w+\\{${key},`));
  for (const s of ["Stationarity", "Independence", "Extrapolation", "Short records"]) assert.match(html, new RegExp(`<strong>${s}\\.</strong>`));
  assert.match(html, /Not modelled:/);
  const ref = JSON.parse(page("eval/reference.json"));
  assert.ok(html.includes(`scipy ${ref.scipy}`));
  // The coverage figures quoted on the page are the ones eval/coverage.mjs wrote.
  const cov = JSON.parse(page("eval/coverage.json"));
  const pct = (v) => Math.round(v * 100);
  const small = cov.filter((c) => c.n <= 60);
  assert.ok(html.includes(`${Math.min(...small.map((c) => pct(c.deltaCoverage)))} to ${Math.max(...small.map((c) => pct(c.deltaCoverage)))}%`));
  assert.ok(html.includes(`${Math.min(...small.map((c) => pct(c.profileCoverage)))} to ${Math.max(...small.map((c) => pct(c.profileCoverage)))}% for the profile`));
  assert.ok(html.includes(`${Math.min(...cov.map((c) => pct(c.profileCoverage)))} to ${Math.max(...cov.map((c) => pct(c.profileCoverage)))}% of the time`));
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(page("usage.mjs"), /"extreme-value-analysis-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/extreme-value-analysis\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /Functional Source License/);
  assert.match(page("VENTURE.yaml"), /^name: extreme-value-analysis$/m);
  assert.match(page("llms.txt"), /return level/i);
});

test("footer links the sibling research-algorithm tools", () => {
  const html = page("index.html");
  for (const s of ["mann-kendall-trend", "changepoint-detector", "survival-analysis", "kalman-smoother"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
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
