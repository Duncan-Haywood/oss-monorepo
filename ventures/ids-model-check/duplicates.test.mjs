// Duplicate GlobalIds (IfcRoot rule UR1) as a model finding, in every output
// (eval/duplicate-globalids-2026-11-17.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { check, parseModel } from "./node.mjs";
import { duplicateGlobalIds } from "./ids.mjs";
import { annotations, codeQuality, stepSummary, tally, modelFindings, junitXml } from "./ci.mjs";
import { textReport, csvReport } from "./report.mjs";
import { bcfZip } from "./bcf.mjs";

const here = new URL(".", import.meta.url).pathname;
const file = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const tiny = file("samples/tiny-house.ifc");
// W-02 given W-01's GlobalId, and a property set given it too: three IfcRoot
// instances of three classes sharing one GlobalId, plus a second pair.
const W1 = "3vB2YO$MX4xv5uCqZZG05x";
const dupModel = tiny
  .replace("#21=IFCWALL('1Lz5$gbjv4GQ6_kuh4Wa3J'", `#21=IFCWALL('${W1}'`)
  .replace(/^(#\d+=IFCPROPERTYSET\(')[^']{22}'/m, `$1${W1}'`)
  .replace("#22=IFCWALL('0Dqu2kwjbCmOwB7c2iZvUo'", "#22=IFCWALL('0Dqu2kwjbCmOwB7c2iZvUZ'")
  .replace(/^(#\d+=IFCSLAB\(')[^']{22}'/m, "$10Dqu2kwjbCmOwB7c2iZvUZ'");

test("the sample model has no duplicate GlobalIds; the edited one has two", () => {
  assert.deepEqual(duplicateGlobalIds(parseModel(tiny)), []);
  assert.equal(dupModel.split(W1).length - 1, 3, "the edit took");
  const d = duplicateGlobalIds(parseModel(dupModel));
  assert.deepEqual(d.map((x) => x.globalId), ["0Dqu2kwjbCmOwB7c2iZvUZ", W1], "sorted by GlobalId");
  const w = d[1];
  assert.equal(w.elements.length, 3);
  assert.deepEqual(w.elements.map((e) => e.id).slice(0, 2), [20, 21], "in #id order");
  assert.deepEqual(w.elements.slice(0, 2).map((e) => [e.type, e.name]), [["IFCWALL", "W-01"], ["IFCWALL", "W-02"]]);
  assert.equal(w.elements[2].type, "IFCPROPERTYSET");
  assert.deepEqual(d[0].elements.map((e) => e.type).sort(), ["IFCSLAB", "IFCWALL"]);
});

test("only IfcRoot GlobalIds count: a repeated string elsewhere is not a duplicate", () => {
  // Two property values holding the same 22-character text, as HHS
  // construction.ifc's 'TreadLengthAtInnerSide' names do.
  const m = tiny.replace("ENDSEC;\nEND-ISO", "#9001=IFCPROPERTYSINGLEVALUE('TreadLengthAtInnerSide',$,$,$);\n#9002=IFCPROPERTYSINGLEVALUE('TreadLengthAtInnerSide',$,$,$);\nENDSEC;\nEND-ISO");
  assert.ok(m.includes("#9002"));
  assert.deepEqual(duplicateGlobalIds(parseModel(m)), []);
});

test("checkIds reports them without changing the IDS verdict", () => {
  const ids = file("samples/coordination-basics.ids.xml");
  const a = check(ids, tiny), b = check(ids, dupModel);
  assert.deepEqual(a.duplicateGlobalIds, []);
  assert.equal(b.duplicateGlobalIds.length, 2);
  assert.equal(b.pass, a.pass);
  assert.match(textReport(b), new RegExp(`model warning: 2 GlobalId\\(s\\) are shared[^\\n]*\\n  0Dqu2kwjbCmOwB7c2iZvUZ: #\\d+ IFC`));
  assert.ok(!/model warning/.test(textReport(a)));
  const rows = csvReport(b).trim().split("\n").filter((l) => l.startsWith("(model) duplicate GlobalId"));
  assert.equal(rows.length, 5, "one row per element in each group");
  assert.ok(rows.every((l) => l.includes(",duplicate,")));
});

test("CI: once per model, a warning unless asked to fail", () => {
  const ids1 = file("samples/coordination-basics.ids.xml"), ids2 = file("samples/quantities-and-naming.ids.xml");
  const parsed = parseModel(dupModel);
  const runs = [
    { model: "m/a.ifc", ids: "r/1.ids", report: check(ids1, parsed) },
    { model: "m/a.ifc", ids: "r/2.ids", report: check(ids2, parsed) },
    { model: "m/b.ifc", ids: "r/1.ids", report: check(ids1, tiny) },
  ];
  assert.equal(modelFindings(runs).length, 1);
  const t = tally(runs);
  assert.equal(t.duplicateModels, 1);
  assert.equal(t.duplicateGlobalIds, 2);
  assert.equal(t.ok, tally(runs.map((r) => ({ ...r, report: { ...r.report, duplicateGlobalIds: [] } }))).ok, "the tally's verdict is the IDS one");
  const lines = new Map([["m/a.ifc", new Map([[21, 42]])]]);
  const an = annotations(runs, { lines }).filter((x) => x.includes("duplicate GlobalId"));
  assert.equal(an.length, 1);
  assert.ok(an[0].startsWith("::warning file=m/a.ifc"), an[0]);
  assert.ok(annotations(runs, { lines, failOnDuplicates: true }).some((x) => x.startsWith("::error file=m/a.ifc") && x.includes("duplicate GlobalId")));
  const cq = codeQuality(runs, { lines }).filter((x) => x.check_name === "ifc-duplicate-globalid");
  assert.equal(cq.length, 2, "one issue per duplicated GlobalId");
  assert.equal(new Set(cq.map((x) => x.fingerprint)).size, 2);
  const w = cq.find((x) => x.description.includes(W1));
  assert.equal(w.location.lines.begin, 42, "on the line of the element that repeats it");
  assert.equal(w.severity, "minor");
  // the fingerprint is the model and GlobalId, so a re-export that renumbers keeps it
  const again = codeQuality([{ model: "m/a.ifc", ids: "r/1.ids", report: { ...runs[0].report, duplicateGlobalIds: runs[0].report.duplicateGlobalIds.map((d) => ({ ...d, elements: d.elements.map((e) => ({ ...e, id: e.id + 1000 })) })) } }]).filter((x) => x.check_name === "ifc-duplicate-globalid");
  assert.deepEqual(again.map((x) => x.fingerprint).sort(), cq.map((x) => x.fingerprint).sort());
  const md = stepSummary(runs);
  assert.match(md, /\*\*Duplicate GlobalIds:\*\* 2 GlobalId\(s\) shared by more than one element in 1 model/);
  assert.match(md, /<summary>m\/a\.ifc: 2 duplicate GlobalId\(s\)<\/summary>/);
  assert.match(stepSummary(runs, { failOnDuplicates: true }), /## IDS model check: FAIL/);
  assert.doesNotThrow(() => junitXml(runs));
});

test("BCF: a topic per duplicated GlobalId, selecting it, before the IDS topics", () => {
  const r = check(file("samples/coordination-basics.ids.xml"), dupModel);
  const zip = Buffer.from(bcfZip(r, { date: "2026-11-17T00:00:00Z" })).toString("latin1");
  const titles = [...zip.matchAll(/<Title>([^<]*)<\/Title>/g)].map((m) => m[1]);
  assert.match(titles[0], /^Duplicate GlobalId: /);
  assert.match(titles[1], /^Duplicate GlobalId: /);
  assert.ok(zip.includes(`<Component IfcGuid="${W1}"/>`));
  const none = Buffer.from(bcfZip(check(file("samples/coordination-basics.ids.xml"), tiny))).toString("latin1");
  assert.ok(!none.includes("Duplicate GlobalId"));
});

test("ci-cli: --fail-on-duplicate-globalids sets the exit code; the default only warns", () => {
  const dir = mkdtempSync(join(tmpdir(), "ids-ci-dup-"));
  mkdirSync(join(dir, "m")); mkdirSync(join(dir, "r"));
  writeFileSync(join(dir, "m/a.ifc"), dupModel);
  copyFileSync(join(here, "samples/quantities-and-naming.ids.xml"), join(dir, "r/q.ids"));
  const go = (...extra) => spawnSync(process.execPath, [join(here, "ci-cli.mjs"), "--root", dir, "--models", "m/*.ifc", "--ids", "r/*.ids", "--fail-on", "never", "--json", join(dir, "o.json"), ...extra], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } });
  const a = go();
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /model warning: m\/a\.ifc: duplicate GlobalId 0Dqu2kwjbCmOwB7c2iZvUZ is held by 2 elements/);
  assert.match(a.stdout, /2 duplicate GlobalId\(s\) in 1 model\(s\)/);
  assert.equal(JSON.parse(readFileSync(join(dir, "o.json"), "utf8")).tally.duplicateGlobalIds, 2);
  const b = go("--fail-on-duplicate-globalids", "--annotations");
  assert.equal(b.status, 0, "--fail-on never still decides the exit code");
  assert.match(b.stdout, /^::error file=m\/a\.ifc,line=\d+,title=IFC%3A 2 duplicate GlobalId\(s\)::/m);
  // An IDS the model passes, so the exit code turns on the duplicates alone.
  writeFileSync(join(dir, "r/q.ids"), `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>walls</title></info><specifications><specification name="Walls are named" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><attribute><name><simpleValue>Name</simpleValue></name></attribute></requirements></specification></specifications></ids>`);
  const exit = (...extra) => spawnSync(process.execPath, [join(here, "ci-cli.mjs"), "--root", dir, "--models", "m/*.ifc", "--ids", "r/*.ids", ...extra], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } });
  const plain = exit();
  assert.equal(plain.status, 0, plain.stdout);
  assert.match(plain.stdout, /^PASS: 1 pair\(s\), 1 pass, 0 fail/m);
  const strict = exit("--fail-on-duplicate-globalids");
  assert.equal(strict.status, 1);
  assert.match(strict.stdout, /^FAIL: .*\(--fail-on-duplicate-globalids\)/m);
});
