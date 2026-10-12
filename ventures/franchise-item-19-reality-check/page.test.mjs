import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-read-franchise-item-19-earnings-claims.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not financial, legal or investment advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any franchisor/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /may be wrong, incomplete or out of date/);
});

test("JSON-LD blocks parse and every FAQ question is on the page", () => {
  for (const name of ["index.html", GUIDE]) {
    const html = page(name);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, name);
    for (const q of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
      assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
    }
  }
  const app = JSON.parse(page("index.html").match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Franchise Item 19 Reality Check/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /item 19/i);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 10);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label[^>]*for="${id}"`).test(html)), `unlabelled: ${tag}`);
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
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
});

test("every name the inline script imports is exported by calc.mjs", async () => {
  const names = page("index.html").match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const calc = await import("./calc.mjs");
  for (const name of names) assert.ok(name in calc, name);
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 12);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["check_run", "example_loaded", "csv_downloaded", "text_shared"]) {
    assert.match(html, new RegExp(`record\\("${e}"\\)`));
    assert.match(html, new RegExp(`<code>${e}</code>`));
  }
  assert.match(html, /never with any of your data/);
  assert.match(html, /id="optout"/);
});

test("robots, sitemap, README, LICENSE and VENTURE.yaml exist and carry the screening notes", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), new RegExp(GUIDE));
  assert.match(page("README.md"), /No warranty/);
  assert.match(page("LICENSE"), /MIT License/);
  const y = page(("VENTURE.yaml"));
  assert.match(y, /^name: franchise-item-19-reality-check$/m);
  assert.match(y, /duplicate_check\.py/);
  assert.match(y, /No payments, no accounts/);
  assert.match(page("index.html"), new RegExp(`href="\\./${GUIDE}"`));
});

test("the page's built-in example gives the figures the guide prints", async () => {
  const { EXAMPLE_TIERS } = await import("./calc.mjs");
  const costs = { royaltyPct: 6, adFundPct: 2, cogsPct: 30, variableLaborPct: 0, otherVariablePct: 3, fixedPerYear: 180000, investment: 350000, ownerSalary: 70000, systemUnits: 0, nonReportingPct: 60 };
  const r = analyze({ text: EXAMPLE_TIERS, costs });
  assert.deepEqual(r.errors, []);
  assert.equal(r.average, 960000);
  assert.equal(r.median, 810000);
  assert.equal(r.belowAvgPct, 50);
  assert.equal(Math.round(r.atMedian.ownerEarnings), 297900);
  assert.equal(Math.round(r.atLowest.ownerEarnings), 150400);
  assert.equal(r.atMedian.paybackYears.toFixed(1), "1.2");
  assert.equal(r.atLowest.paybackYears.toFixed(1), "2.3");
  const guide = page(GUIDE);
  for (const s of ["960,000", "810,000", "297,900", "150,400", "1.2 years", "2.3 years"]) assert.ok(guide.includes(s), s);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, /<link rel="canonical" href="\.\/how-to-read-franchise-item-19-earnings-claims\.html">/);
  assert.ok(page("index.html").includes(`EXAMPLE_TIERS`));
});
