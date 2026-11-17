import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const NETWORK = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/;

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /not medical or policy advice/);
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
  assert.doesNotMatch(html, /AggregateRating|"Review"/);
});

test("SEO basics, in a searcher's words", () => {
  const html = page("index.html");
  assert.match(html, /<title>Synthetic Control Method Online: Did My Intervention Work\?/);
  assert.match(html, /<meta name="description" content="Free synthetic control calculator[^"]{80,}/);
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
    assert.ok(/aria-label=/.test(tag) || (id && html.includes(`<label for="${id}">`)), `unlabelled: ${tag}`);
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
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the example button loads the bundled dataset, verbatim, with the paper's specification", async () => {
  const { EXAMPLE_CSV, EXAMPLE_SPEC } = await import("./example-data.mjs");
  assert.equal(EXAMPLE_CSV, page("data/germany.csv"));
  assert.equal(EXAMPLE_CSV.trim().split("\n").length, 17 * 44 + 1);
  assert.equal(EXAMPLE_SPEC.treated, "West Germany");
  assert.equal(EXAMPLE_SPEC.treatmentTime, 1990);
  assert.match(page("index.html"), /\$\("#csv"\)\.value = EXAMPLE_CSV/);
  const source = page("data/SOURCE.md");
  assert.match(source, /Abadie, Alexis Diamond and Jens Hainmueller/);
  assert.match(source, /pysyncon/);
  assert.match(source, /2026-11-12/);
  assert.match(source, /c59ff635faaf43729eaefdf5e9a4584fc3112a56fdab84b9ac5f78e1b6302e83/);
});

test("page cites the papers with BibTeX and states its limits", () => {
  const html = page("index.html");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  for (const key of ["abadie2003economic", "abadie2010synthetic", "abadie2015comparative", "abadie2021using", "nelder1965simplex"]) assert.match(html, new RegExp(`@\\w+\\{${key},`));
  assert.match(html, /<strong>One treated unit\.<\/strong>/);
  assert.match(html, /<strong>Convex hull\.<\/strong>/);
  assert.match(html, /Not modelled:/);
  assert.match(html, /pysyncon 1\.7\.0/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(page("usage.mjs"), /"synthetic-control-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/synthetic-control\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: synthetic-control$/m);
  assert.match(page("llms.txt"), /synthetic control/i);
});

test("footer links the sibling research-algorithm tools", () => {
  const html = page("index.html");
  for (const s of ["changepoint-detector", "conformal-prediction-intervals", "matrix-profile-explorer", "survival-analysis", "fdr-multiple-testing"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
});
