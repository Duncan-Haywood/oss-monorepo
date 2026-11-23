import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
  assert.match(html, /FiveThirtyEight, ABC News, the National Football League/);
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
  assert.doesNotMatch(html, /AggregateRating|"Review"/);
});

test("SEO basics, in a searcher's words", () => {
  const html = page("index.html");
  assert.match(html, /<title>Probability Calibration Check — reliability diagram, Brier score decomposition/);
  assert.match(html, /<meta name="description" content="Free online calibration check for probability forecasts[^"]{80,}/);
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
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*\\sfor="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html.replace('import("./example-data.mjs")', ""), NETWORK);
  for (const f of ["engine.mjs", "usage.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), NETWORK, f);
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
  const used = [...html.matchAll(/\$\("#([\w-]+)(?:[ "])|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 15);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the example button loads the bundled dataset, verbatim, and its source is recorded", async () => {
  const { EXAMPLE_CSV } = await import("./example-data.mjs");
  assert.equal(EXAMPLE_CSV, page("data/nfl-elo-2010-2020.csv"));
  assert.equal(EXAMPLE_CSV.trim().split("\n").length, 2931);
  assert.match(page("index.html"), /loadExample\(EXAMPLE_CSV\)/);
  const source = page("data/SOURCE.md");
  for (const s of ["fivethirtyeight/nfl-elo-game", "MIT", "ABC News Internet Ventures", "af16cf3c5848393057fad07feea278f0a85ab7b57ddbfe42ed96b5c80e7d519d", "e8a18fdada4cbf837d5400021b9becb0164d69fcbe9d8c4c8681972b8f2c2101", "2026-11-16"]) assert.ok(source.includes(s), s);
});

test("page cites the papers with BibTeX and states its limits", () => {
  const html = page("index.html");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  for (const key of ["dimitriadis2021stable", "ayer1955empirical", "brier1950verification", "murphy1973new", "spiegelhalter1986probabilistic", "cox1958two", "naeini2015obtaining", "hanley1982meaning"]) assert.match(html, new RegExp(`@\\w+\\{${key},`), key);
  assert.match(html, /<strong>Calibration is not skill\.<\/strong>/);
  assert.match(html, /Not modelled:/);
  const ref = JSON.parse(page("eval/reference.json"));
  assert.match(html, new RegExp(`scikit-learn ${ref.versions.sklearn.replace(/\./g, "\\.")}`));
  assert.match(html, new RegExp(`scipy ${ref.versions.scipy.replace(/\./g, "\\.")}`));
});

test("the numbers quoted about the example are the ones the engine gives", () => {
  const html = page("index.html");
  const j = JSON.parse(page("eval/seasons.json"));
  const p1 = (v) => `${(v * 100).toFixed(1)}%`;
  const s2020 = j.seasons.find((s) => s.season === 2020);
  assert.ok(html.includes(`home teams won ${p1(j.all.homeWinRate)} of games against an average forecast of ${p1(j.all.meanForecast)}`));
  assert.ok(html.includes(`they won ${p1(s2020.homeWinRate)} against ${p1(s2020.meanForecast)}`));
  const eces = j.eceByBins.flatMap((e) => [e.eceWidth, e.eceCount]);
  assert.ok(html.includes(`ranges from ${Math.min(...eces).toFixed(3)} to ${Math.max(...eces).toFixed(3)}`));
  assert.ok(html.includes(`p = ${j.all.oeP.toFixed(3)})`));
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(page("usage.mjs"), /"probability-calibration-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/probability-calibration\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: probability-calibration$/m);
  assert.match(page("llms.txt"), /calibration/i);
});

test("footer links the sibling research-algorithm tools", () => {
  const html = page("index.html");
  for (const s of ["conformal-prediction-intervals", "changepoint-detector", "fdr-multiple-testing", "survival-analysis", "spc-control-charts", "isolation-forest", "gaussian-process-regression", "inter-rater-agreement", "mann-kendall-trend"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
});

test("links to ROC analysis, the discrimination side of the same question", () => {
  assert.match(page("index.html"), /href="\.\.\/roc-analysis\/"/);
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
