// The search guides: linked from the tool page, sitemap and llms.txt, FAQ
// markup equal to the visible questions, the disclaimer present, every button
// they name present on the page, and every number in the worked examples equal
// to what the engine gives on the built-in sample house.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const here = (p) => new URL(`./${p}`, import.meta.url).pathname;
const page = (name) => readFileSync(here(name), "utf8");
const GUIDES = [
  "how-to-check-an-ifc-model-against-an-ids-file.html",
  "how-to-write-an-ids-file-in-excel.html",
  "how-to-add-missing-property-values-to-an-ifc-model.html",
];

test("every guide is linked from the tool page, the sitemap and llms.txt", () => {
  for (const g of GUIDES) {
    assert.ok(page("index.html").includes(`href="./${g}"`), g);
    assert.ok(page("sitemap.xml").includes(`<loc>./${g}</loc>`), g);
    assert.ok(page("llms.txt").includes(`/ids-model-check/${g})`), g);
  }
});

test("each guide: canonical, title and description lengths, FAQ markup equals the visible text, disclaimer, links to the others", () => {
  for (const g of GUIDES) {
    const html = page(g);
    assert.ok(html.includes(`<link rel="canonical" href="./${g}">`), g);
    assert.ok(html.match(/<title>(.*?)<\/title>/)[1].length <= 70, g);
    const desc = html.match(/<meta name="description" content="(.*?)">/)[1];
    assert.ok(desc.length >= 60 && desc.length <= 160, `${g} description ${desc.length}`);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(ld["@type"], "FAQPage");
    for (const q of ld.mainEntity) {
      assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
      assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
    }
    assert.match(html, /No warranty/);
    assert.match(html, /not engineering, legal, contractual or design advice/);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
    for (const other of GUIDES) if (other !== g) assert.ok(html.includes(`href="./${other}"`), `${g} -> ${other}`);
  }
});

test("the buttons and panels the guides name exist on the tool page", () => {
  const index = page("index.html");
  for (const label of ["Try a tiny sample", "use the starter IDS", "Audit the IDS only", "Check the model", "Download BCF issues", "Download report (HTML)", "Download as a spreadsheet (.xlsx)", "Write the missing values into the model", "Download the to-fill table (CSV)", "Download the filled model", "Measure missing <code>Qto_</code> volumes, areas and lengths from each element's geometry"]) {
    assert.ok(index.includes(label), label);
  }
  for (const g of GUIDES) for (const m of page(g).matchAll(/<em>([^<]+)<\/em>/g)) {
    if (/^(Value|applicability|requirements|facet|Measure missing.*)$/.test(m[1])) continue;
    assert.ok(index.includes(m[1]), `${g}: "${m[1]}" is not on the tool page`);
  }
});

const dir = mkdtempSync(join(tmpdir(), "ids-guides-"));
// --fill exits 1 while values are left for a person; its output is still wanted.
const cli = (...args) => {
  try { return execFileSync(process.execPath, [here("cli.mjs"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return e.stdout; }
};
const json = (...args) => JSON.parse(cli(...args, "--json"));
const HOUSE = here("samples/tiny-house.ifc"), STARTER = here("samples/coordination-basics.ids.xml");
const status = (r) => Object.fromEntries(r.specs.map((s) => [s.name, `${s.status} ${s.passed}/${s.applicable}`]));

test("the check guide's worked example equals the engine", () => {
  const html = page(GUIDES[0]);
  const r = json(HOUSE, STARTER);
  assert.equal(r.specs.filter((s) => s.status === "pass").length, 3);
  assert.equal(r.specs.length, 7);
  assert.match(html, /passes <strong>3 of 7 specifications<\/strong>/);
  const s = status(r);
  assert.equal(s["Walls say whether they are external"], "pass 3/3");
  assert.equal(s["Walls say whether they are load-bearing"], "fail 2/3");
  assert.equal(s["Walls have a material"], "fail 2/3");
  assert.equal(s["Doors and windows are named"], "pass 2/2");
  assert.equal(s["Doors and windows sit on a storey"], "pass 2/2");
  assert.equal(s["Spaces have a name and a long name"], "fail 0/1");
  assert.match(s["No building element proxies"], /^fail/);
  const failed = (name) => r.specs.find((x) => x.name === name).failed.map((f) => f.name);
  assert.deepEqual(failed("Walls say whether they are load-bearing"), ["W-02"]);
  assert.deepEqual(failed("Walls have a material"), ["P-01"]);
  assert.deepEqual(failed("Spaces have a name and a long name"), ["001"]);
  assert.deepEqual(failed("No building element proxies"), ["Kitchen unit"]);
  for (const t of ["Pass, 3 of 3", "Fail, 2 of 3", "Pass, 2 of 2", "Fail, 0 of 1"]) assert.ok(html.includes(t), t);
});

test("the spreadsheet guide's example: TRUE on row 8 is lower-cased with a warning, the IDS audits clean and passes 0 of 2", () => {
  const html = page(GUIDES[1]);
  assert.ok(html.includes('href="./samples/ids-as-a-spreadsheet.csv"'));
  const ids = join(dir, "sheet.ids");
  cli("--from-sheet", here("samples/ids-as-a-spreadsheet.csv"), "-o", ids);
  const text = readFileSync(ids, "utf8");
  assert.match(text, /<simpleValue>true<\/simpleValue>/);
  assert.doesNotMatch(text, /TRUE/);
  const audit = json("--audit", ids);
  assert.equal(audit.valid, true); assert.deepEqual(audit.issues, []);
  const r = json(HOUSE, ids);
  assert.equal(r.specs.filter((s) => s.status === "pass").length, 0);
  assert.equal(r.specs.length, 2);
  assert.match(html, /passes 0 of 2/);
  assert.match(html, /row 8 comes out as <code>true<\/code>/);
  const walls = r.specs.find((s) => s.name === "External walls say whether they carry load");
  assert.equal(walls.applicable, 2); assert.equal(walls.passed, 1);
  assert.deepEqual(walls.failed.map((f) => f.name), ["W-02"]);
  assert.deepEqual(r.specs.find((s) => s.name === "Doors carry a fire rating").failed.map((f) => f.name), ["D-01"]);
});

test("the fill guide's example: two typed values take the house from 3 to 5 of 7 and change three lines", () => {
  const html = page(GUIDES[2]);
  const todo = join(dir, "todo.csv"), filled = join(dir, "filled.ifc");
  cli("--fill", HOUSE, STARTER, "-o", join(dir, "first.ifc"), "--to-fill", todo);
  const lines = readFileSync(todo, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  assert.equal(lines.length, 3);
  assert.match(lines[1], /,W-02,Pset_WallCommon,LoadBearing,IFCBOOLEAN,/);
  assert.match(lines[2], /,001,\(attribute\),LongName,IFCLABEL,/);
  const set = (line, v) => { const c = line.split(","); c[7] = v; return c.join(","); };
  writeFileSync(todo, [lines[0], set(lines[1], "true"), set(lines[2], "Living room")].join("\n") + "\n");
  cli("--fill", HOUSE, STARTER, "-o", filled, "--values", todo);
  const r = json(filled, STARTER);
  assert.equal(r.specs.filter((s) => s.status === "pass").length, 5);
  assert.match(html, /passes <strong>5 of 7<\/strong> specifications instead of 3/);
  const before = readFileSync(HOUSE, "utf8").split(/\r?\n/), after = readFileSync(filled, "utf8").split(/\r?\n/);
  const kept = new Set(before);
  const changedOrAdded = after.filter((l) => !kept.has(l));
  assert.equal(changedOrAdded.length, 3);
  assert.equal(after.length - before.length, 1);
  assert.match(html, /The change to the file is three lines/);
});
