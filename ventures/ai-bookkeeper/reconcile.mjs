// Reconcile one bank or card account to a statement's closing balance that you
// type in, and when the books disagree, search for the likeliest reason. The
// automatic check in closeChecks only works when the file carried a closing
// balance; this one works from the paper statement.
//
// The balance is as the statement prints it (a card statement prints what you
// owe as a positive number). Candidates for the difference, strongest first:
//   - lines still in review or new, dated on or before the statement date (the
//     journal leaves them out, so the books look short by exactly their sum);
//   - one posted line equal to the difference (booked, not on this statement:
//     a different cleared date, or entered twice);
//   - one posted line equal to half the difference (booked with the wrong sign);
//   - two lines that together equal it;
//   - a difference divisible by 9 (two digits swapped when someone typed it in).
// Only a hint: it names lines to look at, it never edits the books.
// Integer cents. Not accounting advice.

import { journal } from "./engine.mjs";
import { accountMap, balances, natural, fmt } from "./ledger.mjs";

const WINDOW = 400; // most recent posted lines searched for pairs
const MAX_HINTS = 8;

export function reconcile(books, { account, date, balance }) {
  if (!Number.isInteger(balance)) throw new Error("balance must be a whole number of cents");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("date must be YYYY-MM-DD");
  const a = accountMap(books.accounts).get(account);
  if (!a || (a.type !== "asset" && a.type !== "liability")) throw new Error(`${account} is not a bank or card account`);
  const book = natural(a, balances(journal(books), { to: date }).get(account) ?? 0);
  const diff = book - balance; // positive: the books show more than the statement
  const mine = books.transactions.filter((t) => t.account === account && t.date <= date);
  const signed = (t) => natural(a, t.cents);
  const pending = mine.filter((t) => !t.posted || t.status === "review" || t.status === "new");
  const posted = mine.filter((t) => t.posted && t.status !== "review" && t.status !== "new").sort((x, y) => y.date.localeCompare(x.date));
  const pendingSum = pending.reduce((s, t) => s + signed(t), 0);
  const out = { account, date, book, statement: balance, difference: diff, agrees: diff === 0, pending: pending.map((t) => t.id), pendingSum, hints: [] };
  if (diff === 0) return out;

  const hint = (kind, message, ids) => { if (out.hints.length < MAX_HINTS) out.hints.push({ kind, message, ids }); };
  const label = (t) => `${t.date} ${t.desc} ${fmt(signed(t))}`;

  if (pending.length && pendingSum === -diff) hint("unfiled", `The ${pending.length} line${pending.length === 1 ? "" : "s"} still waiting for an account (${fmt(pendingSum)} together) make up the whole difference. File ${pending.length === 1 ? "it" : "them"} and the books will agree.`, pending.map((t) => t.id));
  else if (pending.length) hint("unfiled-part", `${pending.length} line${pending.length === 1 ? " is" : "s are"} still waiting for an account (${fmt(pendingSum)}); the books leave them out. Filing them leaves ${fmt(diff + pendingSum)} to explain.`, pending.map((t) => t.id));
  const rest = diff + pendingSum; // what is left after the unfiled lines are counted
  if (rest !== 0) {
    for (const t of posted) if (signed(t) === rest) hint("on-books-only", `${label(t)} is in the books but may not be on this statement (cleared on another date, or entered twice).`, [t.id]);
    for (const t of posted) if (signed(t) === -rest) hint("not-on-books", `${label(t)} matches the missing amount; check the statement lists it and the books count it once.`, [t.id]);
    for (const t of posted) if (signed(t) !== 0 && signed(t) * 2 === rest) hint("flipped-sign", `${label(t)} is exactly half the difference: booked with the wrong sign, the books are ${fmt(rest)} off.`, [t.id]);
    const recent = posted.slice(0, WINDOW);
    for (let i = 0; i < recent.length && out.hints.length < MAX_HINTS; i++) for (let j = i + 1; j < recent.length; j++) {
      const s = signed(recent[i]) + signed(recent[j]);
      if (s === rest || s === -rest) { hint("pair", `${label(recent[i])} and ${label(recent[j])} together equal the difference${s === rest ? " (both in the books, not on the statement)" : " (the statement has them, the books do not)"}.`, [recent[i].id, recent[j].id]); if (out.hints.length >= MAX_HINTS) break; }
    }
    if (Math.abs(rest) % 9 === 0 && Math.abs(rest) >= 9 && !out.hints.some((h) => h.kind !== "unfiled-part")) hint("transposition", `The difference ${fmt(rest)} divides by 9, the signature of two digits swapped in an amount (for example 540.00 typed as 450.00). Compare amounts line by line.`, []);
  }
  const after = books.transactions.filter((t) => t.account === account && t.date > date && t.date <= addDays(date, 5));
  if (after.length) hint("just-after", `${after.length} line${after.length === 1 ? "" : "s"} dated within 5 days after the statement date; a bank can print them on this statement. (${after.map(label).slice(0, 3).join("; ")})`, after.map((t) => t.id));
  return out;
}

function addDays(d, n) {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
