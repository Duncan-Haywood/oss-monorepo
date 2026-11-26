import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readClause, stateReading, questions, STATES } from "./clause.mjs";

const IF_PAID = "Receipt of payment by Contractor from Owner for the Subcontractor's work is a condition precedent to Contractor's obligation to pay Subcontractor. Subcontractor expressly assumes the risk of Owner's nonpayment.";
const WHEN_PAID = "Contractor shall pay Subcontractor within seven (7) days after Contractor's receipt of payment from the Owner for work performed by Subcontractor.";
const ONLY_IF = "Contractor shall pay Subcontractor only if Contractor has been paid by the Owner for such work.";
const CONTINGENT = "Progress payments to Subcontractor are contingent upon payment by the Owner.";
const NET30 = "Contractor shall pay each approved invoice within 30 days of approval.";

test("express condition-precedent wording reads as pay-if-paid and quotes the words", () => {
  const r = readClause(IF_PAID);
  assert.equal(r.kind, "pay-if-paid");
  assert.ok(r.ifPaid.some((s) => /condition precedent/i.test(s.words)));
  assert.ok(r.ifPaid.some((s) => /risk of Owner's nonpayment/i.test(s.words)));
  assert.ok(r.ifPaid.every((s) => r && s.context.length > s.words.length));
});

test("a days-after-receipt clause reads as pay-when-paid with its day count", () => {
  const r = readClause(WHEN_PAID);
  assert.equal(r.kind, "pay-when-paid");
  assert.equal(r.days, 7);
  assert.equal(r.ifPaid.length, 0);
  assert.ok(r.whenPaid.length >= 1);
  assert.equal(readClause("Payment within ten days after receipt of payment from Owner.").days, 10);
});

test("only-if wording is pay-if-paid; contingent-on alone is unclear, not a confident call", () => {
  assert.equal(readClause(ONLY_IF).kind, "pay-if-paid");
  assert.equal(readClause(CONTINGENT).kind, "unclear");
  assert.equal(readClause("Subcontractor will be paid when and if Contractor is paid.").kind, "pay-if-paid");
});

test("a clause with no link to the owner's payment is neither kind; empty input asks for a clause", () => {
  assert.equal(readClause(NET30).kind, "no-owner-link");
  assert.equal(readClause("   ").kind, "empty");
  assert.equal(readClause(undefined).kind, "empty");
});

test("state readings: void, lien-only and unknown states say different things", () => {
  assert.match(stateReading("pay-if-paid", "ca").text, /unenforceable/);
  assert.match(stateReading("pay-if-paid", "mo").text, /lien/);
  assert.match(stateReading("pay-if-paid", "wi").text, /delays/);
  for (const k of ["constructor", "toString", "__proto__", undefined]) assert.equal(stateReading("pay-if-paid", k).known, false, String(k));
  assert.ok(questions(readClause("x only if Owner pays"), "constructor").length);
  const none = stateReading("pay-if-paid", "zz");
  assert.equal(none.known, false);
  assert.match(none.text, /have not read/);
  assert.match(stateReading("pay-when-paid", "ny").text, /does not by itself excuse/);
});

test("every state rule cites an official legislature site or a published opinion", () => {
  const ok = /^https:\/\/(www\.ncleg\.gov|www\.scstatehouse\.gov|docs\.legis\.wisconsin\.gov|www\.leg\.state\.nv\.us|revisor\.mo\.gov|mgaleg\.maryland\.gov|www\.ilga\.gov|law\.justia\.com)\//;
  assert.ok(Object.keys(STATES).length >= 10);
  for (const [k, s] of Object.entries(STATES)) {
    assert.match(s.url, ok, k);
    assert.ok(["statute", "case law"].includes(s.source), k);
    assert.ok(s.cite && s.rule.length > 60, k);
  }
});

test("questions push for timing wording on a pay-if-paid clause and for a day count when missing", () => {
  assert.match(questions(readClause(IF_PAID), "fl").join(" "), /timing wording/);
  assert.match(questions(readClause("Payment after receipt of payment from Owner."), "fl").join(" "), /names no number of days/);
  assert.match(questions(readClause(IF_PAID), "il").join(" "), /lien filing deadlines/);
  assert.deepEqual(questions(readClause(""), "ca"), []);
});

test("the guide page lists every state in STATES, links each source, and labels its inputs", () => {
  const html = readFileSync(new URL("./pay-if-paid-clauses.html", import.meta.url), "utf8");
  for (const s of Object.values(STATES)) {
    assert.ok(html.includes(s.url.replace(/&/g, "&amp;")), s.state);
  }
  for (const id of ["clause", "cl-state"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.match(html, /2026-11-25/);
  assert.match(html, /import \{ readClause, stateReading, questions, STATES \} from "\.\/clause\.mjs"/);
});

test("written-out day counts are read, including compounds and every word in the table (red team 2026-11-26)", () => {
  const days = (w) => readClause(`Contractor shall pay Subcontractor within ${w} days after receipt of payment from Owner.`).days;
  assert.equal(days("seven"), 7);
  assert.equal(days("fifteen"), 15);
  assert.equal(days("fourteen"), 14);
  assert.equal(days("four"), 4);
  assert.equal(days("twenty-one"), 21);
  assert.equal(days("forty five"), 45);
  assert.equal(days("Thirty"), 30);
  assert.equal(days("ninety"), 90);
  assert.equal(days("several"), null);
  // A written-out count is a number of days, so the page must not say the clause names none.
  assert.ok(!questions(readClause("Payment within fourteen days after receipt of payment from Owner."), "fl").join(" ").includes("names no number of days"));
  assert.ok(readClause("Payment within forty five days after receipt of payment from Owner.").whenPaid.some((s) => /forty five days after/.test(s.words)));
});

test("a quote is widened to whole words at both ends", () => {
  const pad = "abcdefghijklmnopqrstuvwxyz0123456789 ".repeat(3);
  const r = readClause(`${pad}Contractor shall pay within ten days after receipt of payment from the Owner. ${pad}`);
  const ctx = r.whenPaid[0].context;
  assert.ok(ctx.startsWith("…abcdefghijklmnopqrstuvwxyz0123456789 "), ctx);
  assert.ok(ctx.endsWith(" from the Owner.…"), ctx);
});
