import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Remove every tag, repeating until no tag-shaped text is left.
const stripTags = (s, sub = "") => { let p; do { p = s; s = s.replace(/<[^>]*>/g, sub); } while (s !== p); return s; };

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const NETWORK = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/;

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal or professional advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /a law, contract or programme rule may require a different outcome/);
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
  assert.match(html, /<title>Stable Matching Tool/);
  assert.match(html, /<meta name="description" content="Free stable matching tool[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 5);
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
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the examples are the data files, verbatim, and the page's worked example is the engine's", async () => {
  const { EXAMPLES } = await import("./example-data.mjs");
  assert.equal(EXAMPLES.residency.text, page("data/residency-example.txt"));
  assert.equal(EXAMPLES.cyclic.text, page("data/cyclic-3x3.txt"));
  assert.match(EXAMPLES.residency.label, /made-up/);
  assert.match(EXAMPLES.small.label, /made-up/);
  const html = page("index.html");
  for (const k of ["residency", "small", "cyclic"]) assert.match(html, new RegExp(`loadExample\\("${k}"\\)`));
  const source = page("data/SOURCE.md");
  for (const s of ["Made up", "no real preference"]) assert.ok(source.includes(s), s);
  const { analyze } = await import("./engine.mjs");
  const r = analyze({ text: EXAMPLES.cyclic.text });
  assert.equal(r.stableMatchings.count, 3);
  assert.match(html, /Load it: there are three/);
  assert.ok(r.optimalA.rankA.every((x) => x === 1) && r.optimalA.rankB.flat().every((x) => x === 3));
  assert.ok(r.stableMatchings.egalitarian.rankA.every((x) => x === 2) && r.stableMatchings.egalitarian.rankB.flat().every((x) => x === 2));
  assert.match(html, /the middle one gives everyone their second choice/);
  const res = analyze({ text: EXAMPLES.residency.text });
  assert.equal(res.stableMatchings.count, 4);
  assert.deepEqual(res.unmatched, ["Dara", "Eli", "Jun"]);
});

test("the page's verification claims match the test sizes", () => {
  const html = page("index.html");
  const tests = page("engine.test.mjs");
  const ref = JSON.parse(page("eval/reference.json"));
  assert.match(html, new RegExp(`on ${ref.cases.length} random instances`));
  assert.match(html, /<code>matching<\/code> package 1\.4\.3/);
  assert.equal(ref.tool, "matching 1.4.3");
  assert.match(tests, /t < 1000;/);
  assert.match(html, /on 1,000 small random instances/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(html, /loadExample\("residency", true\)/, "the page's first render must not count as a use");
  assert.match(page("usage.mjs"), /"stable-matching-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/stable-matching\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /Functional Source License/);
  assert.match(page("VENTURE.yaml"), /^name: stable-matching$/m);
  assert.match(page("llms.txt"), /Gale/);
});

test("the page cites every paper the engine implements, with BibTeX", async () => {
  const { PAPERS } = await import("./engine.mjs");
  const html = page("index.html");
  for (const p of PAPERS) {
    if (!p.doi) { assert.ok(html.includes(p.title), p.title); continue; }
    assert.ok(html.includes(`doi={${p.doi}}`), p.doi);
    assert.ok(html.includes(`https://doi.org/${p.doi}`), p.doi);
  }
  for (const s of ["ranked-ballot-counter", "cost-sharing-calculator"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
});
