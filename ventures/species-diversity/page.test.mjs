import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "./engine.mjs";

// Remove every tag, repeating until no tag-shaped text is left.
const stripTags = (s, sub = "") => { let p; do { p = s; s = s.replace(/<[^>]*>/g, sub); } while (s !== p); return s; };

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const NETWORK = /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/;

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /not environmental-impact, regulatory/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with the authors of the cited papers or of iNEXT/);
});

test("JSON-LD blocks parse and the FAQ matches the page", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
  const text = stripTags(html).replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  for (const q of blocks[1].mainEntity) {
    assert.ok(text.includes(q.name), q.name);
    assert.ok(text.includes(q.acceptedAnswer.text), `answer to "${q.name}" is not shown on the page`);
  }
  assert.doesNotMatch(html, /AggregateRating|"Review"/);
});

test("SEO basics, in a searcher's words", () => {
  const html = page("index.html");
  assert.match(html, /<title>Species Richness &amp; Diversity Calculator: Rarefaction, Extrapolation, Chao1/);
  assert.match(html, /<meta name="description" content="Free species richness and diversity calculator[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 9);
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
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 20);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
  for (const q of [0, 1, 2]) assert.match(html, new RegExp(`data-q="${q}"`));
});

test("the example buttons load the bundled data, verbatim", async () => {
  const { PORTAL_CSV } = await import("./example-data.mjs");
  assert.equal(PORTAL_CSV, page("data/portal-rodents.csv"));
  assert.equal(PORTAL_CSV.trim().split("\n").length, 306);
  assert.match(page("data/SOURCE.md"), /weecology\/PortalData/);
  assert.match(page("data/SOURCE.md"), /CC0/);
  assert.match(page("data/SOURCE.md"), /build-example\.py/);
});

test("page cites the papers with BibTeX and states its limits", () => {
  const html = page("index.html");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  for (const key of ["hill1973diversity", "chao2014rarefaction", "chao2012coverage", "chao1984nonparametric", "chao1987unequal", "chao1992ace", "chao2013entropy", "good1953population", "hurlbert1971nonconcept", "hsieh2016inext", "portaldata"]) assert.match(html, new RegExp(`@\\w+\\{${key},`));
  assert.match(html, /<strong>Random, independent individuals\.<\/strong>/);
  assert.match(html, /scipy 1\.17\.1/);
  const cov = page("eval/coverage-output.txt");
  for (const s of [",200,richness,120.00,82.59,0.495", ",400,richness,40.00,40.26,0.547", ",100,richness,40.00,40.21,0.926", "S(n/2),41.28,41.26,0.919", "S(n/2),38.13,38.14,0.977", "S(2n),72.37,71.14,0.874", "S(2n),39.98,40.08,0.987", "exp(H),45.56,44.32,0.854", "exp(H),34.71,34.78,0.959"]) assert.ok(cov.includes(s), s);
});

test("the page's example numbers are the engine's", () => {
  const html = page("index.html");
  const portal = page("data/portal-rodents.csv");
  const t = analyze({ text: portal, group: "treatment", count: "individuals" });
  const row = (name) => t.comparison.coverage.rows.find((r) => r.name === name).values[2];
  const f2 = (x) => x.toFixed(2);
  const c = row("Unmanipulated control"), k = row("Kangaroo rats removed");
  assert.ok(html.includes(`${f2(c.qD)} effective species on the controls (95% interval ${f2(c.lower)} to ${f2(c.upper)})`));
  assert.ok(html.includes(`${f2(k.qD)} where kangaroo rats are kept out (${f2(k.lower)} to ${f2(k.upper)})`));
  assert.ok(html.includes(`common coverage of ${(100 * t.comparison.coverage.level).toFixed(2)}%`));
  const kr = t.groups.find((g) => g.name === "Kangaroo rats removed");
  assert.ok(html.includes(`is ${kr.species[0].count.toLocaleString("en-US")} of the ${kr.n.toLocaleString("en-US")} animals`));
  const p = analyze({ text: portal, group: "plot", count: "individuals" });
  const at = p.comparison.coverage.rows.map((r) => ({ name: r.name, v: r.values[0] })).sort((a, b) => b.v.qD - a.v.qD);
  const i10 = at.findIndex((x) => x.name === "10");
  assert.ok(html.includes(`common coverage of ${(100 * p.comparison.coverage.level).toFixed(1)}%, it is ninth of 24, with ${at[i10].v.qD.toFixed(1)} species and a wide interval (${at[i10].v.lower.toFixed(1)} to ${at[i10].v.upper.toFixed(1)})`));
  assert.equal(i10, 8);
  const g4 = p.groups.find((g) => g.name === "4");
  assert.ok(html.includes(`Chao1 says ${g4.chao1.estimate.toFixed(1)}`));
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
  assert.match(page("usage.mjs"), /"species-diversity-usage"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and llms.txt exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /https:\/\/marisstella\.app\/species-diversity\//);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /Functional Source License/);
  assert.match(page("VENTURE.yaml"), /^name: species-diversity$/m);
  assert.match(page("llms.txt"), /species-diversity/i);
});

test("footer links sibling estimation tools", () => {
  const html = page("index.html");
  for (const s of ["capture-recapture", "spatial-autocorrelation", "meta-analysis", "inter-rater-agreement"]) assert.match(html, new RegExp(`href="\\.\\./${s}/"`));
});
