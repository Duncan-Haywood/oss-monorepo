import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const NETWORK = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/;

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not medical, legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with the authors of the cited papers/);
  assert.match(html, /CC BY 4\.0/);
  assert.match(html, /doi:10\.24432\/C56S3T/);
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
  assert.match(html, /<title>Ordinal Logistic Regression Online — proportional odds, Brant test/);
  assert.match(html, /<meta name="description" content="Free online ordinal logistic regression[^"]{80,}/);
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
  assert.doesNotMatch(html.replace('import("./example-data.mjs")', ""), NETWORK);
  for (const f of ["engine.mjs", "usage.mjs", "cli.mjs"]) assert.doesNotMatch(page(f), NETWORK, f);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(src|href)=["']https?:/);
});

test("the page imports only what the engine exports", async () => {
  const html = page("index.html");
  const engine = await import("./engine.mjs");
  const names = html.match(/import \{([^}]+)\} from "\.\/engine\.mjs"/)[1].split(",").map((s) => s.trim());
  for (const n of names) assert.ok(n in engine, n);
});

test("the numbers the page states are the engine's", async () => {
  const { analyze } = await import("./engine.mjs");
  const html = page("index.html");
  const csv = page("data/red-wine-quality.csv");
  const r = analyze({ csv });
  const alc = r.coefficients.find((c) => c.name === "alcohol");
  assert.equal(alc.oddsRatio.toFixed(1), "2.4");
  assert.match(html, /each extra percent of alcohol multiplies the odds of a higher quality score by 2\.4/);
  assert.ok(r.brant.slopes[0].byCut[1].estimate < 0.3);
  assert.match(html, /rejected at the 5% level in 6\.0% of them/);
  const ref = JSON.parse(page("eval/reference.json"));
  assert.equal(ref.brant_size.share_p_below_0_05 ?? ref.brant_size["share_p_below_0.05"], 0.06);
  assert.equal(ref.brant_size.reps, 400);
  assert.match(html, /1,599 red Vinho Verde wines/);
  assert.equal(r.n, 1599);
});

test("the example module is a verbatim copy of the data file", async () => {
  const { EXAMPLE_CSV } = await import("./example-data.mjs");
  assert.equal(EXAMPLE_CSV, page("data/red-wine-quality.csv"));
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
