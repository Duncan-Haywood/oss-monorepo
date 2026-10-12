import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCents, formatMoney, parseDate, addDays, formatDate, parseOptions, parsePhases, validUntil, optionTerms, ladder, rateCheck, check, reviewNotes, buildProposal, proposalText, contractHandoff, contractHandoffHash, DEFAULTS } from "./calc.mjs";

const full = {
  contractor: "Ada Dev", client: "Acme", title: "New website", proposalDate: "2026-10-01", validDays: "14",
  problem: "Your site loses visitors on mobile.", deliverables: "Home page\nPricing page",
  phases: "Design | 2\nBuild | 3", startDate: "2026-11-02",
  options: "Essentials | 3000 | Three pages\nStandard | 6000 | Five pages\nPremium | 11000 | Ten pages and SEO",
  depositPct: "40", whyMe: "Rebuilt a similar site, doubling signups.", assumptions: "Content supplied by client",
};

test("money parsing and formatting", () => {
  assert.equal(parseCents("$1,234.50"), 123450);
  assert.equal(parseCents("abc"), null);
  assert.equal(formatMoney(123450, "USD"), "$1,234.50");
  assert.equal(formatMoney(5000, "JPY"), "¥50");
});

test("dates are real, UTC and add across month ends and leap days", () => {
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2028-02-28", 2), "2028-03-01");
  assert.equal(formatDate("2026-10-01"), "October 1, 2026");
});

test("options parse, keep pipes in the description, and report bad rows", () => {
  const r = parseOptions("A | 100 | x | y\nBad line\nC | 0 | none");
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].includes, "x | y");
  assert.equal(r.problems.length, 2);
});

test("phases chain: each starts the day the previous ends", () => {
  const p = parsePhases("Design | 2\nBuild | 1.5", "2026-11-02");
  assert.deepEqual(p.rows.map((r) => [r.start, r.end]), [["2026-11-02", "2026-11-16"], ["2026-11-16", "2026-11-27"]]);
  assert.equal(p.totalWeeks, 3.5);
  assert.equal(p.finish, "2026-11-27");
  assert.equal(parsePhases("Design | 2", "").finish, null);
});

test("validity date and option deposits add to the price to the cent", () => {
  assert.equal(validUntil(full), "2026-10-15");
  assert.equal(validUntil({ ...full, proposalDate: "" }), null);
  for (const o of optionTerms({ ...full, options: "A | 33.33", depositPct: "33" })) assert.equal(o.deposit + o.balance, o.cents);
  assert.equal(optionTerms(full)[1].deposit, 240000);
});

test("ladder measures each option against the middle one", () => {
  const l = ladder(full);
  assert.deepEqual(l.map((x) => x.vsMidPct), [-50, 0, 83]);
  assert.deepEqual(ladder({ ...full, options: "Only | 100" }), []);
});

test("check flags what is missing and passes a complete proposal", () => {
  assert.deepEqual(check(full), []);
  const issues = check(DEFAULTS);
  assert.ok(issues.length >= 5);
  assert.ok(issues.some((i) => /priced option/.test(i)));
  assert.ok(check({ ...full, startDate: "2026-13-01" }).some((i) => /Start date/.test(i)));
});

test("review notes: single option, tight ladder, missing expiry", () => {
  assert.equal(reviewNotes(full).length, 0);
  assert.ok(reviewNotes({ ...full, options: "Only | 100" }).some((n) => /yes or no/.test(n)));
  assert.ok(reviewNotes({ ...full, options: "A | 100\nB | 105\nC | 110" }).some((n) => /close together/.test(n)));
  assert.ok(reviewNotes({ ...full, proposalDate: "" }).some((n) => /validity/.test(n)));
  assert.ok(reviewNotes({ ...full, depositPct: "0" }).some((n) => /deposit/.test(n)));
});

test("the proposal states dates, options, deposits and expiry", () => {
  const text = proposalText("New website", buildProposal(full));
  assert.match(text, /Option B: Standard: \$6,000\.00/);
  assert.match(text, /\$2,400\.00 on acceptance, \$3,600\.00 on delivery/);
  assert.match(text, /Design: 2 weeks, November 2, 2026 to November 16, 2026/);
  assert.match(text, /by October 15, 2026, when these prices and dates expire/);
  assert.match(text, /Total: 5 weeks, finishing around December 7, 2026/);
});

test("a single option reads as an investment, and the output is deterministic", () => {
  const one = buildProposal({ ...full, options: "Only | 500" });
  assert.ok(one.some((s) => s.title === "Investment"));
  assert.deepEqual(buildProposal(full), buildProposal(full));
});

test("an empty form still produces placeholders, not exceptions", () => {
  const s = buildProposal({});
  assert.match(s[0].body[0], /\[Client\] by \[Your name\]/);
});

test("rate check divides each option by your own hours, in order, and flags the ones under target", () => {
  const r = rateCheck({ ...full, options: "A | 3000\nB | 6000\nC | 11000", hours: "30\n55 hours\n0", targetRate: "100" });
  assert.deepEqual(r.map((x) => x.rate), [10000, 10909, null]);
  assert.deepEqual(r.map((x) => x.belowTarget), [false, false, false]);
  const low = rateCheck({ ...full, options: "A | 3000", hours: "40", targetRate: "100" })[0];
  assert.equal(low.rate, 7500);
  assert.equal(low.belowTarget, true);
  assert.equal(low.floorCents, 400000);
});

test("rate check needs both hours and a target before it says anything, and stays out of the proposal", () => {
  const input = { ...full, options: "A | 3000", hours: "40", targetRate: "" };
  assert.equal(rateCheck(input)[0].belowTarget, false);
  assert.equal(reviewNotes(input).some((n) => /an hour/.test(n)), false);
  const flagged = { ...input, targetRate: "100" };
  assert.ok(reviewNotes(flagged).some((n) => /\$75\.00 an hour/.test(n) && /at least \$4,000\.00/.test(n)));
  assert.doesNotMatch(proposalText("t", buildProposal(flagged)), /target|an hour|75\.00/i);
  assert.ok(check({ ...flagged, targetRate: "abc" }).some((n) => /Target hourly rate/.test(n)));
});

test("contract hand-off carries the chosen option and never the private numbers", () => {
  const f = contractHandoff({ ...full, hours: "30\n55\n90", targetRate: "120", contact: "x" }, 1);
  assert.equal(f.amount, "6000");
  assert.equal(f.depositPct, "40");
  assert.equal(f.effective, "2026-11-02");
  assert.equal(f.deliverables.split("\n")[0], "Standard: Five pages");
  assert.ok(!JSON.stringify(f).includes("120"));
  assert.equal(contractHandoff(full, 9), null);
  assert.ok(contractHandoffHash(full, 0).startsWith("#handoff="));
});

import { invoiceHandoffHash } from "./calc.mjs";
import { parseHandoff as parseInvoiceHandoff } from "../invoice-maker/calc.mjs";

test("deposit invoice hand-off carries the deposit line and survives the receiver's whitelist", () => {
  const i = parseInvoiceHandoff(invoiceHandoffHash(full, 1), "invoice", ["clientName", "terms", "customDays", "notes", "lines"]);
  assert.equal(i.lines[0].rate, "2400.00");
  assert.match(i.lines[0].desc, /Standard, 40% deposit/);
  assert.match(i.notes, /3600\.00/);
  assert.equal(invoiceHandoffHash(full, 9), null);
  assert.equal(parseInvoiceHandoff(invoiceHandoffHash({ ...full, depositPct: "0" }, 0), "invoice", ["lines"]).lines[0].rate, "3000.00");
});

import { parseLeadHandoff } from "./calc.mjs";
test("a lead-tracker hand-off fills only whitelisted text fields", () => {
  const h = "#handoff=" + encodeURIComponent(JSON.stringify({ v: 1, from: "freelance-lead-tracker", proposal: { client: "Acme", contact: "a@b.c", problem: "Needs a site", currency: "EUR", budget: "2500", title: "ignored", __proto__: { x: 1 } } }));
  assert.deepEqual(parseLeadHandoff(h), { client: "Acme", contact: "a@b.c", problem: "Needs a site", currency: "EUR" });
});
test("a lead hand-off from another source, malformed or empty is ignored", () => {
  const enc = (o) => "#handoff=" + encodeURIComponent(JSON.stringify(o));
  assert.equal(parseLeadHandoff(enc({ from: "other", proposal: { client: "x" } })), null);
  assert.equal(parseLeadHandoff("#handoff=%7Bnot"), null);
  assert.equal(parseLeadHandoff(enc({ from: "freelance-lead-tracker", proposal: { client: "  ", currency: "ZZZ" } })), null);
  assert.equal(parseLeadHandoff(""), null);
  assert.deepEqual(parseLeadHandoff(enc({ from: "freelance-lead-tracker", proposal: { client: "A", currency: "ZZZ" } })), { client: "A" });
});
