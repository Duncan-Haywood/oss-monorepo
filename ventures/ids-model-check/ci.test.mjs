import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { check, parseModel, parseIds, readModel } from "./node.mjs";
import { junitXml, annotations, stepSummary, tally, severity, failCount, stepLines, globToRegex, patterns, pairUp } from "./ci.mjs";
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
  for (const k of ["models", "ids", "pairing", "fail-on", "junit", "bcf-dir", "json"]) assert.match(y, new RegExp(`^  ${k}:`, "m"), k);
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
