import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run, parseYears, SAMPLE, step } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["index.html", "form-7203-basis-order.html", "s-corp-distributions-over-basis.html"];

test("every page carries the no-warranty clause; the app also has privacy, independence and sponsor lines", () => {
  for (const n of PAGES) assert.match(page(n), /No warranty/, n);
  const html = page("index.html");
  assert.match(html, /not legal, tax, financial or accounting advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with the IRS/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test("JSON-LD parses and every FAQ question is visible on its page", () => {
  for (const n of PAGES) {
    const html = page(n);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 3, n);
    for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
  }
  const app = JSON.parse(page("index.html").match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(app["@type"], "SoftwareApplication");
  assert.equal(app.offers.price, "0");
});

test("SEO basics", () => {
  for (const n of PAGES) {
    const html = page(n);
    assert.match(html, /<title>[^<]{20,}/, n);
    assert.match(html, /<meta name="description" content="[^"]{80,}/, n);
    assert.match(html, /<link rel="canonical" href="\.\//, n);
    assert.equal((html.match(/<h1>/g) || []).length, 1, n);
    assert.match(html, /<html lang="en">/, n);
  }
});

test("inputs are labelled and nothing is sent anywhere", () => {
  const html = page("index.html");
  for (const tag of [...html.matchAll(/<(input|textarea)\b[^>]*>/g)].map((m) => m[0])) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(id && new RegExp(`<label for="${id}"`).test(html), tag);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|import\(/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./remember.mjs", "./usage.mjs"]);
});

test("the inline script uses only names calc.mjs exports", async () => {
  const mod = await import("./calc.mjs");
  const names = page("index.html").match(/import \{ ([^}]+) \} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  for (const n of names) assert.ok(n in mod, n);
});

test("every internal link and sitemap entry points at a file that exists", () => {
  const sm = page("sitemap.xml");
  for (const n of PAGES) assert.ok(sm.includes(`./${n}`), n);
  for (const n of PAGES) for (const m of page(n).matchAll(/href="\.\/([a-z0-9-]+\.html)"/g)) assert.ok(PAGES.includes(m[1]), m[1]);
});

test("the guide's worked example is recomputed from the engine", () => {
  const html = page("form-7203-basis-order.html");
  const r = run(SAMPLE.opening, parseYears(SAMPLE.text).years);
  const money = (n) => "$" + n.toLocaleString("en-US");
  for (const s of [r.rows[0].close.suspended, r.rows[1].close.debtBasis, r.rows[2].close.stock, r.rows[2].close.debtBasis, r.rows[0].lines.lossAgainstStock]) assert.ok(html.includes(money(s)), money(s));
});

test("the distribution guide's three cases are recomputed", () => {
  const z = { year: 2024, contributions: 0, loansMade: 0, loansRepaid: 0, income: 0, taxExempt: 0, distributions: 0, nondeductible: 0, losses: 0 };
  const open = { stock: 10000, debtBasis: 0, debtFace: 0, suspended: 0, ndCarry: 0 };
  const html = page("s-corp-distributions-over-basis.html");
  const c1 = step(open, { ...z, distributions: 25000 });
  assert.equal(c1.lines.excessDistributions, 15000); assert.ok(html.includes("$15,000 is excess"));
  const c2 = step(open, { ...z, income: 20000, distributions: 25000 });
  assert.equal(c2.lines.excessDistributions, 0); assert.equal(c2.close.stock, 5000); assert.ok(html.includes("basis ends at $5,000"));
  const c3 = step(open, { ...z, distributions: 10000, losses: 5000 });
  assert.equal(c3.close.suspended, 5000); assert.ok(html.includes("$5,000 loss is suspended"));
});

test("the year-end planner is on the page and its event is disclosed", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="plan"/);
  assert.match(html, /Year-end planner/);
  assert.match(html, /<code>plan_viewed<\/code>/);
});

test("the preparer batch section is on the page and its events are disclosed", () => {
  const html = page("index.html");
  for (const id of ["batch-in", "batch-run", "batch-csv", "batch-sheet"]) assert.match(html, new RegExp(`id="${id}"`));
  for (const ev of ["batch_run", "batch_example_loaded", "batch_csv_downloaded", "batch_worksheets_downloaded"]) assert.match(html, new RegExp(`<code>${ev}</code>`));
});

test("the stock-sale outlook is on the page and its event is disclosed", () => {
  const html = page("index.html");
  assert.match(html, /id="sale"/);
  assert.match(html, /Selling your stock\?/);
  assert.match(html, /<code>sale_viewed<\/code>/);
  assert.match(html, /saleOutlook/);
});

test("the AAA section is on the page and its event is disclosed", () => {
  const html = page("index.html");
  assert.match(html, /id="aaa-card"/);
  assert.match(html, /Accumulated adjustments account/);
  assert.match(html, /<code>aaa_viewed<\/code>/);
  assert.match(html, /aaa\(last/);
});

test("K-1 box card is on the page, wired to fromK1Boxes, and its event is disclosed", () => {
  const html = page("index.html");
  assert.match(html, /id="k1-in"/);
  assert.match(html, /fromK1Boxes/);
  assert.match(html, /<code>k1_converted<\/code>/);
});
