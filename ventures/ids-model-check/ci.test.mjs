import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { check, parseModel, parseIds, readModel } from "./node.mjs";
import { junitXml, annotations, codeQuality, cqHash, stepSummary, tally, severity, failCount, notChecked, stepLines, auditFindings, idsSpecLines, globToRegex, patterns, pairUp } from "./ci.mjs";
import { parseXml } from "./xml.mjs";

const here = new URL(".", import.meta.url).pathname;
const file = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const run = () => ({ model: "samples/tiny-house.ifc", ids: "samples/coordination-basics.ids.xml", report: check(file("samples/coordination-basics.ids.xml"), file("samples/tiny-house.ifc")) });

test("severity: required and prohibited failures are errors, optional ones warnings, invalid errors", () => {
  assert.equal(severity({ status: "pass", optionality: "required" }), "pass");
  assert.equal(severity({ status: "fail", optionality: "required" }), "error");
  assert.equal(severity({ status: "fail", optionality: "prohibited" }), "error");
  assert.equal(severity({ status: "fail", optionality: "optional" }), "warning");
  assert.equal(severity({ status: "invalid", optionality: "optional" }), "error");
});

test("JUnit report parses as XML and counts what the text report counts", () => {
  const r = run();
  const xml = junitXml([r, { model: "x.ifc", ids: "y.ids", error: "cannot read <x.ifc> & more" }]);
  const doc = parseXml(xml);
  assert.equal(doc.local, "testsuites");
  const suites = doc.children.filter((c) => c.local === "testsuite");
  assert.equal(suites.length, 2);
  const cases = suites[0].children.filter((c) => c.local === "testcase");
  assert.equal(cases.length, r.report.specs.length);
  const failing = r.report.specs.filter((s) => severity(s) === "error").length;
  assert.equal(Number(suites[0].attrs.failures), failing);
  assert.equal(cases.filter((c) => c.children.some((k) => k.local === "failure")).length, failing);
  assert.equal(Number(doc.attrs.tests), r.report.specs.length + 1);
  assert.equal(Number(doc.attrs.errors), 1);
  assert.match(xml, /cannot read &lt;x\.ifc&gt; &amp; more/);
  // the failing wall's GlobalId is in the failure text
  assert.match(xml, /1Lz5\$gbjv4GQ6_kuh4Wa3J/);
});

test("a prohibited spec with more than 500 matches counts every match, not the 500 listed", () => {
  const failed = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, type: "IFCBUILDINGELEMENTPROXY", name: "", globalId: "", reasons: ["prohibited"] }));
  const s = { name: "No proxies", status: "fail", optionality: "prohibited", applicable: 574, passed: 0, failed, note: "574 element(s) match a prohibited specification" };
  assert.equal(failCount(s), 574);
  const r = { model: "m.ifc", ids: "x.ids", report: { title: "t", specs: [s] } };
  assert.equal(tally([r]).elementsFailed, 574);
  assert.match(annotations([r])[0], /574 of 574 element\(s\) fail/);
  assert.match(junitXml([r]), /574 of 574 element\(s\) fail/);
  assert.match(junitXml([r]), /\.\.\. and 524 more/);
  assert.match(stepSummary([r]), /\| 574 \|/);
});

test("a skipped spec is a JUnit skip, not a pass or a failure", () => {
  const r = { model: "m.ifc", ids: "x.ids", report: { title: "t", specs: [{ name: "IFC4 only", status: "skipped", optionality: "required", applicable: 0, passed: 0, failed: [], note: "this specification is for IFC4" }] } };
  assert.match(junitXml([r]), /<skipped message="this specification is for IFC4"\/>/);
  assert.equal(tally([r]).ok, true);
});

test("JUnit drops control characters XML 1.0 forbids", () => {
  const xml = junitXml([{ model: "a\u0001.ifc", ids: "b.ids", error: "bad\u0007" }]);
  assert.doesNotMatch(xml, /[\u0001\u0007]/);
  parseXml(xml);
});

test("annotations: one per failing spec, on the first failing element's STEP line", () => {
  const r = run();
  const text = file("samples/tiny-house.ifc");
  const ids = r.report.specs.flatMap((s) => s.failed.slice(0, 1).map((f) => f.id));
  const lines = new Map([[r.model, stepLines(text, ids)]]);
  const out = annotations([r], { lines });
  const bad = r.report.specs.filter((s) => severity(s) !== "pass");
  assert.equal(out.length, bad.length);
  const wall = out.find((a) => a.includes("load-bearing"));
  assert.ok(wall.startsWith("::error file=samples/tiny-house.ifc,line=23,"), wall);
  assert.equal(text.split("\n")[22].slice(0, 5), "#21=I");
  assert.ok(out.some((a) => a.startsWith("::warning ")), "the optional spec is a warning");
  // properties escape ':' and ','; no raw newline inside a command
  for (const a of out) assert.doesNotMatch(a, /\n/);
  assert.match(wall, /title=IDS%3A /);
});

test("annotations put an unreadable pair and an invalid spec on the right file", () => {
  const out = annotations([
    { model: "m.ifc", ids: "x.ids", error: "line one\nline two" },
    { model: "m.ifc", ids: "x.ids", report: { specs: [{ name: "Bad, spec", status: "invalid", optionality: "required", failed: [], note: "unknown class" }] } },
  ]);
  assert.equal(out[0], "::error file=m.ifc,title=IDS check could not run::line one%0Aline two");
  assert.equal(out[1], "::error file=x.ids,title=Invalid IDS specification%3A Bad%2C spec::unknown class");
});

test("stepLines ignores non-STEP text and stops once every id is found", () => {
  assert.equal(stepLines("<ifcXML/>", [1]).size, 0);
  const m = stepLines("ISO-10303-21;\nHEADER;\nDATA;\n#1= IFCX();\n  #10=IFCY();\n#100=IFCZ();\n", [10, 1, 7]);
  assert.deepEqual([...m.entries()].sort((a, b) => a[0] - b[0]), [[1, 4], [10, 5]]);
});

test("summary and tally agree; a pair with only optional failures passes", () => {
  const a = run();
  const b = { model: "samples/tiny-house.ifc", ids: "samples/quantities-and-naming.ids.xml", report: check(file("samples/quantities-and-naming.ids.xml"), file("samples/tiny-house.ifc")) };
  const t = tally([a, b]);
  assert.equal(t.specs, a.report.specs.length + b.report.specs.length);
  assert.equal(t.passed + t.failed + t.warnings + t.invalid, t.specs);
  assert.equal(t.ok, false);
  assert.equal(tally([b]).ok, true);
  const md = stepSummary([a, b]);
  assert.match(md, /^## IDS model check: FAIL/);
  assert.match(md, /\| samples\/tiny-house\.ifc \| Quantities and naming \(starter IDS\) \| PASS \|/);
  assert.match(md, /\(Qto_\\\|Base\)/, "pipes in reasons are escaped for the table-free list too");
});

test("globs: **, *, ?, braces, and comma lists that keep brace commas", () => {
  const r = globToRegex("models/**/*.{ifc,ifczip}");
  assert.ok(r.test("models/a.ifc"));
  assert.ok(r.test("models/x/y/b.IFCZIP"));
  assert.ok(!r.test("models/a.ifcxml"));
  assert.ok(!r.test("other/a.ifc"));
  assert.ok(globToRegex("*.ids").test("a.ids") && !globToRegex("*.ids").test("d/a.ids"));
  assert.ok(globToRegex("**/*.ids").test("a.ids") && globToRegex("**/*.ids").test("d/e/a.ids"));
  assert.ok(globToRegex("./m?.ifc").test("m1.ifc"));
  assert.ok(globToRegex("a+b (1).ifc").test("a+b (1).ifc"));
  assert.deepEqual(patterns("models/*.{ifc,ifczip}, more/*.ifc\nthird.ifc"), ["models/*.{ifc,ifczip}", "more/*.ifc", "third.ifc"]);
});

test("pairing by name checks wall.ifc against wall*.ids, falling back to all", () => {
  const ids = ["req/wall.ids", "req/wall.structure.ids", "req/site.ids.xml"];
  assert.deepEqual(pairUp(["m/wall.ifc", "m/site.ifczip", "m/other.ifc"], ids, "name").map((p) => p.model + ">" + p.ids), [
    "m/wall.ifc>req/wall.ids", "m/wall.ifc>req/wall.structure.ids", "m/site.ifczip>req/site.ids.xml",
    "m/other.ifc>req/wall.ids", "m/other.ifc>req/wall.structure.ids", "m/other.ifc>req/site.ids.xml",
  ]);
  assert.equal(pairUp(["a.ifc", "b.ifc"], ids).length, 6);
});

test("ci-cli: globs, writes JUnit, BCF and GitHub outputs, and exits by --fail-on", () => {
  const dir = mkdtempSync(join(tmpdir(), "ids-ci-"));
  mkdirSync(join(dir, "models", "sub"), { recursive: true });
  mkdirSync(join(dir, "req"));
  copyFileSync(join(here, "samples/tiny-house.ifc"), join(dir, "models/sub/house one.ifc"));
  copyFileSync(join(here, "samples/tiny-house.ifczip"), join(dir, "models/house.ifczip"));
  copyFileSync(join(here, "samples/coordination-basics.ids.xml"), join(dir, "req/coordination.ids"));
  copyFileSync(join(here, "samples/quantities-and-naming.ids.xml"), join(dir, "req/quantities.ids"));
  writeFileSync(join(dir, "out.txt"), "");
  writeFileSync(join(dir, "sum.md"), "");
  const env = { ...process.env, GITHUB_ACTIONS: "true", GITHUB_OUTPUT: join(dir, "out.txt"), GITHUB_STEP_SUMMARY: join(dir, "sum.md") };
  const cli = (extra, e = env) => spawnSync(process.execPath, [join(here, "ci-cli.mjs"), "--root", dir, "--models", "models/**/*.{ifc,ifczip}", ...extra], { encoding: "utf8", env: e });

  const a = cli(["--ids", "req/*.ids", "--junit", join(dir, "r/j.xml"), "--bcf-dir", join(dir, "bcf")]);
  assert.equal(a.status, 1, a.stderr);
  assert.match(a.stdout, /FAIL: 4 pair\(s\)/);
  assert.match(a.stdout, /::error file=models\/sub\/house one\.ifc,line=23,/);
  assert.doesNotMatch(a.stdout, /house\.ifczip,line=/, "no line numbers inside a zip");
  assert.match(readFileSync(join(dir, "out.txt"), "utf8"), /^result=fail$/m);
  assert.match(readFileSync(join(dir, "sum.md"), "utf8"), /## IDS model check: FAIL/);
  parseXml(readFileSync(join(dir, "r/j.xml"), "utf8"));
  assert.ok(readdirSync(join(dir, "bcf")).length >= 2);

  // only the optional-heavy IDS: passes on error, fails on warning, never fails on never
  assert.equal(cli(["--ids", "req/quantities.ids"]).status, 0);
  assert.equal(cli(["--ids", "req/quantities.ids", "--fail-on", "warning"]).status, 1);
  assert.equal(cli(["--ids", "req/*.ids", "--fail-on", "never"]).status, 0);
  // no match is a usage error, not a pass
  const none = cli(["--ids", "nothing/*.ids"]);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /no IDS matched/);
  // outside Actions: no annotations unless asked
  const plain = cli(["--ids", "req/coordination.ids"], { ...process.env, GITHUB_ACTIONS: "" });
  assert.doesNotMatch(plain.stdout, /^::/m);
  assert.ok(existsSync(join(dir, "out.txt")));
});

test("action.yml calls ci-cli.mjs with every input it declares", () => {
  const y = file("action.yml");
  for (const k of ["models", "ids", "pairing", "fail-on", "junit", "bcf-dir", "json", "max-failures"]) assert.match(y, new RegExp(`^  ${k}:`, "m"), k);
  assert.match(y, /\$GITHUB_ACTION_PATH\/ci-cli\.mjs/);
  // inputs reach the shell through env, never pasted into the script
  assert.doesNotMatch(y.split("run: |")[1], /\$\{\{\s*inputs\./);
});

test("a model parsed once gives the same report for each IDS as a fresh parse, in any order", async () => {
  const idsFiles = ["samples/coordination-basics.ids.xml", "samples/quantities-and-naming.ids.xml"].map(file);
  for (const m of ["samples/tiny-house.ifc", "samples/tiny-house.ifcxml", "samples/tiny-house.ifczip"]) {
    const text = (await readModel(join(here, m))).text;
    const parsed = parseModel(text);
    const strip = (r) => JSON.stringify(r);
    for (const order of [[0, 1, 0], [1, 0, 1]]) {
      for (const i of order) assert.equal(strip(check(parseIds(idsFiles[i]), parsed)), strip(check(idsFiles[i], text)), `${m} IDS ${i}`);
    }
  }
});

test("ci-cli: a broken model or IDS fails only its own pairs", () => {
  const dir = mkdtempSync(join(tmpdir(), "ids-ci-bad-"));
  mkdirSync(join(dir, "m")); mkdirSync(join(dir, "r"));
  copyFileSync(join(here, "samples/tiny-house.ifc"), join(dir, "m/a.ifc"));
  writeFileSync(join(dir, "m/b.ifc"), "ISO-10303-21;\nHEADER;FILE_SCHEMA(('IFC9'));ENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n");
  copyFileSync(join(here, "samples/tiny-house.ifc"), join(dir, "m/c.ifc"));
  copyFileSync(join(here, "samples/quantities-and-naming.ids.xml"), join(dir, "r/q.ids"));
  writeFileSync(join(dir, "r/z.ids"), "<ids><not closed");
  const r = spawnSync(process.execPath, [join(here, "ci-cli.mjs"), "--root", dir, "--models", "m/*.ifc", "--ids", "r/*.ids", "--json", join(dir, "o.json"), "--fail-on", "never"], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } });
  assert.equal(r.status, 0, r.stderr);
  const runs = JSON.parse(readFileSync(join(dir, "o.json"), "utf8")).runs;
  const key = (x) => `${x.model} ${x.ids} ${x.error ? "error" : "ran"}`;
  assert.deepEqual(runs.map(key), ["m/a.ifc r/q.ids ran", "m/a.ifc r/z.ids error", "m/b.ifc r/q.ids error", "m/b.ifc r/z.ids error", "m/c.ifc r/q.ids ran", "m/c.ifc r/z.ids error"]);
  assert.match(runs[2].error, /not supported/);
  // the two good pairs agree, so nothing from a.ifc's parse leaked into c.ifc's
  assert.deepEqual(runs[0].report.specs, runs[4].report.specs);
});

test("maxFailed keeps the first N failing elements and the exact count", () => {
  const ifc = file("samples/tiny-house.ifc");
  let seen = 0;
  for (const ids of ["samples/coordination-basics.ids.xml", "samples/quantities-and-naming.ids.xml"].map(file)) {
  const full = check(ids, ifc), capped = check(ids, ifc, { maxFailed: 1 });
  for (const [i, s] of full.specs.entries()) {
    const c = capped.specs[i];
    assert.equal(c.status, s.status);
    assert.equal(failCount(c), failCount(s), s.name);
    assert.deepEqual(c.failed, s.failed.slice(0, 1));
    if (s.optionality !== "prohibited" && s.failed.length > 1) { seen++; assert.equal(c.failedCount, s.failed.length); }
    else assert.equal(c.failedCount, undefined);
  }
  assert.equal(tally([{ model: "m", ids: "i", report: capped }]).elementsFailed, tally([{ model: "m", ids: "i", report: full }]).elementsFailed);
  }
  assert.ok(seen > 0, "the sample has a spec with more than one failing element");
  const q = check(file("samples/quantities-and-naming.ids.xml"), ifc, { maxFailed: 1 });
  assert.match(stepSummary([{ model: "m", ids: "i", report: q }], { maxFailures: 1 }), /and 3 more \(see the JUnit, JSON or BCF report\)/);
});

// IDS has no inheritance: a facet naming IFCWALL leaves IfcWallStandardCase
// unchecked (ids.mjs skippedSubclasses). CI says so in every output, and fails
// on it only under --fail-on-unchecked (eval/ci-unchecked-2026-11-17.md).
const subModel = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('m.ifc','',(''),(''),'','','');", "FILE_SCHEMA(('IFC2X3'));", "ENDSEC;", "DATA;",
  "#1=IFCWALL('1hqIFTRjfV6AWq_bMtnZwI',$,'W1',$,$,$,$,$);",
  "#2=IFCWALLSTANDARDCASE('2hqIFTRjfV6AWq_bMtnZwI',$,'W2',$,$,$,$,$);",
  "#3=IFCWALLSTANDARDCASE('3hqIFTRjfV6AWq_bMtnZwI',$,$,$,$,$,$,$);",
  "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
const subIds = (cls) => `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>walls</title></info><specifications><specification name="Walls are named" ifcVersion="IFC2X3"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>${cls}</simpleValue></name></entity></applicability><requirements><attribute><name><simpleValue>Name</simpleValue></name></attribute></requirements></specification></specifications></ids>`;

test("unnamed subclasses: counted, in JUnit, annotations and the summary, the verdict unchanged", () => {
  const r = { model: "m.ifc", ids: "w.ids", report: check(subIds("IFCWALL"), subModel) };
  const s = r.report.specs[0];
  assert.equal(s.status, "pass");
  assert.equal(notChecked(s), 2);
  const t = tally([r]);
  assert.equal(t.ok, true);
  assert.equal(t.elementsNotChecked, 2);
  assert.equal(t.uncheckedSpecs, 1);
  const doc = parseXml(junitXml([r]));
  const tc = doc.children[0].children.find((c) => c.local === "testcase");
  assert.ok(!tc.children.some((k) => k.local === "failure"), "a pass stays a pass");
  assert.match(junitXml([r]), /<system-out>warning: not checked: 2 element\(s\).*IFCWALLSTANDARDCASE \(a subclass of IFCWALL\)/);
  const a = annotations([r]);
  assert.equal(a.length, 1);
  assert.match(a[0], /^::warning file=w\.ids,title=IDS%3A Walls are named%3A 2 element\(s\) not checked::/);
  assert.match(annotations([r], { failOnUnchecked: true })[0], /^::error /);
  const md = stepSummary([r]);
  assert.match(md, /## IDS model check: PASS/);
  assert.match(md, /\*\*Not checked:\*\* 2 element\(s\) in 1 specification check/);
  assert.match(md, /\| PASS \| 1 of 1 \| 0 \| 2 \|/);
  assert.match(md, /- \*\*Walls are named\*\*: 2 IFCWALLSTANDARDCASE \(a subclass of IFCWALL\)/);
  assert.match(stepSummary([r], { failOnUnchecked: true }), /## IDS model check: FAIL/);
  // Naming the subclass leaves nothing out: no warning anywhere.
  const r2 = { model: "m.ifc", ids: "w.ids", report: check(subIds("IFCWALLSTANDARDCASE"), subModel) };
  assert.equal(tally([r2]).elementsNotChecked, 0);
  // ...and the unnamed wall the IFCWALL facet never saw is now found.
  assert.equal(r2.report.specs[0].applicable, 2);
  assert.match(annotations([r2]).join("\n"), /1 of 2 element\(s\) fail .*#3 IFCWALLSTANDARDCASE/);
  assert.doesNotMatch(junitXml([r2]) + stepSummary([r2]), /not checked:|Not checked:\*\*/);
});

test("unnamed subclasses with no element of the named class: the JUnit skip says why", () => {
  const only = subModel.replace(/^#1=IFCWALL\(.*\n/m, "");
  const r = { model: "m.ifc", ids: "w.ids", report: check(subIds("IFCWALL"), only) };
  assert.equal(r.report.specs[0].applicable, 0);
  assert.match(junitXml([r]), /<skipped message="no element of the named class\(es\) matches the applicability; not checked: 2 element/);
});

test("ci-cli: --fail-on-unchecked turns the warning into a failing build, and GITHUB_OUTPUT counts it", () => {
  const dir = mkdtempSync(join(tmpdir(), "ids-unchecked-"));
  writeFileSync(join(dir, "m.ifc"), subModel);
  writeFileSync(join(dir, "w.ids"), subIds("IFCWALL"));
  writeFileSync(join(dir, "out.txt"), "");
  const env = { ...process.env, GITHUB_ACTIONS: "true", GITHUB_OUTPUT: join(dir, "out.txt"), GITHUB_STEP_SUMMARY: join(dir, "sum.md") };
  const cli = (extra) => spawnSync(process.execPath, [join(here, "ci-cli.mjs"), "--root", dir, "--models", "*.ifc", "--ids", "*.ids", ...extra], { encoding: "utf8", env });
  const a = cli([]);
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /warning: "Walls are named" \(m\.ifc vs w\.ids\): not checked: 2 element/);
  assert.match(a.stdout, /PASS: 1 pair\(s\).*2 element\(s\) not checked/);
  assert.match(a.stdout, /^::warning file=w\.ids,/m);
  assert.match(readFileSync(join(dir, "out.txt"), "utf8"), /^not-checked=2$/m);
  const b = cli(["--fail-on-unchecked"]);
  assert.equal(b.status, 1, b.stderr);
  assert.match(b.stdout, /^::error file=w\.ids,/m);
  assert.match(b.stdout, /FAIL: 1 pair\(s\)/);
  assert.match(readFileSync(join(dir, "out.txt"), "utf8"), /result=fail\n[^]*$/);
  assert.equal(cli(["--fail-on-unchecked", "--fail-on", "never"]).status, 0);
});

// IDS audit warnings (class-abstract and the rest) belong to the IDS file:
// annotated on the specification's line, once per file however many models,
// failing the build only under --fail-on-audit-warnings
// (eval/ci-audit-annotations-2026-11-17.md).
const absIds = [
  '<?xml version="1.0"?>',
  "<!-- a <specification> in a comment is not one -->",
  '<ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema">',
  "  <ids:info><ids:title>abstract</ids:title></ids:info>",
  "  <ids:specifications>",
  '    <ids:specification name="Walls are named" ifcVersion="IFC2X3">',
  '      <ids:applicability minOccurs="0" maxOccurs="unbounded"><ids:entity><ids:name><ids:simpleValue>IFCWALL</ids:simpleValue></ids:name></ids:entity></ids:applicability>',
  "      <ids:requirements><ids:attribute><ids:name><ids:simpleValue>Name</ids:simpleValue></ids:name></ids:attribute></ids:requirements>",
  "    </ids:specification>",
  "    <ids:specification",
  '        name="Elements have a material" ifcVersion="IFC2X3">',
  '      <ids:applicability minOccurs="1" maxOccurs="unbounded"><ids:entity><ids:name><ids:simpleValue>IFCBUILDINGELEMENT</ids:simpleValue></ids:name></ids:entity></ids:applicability>',
  "      <ids:requirements><ids:material/></ids:requirements>",
  "    </ids:specification>",
  "  </ids:specifications>",
  "</ids:ids>", ""].join("\n");

test("idsSpecLines: the line of each <specification> start tag, prefixes allowed, comments and <specifications> skipped", () => {
  assert.deepEqual(idsSpecLines(absIds), [6, 10]);
  assert.deepEqual(idsSpecLines(file("samples/coordination-basics.ids.xml")).length, parseIds(file("samples/coordination-basics.ids.xml")).specs.length);
  assert.deepEqual(idsSpecLines("<ids><![CDATA[<specification>]]><specification/></ids>"), [1]);
  assert.deepEqual(idsSpecLines(null), []);
});

test("IDS audit warnings: one annotation per IDS specification on its line, in JUnit and the summary, the verdict unchanged", () => {
  const rep = () => check(absIds, subModel);
  const runs = [{ model: "a.ifc", ids: "r.ids", report: rep() }, { model: "b.ifc", ids: "r.ids", report: rep() }];
  assert.equal(runs[0].report.specs[0].auditWarnings, undefined);
  assert.match(runs[0].report.specs[1].auditWarnings[0], /IFCBUILDINGELEMENT is abstract/);
  const found = auditFindings(runs);
  assert.equal(found.length, 1, "two models, one IDS: told once");
  assert.equal(found[0].index, 1);
  const t = tally(runs);
  assert.equal(t.auditSpecs, 1);
  assert.equal(t.auditWarnings, 1);
  const idsLines = new Map([["r.ids", idsSpecLines(absIds)]]);
  const a = annotations(runs, { idsLines }).filter((x) => /IDS audit/.test(x));
  assert.equal(a.length, 1);
  assert.match(a[0], /^::warning file=r\.ids,line=10,title=IDS audit%3A Elements have a material::IFCBUILDINGELEMENT is abstract/);
  assert.match(annotations(runs, { idsLines, failOnAudit: true }).find((x) => /IDS audit/.test(x)), /^::error file=r\.ids,line=10,/);
  // the unchecked-subclass annotation is per model, and now on the spec's line too
  assert.equal(annotations(runs, { idsLines }).filter((x) => /not checked/.test(x) && /file=r\.ids,line=10,/.test(x)).length, 2);
  assert.match(junitXml(runs), /IDS audit warning: IFCBUILDINGELEMENT is abstract/);
  const md = stepSummary(runs);
  assert.match(md, /\*\*IDS audit:\*\* 1 warning\(s\) on 1 specification\(s\)/);
  assert.match(md, /r\.ids: IDS audit warnings on 1 specification\(s\)<\/summary>/);
  assert.match(md, /- \*\*Elements have a material\*\*: IFCBUILDINGELEMENT is abstract/);
  assert.match(stepSummary(runs, { failOnAudit: true }), /## IDS model check: FAIL/);
  // the clean IDS gets none of it
  const clean = [{ model: "m.ifc", ids: "w.ids", report: check(subIds("IFCWALLSTANDARDCASE"), subModel) }];
  assert.equal(tally(clean).auditWarnings, 0);
  assert.doesNotMatch(annotations(clean).join("\n") + stepSummary(clean) + junitXml(clean), /IDS audit/);
});

test("an invalid specification is annotated once per IDS file, on its line", () => {
  const bad = subIds("IFCWALLL");
  const runs = ["a.ifc", "b.ifc"].map((model) => ({ model, ids: "w.ids", report: check(bad, subModel) }));
  assert.equal(runs[0].report.specs[0].status, "invalid");
  const a = annotations(runs, { idsLines: new Map([["w.ids", idsSpecLines(bad)]]) }).filter((x) => /Invalid IDS/.test(x));
  assert.equal(a.length, 1);
  assert.match(a[0], /^::error file=w\.ids,line=1,title=Invalid IDS specification%3A Walls are named::/);
});

test("ci-cli: audit warnings annotated on the IDS line, counted in GITHUB_OUTPUT, failing only under --fail-on-audit-warnings", () => {
  const dir = mkdtempSync(join(tmpdir(), "ids-audit-"));
  writeFileSync(join(dir, "a.ifc"), subModel);
  writeFileSync(join(dir, "b.ifc"), subModel);
  writeFileSync(join(dir, "r.ids"), absIds.replace("<ids:material/>", '<ids:attribute><ids:name><ids:simpleValue>Name</ids:simpleValue></ids:name></ids:attribute>').replace('minOccurs="1" maxOccurs="unbounded"><ids:entity><ids:name><ids:simpleValue>IFCBUILDINGELEMENT', 'minOccurs="0" maxOccurs="unbounded"><ids:entity><ids:name><ids:simpleValue>IFCBUILDINGELEMENT'));
  writeFileSync(join(dir, "out.txt"), "");
  const env = { ...process.env, GITHUB_ACTIONS: "true", GITHUB_OUTPUT: join(dir, "out.txt"), GITHUB_STEP_SUMMARY: join(dir, "sum.md") };
  const cli = (extra) => spawnSync(process.execPath, [join(here, "ci-cli.mjs"), "--root", dir, "--models", "*.ifc", "--ids", "*.ids", ...extra], { encoding: "utf8", env });
  const a = cli([]);
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.equal(a.stdout.match(/^::warning file=r\.ids,line=10,title=IDS audit/gm).length, 1);
  assert.match(a.stdout, /IDS audit warning: "Elements have a material" \(r\.ids\): IFCBUILDINGELEMENT is abstract/);
  assert.match(a.stdout, /PASS: 2 pair\(s\).*1 IDS audit warning\(s\)/);
  assert.match(readFileSync(join(dir, "out.txt"), "utf8"), /^audit-warnings=1$/m);
  assert.match(readFileSync(join(dir, "sum.md"), "utf8"), /\*\*IDS audit:\*\* 1 warning/);
  const b = cli(["--fail-on-audit-warnings"]);
  assert.equal(b.status, 1);
  assert.match(b.stdout, /^::error file=r\.ids,line=10,title=IDS audit/m);
  assert.match(b.stdout, /FAIL: 2 pair\(s\).*\(--fail-on-audit-warnings\)/);
  assert.equal(cli(["--fail-on-audit-warnings", "--fail-on", "never"]).status, 0);
});

test("IDS audit annotations past maxAudit become one pointer to the job summary", () => {
  const specs = Array.from({ length: 12 }, (_, i) => ({ name: `S${i}`, status: "pass", optionality: "required", applicable: 1, passed: 1, failed: [], auditWarnings: [`w${i}`] }));
  const runs = [{ model: "m.ifc", ids: "x.ids", report: { title: "t", specs } }];
  const a = annotations(runs);
  assert.equal(a.length, 10);
  assert.match(a[9], /^::warning file=x\.ids,title=IDS audit%3A 3 more specification\(s\) with warnings::.*job summary lists every/);
  assert.equal((stepSummary(runs).match(/^- \*\*S\d+\*\*: w\d+$/gm) || []).length, 12);
  assert.equal(annotations(runs, { maxAudit: 20 }).length, 12);
});

test("GitLab code quality: one issue per failing element on its STEP line, fingerprints keyed on GlobalId", () => {
  const r = run();
  const text = file("samples/tiny-house.ifc");
  const allIds = r.report.specs.flatMap((s) => s.failed.map((f) => f.id));
  const cq = codeQuality([r], { lines: new Map([[r.model, stepLines(text, allIds)]]) });
  const elements = r.report.specs.filter((s) => s.status === "fail").reduce((n, s) => n + Math.max(1, s.failed.length), 0);
  assert.equal(cq.length, elements);
  for (const i of cq) {
    assert.deepEqual(Object.keys(i).sort(), ["categories", "check_name", "description", "fingerprint", "location", "severity", "type"]);
    assert.match(i.fingerprint, /^[0-9a-f]{32}$/);
    assert.ok(["info", "minor", "major", "critical", "blocker"].includes(i.severity));
    assert.ok(Number.isInteger(i.location.lines.begin) && i.location.lines.begin >= 1);
  }
  assert.equal(new Set(cq.map((i) => i.fingerprint)).size, cq.length, "fingerprints unique");
  const wall = cq.find((i) => /1Lz5\$gbjv4GQ6_kuh4Wa3J/.test(i.description));
  assert.equal(wall.location.path, "samples/tiny-house.ifc");
  assert.equal(wall.location.lines.begin, 23);
  assert.equal(wall.severity, "critical");
  assert.equal(wall.check_name, "ids-required");
  // every element issue sits on its own #id= line
  const rows = text.split("\n");
  for (const s of r.report.specs) for (const f of s.failed) {
    const i = cq.find((x) => x.description.includes(`#${f.id} `) && x.description.includes(s.name));
    assert.match(rows[i.location.lines.begin - 1], new RegExp(`^#${f.id}=`));
  }
  assert.ok(cq.some((i) => i.severity === "minor" && i.check_name === "ids-optional"), "the optional spec is minor");
  // a re-export that renumbers every #id and shifts every line keeps the fingerprints
  const moved = text.replace(/#(\d+)/g, (_, n) => `#${Number(n) + 1000}`).replace("DATA;", "DATA;\n\n");
  const r2 = { ...r, report: check(file("samples/coordination-basics.ids.xml"), moved) };
  const cq2 = codeQuality([r2], { lines: new Map([[r.model, stepLines(moved, r2.report.specs.flatMap((s) => s.failed.map((f) => f.id)))]]) });
  assert.deepEqual(cq2.map((i) => i.fingerprint).sort(), cq.map((i) => i.fingerprint).sort());
  assert.equal(cq2.find((i) => /1Lz5\$gbjv4GQ6_kuh4Wa3J/.test(i.description)).location.lines.begin, 25);
  // the prefix GitLab needs when files were read under --root
  assert.equal(codeQuality([r], { pathPrefix: "bim/" })[0].location.path.startsWith("bim/samples/"), true);
  assert.equal(cqHash("a"), cqHash("a"));
  assert.notEqual(cqHash("a"), cqHash("b"));
});

test("GitLab code quality: audit warnings once per IDS on the spec line, invalid and unreadable as blockers, the cap", () => {
  const rep = () => check(absIds, subModel);
  const runs = [{ model: "a.ifc", ids: "r.ids", report: rep() }, { model: "b.ifc", ids: "r.ids", report: rep() }];
  const idsLines = new Map([["r.ids", idsSpecLines(absIds)]]);
  const cq = codeQuality(runs, { idsLines });
  const audit = cq.filter((i) => i.check_name === "ids-audit");
  assert.equal(audit.length, 1);
  assert.deepEqual(audit[0].location, { path: "r.ids", lines: { begin: 10 } });
  assert.equal(audit[0].severity, "minor");
  assert.equal(codeQuality(runs, { idsLines, failOnAudit: true }).find((i) => i.check_name === "ids-audit").severity, "major");
  assert.equal(cq.filter((i) => i.check_name === "ids-not-checked" && i.location.lines.begin === 10).length, 2, "per model");
  const bad = subIds("IFCWALLL");
  const inv = codeQuality(["a.ifc", "b.ifc"].map((model) => ({ model, ids: "w.ids", report: check(bad, subModel) })), { idsLines: new Map([["w.ids", idsSpecLines(bad)]]) });
  assert.equal(inv.filter((i) => i.check_name === "ids-invalid-specification").length, 1);
  assert.equal(inv[0].severity, "blocker");
  const err = codeQuality([{ model: "m.ifc", ids: "x.ids", error: "cannot read" }]);
  assert.deepEqual([err[0].check_name, err[0].severity, err[0].location.path], ["ids-unreadable", "blocker", "m.ifc"]);
  // past maxPerSpec failing elements, one "more" issue with the spec's own fingerprint
  const failed = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, type: "IFCWALL", globalId: `G${i}`, reasons: ["no name"] }));
  const many = [{ model: "m.ifc", ids: "x.ids", report: { specs: [{ name: "S", status: "fail", optionality: "required", applicable: 900, failed, failedCount: 800 }] } }];
  const capped = codeQuality(many, { maxPerSpec: 3 });
  assert.equal(capped.length, 4);
  assert.match(capped[3].description, /797 more element\(s\) fail \(800 of 900/);
  many[0].report.specs[0].failedCount = 801;
  assert.equal(codeQuality(many, { maxPerSpec: 3 })[3].fingerprint, capped[3].fingerprint, "a changed count stays one issue");
});

test("ci-cli: --gitlab-codequality writes the report with paths from the working directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "ids-gl-"));
  mkdirSync(join(dir, "bim", "models"), { recursive: true });
  copyFileSync(join(here, "samples/tiny-house.ifc"), join(dir, "bim", "models", "house.ifc"));
  copyFileSync(join(here, "samples/coordination-basics.ids.xml"), join(dir, "bim", "req.ids"));
  const r = spawnSync(process.execPath, [join(here, "ci-cli.mjs"), "--root", "bim", "--models", "models/*.ifc", "--ids", "*.ids", "--gitlab-codequality", "gl.json", "--fail-on", "never"], { encoding: "utf8", cwd: dir, env: { ...process.env, GITHUB_ACTIONS: "" } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const cq = JSON.parse(readFileSync(join(dir, "gl.json"), "utf8"));
  assert.ok(cq.length > 1);
  const wall = cq.find((i) => /1Lz5\$gbjv4GQ6_kuh4Wa3J/.test(i.description));
  assert.deepEqual(wall.location, { path: "bim/models/house.ifc", lines: { begin: 23 } });
});
