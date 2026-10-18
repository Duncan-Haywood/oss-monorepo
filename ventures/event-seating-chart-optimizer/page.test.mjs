import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseGuests, parseRules, sampleSpec, optimize, verifyPlan, validateSpec, baselinePlan, weightMatrix, describe } from "./calc.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const GUIDE = "how-to-make-a-wedding-seating-chart.html";

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial or event-planning advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /never uploaded/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Not affiliated with any venue/);
  assert.match(html, /no price is stated or implied/);
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
  assert.match(html, /<title>Event Seating Chart Optimizer/);
  assert.match(html, /<meta name="description" content="[^"]{80,}/);
  assert.match(html, /<link rel="canonical" href="\.\/index\.html">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<h1>/);
  assert.match(html, /<html lang="en">/);
});

test("every static input has a label and nothing is sent anywhere", () => {
  const html = page("index.html");
  const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 5);
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
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)|getElementById\("([\w-]+)"\)/g)].map((m) => m[1] || m[2]);
  assert.ok(used.length > 15);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
  for (const id of ["guests", "rules", "seats", "tcount", "balance", "analyze", "download", "optout"]) assert.ok(ids.has(id), id);
});

test("page documents the rules and what it leaves out", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /Unverified/);
  assert.match(html, /simulated annealing/);
  assert.match(html, /Table capacity and pinned tables are never broken/);
  for (const op of ["A + B", "A ++ B", "A ! B", "A !! B", "A @ 3"]) assert.ok(html.includes(`<code>${op}</code>`), op);
});

test("usage events named on the page are the ones the code records", () => {
  const html = page("index.html");
  for (const e of ["plan_run", "example_loaded", "report_downloaded", "reseat_run", "signs_printed", "board_printed", "cards_printed", "caterer_printed", "guest_sheet_imported"]) {
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
  assert.match(page("VENTURE.yaml"), /^name: event-seating-chart-optimizer$/m);
});

test("related-tool links point at ventures that exist", () => {
  for (const file of ["index.html", GUIDE]) {
    const links = [...page(file).matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)].map((m) => m[1]);
    assert.ok(links.length >= 2, file);
    for (const l of links) assert.ok(existsSync(new URL(`../${l}/index.html`, import.meta.url)), l);
  }
});

test("the guide carries the clauses, links both ways, and its worked example matches the optimizer", () => {
  const guide = page(GUIDE);
  assert.match(guide, /No warranty/);
  assert.match(guide, /not a guarantee that any guest will be content/i);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, new RegExp(`<link rel="canonical" href="\\./${GUIDE.replace(".", "\\.")}">`));
  assert.match(guide, /href="\.\/"/);
  assert.match(page("index.html"), new RegExp(`href="\\./${GUIDE.replace(".", "\\.")}"`));
  assert.match(page("sitemap.xml"), new RegExp(GUIDE.replace(".", "\\.")));
  const ld = JSON.parse(guide.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld["@type"], "FAQPage");
  for (const q of ld.mainEntity) assert.ok(guide.includes(`<h3>${q.name}</h3>`), q.name);

  const spec = sampleSpec();
  assert.deepEqual(validateSpec(spec), []);
  assert.equal(spec.guests.length, 24);
  assert.equal(spec.tableCount, 3);
  const res = optimize(spec);
  assert.deepEqual(verifyPlan(spec, res), []);
  const base = baselinePlan(spec);
  const baseRes = describe(spec, weightMatrix(spec), base, base);
  const row = (label, rulesMet, total, splits, score) => `<tr><td>${label}</td><td class="n">${rulesMet} of ${total}</td><td class="n">${splits}</td><td class="n">${score}</td></tr>`;
  assert.ok(guide.includes(row("In the order typed", baseRes.rulesMet, baseRes.rulesTotal, baseRes.partySplits.length, baseRes.score)), "list-order row");
  assert.ok(guide.includes(row("Optimized", res.rulesMet, res.rulesTotal, res.partySplits.length, res.score)), "optimized row");
  assert.equal(res.rulesTotal, 8);
  assert.deepEqual(res.tables.map((t) => t.size), [8, 8, 8]);
});

test("the divorced-parents guide is linked, carries the clauses, and its worked example matches the optimizer", () => {
  const name = "how-to-seat-divorced-parents-at-a-wedding.html";
  const guide = page(name);
  assert.match(guide, /No warranty/);
  assert.match(guide, /not a guarantee that any guest will be content/i);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(guide, new RegExp(`<link rel="canonical" href="\\./${name.replace(".", "\\.")}">`));
  assert.match(page("index.html"), new RegExp(`href="\\./${name.replace(".", "\\.")}"`));
  assert.match(page("sitemap.xml"), new RegExp(name.replace(".", "\\.")));
  const ld = JSON.parse(guide.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(guide.includes(`<h3>${q.name}</h3>`), q.name);
  for (const l of [...guide.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)].map((m) => m[1])) assert.ok(existsSync(new URL(`../${l}/index.html`, import.meta.url)), l);

  const guests = ["Nina Castillo", "Paul Castillo", "Rosa Castillo", "Gil Castillo", "Marta Reyes", "Dev Reyes", "Karen Moss", "Alan Moss", "Beth Lowe", "Sam Lowe", "Dana Price", "Eli Price", "Joanne Park", "Ty Park", "Ora Finch", "Len Finch", "Cass Wynn", "Ruth Wynn", "Omar Haddad", "Lucy Haddad", "Pat Quill", "Jo Quill", "Ivy Stone", "Bo Stone"];
  const party = { "Nina Castillo": "Castillo party", "Paul Castillo": "Castillo party", "Marta Reyes": "Reyes party", "Dev Reyes": "Reyes party", "Karen Moss": "Moss party", "Alan Moss": "Moss party" };
  const parsed = parseGuests(guests.map((g) => (party[g] ? `${g} | ${party[g]}` : g)).join("\n"));
  const rulesText = ["Marta Reyes !! Karen Moss", "Marta Reyes !! Alan Moss", "Dev Reyes ! Karen Moss", "Beth Lowe ! Dana Price", "Nina Castillo + Rosa Castillo", "Dev Reyes + Pat Quill", "Rosa Castillo + Gil Castillo", "Karen Moss + Beth Lowe", "Omar Haddad + Lucy Haddad", "Ora Finch + Len Finch", "Nina Castillo @ 1", "Paul Castillo @ 1", "Marta Reyes @ 2", "Dev Reyes @ 2", "Karen Moss @ 3", "Alan Moss @ 3"].join("\n");
  const { rules, errors } = parseRules(rulesText, parsed.guests);
  assert.deepEqual([...parsed.errors, ...errors], []);
  const spec = { guests: parsed.guests, rules, seatsPerTable: 8, tableCount: 3, balance: true, mix: "off", seed: 1 };
  const res = optimize(spec);
  assert.deepEqual(verifyPlan(spec, res), []);
  const base = baselinePlan(spec);
  const baseRes = describe(spec, weightMatrix(spec), base, base);
  const row = (label, met, total, splits, score) => `<tr><td>${label}</td><td class="n">${met} of ${total}</td><td class="n">${splits}</td><td class="n">${score}</td></tr>`;
  assert.ok(guide.includes(row("In the order typed", baseRes.rulesMet, baseRes.rulesTotal, baseRes.partySplits.length, baseRes.score)), "list-order row");
  assert.ok(guide.includes(row("Optimized", res.rulesMet, res.rulesTotal, res.partySplits.length, res.score)), "optimized row");
  assert.equal(res.rulesTotal, 10);
  assert.deepEqual(res.tables.map((t) => t.size), [8, 8, 8]);
});
