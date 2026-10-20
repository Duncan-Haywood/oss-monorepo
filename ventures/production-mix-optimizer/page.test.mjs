import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseResources, parseProducts, analyze } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any bakery supplier/);
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
  assert.match(html, /<title>Weekly Production Mix Optimizer/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 3);
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
  assert.ok(used.length > 4);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("page documents the rules and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  assert.match(html, /Model:/);
  assert.match(html, /two-phase simplex/);
  assert.match(html, /One more unit is worth:/);
  assert.match(html, /Rules of thumb:/);
  assert.match(html, /setup or changeover time/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["plan_run", "example_loaded", "report_downloaded", "plan_run_new_week"]) {
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
  assert.match(page("VENTURE.yaml"), /^name: production-mix-optimizer$/m);
});

test("related-tool links point at ventures that exist", () => {
  const html = page("index.html");
  for (const m of html.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) {
    assert.ok(existsSync(new URL(`../${m[1]}/index.html`, import.meta.url)), m[1]);
  }
});

test("the guide page carries the clauses, links both ways, and its worked example matches the optimizer", () => {
  const name = "why-your-best-margin-product-may-not-be-your-best-product.html";
  const guide = page(name);
  assert.match(guide, /No warranty/);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(guide.includes(`<link rel="canonical" href="./${name}">`));
  assert.match(guide, /href="\.\/"/);
  assert.ok(page("index.html").includes(`href="./${name}"`));
  assert.ok(page("sitemap.xml").includes(name));
  const ld = JSON.parse(guide.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(guide.includes(`<h3>${q.name}</h3>`), q.name);
  for (const m of guide.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) assert.ok(existsSync(new URL(`../${m[1]}/index.html`, import.meta.url)), m[1]);

  const R = parseResources("Oven hours, 40").rows;
  const P = parseProducts("Custom cake, 50, 10, 0, 10, 1, 4\nBun, 5, 1, 0, 1000, 1, 0.2", 1).rows;
  const r = analyze(P, R, {});
  const [cake, bun] = r.plan.lines;
  assert.equal(r.plan.profit, 800);
  assert.equal(bun.units, 200);
  assert.equal(cake.units, 0);
  assert.equal(r.rules.byMargin.profit, 400);
  assert.ok(Math.abs(r.plan.resources[0].shadow - 20) < 1e-3);
  assert.ok(Math.abs(r.plan.resources[0].shadowRange - 160) < 1e-2);
  assert.ok(Math.abs(cake.oppCost - 80) < 1e-3 && Math.abs(cake.netUnit + 40) < 1e-3);
  for (const t of ["$400", "$800", "$20", "$80", "&minus;$40", "10 cakes", "1,000"]) assert.ok(guide.includes(t), t);
  assert.ok(guide.includes("another 160 hours"));
  assert.ok(guide.includes("Two hundred buns"));
});

test("the menu mix analyzer links here, so the two food-side tools are one hop apart", () => {
  const other = readFileSync(new URL("../restaurant-pos-menu-mix-analyzer/index.html", import.meta.url), "utf8");
  assert.match(other, /href="\.\.\/production-mix-optimizer\/"/);
  assert.match(page("index.html"), /href="\.\.\/restaurant-pos-menu-mix-analyzer\/"/);
});

test("links to the cheapest meal plan optimizer, a sibling solving the same kind of linear program", () => {
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\.\/cheap-meal-plan-optimizer\/"/);
  assert.ok(existsSync(new URL("../cheap-meal-plan-optimizer/index.html", import.meta.url)));
});
