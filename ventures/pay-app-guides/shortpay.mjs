// Paid short: reconcile what a pay application asked for with what the GC certified, what came in
// and what the GC said it deducted, so the contractor knows how much of the gap is explained, how
// much to ask about, and which lien waiver amounts match the money actually received.
//
// Inputs are typed by a person: amounts as "$12,500.00" or "12500", one check or deduction per
// line ("amount, date, reference" and "amount, reason"). Pure functions, no I/O. Money is cents.
import { fmt, toCents } from "./calc.mjs";

const lines = (text) =>
  String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

// "12,500.00, 2026-03-10, check 1042": the amount is everything before the first comma that is not
// a thousands separator, so split on ", " or a tab first, then on a bare comma.
function fields(line) {
  if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
  const parts = line.split(/,\s+|;\s*/).map((s) => s.trim());
  return parts;
}

/** Parse "amount, date, reference" lines. Returns { items, errors }. */
export function parseChecks(text) {
  const items = [];
  const errors = [];
  lines(text).forEach((line, i) => {
    const [amount, date = "", ...rest] = fields(line);
    const cents = toCents(amount);
    if (!Number.isFinite(cents) || cents <= 0) {
      errors.push(`Payments line ${i + 1}: "${amount}" is not an amount.`);
      return;
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Not a date: treat it as the reference.
      items.push({ cents, date: "", ref: [date, ...rest].join(", ") });
      return;
    }
    items.push({ cents, date, ref: rest.join(", ") });
  });
  return { items, errors };
}

/** Parse "amount, reason" lines. Returns { items, errors }. */
export function parseDeductions(text) {
  const items = [];
  const errors = [];
  lines(text).forEach((line, i) => {
    const [amount, ...rest] = fields(line);
    const cents = toCents(amount);
    if (!Number.isFinite(cents) || cents <= 0) {
      errors.push(`Deductions line ${i + 1}: "${amount}" is not an amount.`);
      return;
    }
    items.push({ cents, reason: rest.join(", ") || "no reason given" });
  });
  return { items, errors };
}

/**
 * The reconciliation.
 * applied: line 8 (current payment due) of the application, as typed.
 * certified: the amount the GC certified, blank when it did not cut one.
 * checks, deductions: parsed lists.
 */
export function reconcile({ applied, certified = "", checks = [], deductions = [] }) {
  const errors = [];
  const appliedCents = toCents(applied);
  if (!Number.isFinite(appliedCents) || appliedCents <= 0)
    errors.push("Enter what the application asked for (line 8, current payment due).");
  const certTyped = String(certified ?? "").trim() !== "";
  const certifiedCents = certTyped ? toCents(certified) : null;
  if (certTyped && (!Number.isFinite(certifiedCents) || certifiedCents < 0))
    errors.push("The certified amount is not an amount; leave it blank if the GC did not cut one.");
  if (errors.length) return { errors };

  const received = checks.reduce((s, c) => s + c.cents, 0);
  const deducted = deductions.reduce((s, d) => s + d.cents, 0);
  const cut = certifiedCents === null ? 0 : appliedCents - certifiedCents;
  const short = appliedCents - received;
  const unexplained = short - Math.max(0, cut) - deducted;

  const findings = [];
  if (short <= 0) {
    findings.push({
      level: short < 0 ? "medium" : "low",
      text:
        short < 0
          ? `More came in (${fmt(received)}) than the application asked for (${fmt(appliedCents)}). Check whether a check covers two applications or released retainage, and apply it to the right one.`
          : "Paid in full: nothing is short.",
    });
  } else {
    if (cut > 0)
      findings.push({
        level: "medium",
        text: `The GC certified ${fmt(cut)} less than you applied for. That is a cut to the application, not a deduction from payment: ask which lines were reduced and why (usually percent complete or stored materials), and bill the difference next month once agreed.`,
      });
    if (cut < 0)
      findings.push({
        level: "medium",
        text: `The certified amount is ${fmt(-cut)} more than you applied for. Check it was typed right; a GC rarely certifies more than the application.`,
      });
    if (deducted > 0)
      findings.push({
        level: "medium",
        text: `The GC deducted ${fmt(deducted)} (${deductions.map((d) => `${fmt(d.cents)} ${d.reason}`).join("; ")}). Ask for each backcharge in writing with its backup (the notice, the hours, the invoices) and check it against the subcontract's backcharge clause, especially any notice it requires before the GC does the work itself.`,
      });
    if (unexplained > 0)
      findings.push({
        level: "high",
        text: `${fmt(unexplained)} is short with no reason given. Ask the GC what it is held for: a missing lien waiver, insurance certificate or certified payroll is often the answer, and it is paid once the document goes in.`,
      });
    if (unexplained < 0)
      findings.push({
        level: "medium",
        text: `The cut and deductions add up to ${fmt(-unexplained)} more than the shortfall: a deduction may already be inside the certified amount. Ask the GC to show the arithmetic.`,
      });
  }

  // Waivers: an unconditional waiver for each payment received, for that payment's amount; never
  // for money not received.
  const waivers = checks.map((c) => ({
    cents: c.cents,
    text: `Unconditional progress waiver for ${fmt(c.cents)}${c.date ? `, the payment received ${c.date}` : ""}${c.ref ? ` (${c.ref})` : ""}, once it has cleared.`,
  }));
  if (short > 0)
    waivers.push({
      cents: short,
      text: `No unconditional waiver for the ${fmt(short)} not received. If the GC asks for one covering the whole application, offer one for the amount paid, or a conditional waiver for the balance.`,
    });

  return {
    errors: [],
    applied: appliedCents,
    certified: certifiedCents,
    received,
    deducted,
    cut,
    short,
    unexplained,
    findings,
    waivers,
  };
}

/** A short email asking the GC for the breakdown. */
export function letterText(r, { project = "", number = "", gc = "" } = {}) {
  if (!r || r.errors?.length || r.short <= 0) return "";
  const app = number ? `pay application #${number}` : "our pay application";
  const job = project ? ` on ${project}` : "";
  const out = [
    `${gc ? `${gc}, ` : ""}we received ${fmt(r.received)} against ${app}${job}, which asked for ${fmt(r.applied)}. That leaves ${fmt(r.short)} unpaid.`,
  ];
  const ask = [];
  if (r.cut > 0) ask.push(`which lines were reduced in the ${fmt(r.cut)} cut to the certified amount, and why`);
  if (r.deducted > 0) ask.push(`the written notice and backup for each backcharge (${fmt(r.deducted)} in total)`);
  if (r.unexplained > 0) ask.push(`what the remaining ${fmt(r.unexplained)} is held for, and what you need from us to release it`);
  if (ask.length) out.push(`Please send ${ask.join("; ")}.`);
  out.push("We will send an unconditional waiver for the amount received once it clears.");
  return out.join("\n\n");
}
