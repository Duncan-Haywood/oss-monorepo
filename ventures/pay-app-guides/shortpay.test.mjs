import { test } from "node:test";
import assert from "node:assert/strict";
import { letterText, parseChecks, parseDeductions, reconcile } from "./shortpay.mjs";

test("parses checks and deductions, with thousands separators and references", () => {
  const c = parseChecks("12,500.00, 2026-03-10, check 1042\n$2500\tACH 9921\n\nabc, 2026-01-01");
  assert.deepEqual(c.items, [
    { cents: 1_250_000, date: "2026-03-10", ref: "check 1042" },
    { cents: 250_000, date: "", ref: "ACH 9921" },
  ]);
  assert.equal(c.errors.length, 1);
  const d = parseDeductions("1,800, cleanup\n400");
  assert.deepEqual(d.items, [
    { cents: 180_000, reason: "cleanup" },
    { cents: 40_000, reason: "no reason given" },
  ]);
});

test("splits the gap into the certification cut, named deductions and the unexplained rest", () => {
  // Asked 45,000; certified 42,000; 1,800 backcharge; received 38,000: 2,200 unexplained.
  const r = reconcile({
    applied: "45,000",
    certified: "42000",
    checks: parseChecks("38000, 2026-03-10, check 1042").items,
    deductions: parseDeductions("1800, cleanup").items,
  });
  assert.equal(r.short, 700_000);
  assert.equal(r.cut, 300_000);
  assert.equal(r.deducted, 180_000);
  assert.equal(r.unexplained, 220_000);
  assert.deepEqual(r.findings.map((f) => f.level), ["medium", "medium", "high"]);
  assert.match(r.findings[2].text, /\$2,200\.00 is short with no reason given/);
  // Waivers: one unconditional for the check, none for the money not received.
  assert.match(r.waivers[0].text, /Unconditional progress waiver for \$38,000\.00, the payment received 2026-03-10 \(check 1042\)/);
  assert.match(r.waivers[1].text, /No unconditional waiver for the \$7,000\.00 not received/);
  const letter = letterText(r, { project: "Elm St clinic", number: "4", gc: "Harbor Builders" });
  assert.match(letter, /^Harbor Builders, we received \$38,000\.00 against pay application #4 on Elm St clinic/);
  assert.match(letter, /remaining \$2,200\.00/);
});

test("paid in full, overpaid, and missing inputs", () => {
  const full = reconcile({ applied: "100", checks: [{ cents: 10_000, date: "", ref: "" }] });
  assert.equal(full.short, 0);
  assert.match(full.findings[0].text, /Paid in full/);
  assert.equal(letterText(full), "");
  const over = reconcile({ applied: "100", checks: [{ cents: 20_000, date: "", ref: "" }] });
  assert.match(over.findings[0].text, /More came in/);
  assert.equal(reconcile({ applied: "" }).errors.length, 1);
  assert.equal(reconcile({ applied: "100", certified: "x" }).errors.length, 1);
});

test("deductions larger than the gap are flagged, not hidden", () => {
  const r = reconcile({
    applied: "1000",
    checks: [{ cents: 90_000, date: "", ref: "" }],
    deductions: [{ cents: 20_000, reason: "damage" }],
  });
  assert.equal(r.unexplained, -10_000);
  assert.match(r.findings.at(-1).text, /\$100\.00 more than the shortfall/);
});
