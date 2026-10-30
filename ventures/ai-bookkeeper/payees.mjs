// Who the money comes from and goes to. Groups the bank and card lines of a
// period by payee (the same key the categorizer uses) and ranks customers
// (money in) and suppliers (money out) with each one's share of the total.
// The one warning it raises is customer concentration: a business that takes a
// quarter or more of its income from one payer is exposed if that payer leaves.
// Integer cents. Pure; nothing is posted. Transfers between your own accounts
// are skipped. Lines still in review are counted (they are real money), and
// `unreviewed` says how many. A payee is the first two words of the
// description, so two shops sharing a first word merge; check the top rows.

import { payeeKey } from "./categorize.mjs";

// Payment processors and the owner's own money are not customers: a Stripe
// payout is many customers in one line, so it is shown but never warned about.
const NOT_A_PAYER = /\b(stripe|paypal|square|shopify|etsy|amazon payments|adyen|gusto|owner|personal|interest|deposit)\b/i;

export function payeeReport(books, { from = null, to = null, top = 10, concentration = 0.25 } = {}) {
  const bank = new Set(books.accounts.filter((a) => a.bank).map((a) => a.code));
  const side = { in: new Map(), out: new Map() };
  let unreviewed = 0, skipped = 0;
  for (const t of books.transactions) {
    if (!bank.has(t.account) || t.status === "transfer" || !t.cents) continue;
    if ((from && t.date < from) || (to && t.date > to)) continue;
    const key = payeeKey(t.desc);
    if (!key) { skipped++; continue; }
    if (t.status === "review" || t.status === "new") unreviewed++;
    const m = side[t.cents > 0 ? "in" : "out"];
    const r = m.get(key) ?? { payee: key, cents: 0, count: 0, first: t.date, last: t.date, names: new Map() };
    r.cents += Math.abs(t.cents); r.count++;
    if (t.date < r.first) r.first = t.date;
    if (t.date > r.last) r.last = t.date;
    r.names.set(t.desc, (r.names.get(t.desc) ?? 0) + 1);
    m.set(key, r);
  }
  const rank = (m) => {
    const rows = [...m.values()].sort((a, b) => b.cents - a.cents || a.payee.localeCompare(b.payee));
    const total = rows.reduce((s, r) => s + r.cents, 0);
    const shaped = rows.map((r) => ({
      payee: r.payee,
      example: [...r.names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      cents: r.cents, count: r.count, first: r.first, last: r.last,
      share: total ? r.cents / total : 0,
      conduit: NOT_A_PAYER.test([...r.names.keys()][0]),
    }));
    const hhi = shaped.reduce((s, r) => s + r.share * r.share, 0);
    return { total, payees: rows.length, rows: shaped.slice(0, top), top1: shaped[0]?.share ?? 0, top3: shaped.slice(0, 3).reduce((s, r) => s + r.share, 0), hhi };
  };
  const customers = rank(side.in), suppliers = rank(side.out);
  const warnings = [];
  const real = customers.rows.filter((x) => !x.conduit);
  if (real.length && real[0].share >= concentration && customers.payees >= 2) {
    const r = real[0];
    warnings.push(`${r.example} is ${Math.round(r.share * 100)}% of money in; losing one payer would cost that much income.`);
  } else if (customers.payees === 1 && customers.total && !customers.rows[0].conduit) {
    warnings.push(`All money in came from one payer (${customers.rows[0].example}).`);
  }
  if (suppliers.payees >= 2 && suppliers.top1 >= 0.5 && !suppliers.rows[0].conduit) warnings.push(`${suppliers.rows[0].example} is ${Math.round(suppliers.top1 * 100)}% of money out.`);
  return { from, to, customers, suppliers, unreviewed, skipped, warnings };
}
