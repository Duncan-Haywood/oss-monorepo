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
  assert.match(html, /not medical advice/);
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
  assert.match(html, /<title>Fisher's Exact Test Calculator/);
  assert.match(html, /<meta name="description" content="Free Fisher's exact test calculator for 2x2 and larger contingency tables[^"]{80,}/);
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

test("the example buttons load the bundled data, and the Berkeley CSV is the data file verbatim", async () => {
  const { BERKELEY_CSV, TWINS_CSV, JOBS_CSV } = await import("./example-data.mjs");
  assert.equal(BERKELEY_CSV + "\n", page("data/berkeley-admissions-1973.csv"));
  assert.equal(BERKELEY_CSV.trim().split("\n").length, 25);
  for (const name of ["BERKELEY_CSV", "TWINS_CSV", "JOBS_CSV"]) assert.ok(page("index.html").includes(`loadExample(${name})`), name);
  assert.ok(TWINS_CSV && JOBS_CSV);
  const source = page("data/SOURCE.md");
  for (const s of ["10.1126/science.187.4175.398", "UCBAdmissions", "Rdatasets", "2026-11-17", "8bc8fd4a6456f6c801f5dcab041e2aa56e88b68cd941806b49629a4b3cd94913"]) assert.ok(source.includes(s), s);
});

test("page cites the papers with BibTeX, states its limits and the verified versions", () => {
  const html = page("index.html");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  for (const key of ["fisher1935logic", "barnard1945new", "boschloo1970raised", "mehta1983network", "lydersen2009recommended", "mantel1959statistical"]) assert.ok(html.includes(`{${key},`), key);
  assert.match(html, /<strong>An association is not a cause\.<\/strong>/);
  assert.match(html, /Not covered:/);
  const ref = JSON.parse(page("eval/reference.json"));
  assert.ok(html.includes(`scipy ${ref.versions.scipy}`) && html.includes(`statsmodels ${ref.versions.statsmodels}`));
  assert.ok(html.includes(`on ${ref.two_by_two.length} tables`));
  assert.ok(html.includes(`on ${ref.rxc.length} tables`));
  assert.ok(html.includes(`on ${ref.stratified.length} strata sets`));
});

test("the size-study numbers quoted on the page are the ones in eval/size.json", () => {
  const html = page("index.html");
  const s = JSON.parse(page("eval/size.json"));
  const at = (n) => s.designs.find((d) => d.n1 === n).tests;
  const pct1 = (v) => `${(v * 100).toFixed(1)}%`;
  assert.ok(html.includes(`with 20 per group its real false-positive rate averages ${pct1(at(20)["Fisher exact"].meanSize)}`));
  assert.ok(html.includes(`up to ${pct1(at(25)["Pearson chi-square"].maxSize)} of the time at a nominal 5% with 25 per group`));
  assert.ok(html.includes(`averages ${pct1(at(20)["Fisher exact"].meanSize)} at a nominal 5%`));
  for (const d of s.designs) assert.ok(d.tests["Fisher mid-p"].maxSize < 0.05);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.ok(html.includes(`record("${e}")`), e);
    assert.ok(html.includes(`<code>${e}</code>`), e);
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(page("usage.mjs"), /"contingency-table-tests-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/contingency-table-tests\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /Functional Source License/);
  assert.match(page("VENTURE.yaml"), /^name: contingency-table-tests$/m);
  assert.match(page("llms.txt"), /Fisher/);
});

test("footer links the sibling research-algorithm tools", () => {
  const html = page("index.html");
  for (const s of ["meta-analysis", "fdr-multiple-testing", "survival-analysis", "inter-rater-agreement", "probability-calibration", "difference-in-differences", "ab-test-significance-calculator"]) assert.ok(html.includes(`href="../${s}/"`), s);
});
