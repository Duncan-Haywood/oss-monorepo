// The plain route's XQuery prologs and the XPath the compiler rewrites for fontoxpath
// (2026-11-17, eval/pint-zatca-whitespace-2026-11-17.md). Until then Oman's PINT sets
// shipped a prolog that did not parse: u:vatBase's own $lines parameter had the global
// $lines pasted over it, so every Oman rule that needs the prolog (18 of them, the line
// net amount, the VAT breakdown sums, allowance percentages) was listed as "not checked"
// on every file. Two more (IBR-171-OM, ALIGNED-IBRP-S-08-OM) called functions fontoxpath
// lacks: adjust-date-to-timezone and XSLT's current().
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";

const require = createRequire(import.meta.url);
const skip = !plainAvailable() && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
// plain-compile.mjs imports slimdom, which CI's browser job does not install.
const { rewriteTimezone, rewriteCurrent } = skip ? {} : await import("./plain-compile.mjs");
const dir = new URL("./plain/", import.meta.url);
const sets = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "manifest.json");
const om = readFileSync(new URL("./examples/pint-current-jp-invoice.xml", import.meta.url), "utf8")
  .replace(/<cbc:CustomizationID>[^<]*/, "<cbc:CustomizationID>urn:peppol:pint:billing-1@om-1");
const rules = async (xml) => (await runPlain(xml)).findings.map((f) => f.rule);

test("every plain rule set's prolog parses", { skip }, () => {
  const fx = require("fontoxpath");
  const { parseXmlDocument } = require("slimdom");
  const doc = parseXmlDocument("<a/>");
  let n = 0;
  for (const f of sets) {
    const r = JSON.parse(readFileSync(new URL(f, dir)));
    if (!r.prolog) continue;
    n++;
    assert.doesNotThrow(() => fx.evaluateXPathToBoolean(`${r.prolog} true()`, doc, null, null, {
      namespaceResolver: (p) => r.ns?.[p] ?? null, language: fx.evaluateXPath.XQUERY_3_1_LANGUAGE,
    }), f);
  }
  assert.ok(n >= 30, `${n} sets with a prolog`);
});

test("no Oman rule is skipped on an Oman invoice", { skip }, async () => {
  const r = await runPlain(om);
  assert.deepEqual(r.sets, ["pint-om-1"]);
  assert.deepEqual(r.skipped, []);
});

test("IBR-071-OM (line net = quantity x price) now runs", { skip }, async () => {
  const base = await rules(om);
  assert.ok(!base.includes("IBR-071-OM"));
  const bad = om.replace(/(<cac:InvoiceLine>[\s\S]*?<cbc:LineExtensionAmount\b[^>]*>)([^<]*)/, (_, a, v) => `${a}${(Number(v) + 7).toFixed(2)}`);
  assert.notEqual(bad, om);
  assert.ok((await rules(bad)).includes("IBR-071-OM"));
});

test("IBR-171-OM: an issue date in the future, by Oman time", { skip }, async () => {
  assert.ok(!(await rules(om)).includes("IBR-171-OM"));
  const future = om.replace(/<cbc:IssueDate>[^<]*/, "<cbc:IssueDate>2099-01-01");
  assert.ok((await rules(future)).includes("IBR-171-OM"));
});

test("adjust-date(Time)-to-timezone calls are renamed; current() is bound to the context", { skip }, () => {
  assert.equal(rewriteTimezone("adjust-date-to-timezone(xs:date(.), ()) le fn:adjust-dateTime-to-timezone($x, $t)"),
    "u:adjust-date-to-timezone(xs:date(.), ()) le u:adjust-dateTime-to-timezone($x, $t)");
  assert.equal(rewriteTimezone("u:adjust-date-to-timezone(.)"), "u:adjust-date-to-timezone(.)");
  assert.equal(rewriteCurrent("sum(//a[@r = current()/@r])"), "let $schematron-current := . return (sum(//a[@r = $schematron-current/@r]))");
  assert.equal(rewriteCurrent("count(.) = 1"), "count(.) = 1");
});

test("the timezone helpers give F&O 3.1's own examples", { skip }, () => {
  const fx = require("fontoxpath");
  const r = JSON.parse(readFileSync(new URL("pint1-om-jur-ubl.json", dir)));
  const prolog = r.prolog.split("\n").filter((l) => /namespace u =|u:tz-string|u:adjust-/.test(l)).join("\n");
  const run = (e) => fx.evaluateXPathToString(`${prolog}\nstring(${e})`, null, null, null, { language: fx.evaluateXPath.XQUERY_3_1_LANGUAGE });
  const cases = {
    'u:adjust-dateTime-to-timezone(xs:dateTime("2002-03-07T10:00:00-07:00"), xs:dayTimeDuration("-PT10H"))': "2002-03-07T07:00:00-10:00",
    'u:adjust-dateTime-to-timezone(xs:dateTime("2002-03-07T10:00:00"), xs:dayTimeDuration("-PT10H"))': "2002-03-07T10:00:00-10:00",
    'u:adjust-dateTime-to-timezone(xs:dateTime("2002-03-07T10:00:00-07:00"), ())': "2002-03-07T10:00:00",
    'u:adjust-dateTime-to-timezone(xs:dateTime("2002-03-07T10:00:00-07:00"), xs:dayTimeDuration("PT10H"))': "2002-03-08T03:00:00+10:00",
    'u:adjust-date-to-timezone(xs:date("2002-03-07-07:00"), xs:dayTimeDuration("-PT10H"))': "2002-03-06-10:00",
    'u:adjust-date-to-timezone(xs:date("2002-03-07-07:00"), ())': "2002-03-07",
    'u:adjust-date-to-timezone(xs:date("2002-03-07"), xs:dayTimeDuration("-PT10H"))': "2002-03-07-10:00",
  };
  for (const [e, want] of Object.entries(cases)) assert.equal(run(e), want, e);
});
