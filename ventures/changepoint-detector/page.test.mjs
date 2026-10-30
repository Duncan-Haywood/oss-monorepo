import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /not affiliated with or endorsed by the papers' authors/);
});

test("JSON-LD blocks parse, cite both papers, and every FAQ is visible", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[0].citation.length, 2);
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
  for (const q of blocks[1].mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Changepoint Detector/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 6);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && html.includes(`<label for="${id}">`)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  for (const f of ["engine.mjs", "example-data.mjs", "usage.mjs"]) assert.doesNotMatch(page(f), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module script imports only local files and parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./engine.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("every name the page imports from engine.mjs is exported", async () => {
  const names = page("index.html").match(/import \{([^}]+)\} from "\.\/engine\.mjs"/)[1].split(",").map((s) => s.trim());
  const engine = await import("./engine.mjs");
  for (const name of names) assert.notEqual(engine[name], undefined, name);
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 10);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("page states the method, the limits, the citation and the data source", () => {
  const html = page("index.html");
  assert.match(html, /<strong>Limits\.<\/strong>/);
  assert.match(html, /@article\{adams2007bayesian/);
  assert.match(html, /@article\{killick2012optimal/);
  assert.match(html, /Cobb \(1978/);
  assert.match(html, /public domain/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "file_opened", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and data source exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: changepoint-detector$/m);
  assert.match(page("data/SOURCE.md"), /public domain/i);
});

test("footer links the sibling research-algorithm tools", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/conformal-prediction-intervals\/"/);
  assert.match(html, /href="\.\.\/matrix-profile-explorer\/"/);
});

test("the trend box offers one bend and several, and passes the choice to the engine", () => {
  const html = page("index.html");
  assert.match(html, /<select id="trend">[^]*?<option value="bend">[^]*?<option value="bends">/);
  assert.match(html, /trend: \$\("#trend"\)\.value === "1" \? true : \$\("#trend"\)\.value \|\| false/);
});

test("the page has a switch for scoring every pair of knots and passes it to the engine", () => {
  const html = page("index.html");
  assert.match(html, /<input id="jointKnots" type="checkbox">/);
  assert.match(html, /jointKnots: \$\("#jointKnots"\)\.checked/);
  assert.match(html, /<select id="knotMargin">/);
  assert.match(html, /knotMargin: Number\(\$\("#knotMargin"\)\.value\)/);
});

test("the counts box offers the negative-binomial cost and passes 'nb' to the engine", () => {
  const html = page("index.html");
  assert.match(html, /<select id="overdispersion">[^]*?<option value="1">[^]*?<option value="nb">/);
  assert.match(html, /overdispersion: \$\("#overdispersion"\)\.value === "nb" \? "nb" : \$\("#overdispersion"\)\.value === "1"/);
});

test("page offers known holidays for counts", () => {
  const html = page("index.html");
  assert.match(html, /<input id="holidays" type="text"/);
  assert.match(html, /holidays: \$\("#holidays"\)\.value\.split\(","\)/);
});

test("page offers the burst rule for counts", () => {
  const html = page("index.html");
  assert.match(html, /<input id="bursts" type="checkbox"/);
  assert.match(html, /bursts: \$\("#bursts"\)\.checked/);
});

test("the page offers the Laplace cost for the volatility model and passes it to analyze", () => {
  const html = page("index.html");
  assert.match(html, /<input id="robust" type="checkbox">/);
  assert.match(html, /robust: \$\("#model"\)\.value === "meanvar" && \$\("#robust"\)\.checked/);
});

test('the page has a "take logs first" checkbox wired into analyze (--log in the CLI)', () => {
  const html = page("index.html");
  assert.match(html, /<input id="log" type="checkbox"/);
  assert.match(html, /log: \$\("#log"\)\.checked/);
});

test("index page shows the engine's cycle, drift and range warnings", () => {
  const html = page("index.html");
  assert.match(html, /id="warnings"/);
  for (const k of ["cycleWarning", "driftWarning", "rangeWarning"]) assert.ok(html.includes(`r.${k}`), k);
});
