import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { createPlainRunner } from "./plain-schematron.mjs";
import { runSchematron, schematronAvailable } from "./schematron.mjs";
import { hasSpecificFix } from "./schematron-fixes.mjs";

const ready = plainAvailable() && existsSync(new URL("./plain/en16931-ubl.json", import.meta.url));
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");

test("the clean example invoices pass the official rules, base and add-ons", { skip }, async () => {
  for (const name of ["xrechnung-cii-invoice.xml", "peppol-credit-note.xml", "peppol-nl-credit-note.xml", "xrechnung-cii-credit-note.xml"]) {
    const r = await runPlain(read(name));
    assert.equal(r.status, "ok", name);
    assert.deepEqual(r.findings.filter((f) => f.severity !== "information").map((f) => f.rule), [], name);
    assert.deepEqual(r.skipped, [], `${name}: every rule was evaluated`);
  }
});

test("the same defects the Saxon route finds, with English fixes", { skip }, async () => {
  const ubl = await runPlain(read("ubl-credit-note-with-defects.xml"));
  assert.deepEqual(ubl.findings.map((f) => f.rule).sort(), ["BR-CL-01", "BR-CO-14", "BR-CO-15", "DE-R-015", "PEPPOL-EN16931-P0101", "PEPPOL-EN16931-R003"]);
  const cii = await runPlain(read("xrechnung-cii-credit-note-with-defects.xml"));
  assert.deepEqual(cii.sets, ["en16931", "xrechnung"]);
  assert.deepEqual(cii.findings.map((f) => f.rule).sort(), ["BR-CL-01", "BR-CO-14", "BR-CO-17", "BR-DE-15", "BR-DE-17", "BR-DE-2", "BR-DE-TMP-32", "BR-S-09"]);
  for (const f of [...ubl.findings, ...cii.findings]) assert.ok(hasSpecificFix(f.rule), f.rule);
  assert.match(ubl.findings[0].path, /^\/Invoice\[1\]|^\/CreditNote\[1\]/);
});

test("Peppol's Dutch NL-R rules fire on a Dutch credit note, each with an English fix", { skip }, async () => {
  const r = await runPlain(read("peppol-nl-credit-note-with-defects.xml"));
  assert.deepEqual(r.sets, ["en16931", "peppol"]);
  assert.deepEqual(r.findings.map((f) => f.rule).sort(), ["NL-R-001", "NL-R-002", "NL-R-003"]);
  for (const f of r.findings) assert.ok(hasSpecificFix(f.rule), f.rule);
});

// The reference: every example must give the same rule at the same place as the
// compiled Saxon route, wherever both are built.
test("agrees with the Saxon SEF route on every example invoice", { skip: skip || (!schematronAvailable("ubl") && "run build-schematron.mjs") }, async (t) => {
  const key = (r) => r.findings.map((f) => `${f.rule}@${f.path}`).sort().join(" ");
  const files = readdirSync(new URL("./examples/", import.meta.url)).filter((f) => f.endsWith(".xml"));
  for (const name of files) {
    const ref = runSchematron(read(name));
    if (ref.status === "unavailable") return t.skip("saxon-js not installed");
    const mine = await runPlain(read(name));
    assert.equal(key(mine), key(ref), name);
    assert.deepEqual(mine.sets, ref.sets, name);
  }
});

test("a rule that fails to evaluate is reported as skipped, never as a pass", { skip }, () => {
  const fx = createRequire(import.meta.url)("fontoxpath");
  const runner = createPlainRunner({ fontoxpath: fx, parseXml: () => ({}) });
  const rules = { ns: {}, prolog: "", patterns: [{ id: "p", rules: [{ context: "/a", checks: [{ kind: "assert", id: "R-1", flag: "fatal", test: "xs:integer('x') = 1", text: "[R-1]-x" }] }] }] };
  const doc = createRequire(import.meta.url)("slimdom").parseXmlDocument("<a/>");
  const out = runner.runRules(rules, doc);
  assert.deepEqual([...out], []);
  assert.deepEqual(out.skipped, ["R-1"]);
});

test("a failed money equation is cleared when it is only floating-point noise", { skip }, () => {
  const req = createRequire(import.meta.url);
  const runner = createPlainRunner({ fontoxpath: req("fontoxpath"), parseXml: () => ({}) });
  const check = (id, test) => ({ kind: "assert", id, flag: "fatal", test, text: `[${id}]-m` });
  const rules = { ns: {}, prolog: "", patterns: [{ id: "p", rules: [{ context: "/a", checks: [check("NOISE", "0.1 + 0.2 = 0.3"), check("REAL", "0.1 + 0.2 = 0.31"), check("OR", "1 = 2 or 3 = 4")] }] }] };
  const out = runner.runRules(rules, req("slimdom").parseXmlDocument("<a/>"));
  assert.deepEqual(out.map((f) => f.rule), ["REAL", "OR"], "0.1+0.2=0.3 is noise; a real cent is not; a compound test is left alone");
});

// ---- the compiler -------------------------------------------------------------------
const compileReady = (() => { try { createRequire(import.meta.url)("slimdom"); return true; } catch { return false; } })();

async function compileText(files, main = "main.sch") {
  const { compileSchematron } = await import("./plain-compile.mjs");
  const dir = mkdtempSync(join(tmpdir(), "plain-compile-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return compileSchematron(join(dir, main));
}
const SCH = (body) => `<schema xmlns="http://purl.oclc.org/dsdl/schematron" xmlns:x="http://www.w3.org/1999/XSL/Transform">${body}</schema>`;

test("compiler: includes, global/pattern/rule lets are substituted into tests", { skip: !compileReady && "slimdom" }, async () => {
  const r = await compileText({
    "common.sch": `<pattern xmlns="http://purl.oclc.org/dsdl/schematron" id="vars"><let name="MAX" value="'3'"/></pattern>`,
    "main.sch": SCH(`<ns prefix="e" uri="urn:e"/><include href="common.sch"/><let name="ROOT" value="/e:a"/>
      <pattern id="p"><let name="LIM" value="number($MAX) + 1"/>
        <rule context="e:b"><let name="own" value="@v"/><assert id="T-1" flag="warning" test="$own &lt; $LIM and $ROOT/e:b">[T-1]-Too big</assert></rule></pattern>`),
  });
  assert.equal(r.patterns.length, 1, "a pattern that only declares variables is not a pattern");
  const check = r.patterns[0].rules[0].checks[0];
  assert.equal(check.test, "(@v) < (number(('3')) + 1) and (/e:a)/e:b");
  assert.equal(check.flag, "warning");
  assert.equal(check.text, "[T-1]-Too big");
});

test("compiler: rewrites xsl:function as XQuery and refuses what it cannot translate", { skip: !compileReady && "slimdom" }, async () => {
  const r = await compileText({
    "main.sch": SCH(`<ns prefix="u" uri="urn:u"/>
      <x:function name="u:even" as="xs:boolean"><x:param name="n" as="xs:integer"/><x:variable name="m" select="$n mod 2"/><x:sequence select="$m = 0"/></x:function>
      <pattern id="p"><rule context="/a"><assert id="F-1" test="u:even(@n)">[F-1]-odd</assert></rule></pattern>`),
  });
  assert.match(r.prolog, /declare function u:even\(\$n as xs:integer\) as xs:boolean \{ let \$m := \(\$n mod 2\) return \(\$m = 0\) \};/);
  assert.equal(r.patterns[0].rules[0].checks[0].xq, true);
  await assert.rejects(compileText({ "main.sch": SCH(`<pattern abstract="true" id="p"><rule context="/a"><assert test="true()">x</assert></rule></pattern>`) }), /abstract patterns/);
  await assert.rejects(compileText({ "main.sch": SCH(`<pattern id="p"><rule context="/a"><extends rule="r"/></rule></pattern>`) }), /unsupported <extends>/);
});

test("compiler: an IBAN-style mod 97 on a 24-digit string runs digit by digit", { skip: skip || (!compileReady && "slimdom") }, async () => {
  const r = await compileText({
    "main.sch": SCH(`<ns prefix="u" uri="urn:u"/>
      <pattern id="p"><rule context="/a"><assert id="M-1" test="xs:integer(string-join(for $c in string-to-codepoints(@d) return string($c - 48), '')) mod 97 = 1">[M-1]-no</assert></rule></pattern>`),
  });
  const req = createRequire(import.meta.url);
  const runner = createPlainRunner({ fontoxpath: req("fontoxpath"), parseXml: () => ({}) });
  const doc = (d) => req("slimdom").parseXmlDocument(`<a d="${d}"/>`);
  // 370400440532013000 mod 97 computed independently with BigInt
  const rem = (s) => Number(BigInt(s) % 97n);
  const good = "1".repeat(1) + "0".repeat(20) + "5";
  const target = rem(good) === 1 ? good : String(BigInt(good) + BigInt((98 - rem(good)) % 97));
  assert.equal(rem(target), 1);
  assert.deepEqual([...runner.runRules(r, doc(target))], [], "remainder 1 passes at 22+ digits");
  assert.deepEqual(runner.runRules(r, doc(String(BigInt(target) + 1n))).map((f) => f.rule), ["M-1"]);
});

test("the page route: manifest, bundled fontoxpath and rule files fetched by URL", { skip }, async () => {
  const { loadPlainRunner } = await import("./official-browser.mjs");
  const dir = new URL("./plain/", import.meta.url);
  const fetched = [];
  const fetchFn = async (url) => {
    fetched.push(url);
    const file = url.replace(/^.*plain\//, "");
    if (!existsSync(new URL(file, dir))) return { ok: false };
    return { ok: true, json: async () => JSON.parse(readFileSync(new URL(file, dir), "utf8")) };
  };
  const slimdom = createRequire(import.meta.url)("slimdom");
  const run = await loadPlainRunner({ base: "x/", fetchFn, importFn: () => import(new URL("fontoxpath.esm.js", dir).href), parseXml: (xml) => slimdom.parseXmlDocument(xml) });
  const r = await run(read("xrechnung-cii-credit-note-with-defects.xml"));
  assert.equal(r.status, "ok");
  assert.ok(r.findings.some((f) => f.rule === "BR-DE-2" && f.source === "xrechnung-schematron"));
  assert.deepEqual(fetched.filter((u) => u.endsWith(".json")).map((u) => u.replace(/^.*plain\//, "")), ["manifest.json", "en16931-cii.json", "xrechnung-cii.json"], "only the sets this invoice needs are downloaded");
  assert.equal((await run("<nope/>")).status, "unavailable");
});
