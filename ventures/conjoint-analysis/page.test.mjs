import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const NETWORK = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/;

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /not a sales forecast/);
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
  assert.ok(blocks[1].mainEntity.length >= 6);
  const text = html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&gt;/g, ">");
  for (const q of blocks[1].mainEntity) {
    assert.ok(text.includes(q.name), q.name);
    assert.ok(text.includes(q.acceptedAnswer.text), `answer to "${q.name}" is not shown on the page`);
  }
  assert.doesNotMatch(html, /AggregateRating|"Review"/);
});

test("SEO basics, in a searcher's words", () => {
  const html = page("index.html");
  assert.match(html, /<title>Conjoint Analysis Tool Online: Choice-Based Conjoint/);
  assert.match(html, /<meta name="description" content="Free choice-based conjoint \(CBC\) tool[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const markup = html.replace(/<script[\s\S]*?<\/script>/g, "");
  const inputs = [...markup.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 15);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && html.includes(`<label for="${id}">`)), `unlabelled: ${tag}`);
  }
  // Product editors are built by script: each control gets a label too.
  assert.match(html, /<label for="\$\{id\(j\)\}">/);
  assert.match(html, /<label for="\$\{id\("name"\)\}">/);
  assert.doesNotMatch(html, NETWORK);
  for (const f of ["engine.mjs", "simulate.mjs", "usage.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), NETWORK, f);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(src|href)=["']https?:/);
});

test("the module script imports only local files and parses", async () => {
  const html = page("index.html");
  const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]), ["./engine.mjs", "./simulate.mjs", "./usage.mjs"]);
  assert.doesNotMatch(page("engine.mjs"), /^\s*import\s/m);
  assert.deepEqual([...page("simulate.mjs").matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]), ["./engine.mjs"]);
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
  assert.ok(used.length > 30);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the example button regenerates the bundled file, verbatim", async () => {
  const { simulate, MEAL_KIT_ATTRIBUTES } = await import("./simulate.mjs");
  assert.equal(simulate(), page("data/meal-kit-simulated.csv"));
  assert.equal(MEAL_KIT_ATTRIBUTES + "\n", page("data/meal-kit-levels.txt"));
  assert.match(page("data/SOURCE.md"), /simulate\.mjs/);
});

test("page cites the papers with BibTeX, states its limits, and quotes numbers the code produces", () => {
  const html = page("index.html");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  for (const key of ["mcfadden1974conditional", "louviere1983design", "huber1996utility", "kuhfeld1994efficient", "train2009discrete"]) assert.match(html, new RegExp(`@\\w+\\{${key},`));
  assert.match(html, /<strong>One segment\.<\/strong>/);
  assert.match(html, /<strong>Not here \(yet\):<\/strong>/);
  assert.match(html, /statsmodels 0\.15\.0/);
  // engine.test.mjs pins the example's numbers; eval/coverage-output.txt holds the simulation's.
  for (const s of ["−0.392 per dollar", "55.1%", "R² 0.205", "60.0% of the importance", "packaging 3.6%", "$1.09", "$0.86"]) assert.ok(html.includes(s), s);
  const cov = page("eval/coverage-output.txt");
  for (const s of ["all,95.0,94.8", "shrink by 7 to 15 percent", "by 5 to 19 percent; cluster-robust SEs are within 6 percent", "within 0.01 to 0.10 dollars", "Price per serving (per unit),-0.450,-0.381", "Delivery: Pick any day,0.89,0.90"]) assert.ok(cov.includes(s), s);
  for (const s of ["95.0% (model-based) and 94.8% (cluster-robust)", "7 to 15 percent", "5 to 19 percent", "within 6 percent", "$0.01 to $0.10", "averages −0.381", "$0.90 across studies against a true $0.89"]) assert.ok(html.includes(s), s);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["design_generated", "analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(page("usage.mjs"), /"conjoint-analysis-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/conjoint-analysis\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /Functional Source License/);
  assert.match(page("VENTURE.yaml"), /^name: conjoint-analysis$/m);
  assert.match(page("llms.txt"), /choice-based conjoint/i);
});

test("footer links sibling pricing and survey tools", () => {
  const html = page("index.html");
  for (const s of ["van-westendorp-pricing-analyzer", "gabor-granger-price-analyzer", "price-elasticity-estimator", "quick-pick-survey"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
});
