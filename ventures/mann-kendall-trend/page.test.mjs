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
  assert.match(html, /not proof of an error or of a cause/);
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
  assert.match(html, /<title>Mann-Kendall Trend Test Online/);
  assert.match(html, /<meta name="description" content="Free online Mann-Kendall trend test with Sen's slope[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !t.includes("${"));
  assert.ok(inputs.length >= 10);
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
  const used = [...html.matchAll(/\$\("#([\w-]+)(?:[ "])|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 15);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the example buttons load the bundled datasets, verbatim", async () => {
  const { EXAMPLE_CSV, PEAKS_CSV } = await import("./example-data.mjs");
  assert.equal(EXAMPLE_CSV, page("data/potomac-monthly-flow.csv"));
  assert.equal(PEAKS_CSV, page("data/potomac-annual-peaks.csv"));
  assert.equal(EXAMPLE_CSV.trim().split("\n").length, 1160);
  assert.match(page("index.html"), /loadExample\(EXAMPLE_CSV\)/);
  const source = page("data/SOURCE.md");
  for (const s of ["01646500", "01646502", "public domain", "e0d81f40c6ce24a694821277295ff05f37cb6aed9e3d90c809210f63d205c0d6", "c5d66857b1b493c32052bd190918b2c864bbcfd95baf3ae55cac4d87032038e1", "2026-11-15"]) assert.ok(source.includes(s), s);
});

test("page cites the papers with BibTeX and states its limits", () => {
  const html = page("index.html");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  for (const key of ["mann1945nonparametric", "kendall1975rank", "sen1968estimates", "hamed1998modified", "yue2004mann", "yue2002influence", "hirsch1982techniques", "hirsch1984nonparametric", "vanbelle1984nonparametric"]) assert.match(html, new RegExp(`@\\w+\\{${key},`));
  assert.match(html, /<strong>A trend is not a cause\.<\/strong>/);
  assert.match(html, /Not modelled:/);
  assert.match(html, /pymannkendall 1\.4\.3/);
  assert.match(html, /scipy 1\.17\.1/);
  const ref = JSON.parse(page("eval/reference.json"));
  assert.equal(ref.versions.pymannkendall, "1.4.3");
  assert.equal(ref.versions.scipy, "1.17.1");
});

test("the simulation numbers quoted on the page are the ones in the file", () => {
  const html = page("index.html");
  const sim = JSON.parse(page("eval/size-simulation.json")).rows.find((r) => r.phi === 0.6 && r.n === 100).rejectionRate;
  const pct = (v) => `${Math.round(v * 100)}%`;
  assert.match(html, new RegExp(`plain ${pct(sim.none)}, Yue-Wang ${pct(sim["yue-wang"])}, Hamed-Rao ${pct(sim["hamed-rao"])} \\(first 3 lags ${pct(sim["hamed-rao-3"])}\\), trend-free pre-whitening ${pct(sim.tfpw)}`));
  assert.ok(html.includes(`the plain test found a trend ${pct(sim.none)} of the time at the 5% level and the default Yue-Wang correction ${pct(sim["yue-wang"])}`));
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(page("usage.mjs"), /"mann-kendall-trend-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/mann-kendall-trend\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /Functional Source License/);
  assert.match(page("VENTURE.yaml"), /^name: mann-kendall-trend$/m);
  assert.match(page("llms.txt"), /Mann-Kendall/);
});

test("footer links the sibling research-algorithm tools", () => {
  const html = page("index.html");
  for (const s of ["changepoint-detector", "conformal-prediction-intervals", "matrix-profile-explorer", "survival-analysis", "fdr-multiple-testing", "stl-decomposition", "spc-control-charts", "isolation-forest", "gaussian-process-regression", "robust-pca", "lomb-scargle-periodogram"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
});
