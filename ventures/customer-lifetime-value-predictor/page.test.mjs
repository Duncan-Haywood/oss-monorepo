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
  assert.match(html, /Not affiliated with any e-commerce platform/);
});

test("JSON-LD blocks parse and describe a free application and a FAQ", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  for (const q of blocks[1].mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Customer Lifetime Value Predictor/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 5);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && html.includes(`<label for="${id}">`)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module scripts import only local files, and the inline script parses", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(page("calc.mjs"), /^\s*import\s/m);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("every name the inline script imports is exported by calc.mjs", async () => {
  const names = page("index.html").match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const calc = await import("./calc.mjs");
  for (const name of names) assert.equal(typeof calc[name], "function", name);
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 6);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("page documents the rules and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  assert.match(html, /BG\/NBD/);
  assert.match(html, /Gamma-Gamma/);
  assert.match(html, /Back-test/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["analysis_run", "example_loaded", "file_loaded", "report_downloaded"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, LICENSE and VENTURE.yaml exist", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("LICENSE"), /MIT License/);
  assert.match(page("VENTURE.yaml"), /^name: customer-lifetime-value-predictor$/m);
});

test("lifetime value guide's table is what the engine returns for the sample shop", async () => {
  const { compareForecasts, parseOrders, sampleText } = await import("./calc.mjs");
  const html = readFileSync(new URL("./predict-customer-lifetime-value-from-orders.html", import.meta.url), "utf8");
  const r = compareForecasts(parseOrders(sampleText()).orders, 26);
  assert.equal(r.customers, 1064);
  assert.equal(r.actual, 578);
  const m = r.methods;
  assert.equal(Math.round(m.model.predicted), 608);
  assert.equal(Math.round(m.ownRate.predicted), 973);
  assert.equal(Math.round(m.shopAverage.predicted), 879);
  assert.equal(Math.round(m.model.errorPct * 100), 5);
  assert.equal(Math.round(m.ownRate.errorPct * 100), 68);
  assert.equal(Math.round(m.shopAverage.errorPct * 100), 52);
  assert.equal(m.model.meanAbsError.toFixed(2), "0.60");
  assert.equal(m.ownRate.meanAbsError.toFixed(2), "0.85");
  assert.equal(m.shopAverage.meanAbsError.toFixed(2), "0.99");
  assert.equal(Math.round(m.model.topDecileShare * 100), 48);
  assert.equal(Math.round(m.ownRate.topDecileShare * 100), 42);
  assert.equal(Math.round(m.shopAverage.topDecileShare * 100), 13);
  assert.ok(m.model.meanAbsError < m.ownRate.meanAbsError && m.model.meanAbsError < m.shopAverage.meanAbsError);
  for (const s of ["608", "973", "879", "+5%", "+68%", "+52%", "overshoots by 68%"]) assert.ok(html.includes(s), s);
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /predict-customer-lifetime-value-from-orders\.html/);
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /predict-customer-lifetime-value-from-orders\.html/);
  assert.ok(html.includes("No warranty"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
});

test("guide's lapsed-regulars sentence matches the engine", async () => {
  const c = await import("./calc.mjs");
  const orders = c.parseOrders(c.sampleText()).orders;
  const calEnd = Math.max(...orders.map((o) => o.day)) - 26 * 7;
  const cal = c.summarize(orders, calEnd), p = c.fitBgnbd(cal);
  const actual = new Map();
  for (const o of orders) if (o.day > calEnd) (actual.get(o.id) ?? actual.set(o.id, new Set()).get(o.id)).add(o.day);
  const g = cal.filter((r) => r.x >= 3 && c.probAlive(p, r.x, r.tx, r.T) < 0.2);
  assert.equal(g.length, 26);
  assert.equal(Math.round(g.reduce((s, r) => s + c.expectedPurchases(p, r.x, r.tx, r.T, 26), 0)), 3);
  assert.equal(g.reduce((s, r) => s + (actual.get(r.id)?.size ?? 0), 0), 5);
  assert.equal(Math.round(g.reduce((s, r) => s + (r.x / r.T) * 26, 0)), 85);
});
