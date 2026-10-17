import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseGenes, parseAnimal, cross, pct, buildSpec, solve, verifyPlan, SAMPLE_GENES, SAMPLE_FEMALES, SAMPLE_MALES, SAMPLE_PRICES, SAMPLE_ECON } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-work-out-ball-python-morph-odds.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not veterinary, animal husbandry, legal, tax or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any morph marketplace/);
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
  assert.match(html, /<title>Ball Python Morph Pairing Planner/);
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

test("every name the inline script imports is exported by calc.mjs", async () => {
  const names = page("index.html").match(/import \{([^}]+)\} from "\.\/calc\.mjs"/)[1].split(",").map((s) => s.trim());
  const calc = await import("./calc.mjs");
  for (const name of names) assert.ok(name in calc, name);
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)[^"]*"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 15);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
  for (const id of ["genes", "females", "males", "prices", "defprice", "eggs", "hatch", "raise", "fee", "overhead", "target", "rank", "pick", "analyze", "download", "optout"]) assert.ok(ids.has(id), id);
});

test("page documents the method, the limits and the safety floor", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  assert.match(html, /allelic|same site/);
  assert.match(html, /may be wrong or out of date/);
  assert.match(html, /verifying each gene/);
  assert.match(html, /probabilities, not what a clutch will contain/);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["plan_run", "example_loaded", "report_downloaded"]) {
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
  assert.match(page("VENTURE.yaml"), /^name: ball-python-morph-pairing-planner$/m);
});

test("related-tool links point at ventures that exist", () => {
  for (const file of ["index.html", GUIDE]) {
    const links = [...page(file).matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
    assert.ok(links.length >= 2, file);
    for (const l of links) assert.ok(existsSync(new URL(`../${l}/index.html`, import.meta.url)), l);
  }
});

test("the starter example on the page loads and verifies end to end", () => {
  const { spec, errors } = buildSpec({ genes: SAMPLE_GENES, females: SAMPLE_FEMALES, males: SAMPLE_MALES, prices: SAMPLE_PRICES, target: "Pastel, Clown", defaultPrice: 75, ...SAMPLE_ECON });
  assert.deepEqual(errors, []);
  const res = solve(spec);
  assert.deepEqual(verifyPlan(spec, res), []);
  assert.equal(res.ranked.length, 9);
});

test("the guide carries the clauses, links both ways, and its worked table matches the solver", () => {
  const guide = page(GUIDE);
  assert.match(guide, /No warranty/);
  assert.match(guide, /not veterinary, animal husbandry, legal, tax or financial advice/i);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, new RegExp(`<link rel="canonical" href="\\./${GUIDE.replace(/\./g, "\\.")}">`));
  assert.match(guide, /href="\.\/"/);
  assert.match(page("index.html"), new RegExp(`href="\\./${GUIDE.replace(/\./g, "\\.")}"`));
  assert.match(page("sitemap.xml"), new RegExp(GUIDE.replace(/\./g, "\\.")));
  const ld = JSON.parse(guide.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "FAQPage");
  for (const q of ld.mainEntity) assert.ok(guide.includes(`<h3>${q.name}</h3>`), q.name);

  const G = parseGenes(SAMPLE_GENES);
  const an = (t) => ({ name: "x", state: parseAnimal(t, G.lookup).state });
  const CROSSES = [["het Albino", "het Albino"], ["Albino", "het Albino"], ["Pastel", "Pastel"], ["Spider", "Spider"], ["Clown", "66% het Clown"], ["Pastel, het Albino", "Pastel, het Albino"]];
  let rows = "";
  for (const [a, b] of CROSSES) {
    const x = cross(an(a), an(b), G.genes);
    x.outcomes.forEach((o, i) => {
      rows += `<tr><td>${i === 0 ? `${a} × ${b}` : ""}</td><td>${[o.vis.join(" ") || "Normal", ...o.het].join(", ").replace(/^Normal, /, "")}</td><td class="n">${pct(o.p, 2)}</td></tr>\n`;
    });
    if (x.dead > 0) rows += `<tr><td></td><td>double copy, does not hatch</td><td class="n">${pct(x.dead, 2)}</td></tr>\n`;
  }
  assert.ok(guide.includes(rows.trim()), "worked table does not match what the solver computes");
});
