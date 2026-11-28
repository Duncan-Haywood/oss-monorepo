import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { REQUIREMENTS, FAMILIES } from "./sprs-data.mjs";
import { REQUIREMENT_TEXT } from "./policy-text.mjs";
import { SOURCE, render } from "./policy-text-sync.mjs";
import {
  POLICY_FAMILIES, familyRequirements, policyBody, policyDocument, policyManual, statementsFromSsp,
  namesFromSsp, markdownToHtml, coverage, reviewMonths,
} from "./policies.mjs";

test("policy-text.mjs is what policy-text-sync.mjs writes from CMMC Workspace's official text", { skip: !existsSync(SOURCE) && "app not in this checkout" }, () => {
  const official = JSON.parse(readFileSync(SOURCE, "utf8"));
  assert.equal(readFileSync(new URL("./policy-text.mjs", import.meta.url), "utf8"), render(official), "run node policy-text-sync.mjs");
});

test("every one of the 110 requirements has its official text, and the numbers match sprs-data", () => {
  assert.equal(REQUIREMENT_TEXT.size, 110);
  assert.deepEqual([...REQUIREMENT_TEXT.keys()], REQUIREMENTS.map((r) => r.id));
  for (const t of REQUIREMENT_TEXT.values()) assert.match(t, /^[A-Z].{20,}\.$/s);
  assert.equal(REQUIREMENT_TEXT.get("3.1.1"), "Limit system access to authorized users, processes acting on behalf of authorized users, and devices (including other systems).");
});

test("14 families, and their requirements add up to 110", () => {
  assert.equal(POLICY_FAMILIES.length, 14);
  assert.equal(POLICY_FAMILIES.reduce((n, f) => n + familyRequirements(f).length, 0), 110);
  assert.equal(familyRequirements("3.1").length, 22);
  assert.equal(familyRequirements("3.9").length, 2);
});

test("section 4 restates each requirement word for word (first letter lowered), nothing else", () => {
  const body = policyBody("3.9", { orgName: "Acme Machining" });
  const sec4 = body.split("## 4. Policy")[1].split("## 5.")[0];
  const bullets = sec4.split("\n").filter((l) => l.startsWith("- "));
  assert.equal(bullets.length, 2);
  for (const [i, r] of familyRequirements("3.9").entries()) {
    assert.equal(bullets[i], `- **${r.id}** ${r.text[0].toLowerCase()}${r.text.slice(1)}`);
  }
  assert.match(sec4, /Acme Machining will:/);
});

test("the requirement's first word is lowered to follow \"will:\"", () => {
  assert.match(policyBody("3.8", {}), /\*\*3\.8\.1\*\* protect \(i\.e\., physically control and securely store\)/);
});

test("procedures come only from the shop's statements; the rest says what to write", () => {
  const statements = new Map([["3.9.1", "HR runs a background check before a start date.\n# not a heading"]]);
  const body = policyBody("3.9", { statements });
  assert.match(body, /### 3\.9\.1\n\nHR runs a background check before a start date\.\n\\# not a heading/);
  assert.match(body, /### 3\.9\.2\n\n_No implementation statement yet\./);
  assert.deepEqual(coverage("3.9", statements), { total: 2, written: 1 });
});

test("names, owner and review interval are the shop's; an unknown interval falls back to 12", () => {
  const body = policyBody("3.6", { orgName: "Acme", systemName: "Acme CUI enclave", ownerName: "J. Ortiz", reviewMonths: 24 });
  assert.match(body, /applies to Acme CUI enclave,/);
  assert.match(body, /Policy owner \(J\. Ortiz\)/);
  assert.match(body, /at least every 24 months/);
  assert.match(body, /does not set a review interval; this one is Acme's choice/);
  assert.equal(reviewMonths(7), 12);
  assert.match(policyBody("3.6", {}), /The organization will:/);
  assert.throws(() => policyBody("3.99", {}));
});

test("a document is marked draft, never approved", () => {
  const doc = policyDocument("3.2", { orgName: "Acme | Sons" }, { today: "2026-11-28" });
  assert.match(doc, /^# Awareness and Training Policy\n/);
  assert.match(doc, /\| Status \| Draft \(not approved\) \|/);
  assert.match(doc, /\| Organization \| Acme \\\| Sons \|/);
  assert.match(doc, /\| Requirements covered \| 3\.2\.1, 3\.2\.2, 3\.2\.3 \|/);
  assert.doesNotMatch(doc, /Approved by/);
});

test("the manual holds the chosen families in NIST order, one heading level down", () => {
  const m = policyManual(["3.14", "3.1"], { orgName: "Acme" }, { today: "2026-11-28" });
  assert.match(m, /^# Security policies — Acme/);
  assert.ok(m.indexOf("## Access Control Policy") < m.indexOf("## System and Information Integrity Policy"));
  assert.match(m, /### 4\. Policy/);
  assert.doesNotMatch(m, /Awareness and Training Policy/);
});

test("statements and names come from an SSP template plan; junk is ignored", () => {
  const plan = { system: { name: "Shop CUI", organization: "Acme" }, requirements: { "3.1.1": { implementation: "  AD accounts only.  " }, "3.1.2": { implementation: "" }, "9.9.9": { implementation: "x" }, "3.2.1": { implementation: 5 } } };
  assert.deepEqual([...statementsFromSsp(plan)], [["3.1.1", "AD accounts only."]]);
  assert.deepEqual(namesFromSsp(plan), { systemName: "Shop CUI", orgName: "Acme" });
  assert.equal(statementsFromSsp(null).size, 0);
  assert.equal(statementsFromSsp({ requirements: "x" }).size, 0);
  assert.deepEqual(namesFromSsp(undefined), { systemName: "", orgName: "" });
});

test("HTML escapes everything the shop typed", () => {
  const statements = new Map([["3.9.1", '<script>alert(1)</script> **bold** <img src=x onerror="y">']]);
  const html = markdownToHtml(policyDocument("3.9", { orgName: "<b>Acme</b>", statements }), "<x>");
  assert.doesNotMatch(html, /<script>alert|<img|<b>Acme/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; <strong>bold<\/strong>/);
  assert.match(html, /<title>&lt;x&gt;<\/title>/);
  assert.match(html, /<h1>Personnel Security Policy<\/h1>/);
  assert.match(html, /<td>Organization<\/td><td>&lt;b&gt;Acme&lt;\/b&gt;<\/td>/);
  assert.match(html, /<blockquote><strong>Draft\.<\/strong>/);
  assert.match(html, /<li><strong>3\.9\.1<\/strong> screen individuals/);
});

test("every family renders to HTML with one list item per requirement", () => {
  for (const f of POLICY_FAMILIES) {
    const html = markdownToHtml(policyDocument(f, {}), "t");
    const sec4 = html.split("<h2>4. Policy</h2>")[1].split("<h2>5.")[0];
    assert.equal((sec4.match(/<li>/g) || []).length, familyRequirements(f).length, f);
    assert.ok(FAMILIES[f]);
  }
});
