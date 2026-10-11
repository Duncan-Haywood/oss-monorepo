import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildSpec, solve, verifyPlan, fmt, money2, SAMPLE_FIELDS, SAMPLE_ECON } from "./calc.mjs";
import * as calc from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-price-spray-drone-application-per-acre.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not agronomic, pesticide, aviation, legal, tax or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any drone maker/);
  assert.match(html, /example prices are illustrative, not quotes/);
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
  assert.match(html, /<title>Ag Spray Drone Quote Calculator/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 25);
  for (const tag of inputs) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/);
  assert.doesNotMatch(page("calc.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(|localStorage/);
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

test("every name the inline script imports is exported by calc.mjs", () => {
  const names = page("index.html").match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  for (const name of names) assert.ok(name in calc, name);
});

test("every element the script looks up exists, and every number in the form has an input", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)[^"]*"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 10);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
  for (const k of Object.keys(SAMPLE_ECON)) assert.ok(ids.has(k), `no input for ${k}`);
  for (const id of ["fields", "analyze", "download", "optout", "load-example"]) assert.ok(ids.has(id), id);
});

test("form defaults on the page equal the starter economics", () => {
  const html = page("index.html");
  for (const [k, v] of Object.entries(SAMPLE_ECON)) {
    const m = html.match(new RegExp(`<input id="${k}"[^>]*value="([^"]*)"`));
    assert.ok(m, k);
    assert.equal(Number(m[1]), v, k);
  }
});

test("page documents the method, the limits and the safety floor", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  assert.match(html, /applying only what the label and the law allow/);
  assert.match(html, /No\. It only does arithmetic/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["quote_run", "example_loaded", "report_downloaded"]) {
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
  assert.match(page("VENTURE.yaml"), /^name: ag-spray-drone-quote-calculator$/m);
});

test("related-tool links point at ventures that exist", () => {
  for (const file of ["index.html", GUIDE]) {
    const links = [...page(file).matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
    assert.ok(links.length >= 2, file);
    for (const l of links) assert.ok(existsSync(new URL(`../${l}/index.html`, import.meta.url)), l);
  }
});

test("the starter example on the page loads and verifies end to end", () => {
  const { spec, errors } = buildSpec({ ...SAMPLE_ECON, fields: SAMPLE_FIELDS });
  assert.deepEqual(errors, []);
  const res = solve(spec);
  assert.deepEqual(verifyPlan(spec, res), []);
  assert.equal(res.rows.length, 7);
});

test("the guide carries the clauses, links both ways, and its worked table matches the solver", () => {
  const guide = page(GUIDE);
  assert.match(guide, /No warranty/);
  assert.match(guide, /not agronomic, pesticide, aviation, legal, tax or financial advice/i);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, new RegExp(`<link rel="canonical" href="\\./${GUIDE.replace(/\./g, "\\.")}">`));
  assert.match(guide, /href="\.\/"/);
  assert.match(page("index.html"), new RegExp(`href="\\./${GUIDE.replace(/\./g, "\\.")}"`));
  assert.match(page("sitemap.xml"), new RegExp(GUIDE.replace(/\./g, "\\.")));
  const ld = JSON.parse(guide.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "FAQPage");
  for (const q of ld.mainEntity) assert.ok(guide.includes(`<h3>${q.name}</h3>`), q.name);

  const { spec } = buildSpec({ ...SAMPLE_ECON, fields: "Worked example | 80 | 10" });
  const r = solve(spec), x = r.rows[0];
  const rows = [
    ["Spray-only coverage (acres per hour)", fmt(r.machine.acresPerSprayHour, 1)],
    ["Sorties (tank-limited)", String(x.sorties)],
    ["Minutes from first takeoff to last landing", fmt(x.sprayMin, 0)],
    ["Crew hours incl. setup and driving", fmt(x.crewHours, 2)],
    ["Drone wear", money2(x.droneWear)],
    ["Battery wear", money2(x.battery)],
    ["Crew labor", money2(x.labor)],
    ["Truck", money2(x.truck)],
    ["Share of yearly fixed cost", money2(x.overhead)],
    ["Total cost", money2(x.cost)],
    ["Cost per acre", money2(x.perAcreCost)],
    ["Price per acre for a 30% margin", money2(x.recommendedPerAcre)],
  ].map(([a, b]) => `<tr><td>${a}</td><td class="n">${b}</td></tr>`).join("\n");
  assert.ok(guide.includes(rows), "worked table does not match what the solver computes");
  assert.equal(x.sortieLimit, "tank size");
});

test("footer links the grain store-or-sell calculator sibling", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\.\/grain-store-or-sell-calculator\/"/);
});
