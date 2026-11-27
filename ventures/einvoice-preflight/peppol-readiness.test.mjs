// Peppol BIS 3.1.0 readiness (peppol-readiness.mjs, the CLI and
// peppol-bis-3-1-0-readiness.html): files that pass 3.0.22 and fail 3.1.0 are counted
// and grouped by rule, and the page's change table is the compiled rule sets' diff.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { adviceFor, classifyFile, headline, isPeppolFile, ruleChanges, stripNote, summarize, toCsv, toMarkdown } from "./peppol-readiness.mjs";
import { renderPage } from "./build-peppol-readiness-page.mjs";

const skip = !plainAvailable() && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const cn = read("./examples/peppol-credit-note.xml");
const nl = read("./examples/peppol-nl-credit-note.xml");
const gln19 = cn.replace(/(<cbc:EndpointID schemeID="0088">)4012345000009</, "$19482348239847239874<");
const kvk7 = nl.replace(/<cbc:EndpointID schemeID="0106">\d+</, '<cbc:EndpointID schemeID="0106">1234567<');
const both = async (name, xml) => classifyFile(name, await runPlain(xml), await runPlain(xml, { peppolNext: true }), { peppol: isPeppolFile(xml) });

test("ruleChanges: added, removed, warning to fatal and a changed test; wording and whitespace ignored", () => {
  const set = (checks) => ({ patterns: [{ rules: [{ context: "x", checks }] }] });
  const now = set([
    { id: "A", flag: "fatal", test: "a  =\n 1", text: "[A]-x should be" },
    { id: "B", flag: "warning", test: "b", text: "[B]-b" },
    { id: "C", flag: "fatal", test: "c", text: "[C]-c" },
    { id: "D", flag: "fatal", test: "d", text: "[D]-d" },
  ]);
  const next = set([
    { id: "A", flag: "fatal", test: "a = 1", text: "[A]-x SHOULD be" },
    { id: "B", flag: "fatal", test: "b", text: "[B]-b" },
    { id: "C", flag: "fatal", test: "c2", text: "[C]-c" },
    { id: "E", flag: "warning", test: "e", text: "[E]-e" },
  ]);
  assert.deepEqual(ruleChanges(now, next).map((c) => `${c.id}:${c.change}`), ["B:warning to fatal", "C:test changed", "D:removed", "E:added"]);
});

test("the compiled 3.0.22 to 3.1.0 diff: 130 UBL rules added, the Dutch formats raised to fatal, 0088 tightened", () => {
  const load = (f) => JSON.parse(read(`./plain/${f}`));
  const ubl = ruleChanges(load("peppol-ubl.json"), load("peppol-next-ubl.json"));
  const cii = ruleChanges(load("peppol-cii.json"), load("peppol-next-cii.json"));
  assert.equal(ubl.filter((c) => c.change === "added").length, 130);
  assert.deepEqual(cii.filter((c) => c.change === "added").map((c) => c.id).sort(), ["DK-R-017", "PEPPOL-COMMON-R058", "PEPPOL-COMMON-R059", "PEPPOL-COMMON-R062"]);
  for (const id of ["PEPPOL-COMMON-R054", "PEPPOL-COMMON-R055", "PEPPOL-COMMON-R056-1", "PEPPOL-COMMON-R056-2", "PEPPOL-COMMON-R057"]) {
    assert.equal(ubl.find((c) => c.id === id)?.change, "warning to fatal", id);
    assert.equal(cii.find((c) => c.id === id)?.change, "warning to fatal", id);
  }
  assert.equal(ubl.find((c) => c.id === "PEPPOL-COMMON-R040").change, "test changed");
  assert.deepEqual(ubl.filter((c) => c.change === "removed").map((c) => c.id), ["GR-R-001-5"]);
  // Every rule the page's advice covers by pattern is in the diff (the advice is not about
  // a rule 3.1.0 leaves alone).
  for (const c of [...ubl, ...cii].filter((c) => c.change !== "removed" && !/^(PEPPOL-EN16931-P01|GR-)/.test(c.id))) assert.ok(adviceFor(c.id), `no advice for ${c.id}`);
});

test("the page's change table is the one build-peppol-readiness-page.mjs writes from ./plain/", () => {
  const page = read("./peppol-bis-3-1-0-readiness.html");
  assert.equal(page, renderPage(page), "run node build-peppol-readiness-page.mjs");
  assert.match(page, /<code>PEPPOL-COMMON-R040<\/code><\/td><td>UBL, CII<\/td><td>test changed/);
});

test("the page carries the disclaimer, a canonical link, local-only usage counting and the deadline", () => {
  const page = read("./peppol-bis-3-1-0-readiness.html");
  assert.match(page, /No warranty\./);
  assert.match(page, /not legal, tax, financial, or accounting advice/);
  assert.match(page, /rel="canonical" href="\.\/peppol-bis-3-1-0-readiness\.html"/);
  assert.match(page, /recordUsage\(usageStorage\(\), \$\("usageOptOut"\)\.checked, "peppol_readiness_checked"\)/);
  assert.match(page, /24 February 2027/);
  assert.doesNotMatch(page, /fetch\([^)]*(api|upload)/i);
  for (const f of ["sitemap.xml", "llms.txt", "index.html"]) assert.match(read(`./${f}`), /peppol-bis-3-1-0-readiness\.html/, f);
});

test("a 19-digit 0088 address and a 7-digit KVK pass 3.0.22 and are rejected under 3.1.0", { skip }, async () => {
  const rows = [
    await both("clean.xml", cn),
    await both("gln19.xml", gln19),
    await both("nl.xml", nl),
    await both("kvk7.xml", kvk7),
    await both("not-peppol.xml", read("./examples/ubl-invoice.xml")),
  ];
  assert.deepEqual(rows.map((r) => r.verdict), ["ready", "newly-rejected", "ready", "newly-rejected", "not-peppol"]);
  assert.deepEqual(rows[1].added.map((f) => `${f.rule}:${f.severity}`), ["PEPPOL-COMMON-R040:fatal"]);
  assert.ok(rows[3].added.some((f) => f.rule === "PEPPOL-COMMON-R054" && f.severity === "fatal"));
  assert.doesNotMatch(rows[1].added[0].message, /New in Peppol/);
  const s = summarize(rows);
  assert.equal(s.peppol, 4);
  assert.equal(s.counts["newly-rejected"], 2);
  assert.equal(headline(s), "2 of 4 Peppol files pass 3.0.22 today and would be rejected under 3.1.0 from 2027-02-24.");
  assert.deepEqual(s.rules.map((r) => r.rule), ["PEPPOL-COMMON-R040", "PEPPOL-COMMON-R054"]);
  assert.match(s.rules[0].advice, /13 digits/);
  const md = toMarkdown(s);
  assert.match(md, /## Files to fix before 2027-02-24\n\n- gln19\.xml: PEPPOL-COMMON-R040\n- kvk7\.xml: PEPPOL-COMMON-R054/);
  assert.equal(toCsv(s).split("\n")[0], "file,verdict,rule,severity,path,message,fix");
});

test("a file failing 3.0.22 already is not counted as newly rejected; unreadable files are named", { skip }, async () => {
  const bad = read("./examples/peppol-nl-credit-note-with-defects.xml");
  assert.equal((await both("bad.xml", bad)).verdict, "fails-both");
  assert.equal(headline(summarize([await both("bad.xml", bad), await both("ok.xml", cn)])), "None of 2 Peppol files would be newly rejected under 3.1.0 (1 already fails 3.0.22 today).");
  const broken = classifyFile("broken.xml", { error: "not well-formed XML" }, { error: "not well-formed XML" });
  assert.deepEqual([broken.verdict, broken.reason], ["unreadable", "not well-formed XML"]);
});

test("CSV cells that a spreadsheet would read as a formula are quoted as text", () => {
  const s = summarize([{ name: "=HYPERLINK(\"x\")", verdict: "newly-rejected", added: [{ rule: "R", severity: "fatal", path: "/a", message: "+1", fix: "-2.50" }] }]);
  assert.equal(toCsv(s).split("\n")[1], `"'=HYPERLINK(""x"")",newly-rejected,R,fatal,/a,'+1,-2.50`);
  assert.equal(stripNote("x. [New in Peppol BIS 3.1.0, rejected from 2027-02-24; 3.0.22, in force today, does not raise this.]"), "x.");
});

test("the CLI reports a folder and exits 1 when a file is newly rejected", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "peppol-ready-"));
  writeFileSync(join(dir, "a.xml"), cn);
  writeFileSync(join(dir, "b.xml"), gln19);
  let code = 0, out = "";
  try { out = execFileSync(process.execPath, [new URL("./peppol-readiness-cli.mjs", import.meta.url).pathname, dir, "--csv", join(dir, "r.csv")], { encoding: "utf8" }); } catch (e) { code = e.status; out = e.stdout; }
  assert.equal(code, 1);
  assert.match(out, /1 of 2 Peppol files pass 3\.0\.22 today/);
  assert.match(readFileSync(join(dir, "r.csv"), "utf8"), /b\.xml,newly-rejected,PEPPOL-COMMON-R040,fatal/);
});

// The verdict table without the plain rule runner, so it runs where slimdom and
// fontoxpath are not installed (a red-team campaign, 2026-11-27, saw four mutants of
// classifyFile, summarize and toCsv escape locally because the tests above skip).
test("classifyFile, summarize and toCsv on hand-built runs, no rule runner needed", () => {
  const sets = ["en16931", "peppol-next"];
  const fatalNew = { rule: "PEPPOL-COMMON-R040", severity: "fatal", path: "/E", message: "x [New in Peppol BIS 3.1.0, rejected from 2027-02-24]", peppolNext: "new" };
  const fatalOld = { rule: "BR-01", severity: "fatal", path: "/I", message: "old" };
  const warnNew = { rule: "PEPPOL-COMMON-R062", severity: "warning", path: "/V", message: "w", peppolNext: "new" };
  const run = (findings) => ({ status: "ok", sets, findings });
  const rows = [
    classifyFile("ready.xml", run([]), run([])),
    classifyFile("new.xml", run([]), run([fatalNew])),
    classifyFile("both.xml", run([fatalOld]), run([fatalOld])),
    classifyFile("fixed.xml", run([fatalOld]), run([])),
    classifyFile("warn.xml", run([]), run([warnNew])),
    classifyFile("plain.xml", run([]), { status: "ok", sets: ["en16931"], findings: [] }),
    classifyFile("unavail.xml", { status: "unavailable", sets: [], findings: [] }, run([])),
    classifyFile("half.xml", run([]), { status: "unavailable", sets: [], findings: [] }),
  ];
  assert.deepEqual(rows.map((r) => r.verdict),
    ["ready", "newly-rejected", "fails-both", "fixed-by-3.1.0", "new-warnings", "not-peppol", "unreadable", "unreadable"]);
  assert.equal(rows[1].added[0].message, "x");
  assert.deepEqual([rows[1].fatalNow, rows[1].fatalNext], [0, 1]);
  const s = summarize(rows);
  assert.deepEqual(s.counts, { "newly-rejected": 1, "fails-both": 1, "fixed-by-3.1.0": 1, "new-warnings": 1, ready: 1, "not-peppol": 1, unreadable: 2 });
  assert.equal(s.peppol, 5);
  assert.deepEqual(s.rules.map((r) => `${r.rule}:${r.severity}:${r.files.join("+")}`), ["PEPPOL-COMMON-R040:fatal:new.xml", "PEPPOL-COMMON-R062:warning:warn.xml"]);
  const csv = toCsv(s);
  assert.ok(csv.endsWith("\n") && !csv.endsWith("\n\n"));
  assert.equal(csv.split("\n").length, 1 + 8 + 1);
  assert.equal(csv.split("\n")[2], "new.xml,newly-rejected,PEPPOL-COMMON-R040,fatal,/E,x,");
  const md = toMarkdown(s);
  assert.match(md, /^# Peppol BIS 3\.1\.0 readiness\n/);
  assert.match(md, /\| Passes 3\.0\.22 today, rejected under 3\.1\.0 \| 1 \|/);
  assert.match(md, /- new\.xml: PEPPOL-COMMON-R040\n/);
  assert.ok(md.endsWith(" will be accepted.\n"));
});
