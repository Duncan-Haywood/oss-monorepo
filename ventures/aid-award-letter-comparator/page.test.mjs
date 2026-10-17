import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import * as calc from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-compare-financial-aid-offers.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not financial, tax, legal or educational advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any college/);
  assert.match(html, /made up/);
});

test("JSON-LD blocks parse and every FAQ question is visible on the page", () => {
  for (const name of ["index.html", GUIDE]) {
    const html = page(name);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq && faq.mainEntity.length >= 4, name);
    if (name === "index.html") {
      assert.equal(blocks[0]["@type"], "SoftwareApplication");
      assert.equal(blocks[0].offers.price, "0");
      for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    } else {
      for (const q of faq.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    }
  }
});

test("SEO basics", () => {
  const html = page("index.html");
  assert.match(html, /<title>Financial Aid Award Letter Comparator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 10);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    const wrapped = new RegExp(`<label[^>]*><input[^>]*id="${id}"`).test(html);
    assert.ok(/aria-label=/.test(tag) || (id && (new RegExp(`<label for="${id}"`).test(html) || wrapped)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(|localStorage/);
  assert.doesNotMatch(page("usage.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(html, /<form[^>]+action=/i);
});

test("the module scripts import only local files and every imported name exists", () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./calc.mjs", "./usage.mjs"]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.doesNotMatch(page("calc.mjs"), /^\s*import\s/m);
  const names = html.match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  for (const n of names) assert.ok(n in calc, `calc.mjs does not export ${n}`);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*$/gm, "");
  assert.doesNotThrow(() => new Function(src.replace(/\bawait\b/g, "")));
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of src.matchAll(/\$\("#([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), `#${m[1]}`);
  const fields = src.match(/const FIELDS = \[([^\]]+)\]/)[1].match(/"(\w+)"/g).map((s) => s.slice(1, -1));
  for (const f of fields) assert.ok(ids.has(f), `field ${f}`);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  const recorded = [...html.matchAll(/record\("(\w+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual([...new Set(recorded)], ["compare_run", "example_loaded", "report_downloaded"]);
  for (const e of recorded) assert.ok(html.includes(`<code>${e}</code>`), e);
});

test("robots, sitemap, README, LICENSE and VENTURE.yaml exist and the guide is linked both ways", () => {
  for (const f of ["robots.txt", "sitemap.xml", "README.md", "LICENSE", "VENTURE.yaml", GUIDE]) assert.ok(existsSync(new URL(`./${f}`, import.meta.url)), f);
  assert.match(page("sitemap.xml"), new RegExp(GUIDE));
  assert.match(page("index.html"), new RegExp(`href="\\./${GUIDE}"`));
  assert.match(page(GUIDE), /href="\.\/index\.html"/);
  assert.match(page("README.md"), /No warranty/);
});

test("related-tool links point at ventures that exist", () => {
  for (const [, slug] of page("index.html").matchAll(/href="\.\.\/([\w-]+)\/"/g)) {
    assert.ok(existsSync(new URL(`../${slug}/VENTURE.yaml`, import.meta.url)), slug);
  }
});

test("the guide carries the clauses and its worked example matches the calculator", () => {
  const html = page(GUIDE);
  assert.match(html, /No warranty/);
  assert.match(html, /Not affiliated with any college/);
  const { colleges } = calc.parseColleges(calc.SAMPLE);
  const out = calc.compareColleges(colleges, {});
  for (const r of out) {
    for (const v of [r.sticker, r.year1Net, r.laterNet, r.borrowed, r.totalCost]) assert.ok(html.includes(calc.money(v)), `${r.name}: ${calc.money(v)}`);
  }
  const [state, regional, priv] = out;
  assert.equal(state.name, "State University (in state)");
  assert.ok(html.includes(calc.money(priv.totalCost - regional.totalCost)), "gap vs Regional");
  assert.ok(html.includes(calc.money(priv.matchGrant)), "grant to match");
  assert.equal(regional.year1Net, priv.year1Net);
});
