import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toCents, percentOf, addDays, addMonths, daysBetween, splitLines, normalizeProposal, pricingOptions, depositFor, phaseDates, finishDate,
  paymentSchedule, clauseTexts, status, proposalValue, nextNumber, duplicateNumbers, pipeline, duplicateProposal, validUntil, validate,
  followUps, followUpText, renderProposal, standaloneHtml, toEstimateDraft, parseBackup, mergeProposals, proposalsToCsv, esc, LEGAL_NOTICE,
} from "./calc.mjs";

const base = (over = {}) => normalizeProposal({
  id: "p1", number: "PROP-0001", status: "sent", sentOn: "2026-10-01", fromName: "Ana Dev", clientName: "Acme", title: "Website rebuild",
  issued: "2026-10-01", validDays: "30", validUntil: "2026-10-31", currency: "USD", startDate: "2026-11-02",
  deliverables: [{ name: "Marketing site", included: "5 pages\nContact form", excluded: "Copywriting\nHosting" }],
  phases: [{ name: "Design", days: "10" }, { name: "Build", days: "14" }],
  model: "fixed", options: [{ name: "", lines: [{ desc: "Design", qty: 1, rate: "3000" }, { desc: "Build", qty: 40, rate: "100" }] }],
  taxRate: "0", depositType: "percent", depositValue: "30",
  milestones: [{ label: "Design approved", percent: "30", when: "After design sign-off" }],
  ...over,
});

test("money helpers use integer cents", () => {
  assert.equal(toCents("$1,234.56"), 123456);
  assert.equal(toCents("abc"), 0);
  assert.equal(percentOf(10001, 10), 1000);
  assert.equal(percentOf(-1005, 10), -101);
});

test("date helpers: addDays, addMonths clamp, daysBetween", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("nope", 1), "");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-15", 2), "2027-01-15");
  assert.equal(daysBetween("2026-10-01", "2026-10-11"), 10);
  assert.equal(validUntil("2026-10-01", 30), "2026-10-31");
});

test("splitLines strips bullets and blanks", () => {
  assert.deepEqual(splitLines("- a\n\n * b \n• c"), ["a", "b", "c"]);
});

test("fixed price: lines, tax, one option", () => {
  const p = base({ taxRate: "10" });
  const [o] = pricingOptions(p);
  assert.equal(o.subtotal, 700000);
  assert.equal(o.tax, 70000);
  assert.equal(o.total, 770000);
  assert.equal(proposalValue(p), 770000);
});

test("good-better-best: three priced options, lowest counts until one is accepted", () => {
  const p = base({
    model: "tiers",
    options: [
      { name: "Starter", lines: [{ desc: "x", qty: 1, rate: "1000" }] },
      { name: "Standard", lines: [{ desc: "x", qty: 1, rate: "2500" }] },
      { name: "Premium", lines: [{ desc: "x", qty: 1, rate: "4000" }] },
      { name: "Ignored fourth", lines: [{ desc: "x", qty: 1, rate: "9000" }] },
    ],
  });
  assert.equal(p.options.length, 3);
  assert.deepEqual(pricingOptions(p).map((o) => o.total), [100000, 250000, 400000]);
  assert.equal(proposalValue(p), 100000);
  const won = { ...p, status: "accepted", acceptedOption: 2 };
  assert.equal(proposalValue(won), 400000);
});

test("hourly with cap: estimate, cap and tax", () => {
  const p = base({ model: "hourly", hourly: { rate: "150", hours: "20", capHours: "25" }, taxRate: "8" });
  const [o] = pricingOptions(p);
  assert.equal(o.subtotal, 300000);
  assert.equal(o.total, 324000);
  assert.equal(o.cap, 405000);
  assert.ok(validate(p).every((m) => !/cap/i.test(m)));
  assert.ok(validate({ ...p, hourly: { rate: "150", hours: "20", capHours: "" } }).some((m) => /cap/i.test(m)));
  assert.ok(validate({ ...p, hourly: { rate: "150", hours: "20", capHours: "10" } }).some((m) => /below/i.test(m)));
});

test("retainer: months of fee, monthly schedule dated from the start", () => {
  const p = base({ model: "retainer", retainer: { monthly: "2000", months: "3", hours: "10", overageRate: "120" }, taxRate: "10", startDate: "2026-11-30" });
  const [o] = pricingOptions(p);
  assert.equal(o.total, 3 * 220000);
  const rows = paymentSchedule(p);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.due), ["2026-11-30", "2026-12-30", "2027-01-30"]);
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), o.total);
});

test("deposit: percent, flat, capped, off", () => {
  assert.equal(depositFor({ depositType: "percent", depositValue: "25" }, 110800), 27700);
  assert.equal(depositFor({ depositType: "amount", depositValue: "500" }, 110800), 50000);
  assert.equal(depositFor({ depositType: "amount", depositValue: "5000" }, 110800), 110800);
  assert.equal(depositFor({ depositType: "none" }, 110800), 0);
  assert.equal(depositFor({ depositType: "percent", depositValue: "25" }, 0), 0);
});

test("payment schedule always adds up to the total, with the balance as the remainder", () => {
  const p = base({ options: [{ name: "", lines: [{ desc: "x", qty: 1, rate: "1000.01" }] }], depositValue: "33", milestones: [{ label: "Draft", percent: "33.3", when: "" }, { label: "Beta", percent: "10", when: "Beta" }] });
  const rows = paymentSchedule(p);
  const total = pricingOptions(p)[0].total;
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), total);
  assert.equal(rows[0].label, "Deposit to book the work");
  assert.equal(rows.at(-1).label, "Final balance");
  assert.equal(rows[1].due, "On completion of this milestone");
});

test("no deposit and no milestones: one full-payment row", () => {
  const p = base({ depositType: "none", milestones: [] });
  const rows = paymentSchedule(p);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "Full payment");
  assert.equal(rows[0].amount, 700000);
});

test("hourly schedule is deposit plus an as-invoiced row", () => {
  const p = base({ model: "hourly", hourly: { rate: "100", hours: "10", capHours: "12" } });
  const rows = paymentSchedule(p);
  assert.equal(rows.at(-1).amount, null);
  assert.match(rows.at(-1).due, /Net 14/);
});

test("timeline: phases run back to back from the start date", () => {
  const p = base();
  const ph = phaseDates(p);
  assert.deepEqual(ph.map((x) => [x.start, x.end]), [["2026-11-02", "2026-11-11"], ["2026-11-12", "2026-11-25"]]);
  assert.equal(finishDate(p), "2026-11-25");
  assert.equal(finishDate(base({ startDate: "" })), "");
});

test("status: draft, sent, expired, accepted, declined", () => {
  const p = base();
  assert.equal(status({ ...p, status: "draft" }, "2026-10-05"), "draft");
  assert.equal(status(p, "2026-10-05"), "sent");
  assert.equal(status(p, "2026-11-05"), "expired");
  assert.equal(status({ ...p, status: "accepted" }, "2026-12-05"), "accepted");
  assert.equal(status({ ...p, status: "declined" }, "2026-10-05"), "declined");
});

test("pipeline: win rate counts decided proposals only", () => {
  const mk = (id, st, rate, valid = "2026-12-31") => base({ id, number: id, status: st, validUntil: valid, options: [{ name: "", lines: [{ desc: "x", qty: 1, rate }] }] });
  const list = [mk("a", "accepted", "1000"), mk("b", "declined", "500"), mk("c", "sent", "2000"), mk("d", "sent", "300", "2026-09-01"), mk("e", "draft", "9999")];
  const p = pipeline(list, "2026-10-07");
  assert.equal(p.sent, 4);
  assert.equal(p.accepted, 1);
  assert.equal(p.expired, 1);
  assert.equal(p.open, 1);
  assert.equal(p.openValue, 200000);
  assert.equal(p.wonValue, 100000);
  assert.equal(p.winRate, 1 / 3);
  assert.equal(pipeline([mk("e", "draft", "1")], "2026-10-07").winRate, null);
});

test("numbering and duplicates", () => {
  assert.equal(nextNumber([{ number: "PROP-0009" }, { number: "X" }]), "PROP-0010");
  assert.equal(nextNumber([]), "PROP-0001");
  assert.deepEqual(duplicateNumbers([{ number: "A" }, { number: "A" }, { number: "B" }]), ["A"]);
});

test("duplicateProposal restarts as a draft with a new id, number and dates", () => {
  const c = duplicateProposal(base({ status: "accepted", acceptedOption: 1 }), { id: "p2", number: "PROP-0002", today: "2026-10-07" });
  assert.equal(c.id, "p2");
  assert.equal(c.number, "PROP-0002");
  assert.equal(c.status, "draft");
  assert.equal(c.sentOn, "");
  assert.equal(c.issued, "2026-10-07");
  assert.equal(c.validUntil, "2026-11-06");
  assert.equal(c.title, "Website rebuild");
});

test("clause text is generic template wording that follows the terms entered", () => {
  const p = base({ terms: { revisionRounds: "3", netDays: "30", lateFeePct: "1.5", feedbackDays: "7", killFeePct: "20", changeRate: "125" } });
  const c = Object.fromEntries(clauseTexts(p).map((x) => [x.key, x.text]));
  assert.match(c.changeOrders, /\$125\.00 per hour/);
  assert.match(c.changeOrders, /in writing/);
  assert.match(c.revisions, /3 rounds/);
  assert.match(c.payment, /30 days/);
  assert.match(c.payment, /1\.5% per month/);
  assert.match(c.clientResponsibilities, /7 business days/);
  assert.match(c.termination, /20%/);
  const off = base({ clauses: { changeOrders: false } });
  assert.ok(!clauseTexts(off).some((x) => x.key === "changeOrders"));
  assert.ok(clauseTexts(base({ customTerms: "Travel is billed at cost." })).some((x) => x.key === "custom"));
});

test("clause text never promises legal effect or says it is legal advice", () => {
  const all = clauseTexts(base()).map((c) => c.text).join(" ");
  assert.doesNotMatch(all, /legally binding|enforceable|guarantee/i);
  assert.match(LEGAL_NOTICE, /not legal advice/i);
  assert.match(LEGAL_NOTICE, /lawyer/i);
});

test("validate flags the things that cause disputes", () => {
  const good = base();
  assert.deepEqual(validate(good), []);
  assert.ok(validate({ ...good, deliverables: [{ name: "Site", included: "x", excluded: "" }] }).some((m) => /excluded/.test(m)));
  assert.ok(validate({ ...good, validUntil: "" }).some((m) => /expiry/.test(m)));
  assert.ok(validate({ ...good, phases: [] }).some((m) => /phase/.test(m)));
  assert.ok(validate({ ...good, model: "tiers" }).some((m) => /second option/.test(m)));
  assert.ok(validate({ ...good, depositValue: "90" }).some((m) => /more than the total/.test(m)));
});

test("normalizeProposal fills defaults, drops junk and caps lists", () => {
  const n = normalizeProposal({ model: "bogus", status: "weird", options: "x", phases: Array(40).fill({ name: "p" }), evil: 1 });
  assert.equal(n.model, "fixed");
  assert.equal(n.status, "draft");
  assert.equal(n.phases.length, 20);
  assert.equal(n.options.length, 1);
  assert.ok(!("evil" in n));
  assert.equal(normalizeProposal(null).clauses.payment, true);
});

test("renderProposal escapes every user-typed field", () => {
  const evil = `<img src=x onerror=alert(1)>"'&`;
  const p = base({
    fromName: evil, fromEmail: evil, fromAddr: evil, clientName: evil, clientContact: evil, clientEmail: evil, clientAddr: evil, title: evil, number: evil,
    summary: evil, problem: evil, goals: evil, assumptions: evil, customTerms: evil, validUntil: evil, issued: evil,
    deliverables: [{ name: evil, included: evil, excluded: evil }],
    phases: [{ name: evil, days: "3", notes: evil }],
    options: [{ name: evil, lines: [{ desc: evil, qty: evil, rate: "10" }] }],
    milestones: [{ label: evil, percent: "10", when: evil }],
  });
  for (const model of ["fixed", "tiers"]) {
    const html = renderProposal({ ...p, model, options: [p.options[0], p.options[0]] }, { today: "2026-10-07" });
    assert.ok(!html.includes("<img"), model);
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"), model);
  }
  assert.equal(esc(evil).includes("<"), false);
});

test("renderProposal covers each pricing model and carries the sections a client expects", () => {
  for (const model of ["fixed", "tiers", "hourly", "retainer"]) {
    const html = renderProposal(base({ model, summary: "S", problem: "P", goals: "G1\nG2", assumptions: "A1", hourly: { rate: "100", hours: "10", capHours: "12" }, retainer: { monthly: "1000", months: "2", hours: "8", overageRate: "" }, options: [{ name: "A", lines: [{ desc: "d", qty: 1, rate: "100" }] }, { name: "B", lines: [{ desc: "d", qty: 1, rate: "200" }] }] }));
    for (const s of ["Project summary", "The problem", "Goals", "Scope", "Not included", "Timeline", "Investment", "Payment schedule", "Assumptions", "Terms", "Acceptance", "Change orders", "Signature"]) {
      assert.ok(html.includes(s), `${model}: ${s}`);
    }
    assert.ok(html.includes("not legal advice"), model);
  }
});

test("toEstimateDraft maps each model into Estimate Maker's schema", () => {
  const t = toEstimateDraft(base({ taxRate: "5" }), { number: "EST-0003", issued: "2026-10-07" });
  assert.equal(t.id, "from-p1");
  assert.equal(t.number, "EST-0003");
  assert.equal(t.clientName, "Acme");
  assert.equal(t.options.length, 1);
  assert.equal(t.options[0].lines.length, 2);
  assert.equal(t.taxRate, "5");
  assert.equal(t.validUntil, "2026-11-06");
  assert.match(t.scope, /not included: Copywriting; Hosting/);
  const tiers = toEstimateDraft(base({ model: "tiers", options: [{ name: "A", lines: [{ desc: "x", qty: 1, rate: "5" }] }, { name: "B", lines: [{ desc: "x", qty: 1, rate: "9" }] }] }), { number: "EST-1", issued: "2026-10-07" });
  assert.deepEqual(tiers.options.map((o) => o.name), ["A", "B"]);
  const hourly = toEstimateDraft(base({ model: "hourly", hourly: { rate: "90", hours: "12", capHours: "" } }), { number: "EST-1", issued: "2026-10-07" });
  assert.equal(hourly.options[0].lines[0].qty, "12");
  const ret = toEstimateDraft(base({ model: "retainer", retainer: { monthly: "500", months: "4", hours: "5", overageRate: "" } }), { number: "EST-1", issued: "2026-10-07" });
  assert.equal(ret.options[0].lines[0].rate, "500.00");
});

test("backup: parse, reject non-backups, merge without overwriting", () => {
  const a = base();
  const text = JSON.stringify({ proposals: [a, { id: "", number: "bad" }, 5], profile: { fromName: "x" } });
  const parsed = parseBackup(text);
  assert.equal(parsed.proposals.length, 1);
  assert.equal(parseBackup("not json"), null);
  assert.equal(parseBackup(JSON.stringify({ estimates: [] })), null);
  const merged = mergeProposals([a], [normalizeProposal({ ...a, title: "changed" }), normalizeProposal({ id: "p9" })]);
  assert.equal(merged.added, 1);
  assert.equal(merged.skipped, 1);
  assert.equal(merged.proposals.find((p) => p.id === "p1").title, "Website rebuild");
});

test("CSV export neutralises spreadsheet formulas and quotes commas", () => {
  const csv = proposalsToCsv([base({ clientName: "=HYPERLINK(\"x\")", title: "A, B" })], "2026-10-07");
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /"A, B"/);
  assert.match(csv.split("\n")[1], /,sent,fixed,7000\.00$/);
});

test("standaloneHtml is one self-contained file: no script, no network, user text escaped", () => {
  const html = standaloneHtml(base({ title: "<b>Site</b>", clientName: "A & B" }), { css: "#preview h3{color:red}" });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<title>PROP-0001 &lt;b&gt;Site&lt;\/b&gt;<\/title>/);
  assert.match(html, /#preview h3\{color:red\}/);
  assert.match(html, /A &amp; B/);
  assert.doesNotMatch(html, /<script|<link|src=|href=|<b>Site/i);
});

test("followUps lists quiet or expiring sent proposals, most urgent first", () => {
  const today = "2026-10-10";
  const quiet = base({ id: "a", number: "PROP-0001", sentOn: "2026-10-05", validUntil: "2026-10-31" });
  const fresh = base({ id: "b", number: "PROP-0002", sentOn: "2026-10-09", validUntil: "2026-10-31" });
  const soon = base({ id: "c", number: "PROP-0003", sentOn: "2026-10-09", validUntil: "2026-10-12" });
  const expired = base({ id: "d", number: "PROP-0004", sentOn: "2026-09-01", validUntil: "2026-09-30" });
  const draft = base({ id: "e", number: "PROP-0005", status: "draft", sentOn: "" });
  const accepted = base({ id: "f", number: "PROP-0006", status: "accepted", sentOn: "2026-10-01" });
  const r = followUps([quiet, fresh, soon, expired, draft, accepted], today);
  assert.deepEqual(r.map((x) => x.id), ["c", "a"]);
  assert.equal(r[0].reason, "expiring");
  assert.equal(r[0].daysLeft, 2);
  assert.equal(r[1].quietDays, 5);
  assert.equal(r[1].value, 700000);
});

test("followUps breaks ties on expiry by quietest first, and keeps input order when both are unknown", () => {
  const today = "2026-10-10";
  const a = base({ id: "a", sentOn: "2026-10-04", validUntil: "" });
  const b = base({ id: "b", sentOn: "2026-10-01", validUntil: "" });
  assert.deepEqual(followUps([a, b], today).map((x) => x.id), ["b", "a"]);
  // Same expiry day, no sent date: neither has a quiet count, so order is untouched.
  const c = base({ id: "c", sentOn: "", validUntil: "2026-10-11" });
  const d = base({ id: "d", sentOn: "", validUntil: "2026-10-11" });
  assert.deepEqual(followUps([c, d], today).map((x) => x.id), ["c", "d"]);
  // A known quiet count outranks an unknown one at the same expiry, whatever the input order.
  const e = base({ id: "e", sentOn: "2026-10-09", validUntil: "2026-10-11" });
  assert.deepEqual(followUps([c, e], today).map((x) => x.id), ["e", "c"]);
  assert.deepEqual(followUps([e, c], today).map((x) => x.id), ["e", "c"]);
});

test("followUpText names the proposal and the remaining days", () => {
  const txt = followUpText({ clientName: "Acme", number: "PROP-0003", title: "Website rebuild", reason: "expiring", daysLeft: 1 });
  assert.match(txt, /^Hi Acme,/);
  assert.match(txt, /PROP-0003 \(Website rebuild\)/);
  assert.match(txt, /1 more day\./);
  assert.match(followUpText({ clientName: "", number: "P", title: "", reason: "quiet", daysLeft: null }), /^Hi,/);
});
