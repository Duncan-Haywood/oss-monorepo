// Getting paid: a payment reminder for each customer with overdue invoices, in a tone that steps up
// with how late the oldest one is (friendly, firm, final). Built on the same open
// documents as aging(), so the amounts always agree with the ledger. Drafts are
// plain text and HTML for the owner to read and send; nothing is sent from here.
// Pure functions, no DOM, no network.

import { aging } from "./accruals.mjs";
import { fmt } from "./ledger.mjs";


export const TONES = ["friendly", "firm", "final"];
// Days past due at which the tone steps up. Defaults are a common practice, not a rule.
export const DEFAULT_STEPS = { firm: 15, final: 45 };

export const toneFor = (daysLate, steps = DEFAULT_STEPS) =>
  daysLate >= steps.final ? "final" : daysLate >= steps.firm ? "firm" : "friendly";

const ref = (id) => id.replace(/^INV-/, "");

const OPEN = {
  friendly: (n, who) => `Hello ${n},\n\nA quick note from ${who}: payment of {subject} may have slipped past. If it has already been paid, please ignore this and thank you.`,
  firm: (n, who) => `Hello ${n},\n\nOur records show payment of {subject} to ${who} is past due. Please arrange payment this week, or tell us if something is holding it up.`,
  final: (n, who) => `Dear ${n},\n\nThis is a final reminder from ${who}. Payment of {subject} is now well past due. Unless we receive payment or hear from you within 7 days, we will have to stop further work or supplies on the account and consider other recovery steps.`,
};

// One reminder per customer with an overdue invoice, oldest debt first.
// -> [{ party, tone, daysLate, overdue, invoices:[id], subject, text }]
export function reminders(books, { asOf = null, steps = DEFAULT_STEPS, min = 1 } = {}) {
  const a = aging(books, asOf);
  const cur = books.currency ?? "";
  const m = (c) => fmt(c, cur);
  const p = books.profile ?? {};
  const who = p.name || books.name || "us";
  const by = new Map();
  for (const x of a.open) {
    if (x.kind !== "invoice" || x.credit || x.daysLate < 1) continue;
    const k = x.party.toLowerCase();
    if (!by.has(k)) by.set(k, { party: x.party, rows: [] });
    by.get(k).rows.push(x);
  }
  const out = [];
  for (const { party, rows } of by.values()) {
    const overdue = rows.reduce((s, x) => s + x.total, 0);
    if (overdue < min) continue;
    const daysLate = Math.max(...rows.map((x) => x.daysLate));
    const tone = toneFor(daysLate, steps);
    const subject = rows.length === 1 ? `invoice ${ref(rows[0].id)} (${m(rows[0].total)})` : `${rows.length} invoices (${m(overdue)} in all)`;
    const list = rows.map((x) => `  - ${ref(x.id)}, due ${x.due}, ${x.daysLate} days late, ${m(x.total)}`).join("\n");
    const body = OPEN[tone](party, who).replace("{subject}", subject);
    const text = `${body}\n\n${list}\n\nTotal overdue: ${m(overdue)}\n${p.payTo ? `\nHow to pay:\n${p.payTo}\n` : ""}\nThank you,\n${who}${p.email ? `\n${p.email}` : ""}\n`;
    out.push({ party, tone, daysLate, overdue, invoices: rows.map((x) => x.id), subject: `${tone === "final" ? "Final reminder" : "Reminder"}: ${subject}`, text });
  }
  out.sort((x, y) => y.daysLate - x.daysLate || y.overdue - x.overdue || x.party.localeCompare(y.party));
  return out;
}
