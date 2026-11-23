import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const NETWORK = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/;

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /not wildlife-management, regulatory/);
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
  const text = html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&gt;/g, ">");
  for (const q of blocks[1].mainEntity) {
    assert.ok(text.includes(q.name), q.name);
    assert.ok(text.includes(q.acceptedAnswer.text), `answer to "${q.name}" is not shown on the page`);
  }
  assert.doesNotMatch(html, /AggregateRating|"Review"/);
});

test("SEO basics, in a searcher's words", () => {
  const html = page("index.html");
  assert.match(html, /<title>Capture-Recapture Calculator: Population Size Estimate/);
  assert.match(html, /<meta name="description" content="Free capture-recapture \(mark-recapture\) population size calculator[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 10);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && html.includes(`<label for="${id}">`)), `unlabelled: ${tag}`);
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
  for (const m of ["histories", "counts", "frequencies"]) assert.ok(ids.has(`pane-${m}`), m);
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the example buttons load the bundled data, verbatim", async () => {
  const { LILY_CSV, COTTONTAIL } = await import("./example-data.mjs");
  assert.equal(LILY_CSV, page("data/lily-pond-chorus-frogs.csv"));
  assert.equal(LILY_CSV.trim().split("\n").length, 2934);
  assert.deepEqual(COTTONTAIL, { frequencies: [43, 16, 8, 6, 0, 2, 1], k: 18, trueN: 135 });
  assert.match(page("data/SOURCE.md"), /10\.5066\/P9BZAPLB/);
  assert.match(page("data/SOURCE.md"), /build-example\.py/);
});

test("page cites the papers with BibTeX and states its limits", () => {
  const html = page("index.html");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  for (const key of ["otis1978closed", "darroch1958multiple", "chapman1951some", "seber1982estimation", "chao1987unequal", "burnham1978jackknife", "akaike1974new", "muths2020chorus"]) assert.match(html, new RegExp(`@\\w+\\{${key},`));
  assert.match(html, /<strong>Closed population\.<\/strong>/);
  assert.match(html, /scipy 1\.18\.1/);
  // The page's numbers are the engine's (engine.test.mjs pins them too).
  for (const s of ["57 of 270", "539, 95% interval 455 to 656", "68, 39, 23", "95% of the weight and says 135", "says 493", "one of 88 frogs", "474 to about 33,300", "94.5% to 95.5%", "2% to 13%", "85.5%", "14% to 64%"]) assert.ok(html.includes(s), s);
  const cov = page("eval/coverage-output.txt");
  for (const s of ["M0,95.5", "Mt,94.6", "Mb,94.5", "Chao,85.5", "AIC-best,13.4", "M0,2.7", "Mt,2.4", "Chao,80.6,13.9", "Chao,25.8,64.0"]) assert.ok(cov.includes(s), s);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(page("usage.mjs"), /"capture-recapture-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/capture-recapture\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: capture-recapture$/m);
  assert.match(page("llms.txt"), /capture-recapture/i);
});

test("footer links sibling estimation tools", () => {
  const html = page("index.html");
  for (const s of ["survival-analysis", "inter-rater-agreement", "meta-analysis", "extreme-value-analysis", "species-diversity"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
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
