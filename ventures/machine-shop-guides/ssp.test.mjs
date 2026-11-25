import test from "node:test";
import assert from "node:assert/strict";
import { REQUIREMENTS } from "./sprs-data.mjs";
import { emptySsp, normaliseSsp, applySprsAnswers, reviewSsp, sspToMarkdown, sspToHtml, poamToCsv, mdText, esc } from "./ssp.mjs";

function filled() {
  const d = emptySsp();
  Object.assign(d.system, {
    name: "Acme CUI enclave", organization: "Acme Machine LLC", cage: "1ABC2", version: "1.0",
    date: "2026-11-25", nextReview: "2027-11-25",
    description: "Quoting and machining of export-controlled parts.",
    boundary: "Estimator PC, CAM workstation, file server, GCC High tenant.",
    environment: "One building, office VLAN separated from shop floor.",
    connections: "MSP remote management agent on the file server.",
  });
  d.contacts[0].name = "Pat Owner";
  d.contacts[1].name = "Pat Owner";
  for (const r of REQUIREMENTS) d.requirements[r.id] = { status: "met", implementation: "Done like this.", evidence: "Screenshot in /evidence." };
  return d;
}

test("an empty plan is blocked on the 3.12.4 contents and has no statuses", () => {
  const rv = reviewSsp(emptySsp());
  assert.equal(rv.answered, 0);
  assert.ok(rv.blocking >= 5);
  for (const where of ["System name", "Organization", "System boundary", "Environment of operation", "Connections to other systems"]) {
    assert.ok(rv.issues.some((i) => i.level === "block" && i.where === where), where);
  }
});

test("a complete plan with everything met has no issues and scores 110", () => {
  const rv = reviewSsp(filled(), { today: "2026-11-25" });
  assert.deepEqual(rv.issues, []);
  assert.equal(rv.score.score, 110);
  assert.equal(rv.score.complete, true);
  assert.equal(rv.fullScoreDate, null);
});

test("gaps score by the Annex A weights; N/A counts as met; partial credit applies", () => {
  const d = filled();
  d.requirements["3.1.1"] = { status: "not_met", plannedAction: "Remove shared login", milestone: "2027-01-15" };
  d.requirements["3.5.3"] = { status: "partial", plannedAction: "MFA for all users", milestone: "2027-03-01", implementation: "MFA on VPN and admins." };
  d.requirements["3.1.16"] = { status: "na", naReason: "No wireless in the enclave." };
  const rv = reviewSsp(d, { today: "2026-11-25" });
  assert.equal(rv.score.score, 110 - 5 - 3);
  assert.equal(rv.fullScoreDate, "2027-03-01");
  assert.equal(rv.gapsWithoutDates, 0);
  assert.ok(!rv.issues.some((i) => i.where === "3.1.16"));
});

test("review flags met-without-statement, N/A without reason, gaps without dates and lapsed dates", () => {
  const d = filled();
  d.requirements["3.1.2"] = { status: "met" };
  d.requirements["3.1.3"] = { status: "met", implementation: "Firewall rules." };
  d.requirements["3.1.4"] = { status: "na" };
  d.requirements["3.1.5"] = { status: "not_met" };
  d.requirements["3.1.6"] = { status: "not_met", plannedAction: "x", milestone: "2026-01-01" };
  d.system.nextReview = "2026-06-01";
  const rv = reviewSsp(d, { today: "2026-11-25" });
  const msg = (id) => rv.issues.filter((i) => i.where === id).map((i) => i.message).join(" ");
  assert.match(msg("3.1.2"), /no implementation statement/);
  assert.match(msg("3.1.3"), /no evidence location/);
  assert.match(msg("3.1.4"), /no reason/);
  assert.match(msg("3.1.5"), /no planned action/);
  assert.match(msg("3.1.6"), /has passed/);
  assert.match(msg("Next review date"), /has passed/);
  assert.equal(rv.fullScoreDate, null, "a gap without a milestone leaves the 110 date unset");
});

test("3.12.4 not met blocks and means no score", () => {
  const d = filled();
  d.requirements["3.12.4"] = { status: "not_met", plannedAction: "write it", milestone: "2027-01-01" };
  const rv = reviewSsp(d);
  assert.ok(rv.issues.some((i) => i.level === "block" && i.where === "3.12.4"));
  assert.equal(rv.score.sspMissing, true);
  assert.match(sspToMarkdown(d), /none, 3\.12\.4 not met/);
});

test("normalise drops unknown keys, bad statuses, bad dates, prototype keys and control characters", () => {
  const raw = JSON.parse('{"system":{"name":"A\\u0000B","date":"tomorrow","evil":"x"},"requirements":{"__proto__":{"status":"met"},"3.1.1":{"status":"partial"},"3.5.3":{"status":"partial","milestone":"soon","extra":1},"9.9.9":{"status":"met"}},"contacts":"nope"}');
  const d = normaliseSsp(raw);
  assert.equal(d.system.name, "AB");
  assert.equal(d.system.date, "");
  assert.equal("evil" in d.system, false);
  assert.equal(d.requirements["3.1.1"], undefined, "partial is only for 3.5.3 and 3.13.11");
  assert.equal(d.requirements["3.5.3"].status, "partial");
  assert.equal(d.requirements["3.5.3"].milestone, "");
  assert.equal("extra" in d.requirements["3.5.3"], false);
  assert.equal(d.requirements["9.9.9"], undefined);
  assert.equal(Object.getPrototypeOf(d.requirements), Object.prototype);
  assert.equal(d.contacts.length, 4);
  assert.deepEqual(normaliseSsp(null), emptySsp());
  assert.deepEqual(normaliseSsp([1, 2]), emptySsp());
  assert.equal(normaliseSsp({ system: { description: "x".repeat(20000) } }).system.description.length, 8000);
});

test("a plan round-trips through JSON unchanged", () => {
  const d = filled();
  d.requirements["3.1.1"] = { status: "not_met", implementation: "", responsible: "Pat", evidence: "", provider: "MSP", plannedAction: "Fix", milestone: "2027-01-01", naReason: "" };
  const once = normaliseSsp(d);
  assert.deepEqual(normaliseSsp(JSON.parse(JSON.stringify(once))), once);
});

test("SPRS calculator answers set statuses without overwriting statements", () => {
  const d = emptySsp();
  d.requirements["3.1.1"] = { status: "not_met", implementation: "Keep me" };
  const out = applySprsAnswers(d, { "3.1.1": "met", "3.1.2": "not_met", "3.5.3": "partial", "3.1.3": "partial", "3.1.4": "bogus" });
  assert.equal(out.requirements["3.1.1"].status, "met");
  assert.equal(out.requirements["3.1.1"].implementation, "Keep me");
  assert.equal(out.requirements["3.1.2"].status, "not_met");
  assert.equal(out.requirements["3.5.3"].status, "partial");
  assert.equal(out.requirements["3.1.3"], undefined);
  assert.equal(out.requirements["3.1.4"], undefined);
});

test("Markdown has every requirement once and renders user text literally", () => {
  const d = filled();
  d.system.name = "# Hi [x](javascript:alert(1)) <b>";
  d.requirements["3.1.1"].implementation = "1. first\n- second\n<script>alert(1)</script>";
  const md = sspToMarkdown(d);
  for (const r of REQUIREMENTS) assert.equal(md.split(`\n#### ${r.id} `).length, 2, r.id);
  assert.ok(md.startsWith("# System Security Plan: \\# Hi \\[x\\]\\(javascript:alert\\(1\\)\\) \\<b\\>"));
  assert.doesNotMatch(md, /<script>/);
  assert.match(md, /\\1\. first/);
  assert.equal(mdText("a|b"), "a\\|b");
});

test("HTML escapes every user field and contains no script", () => {
  const d = filled();
  const evil = `"><img src=x onerror=alert(1)><script>alert(2)</script>'`;
  d.system.name = evil;
  d.system.boundary = evil;
  d.contacts[2] = { role: "x", name: evil, email: evil, phone: evil };
  d.requirements["3.1.1"] = { status: "not_met", implementation: evil, responsible: evil, evidence: evil, provider: evil, plannedAction: evil, milestone: "2027-01-01" };
  const html = sspToHtml(d);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal(esc(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
  assert.ok(html.startsWith("<!doctype html>"));
});

test("POA&M CSV lists gaps heaviest first with plan fields, formula-safe", () => {
  const d = filled();
  d.requirements["3.1.8"] = { status: "not_met", plannedAction: "=HYPERLINK(\"x\")", responsible: "Pat", milestone: "2027-02-01" };
  d.requirements["3.1.1"] = { status: "not_met", plannedAction: "Remove shared login, then audit", responsible: "Pat", milestone: "2027-01-01", provider: "MSP" };
  const lines = poamToCsv(d).trim().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^3\.1\.1,.*,5,Not met,/);
  assert.match(lines[1], /"Remove shared login, then audit",Pat,2027-01-01,MSP$/);
  assert.match(lines[2], /^3\.1\.8,/);
  assert.match(lines[2], /"'=HYPERLINK\(""x""\)"/);
});

test("an open 170.21(a)(2)(iii) requirement is flagged and marked not POA&M-eligible", () => {
  const d = filled();
  d.requirements["3.10.3"] = { status: "not_met", plannedAction: "Visitor log and escort rule", responsible: "Pat", milestone: "2027-01-01" };
  d.requirements["3.1.3"] = { status: "not_met", plannedAction: "Firewall rules", responsible: "Pat", milestone: "2027-01-01" };
  const rv = reviewSsp(d, { today: "2026-11-25" });
  assert.match(rv.issues.filter((i) => i.where === "3.10.3").map((i) => i.message).join(" "), /never allows this requirement on a POA&M/);
  assert.ok(!rv.issues.some((i) => i.where === "3.1.3" && /never allows/.test(i.message)));
  assert.deepEqual(rv.score.conditional.prohibited, ["3.10.3"]);
  const lines = poamToCsv(d).trim().split("\n");
  assert.match(lines[0], /,POA&M allowed \(32 CFR 170\.21\),/);
  assert.match(lines.find((l) => l.startsWith("3.10.3,")), /,No: listed in 32 CFR 170\.21\(a\)\(2\)\(iii\); must be met,/);
  assert.match(lines.find((l) => l.startsWith("3.1.3,")), /,Not met,Yes,/);
});
