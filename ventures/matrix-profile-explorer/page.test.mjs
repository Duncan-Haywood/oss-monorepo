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
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with NOAA/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 5);
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), `answer for ${q.name} differs from the page`);
  }
});

test("SEO basics, in a searcher's words", () => {
  const html = page("index.html");
  assert.match(html, /<title>Matrix Profile Online/);
  const desc = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(desc.length >= 80 && desc.length <= 300, desc.length);
  assert.match(desc, /time series anomaly detection/);
  assert.match(html, /find repeated patterns/i);
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
    assert.ok(/aria-label=/.test(tag) || (id && html.includes(`for="${id}"`)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, NETWORK);
  for (const f of ["engine.mjs", "example-data.mjs", "usage.mjs", "worker.mjs"]) assert.doesNotMatch(page(f), NETWORK, f);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module script imports only local files, and the inline script parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./engine.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:[^>]+stylesheet/);
  for (const f of ["engine.mjs", "worker.mjs"]) {
    for (const m of page(f).matchAll(/^\s*import .* from "([^"]+)"/gm)) assert.match(m[1], /^\.\/[\w-]+\.mjs$/, `${f} imports ${m[1]}`);
  }
  assert.doesNotMatch(page("example-data.mjs"), /^\s*import\s/m);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("every name the inline script imports is exported by engine.mjs, and the worker calls analyze", async () => {
  const names = page("index.html").match(/import \{([^}]+)\} from "\.\/engine\.mjs"/)[1].split(",").map((s) => s.trim());
  const engine = await import("./engine.mjs");
  for (const name of names) assert.ok(name in engine, name);
  assert.match(page("worker.mjs"), /import \{ analyze \} from "\.\/engine\.mjs"/);
  assert.match(page("index.html"), /new Worker\("\.\/worker\.mjs", \{ type: "module" \}\)/);
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)(?:[ "])|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 10);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("method, citation, limits and data source are on the page", () => {
  const html = page("index.html");
  assert.match(html, /<h2>Method and citation<\/h2>/);
  assert.match(html, /@inproceedings\{yeh2016matrixprofile1/);
  assert.match(html, /@inproceedings\{zhu2016matrixprofile2/);
  assert.match(html, /doi\s*=\s*\{10\.1109\/ICDM\.2016\.0179\}/);
  assert.match(html, /doi\s*=\s*\{10\.1109\/ICDM\.2016\.0085\}/);
  assert.match(html, /cs\.ucr\.edu\/~eamonn\/MatrixProfile\.html/);
  assert.match(html, /&lceil;m\/4&rceil;/);
  assert.match(html, /<h2>Limits<\/h2>/);
  assert.match(html, /Shape, not level/);
  assert.match(html, /The window matters/);
  assert.match(html, /O\(n&sup2;\) time/);
  assert.match(html, /Flat windows/);
  assert.match(html, /Xin Lan, NOAA\/GML/);
  assert.match(html, /Ralph Keeling/);
  assert.match(html, /Retrieved 2026-10-20/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  const named = [...html.matchAll(/<code>(\w+_\w+)<\/code>/g)].map((m) => m[1]);
  const recorded = [...html.matchAll(/record\("(\w+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(named)].sort(), [...new Set(recorded)].sort());
  for (const e of ["analysis_run", "example_loaded", "file_loaded", "report_downloaded"]) assert.ok(recorded.includes(e), e);
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, LICENSE, VENTURE.yaml and data source exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("README.md"), /## Verification/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: matrix-profile-explorer$/m);
  assert.match(page("VENTURE.yaml"), /production: https:\/\/duncan-haywood\.github\.io\/(?:oss-monorepo|monorepo-projects)\/matrix-profile-explorer\//);
  const src = page("data/SOURCE.md");
  assert.match(src, /https:\/\/gml\.noaa\.gov\/webdata\/ccgg\/trends\/co2\/co2_mm_mlo\.csv/);
  assert.match(src, /2026-10-20/);
  assert.match(src, /public domain/i);
});

test("footer links the sibling research-algorithm tools", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\.\/changepoint-detector\/"/);
  assert.match(html, /href="\.\.\/conformal-prediction-intervals\/"/);
});
