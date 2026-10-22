// Paying bills: when to pay each open bill so the bank balance stays above a reserve.
// Starts from the cash forecast (bank balance, recurring items, invoices expected in) with
// the open bills taken out, then places each bill on its due date, or tomorrow if it is
// already late. A bill that would push the balance under the reserve slides to the first
// day from which it fits; one that never fits is reported with the shortfall. Overdue and
// older bills go first. A plan to read, not a payment: nothing is paid from here.
// Pure functions, no DOM, no network.

import { forecastCash } from "./recurring.mjs";
import { aging } from "./accruals.mjs";
import { fmt } from "./ledger.mjs";

const day = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const iso = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

// -> { asOf, to, reserve, start, rows: [{ id, party, cents, due, payOn, daysLate, delay, status, note }],
//      lowest: {date, cents}, shortfall }
// status: "on time" (paid on its due date), "late now" (already past due, paid tomorrow),
// "deferred" (moved later to hold the reserve; delay days past the target date), "cannot fit".
// terms (optional): { "supplier name": { discountPct, discountDays, lateFeePct } }, matched on the
// party name ignoring case. A discount is taken when the bill can be paid within discountDays of
// its date without breaking the reserve; a late fee (a flat percent, charged once) is added to a
// bill paid after its due date. Rows then carry `saved` and `fee` in cents. The fee counts toward the reserve test, so
// a bill that only fits without it is held longer. Neither is modelled without terms.
export function planBills(books, { asOf = null, days = 90, reserve = 0, terms = {} } = {}) {
  const tm = new Map(Object.entries(terms).map(([k, v]) => [k.trim().toLowerCase(), v]));
  const f = forecastCash(books, { asOf, days });
  const from = f.asOf, today = day(from), end = day(f.to);
  const open = aging(books, from).open.filter((o) => o.kind === "bill" && !o.credit && o.total > 0);
  // everything in the forecast except the bills themselves
  const base = f.items.filter((i) => !(i.source === "document" && i.cents < 0));
  const bills = open.map((o) => {
    const due = o.due ?? iso(day(o.date) + 30);
    return { id: o.id, party: o.party, cents: o.total, due, date: o.date, daysLate: o.daysLate, target: Math.max(day(due), today + 1) };
  }).filter((b) => b.target <= end)
    .sort((a, b) => b.daysLate - a.daysLate || a.target - b.target || b.cents - a.cents || a.id.localeCompare(b.id));
  const placed = [];
  // balance at the end of day n, counting the base items and the bills placed so far
  const events = () => [...base.map((i) => ({ n: day(i.date), c: i.cents })), ...placed.map((p) => ({ n: p.n, c: -p.cents }))].sort((a, b) => a.n - b.n);
  const lowestFrom = (n0, extra) => {
    // lowest end-of-day balance over days n0..end, with `extra` taken out on day n0
    let bal = f.start, low = Infinity;
    const ev = events();
    let i = 0;
    for (let n = today; n <= end; n++) {
      while (i < ev.length && ev[i].n <= n) bal += ev[i++].c;
      if (n >= n0) low = Math.min(low, bal - extra);
    }
    return low;
  };
  const rows = [];
  for (const b of bills) {
    let n = b.target, fit = false;
    // a day's balance only changes on item days, so try the target and each item day after it
    const cand = [b.target, ...new Set(base.map((i) => day(i.date)).filter((d) => d > b.target && d <= end))].sort((x, y) => x - y);
    for (const c of cand) if (lowestFrom(c, b.cents) >= reserve) { n = c; fit = true; break; }
    if (!fit) n = b.target;
    const t = tm.get(String(b.party).trim().toLowerCase()) ?? {};
    let saved = 0, fee = 0;
    const disc = t.discountPct > 0 && t.discountDays >= 0 ? Math.round(b.cents * t.discountPct / 100) : 0;
    if (disc) {
      const dd = day(b.date) + t.discountDays;
      // pay early for the discount when the cash holds, else take it if the plan already lands in the window
      if (dd >= today + 1 && dd <= end && dd < n && lowestFrom(dd, b.cents - disc) >= reserve) { n = dd; fit = true; saved = disc; }
      else if (fit && n <= dd) saved = disc;
    }
    if (!saved && t.lateFeePct > 0 && n > day(b.due)) {
      fee = Math.round(b.cents * t.lateFeePct / 100);
      // the fee is cash out too: the day must hold the bill plus the fee, so search on from here
      if (fit && lowestFrom(n, b.cents + fee) < reserve) {
        fit = false;
        for (const c of cand) if (c > n && lowestFrom(c, b.cents + fee) >= reserve) { n = c; fit = true; break; }
        if (!fit) n = b.target;
      }
      if (n <= day(b.due)) fee = 0;
    }
    placed.push({ n, cents: b.cents - saved + fee });
    const delay = Math.max(0, n - b.target);
    const status = !fit ? "cannot fit" : delay > 0 ? "deferred" : b.daysLate > 0 ? "late now" : "on time";
    const note = !fit ? `would take the balance ${fmt(reserve - lowestFrom(n, b.cents))} below the reserve even on the last day; needs cash in first`
      : delay > 0 ? `held ${delay} day${delay > 1 ? "s" : ""} past ${iso(b.target)} until cash covers it; the supplier may charge late fees or stop supply` : "";
    const extra = saved ? `; early-payment discount ${fmt(saved)} taken` : fee ? `; late fee about ${fmt(fee)}` : "";
    rows.push({ saved, fee, id: b.id, party: b.party, cents: b.cents, due: b.due, payOn: iso(n), daysLate: b.daysLate, delay, status, note: note + extra });
  }
  rows.sort((a, b) => a.payOn.localeCompare(b.payOn) || a.id.localeCompare(b.id));
  let bal = f.start, lowest = { date: from, cents: f.start };
  for (const e of events()) { bal += e.c; if (bal < lowest.cents) lowest = { date: iso(e.n), cents: bal }; }
  const shortfall = rows.filter((r) => r.status === "cannot fit").reduce((s, r) => s + r.cents, 0);
  return { asOf: from, to: f.to, reserve, start: f.start, rows, lowest, shortfall };
}
