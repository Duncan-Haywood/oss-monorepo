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
  assert.match(html, /not medical advice/);
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
  const text = stripTags(html).replace(/&amp;/g, "&");
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(text.includes(q.acceptedAnswer.text), `answer to "${q.name}" is not shown on the page`);
  }
});

test("SEO basics, in a searcher's words", () => {
  const html = page("index.html");
  assert.match(html, /<title>Meta-Analysis Calculator/);
  assert.match(html, /<meta name="description" content="Free meta-analysis calculator[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 8);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
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
  assert.ok(used.length > 15);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the example button loads the bundled trials, verbatim", async () => {
  const { BCG_CSV } = await import("./example-data.mjs");
  assert.equal(BCG_CSV, page("data/bcg-vaccine-trials.csv"));
  assert.equal(BCG_CSV.trim().split("\n").length, 14);
  assert.match(page("index.html"), /\$\("#csv"\)\.value = BCG_CSV/);
  const source = page("data/SOURCE.md");
  assert.match(source, /Colditz/);
  assert.match(source, /2026-11-16/);
  assert.match(source, /SHA-256/);
});

test("page cites the papers with BibTeX, states its limits, and its numbers match the evals", async () => {
  const html = page("index.html");
  const { PAPERS } = await import("./engine.mjs");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  for (const p of PAPERS) assert.match(html, new RegExp(`@\\w+\\{${p.key},`), p.key);
  for (const s of ["Garbage in", "Few studies", "Large-sample variances", "Moderators"]) assert.match(html, new RegExp(`<strong>${s}\\.</strong>`));
  assert.match(html, /Not modelled:/);
  const ref = JSON.parse(page("eval/reference.json"));
  assert.ok(html.includes(`statsmodels ${ref.statsmodels}`));
  const cov = JSON.parse(page("eval/coverage.json"));
  const pct = (v) => Math.round(v * 100);
  const range = (key) => `${Math.min(...cov.map((c) => pct(c[key])))} to ${Math.max(...cov.map((c) => pct(c[key])))}%`;
  const wald = [...cov.map((c) => c.dlWald), ...cov.map((c) => c.remlWald)];
  const waldRange = `${Math.min(...wald.map(pct))} to ${Math.max(...wald.map(pct))}%`;
  assert.ok(html.includes(`Wald interval covered the true mean ${waldRange}`), waldRange);
  assert.ok(html.includes(`Hartung-Knapp interval ${range("remlHK")}`), range("remlHK"));
  assert.ok(html.includes(`prediction interval held ${range("predictionCoverage")}`), range("predictionCoverage"));
  assert.ok(html.includes(`In ${cov[0].reps} simulated meta-analyses`));
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(page("usage.mjs"), /"meta-analysis-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/meta-analysis\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: meta-analysis$/m);
  assert.match(page("llms.txt"), /meta-analysis/i);
});

test("footer links the sibling research-algorithm tools", () => {
  const html = page("index.html");
  for (const s of ["contingency-table-tests", "fdr-multiple-testing", "inter-rater-agreement", "survival-analysis", "probability-calibration"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
});
