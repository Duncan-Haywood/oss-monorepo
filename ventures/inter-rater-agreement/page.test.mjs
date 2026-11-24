import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  assert.match(html, /<title>Inter-Rater Agreement Calculator/);
  assert.match(html, /<meta name="description" content="Free inter-rater reliability calculator: Krippendorff's alpha[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !t.includes("${"));
  assert.ok(inputs.length >= 7);
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

test("the example button loads the bundled dataset, verbatim, and the page's claims about it hold", async () => {
  const { EXAMPLE_CSV } = await import("./example-data.mjs");
  assert.equal(EXAMPLE_CSV, page("data/goemotions-sentiment.csv"));
  assert.equal(EXAMPLE_CSV.trim().split("\n").length, 1201);
  assert.match(page("index.html"), /\$\("#csv"\)\.value = EXAMPLE_CSV/);
  const source = page("data/SOURCE.md");
  for (const s of ["Apache License 2.0", "Demszky", "sentiment_mapping.json", "e30c9e0859ff4da88452ea880fdb51b8d67f30b2f866033677e06684f004c717", "2026-11-15"]) assert.ok(source.includes(s), s);
  const { analyze } = await import("./engine.mjs");
  const r = analyze({ csv: EXAMPLE_CSV, bootstrap: 0 });
  const html = page("index.html");
  assert.ok(html.includes(`alpha is ${r.coefficients[0].value.toFixed(3)}`));
  assert.equal(r.nRaters, 75);
  // "each labelled by three to five of the dataset's raters": rows per comment, blanks included.
  const perComment = {};
  for (const line of EXAMPLE_CSV.trim().split("\n").slice(1)) perComment[line.split(",")[0]] = (perComment[line.split(",")[0]] || 0) + 1;
  assert.deepEqual([Math.min(...Object.values(perComment)), Math.max(...Object.values(perComment))], [3, 5]);
  assert.equal(r.ratingsPerSubject.min, 2, "after blanks, some comments keep two usable ratings");
  const byKappa = [...r.perCategory].sort((a, b) => a.kappa - b.kappa);
  assert.equal(byKappa[0].category, "mixed");
  assert.equal(byKappa.at(-1).category, "positive");
  assert.match(html, /most on "positive" and least on "mixed"/);
});

test("page cites the papers with BibTeX and states its limits", () => {
  const html = page("index.html");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  for (const key of ["krippendorff2004content", "krippendorff2011computing", "hayes2007answering", "cohen1960coefficient", "cohen1968weighted", "fleiss1969large", "fleiss1971measuring", "gwet2008computing", "shrout1979intraclass", "mcgraw1996forming", "landis1977measurement", "koo2016guideline", "byrt1993bias", "light1971measures"]) assert.match(html, new RegExp(`@\\w+\\{${key},`));
  assert.match(html, /<strong>Agreement is not accuracy\.<\/strong>/);
  assert.match(html, /Not modelled:/);
  const ref = JSON.parse(page("eval/reference.json"));
  for (const [lib, v] of Object.entries({ krippendorff: "0.9.0", irrCAC: "0.4.4", statsmodels: "0.15.0", pingouin: "0.7.0" })) {
    assert.equal(ref.versions[lib], v);
    assert.match(html, new RegExp(`${lib} ${escapeRegExp(v)}`));
  }
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(page("usage.mjs"), /"inter-rater-agreement-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/inter-rater-agreement\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: inter-rater-agreement$/m);
  assert.match(page("llms.txt"), /Krippendorff's alpha/);
});

test("footer links the sibling research-algorithm tools", () => {
  const html = page("index.html");
  for (const s of ["changepoint-detector", "fdr-multiple-testing", "survival-analysis", "conformal-prediction-intervals", "spc-control-charts", "fuzzy-dedupe", "isolation-forest", "robust-pca", "mann-kendall-trend", "lomb-scargle-periodogram"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`), s);
});

test("links its sibling, the item response theory tool", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\.\/item-response-theory\/"/);
});

test("links its sibling, the method comparison tool", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\.\/method-comparison\/"/);
  assert.match(html, /href="\.\.\/pairwise-ranking\/"/);
});
