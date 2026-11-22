// The search guides: linked from the tool page, sitemap and llms.txt, FAQ
// markup equal to the visible questions, the disclaimer present, every control
// they name present on the tool page, and every number in the worked examples
// equal to what the engine gives on the built-in sample office.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const here = (p) => new URL(`./${p}`, import.meta.url).pathname;
const page = (name) => readFileSync(here(name), "utf8");
const GUIDES = [
  "how-to-get-a-bill-of-quantities-from-an-ifc-model.html",
  "how-to-check-ifc-quantities-before-pricing.html",
  "how-to-compare-two-ifc-revisions-for-a-change-order.html",
];
const SAMPLE = here("samples/sample-office.ifc"), REV2 = here("samples/sample-office-rev2.ifc");
const cli = (...args) => execFileSync(process.execPath, [here("cli.mjs"), ...args], { encoding: "utf8" });
const csv = (text) => {
  const rows = text.replace(/^﻿/, "").trim().split(/\r?\n/).map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, -1).map((c) => c.replace(/,$/, "").replace(/^"(.*)"$/, "$1")));
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
};
const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&minus;/g, "-").replace(/&rarr;/g, "->").replace(/&times;/g, "x").replace(/&sup2;/g, "2");

test("every guide is linked from the tool page, the sitemap and llms.txt", () => {
  for (const g of GUIDES) {
    assert.ok(page("index.html").includes(`href="./${g}"`), g);
    assert.ok(page("sitemap.xml").includes(`<loc>./${g}</loc>`), g);
    assert.ok(page("llms.txt").includes(`/ifc-quantity-takeoff/${g})`), g);
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

test("the controls the guides name exist on the tool page", () => {
  const index = page("index.html");
  for (const g of GUIDES) for (const m of page(g).matchAll(/<em>([^<]+)<\/em>/g)) {
    assert.ok(index.includes(m[1]), `${g}: "${m[1]}" is not on the tool page`);
  }
});

test("the bill-of-quantities guide's table and notes equal the engine on the sample office", () => {
  const html = strip(page(GUIDES[0]));
  const lines = csv(cli(SAMPLE));
  const get = (cls) => lines.find((l) => l.Class === cls);
  const want = { IfcBeam: ["1", "0.011394", "0", "4", "89.44"], IfcColumn: ["1", "0.212058", "0", "3", "0"], IfcSlab: ["1", "5", "20", "0", "0"], IfcWall: ["4", "8.18", "40.9", "15", "0"] };
  for (const [cls, [n, v, a, len, w]] of Object.entries(want)) {
    const l = get(cls);
    assert.equal(l.Count, n, cls); assert.equal(l["Volume m3"], v, cls); assert.equal(l["Area m2"], a, cls); assert.equal(l["Length m"], len, cls);
    assert.equal(Number(l["Weight kg"]).toFixed(2).replace(/\.00$/, ""), w, cls);
    assert.ok(html.includes(`${cls}`) && html.includes(v), `${cls} ${v} in the guide`);
  }
  assert.equal(get("IfcWall")["Volume from model's stored quantities"], "2");
  assert.equal(get("IfcWall")["Volume computed here"], "2");
  assert.match(html, /2\.58 \+ 2 \+ 1\.8 \+ 1\.8 = 8\.18 m3/);
  // the beam weighed from its stored volume would be 0.0142 x 7850
  assert.equal((0.0142 * 7850).toFixed(2), "111.47");
  assert.match(html, /89\.44 kg, where the stored volume would have given 111\.47 kg/);
  const storeys = csv(cli(SAMPLE, "--by", "storey,class"));
  assert.equal(storeys.find((l) => l.Storey === "Level 1" && l.Class === "IfcWall")["Volume m3"], "6.38");
  assert.equal(storeys.find((l) => l.Storey === "Level 2" && l.Class === "IfcWall")["Volume m3"], "1.8");
  assert.match(html, /Level 1 holds three wall pieces \(6\.38 m3\) and Level 2 one \(1\.8 m3\)/);
  const uf = csv(cli(SAMPLE, "--by", "uniformat")).map((l) => l["Uniformat II element"]);
  for (const code of ["A1030 Slab on Grade", "B2010 Exterior Walls", "B10 Superstructure"]) {
    assert.ok(uf.some((u) => u.startsWith(code)), code);
    assert.ok(html.includes(code), code);
  }
});

test("the check guide's example equals the engine: 2 of 4 gross and 2 of 3 net agree, the causes named", () => {
  const html = strip(page(GUIDES[1]));
  const summary = cli(SAMPLE, "--check");
  assert.match(summary, /stored GrossVolume: 2 of 4 agree; stored NetVolume: 2 of 3 agree/);
  assert.match(html, /stores four GrossVolumes and three NetVolumes\. Two of each agree/);
  const dir = mkdtempSync(join(tmpdir(), "qto-guides-"));
  cli(SAMPLE, "--rows", join(dir, "rows.csv"));
  const rows = csv(readFileSync(join(dir, "rows.csv"), "utf8"));
  const c = rows.filter((r) => r.Name === "Wall C");
  assert.equal(c.length, 2);
  for (const r of c) { assert.equal(r["Stored GrossVolume m3"], "3.6"); assert.equal(r["Computed gross m3"], "1.8"); assert.match(r["Area check"], /GrossSideArea differs -50\.0% \(split\)/); }
  const beam = rows.find((r) => r.Class === "IfcBeam");
  assert.equal(beam["Stored NetVolume m3"], "0.0142");
  assert.equal(beam["Computed net m3"], "0.011394");
  assert.match(beam["Stored quantities"], /Length=4; CrossSectionArea=0\.002848/);
  assert.equal((4 * 0.002848).toFixed(6), "0.011392");
  assert.match(beam["Weight from"], /computed volume x 7850/);
  assert.match(html, /Contradicts its own Length x CrossSectionArea \(0\.011392 m3\)/);
  assert.match(html, /89\.44 kg, not the 111\.47 kg/);
});

test("the revision guide's example equals the engine's comparison of the sample's two revisions", () => {
  const html = strip(page(GUIDES[2]));
  const dir = mkdtempSync(join(tmpdir(), "qto-guides-"));
  const changesPath = join(dir, "changes.csv");
  let out = "";
  try { out = execFileSync(process.execPath, [here("cli.mjs"), REV2, "--compare", SAMPLE, "--changes", changesPath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { out = e.stdout; }
  const delta = csv(out);
  const line = (cls) => delta.find((l) => l.Class === cls);
  assert.deepEqual([line("IfcColumn")["Count before"], line("IfcColumn")["Count after"], line("IfcColumn")["Volume m3 change"], line("IfcColumn")["Length m change"]], ["1", "2", "0.212058", "3"]);
  assert.equal(line("IfcSlab")["Volume m3 change"], "1");
  assert.deepEqual([line("IfcWall")["Count after"], line("IfcWall")["Volume m3 change"], line("IfcWall")["Area m2 change"], line("IfcWall")["Length m change"]], ["3", "-2.084", "-10.42", "-4"]);
  for (const t of ["1 -> 2", "+0.212058", "4 -> 3", "-2.084", "-10.42"]) assert.ok(html.includes(t), t);
  const ch = csv(readFileSync(changesPath, "utf8"));
  const kinds = ch.map((r) => r.Change);
  assert.equal(kinds.filter((k) => k === "changed").length, 3);
  assert.equal(kinds.filter((k) => k === "added").length, 1);
  assert.equal(kinds.filter((k) => k === "removed").length, 1);
  assert.equal(kinds.filter((k) => /new GlobalId/.test(k)).length, 1);
  assert.match(ch.find((r) => r.Name === "Wall A")["What changed"], /volume -0\.084; area -0\.42/);
  assert.match(ch.find((r) => r.Class === "IfcSlab")["What changed"], /5 x 4 x 0\.25 -> 5 x 4 x 0\.3 m/);
  assert.match(ch.find((r) => r.Class === "IfcBeam")["What changed"], /moved 1 m/);
  assert.match(ch.find((r) => /new GlobalId/.test(r.Change))["Matched by"], /Tag/);
  assert.match(html, /3 unchanged, 3 changed, 1 added, 1 removed, and 1 matched under a new GlobalId by its Tag/);
});
