// Lines worth a second look before the books are closed. Three heuristics on
// your own bank and card history, each with a reason a person can check:
//   duplicate  - the same payee and amount again within `dupDays` (a double charge
//                or a line imported twice; refunds and transfers are skipped)
//   spike      - a line far above that payee's usual amount (median plus
//                `spikeK` robust spreads, and at least `spikeMin` times the median)
//   new-large  - the first line ever from a payee, bigger than `newLargeX` times
//                the median outflow of the whole book
// Integer cents. Pure; nothing is posted. A heuristic, not an audit: it flags
// candidates and says why, and a flagged line is often fine.

import { payeeKey } from "./categorize.mjs";

const day = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function findAnomalies(books, { dupDays = 7, spikeK = 6, spikeMin = 2.5, minHistory = 4, newLargeX = 5 } = {}) {
  const bank = new Set(books.accounts.filter((a) => a.bank).map((a) => a.code));
  const lines = books.transactions
    .filter((t) => bank.has(t.account) && t.status !== "transfer" && t.cents)
    .map((t) => ({ t, payee: payeeKey(t.desc) }))
    .filter((x) => x.payee)
    .sort((a, b) => a.t.date.localeCompare(b.t.date) || String(a.t.id).localeCompare(String(b.t.id)));
  const found = [];
  const flag = (t, kind, reason) => found.push({ id: t.id, date: t.date, desc: t.desc, cents: t.cents, account: t.account, kind, reason });

  const byPayee = new Map();
  for (const x of lines) (byPayee.get(x.payee) ?? byPayee.set(x.payee, []).get(x.payee)).push(x.t);

  // duplicates: same payee, same signed amount, within dupDays; the later line is flagged
  for (const [, list] of byPayee) {
    for (let i = 1; i < list.length; i++) {
      const prev = list.slice(0, i).reverse().find((p) => p.cents === list[i].cents && day(list[i].date) - day(p.date) <= dupDays);
      if (prev) flag(list[i], "duplicate", `same payee and amount as ${prev.date} (${day(list[i].date) - day(prev.date)} days earlier)`);
    }
  }

  // spikes: compare each line with the payee's other lines of the same direction
  for (const [, list] of byPayee) {
    for (const dir of [-1, 1]) {
      const same = list.filter((t) => Math.sign(t.cents) === dir);
      if (same.length < minHistory) continue;
      for (const t of same) {
        const others = same.filter((o) => o !== t).map((o) => Math.abs(o.cents));
        const med = median(others);
        const mad = median(others.map((v) => Math.abs(v - med))) * 1.4826;
        const spread = Math.max(mad, med * 0.05, 1);
        const a = Math.abs(t.cents);
        if (a >= med * spikeMin && a > med + spikeK * spread) flag(t, "spike", `${(a / 100).toFixed(2)} against a usual ${(med / 100).toFixed(2)} for this payee (${others.length} other lines)`);
      }
    }
  }

  // new payee with a large first outflow, against the book's median outflow
  const outflows = lines.filter((x) => x.t.cents < 0).map((x) => -x.t.cents);
  if (outflows.length >= 10) {
    const med = median(outflows);
    // descriptors vary by reference code, so "new" means the payee's first word is unique too
    const words = new Map();
    for (const [k, list] of byPayee) words.set(k.split(" ")[0], (words.get(k.split(" ")[0]) ?? 0) + list.length);
    const generic = /^(purchase|payment|pos|debit|check|checkcard|ach|online|withdrawal|deposit|card|recurring)$/;
    for (const [k, list] of byPayee) {
      const first = list[0], w = k.split(" ")[0];
      if (generic.test(w) || /transfer|draw|payroll|tax/i.test(first.desc) || words.get(w) > 1) continue;
      if (list.length === 1 && first.cents < 0 && -first.cents > med * newLargeX) flag(first, "new-large", `first line from this payee, ${(-first.cents / 100).toFixed(2)} against a median outflow of ${(med / 100).toFixed(2)}`);
    }
  }

  // one entry per line, strongest reason first
  const rank = { duplicate: 0, spike: 1, "new-large": 2 };
  const seen = new Map();
  for (const f of found.sort((a, b) => rank[a.kind] - rank[b.kind])) if (!seen.has(f.id)) seen.set(f.id, f); else seen.get(f.id).reason += `; also ${f.kind}: ${f.reason}`;
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}
