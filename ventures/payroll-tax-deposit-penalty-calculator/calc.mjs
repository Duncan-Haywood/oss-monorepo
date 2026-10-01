// Payroll tax deposit schedule, due dates and failure-to-deposit penalty
// (IRC 6656 tiers) from the employer's own payday liabilities and deposits.
// Pure functions, integer cents inside, no network, no rate or date tables
// beyond the statutory ones named below. Dates are ISO "YYYY-MM-DD" strings
// handled in UTC so a viewer's time zone can never move a due date.

export const NEXT_DAY_THRESHOLD_CENTS = 10_000_000; // $100,000
export const LOOKBACK_LIMIT_CENTS = 5_000_000; // $50,000
export const DE_MINIMIS_CENTS = 250_000; // $2,500 per quarter
export const PENALTY_TIERS = [
  { from: 1, to: 5, pct: 2 },
  { from: 6, to: 15, pct: 5 },
  { from: 16, to: Infinity, pct: 10 },
];

// ---------- dates ----------
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(input) {
  const s = String(input ?? "").trim();
  let y, m, d;
  let hit = ISO.exec(s);
  if (hit) [y, m, d] = [+hit[1], +hit[2], +hit[3]];
  else if ((hit = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) [m, d, y] = [+hit[1], +hit[2], +hit[3]];
  else throw new Error(`"${s}" is not a date; use YYYY-MM-DD or M/D/YYYY`);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
    throw new Error(`"${s}" is not a real calendar date`);
  }
  if (y < 2000 || y > 2100) throw new Error(`"${s}" is outside 2000-2100`);
  return toIso(t);
}

function toIso(t) {
  return new Date(t).toISOString().slice(0, 10);
}
function ms(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
export function addDays(iso, n) {
  return toIso(ms(iso) + n * 86_400_000);
}
export function daysBetween(fromIso, toIsoDate) {
  return Math.round((ms(toIsoDate) - ms(fromIso)) / 86_400_000);
}
// 0 = Sunday ... 6 = Saturday
export function weekday(iso) {
  return new Date(ms(iso)).getUTCDay();
}

function nthWeekday(year, month, dow, n) {
  // month 1-12; n = 1.. or -1 for last
  if (n > 0) {
    const first = weekday(`${year}-${String(month).padStart(2, "0")}-01`);
    const day = 1 + ((dow - first + 7) % 7) + (n - 1) * 7;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastIso = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return addDays(lastIso, -((weekday(lastIso) - dow + 7) % 7));
}

const holidayCache = new Map();
// Federal banking holidays for one year. A holiday on Sunday is observed on
// Monday. One on Saturday is NOT moved: the Federal Reserve stays open the
// Friday before, so a Friday is still a banking day.
export function federalHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const fixed = [`${year}-01-01`, `${year}-06-19`, `${year}-07-04`, `${year}-11-11`, `${year}-12-25`];
  const set = new Set();
  for (const f of fixed) set.add(weekday(f) === 0 ? addDays(f, 1) : f);
  set.add(nthWeekday(year, 1, 1, 3)); // MLK
  set.add(nthWeekday(year, 2, 1, 3)); // Presidents
  set.add(nthWeekday(year, 5, 1, -1)); // Memorial
  set.add(nthWeekday(year, 9, 1, 1)); // Labor
  set.add(nthWeekday(year, 10, 1, 2)); // Columbus / Indigenous Peoples
  set.add(nthWeekday(year, 11, 4, 4)); // Thanksgiving
  holidayCache.set(year, set);
  return set;
}

export function isBankingDay(iso) {
  const dow = weekday(iso);
  if (dow === 0 || dow === 6) return false;
  const y = +iso.slice(0, 4);
  return !federalHolidays(y).has(iso);
}
export function onOrAfterBankingDay(iso) {
  let d = iso;
  while (!isBankingDay(d)) d = addDays(d, 1);
  return d;
}
export function addBankingDays(iso, n) {
  let d = iso;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isBankingDay(d)) left--;
  }
  return d;
}

// ---------- money ----------
export function toCents(value, label = "amount") {
  const s = String(value ?? "").replace(/[$,\s]/g, "");
  if (s === "" || !/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`${label} "${value}" must be a number`);
  const n = Number(s);
  if (n < 0) throw new Error(`${label} cannot be negative`);
  if (n > 1e9) throw new Error(`${label} is too large`);
  return Math.round(n * 100);
}
export const dollars = (cents) => Math.round(cents) / 100;

// ---------- schedule ----------
export function depositorSchedule({ newEmployer = false, lookbackTotal } = {}) {
  if (newEmployer) return { schedule: "monthly", reason: "new employer: monthly until a lookback period exists" };
  const c = toCents(lookbackTotal, "lookback total");
  return c > LOOKBACK_LIMIT_CENTS
    ? { schedule: "semiweekly", reason: `lookback total ${fmt(c)} is over $50,000` }
    : { schedule: "monthly", reason: `lookback total ${fmt(c)} is $50,000 or less` };
}
function fmt(c) {
  return "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// End of the semiweekly period a payday falls in: Wed-Fri -> that Friday,
// Sat-Tue -> the Tuesday that closes it.
export function semiweeklyPeriodEnd(payday) {
  const dow = weekday(payday);
  if (dow >= 3 && dow <= 5) return addDays(payday, 5 - dow);
  return addDays(payday, (2 - dow + 7) % 7);
}
// Due on the third banking day after the period closes. That gives the usual
// Wednesday / Friday, and one extra day for any intervening holiday.
export function semiweeklyDue(payday) {
  return addBankingDays(semiweeklyPeriodEnd(payday), 3);
}
export function monthlyDue(payday) {
  const y = +payday.slice(0, 4);
  const m = +payday.slice(5, 7);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return onOrAfterBankingDay(`${ny}-${String(nm).padStart(2, "0")}-15`);
}
export function nextDayDue(date) {
  return addBankingDays(date, 1);
}

// ---------- parsing ----------
export function parseRows(text, what) {
  const rows = [];
  String(text ?? "").split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const parts = t.split(/[,\t;]+|\s{2,}|\s(?=[$\d.-]+$)/).map((p) => p.trim()).filter(Boolean);
    if (parts.length !== 2) throw new Error(`${what} line ${i + 1}: expected "date, amount"`);
    try {
      rows.push({ date: parseDate(parts[0]), cents: toCents(parts[1], "amount") });
    } catch (e) {
      throw new Error(`${what} line ${i + 1}: ${e.message}`);
    }
  });
  return rows;
}

// ---------- obligations ----------
// liabilities: [{date, cents}] (one per payday, any order, same dates merge).
// Returns deposit obligations: each is one amount with one due date.
export function buildObligations(liabilities, startSchedule) {
  const byDate = new Map();
  for (const l of liabilities) byDate.set(l.date, (byDate.get(l.date) || 0) + l.cents);
  const days = [...byDate.entries()].map(([date, cents]) => ({ date, cents })).sort((a, b) => (a.date < b.date ? -1 : 1));

  let schedule = startSchedule;
  const out = [];
  const notes = [];
  let acc = null; // {key, cents, first, last}

  const keyOf = (date) => (schedule === "monthly" ? date.slice(0, 7) : semiweeklyPeriodEnd(date));
  const dueOf = (date) => (schedule === "monthly" ? monthlyDue(date) : semiweeklyDue(date));
  const flush = () => {
    if (acc && acc.cents > 0) {
      out.push({ accrued: acc.first, lastPayday: acc.last, cents: acc.cents, due: dueOf(acc.last), rule: acc.schedule });
    }
    acc = null;
  };

  for (const day of days) {
    if (acc && acc.key !== keyOf(day.date)) flush();
    if (!acc) acc = { key: keyOf(day.date), cents: 0, first: day.date, last: day.date, schedule };
    acc.cents += day.cents;
    acc.last = day.date;
    if (acc.cents >= NEXT_DAY_THRESHOLD_CENTS) {
      out.push({ accrued: acc.first, lastPayday: day.date, cents: acc.cents, due: nextDayDue(day.date), rule: "next-day" });
      acc = null;
      notes.push(`${day.date}: accumulated liability reached $100,000, so that amount is due the next banking day (${nextDayDue(day.date)}).`);
      if (schedule === "monthly") {
        schedule = "semiweekly";
        notes.push(`${day.date}: a monthly depositor who hits $100,000 becomes semiweekly for the rest of the year and the next year; later paydays here are scheduled that way.`);
      }
    }
  }
  flush();
  out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.accrued < b.accrued ? -1 : 1));

  const perQuarter = new Map();
  for (const d of days) {
    const q = `${d.date.slice(0, 4)}-Q${Math.floor((+d.date.slice(5, 7) - 1) / 3) + 1}`;
    perQuarter.set(q, (perQuarter.get(q) || 0) + d.cents);
  }
  for (const [q, c] of perQuarter) {
    if (c < DE_MINIMIS_CENTS) notes.push(`${q}: net liability ${fmt(c)} is under $2,500, so it may be paid with the return instead of deposited.`);
  }
  return { obligations: out.map((o, i) => ({ ...o, id: i })), notes, endSchedule: schedule };
}

// ---------- penalty ----------
export function penaltyPct(daysLate) {
  for (const t of PENALTY_TIERS) if (daysLate >= t.from && daysLate <= t.to) return t.pct;
  return 0;
}

const MAX_ROWS = 600;

// How deposits are matched to obligations.
//   "default"  IRS ordering: a deposit goes to the most recent open liability
//              (latest accrual first) unless the taxpayer designates otherwise.
//   "oldest"   Designate the oldest open liability first.
//   "optimal"  Cheapest legal matching, solved as a min-cost transportation
//              problem. Never costs more than either of the other two.
export function allocate(obligations, deposits, asOf, strategy = "default") {
  if (obligations.length > MAX_ROWS || deposits.length > MAX_ROWS) throw new Error(`Too many rows (limit ${MAX_ROWS} each)`);
  const deps = deposits
    .filter((d) => d.date <= asOf)
    .map((d, j) => ({ j, date: d.date, cents: d.cents }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.j - b.j));
  const need = obligations.map((o) => o.cents);
  const chunks = []; // {ob, dep (index or -1 for unpaid), cents, daysLate, pct}

  const add = (ob, depIdx, date, cents) => {
    const daysLate = Math.max(0, daysBetween(obligations[ob].due, date));
    chunks.push({ ob, dep: depIdx, date, cents, daysLate, pct: penaltyPct(daysLate) });
  };
  const surplus = new Array(deps.length).fill(0);

  if (strategy === "optimal") {
    const flow = minCostMatch(obligations, deps, asOf);
    for (const f of flow.assign) {
      if (f.dep === -1) add(f.ob, -1, asOf, f.cents);
      else add(f.ob, deps[f.dep].j, deps[f.dep].date, f.cents);
    }
    flow.surplus.forEach((s, k) => (surplus[k] = s));
  } else {
    const left = need.slice();
    deps.forEach((d, k) => {
      let rem = d.cents;
      const open = obligations
        .map((o, i) => i)
        .filter((i) => obligations[i].accrued <= d.date && left[i] > 0);
      open.sort((a, b) =>
        strategy === "oldest"
          ? obligations[a].due < obligations[b].due ? -1 : obligations[a].due > obligations[b].due ? 1 : a - b
          : obligations[b].accrued < obligations[a].accrued ? -1 : obligations[b].accrued > obligations[a].accrued ? 1 : b - a);
      for (const i of open) {
        if (rem <= 0) break;
        const take = Math.min(rem, left[i]);
        left[i] -= take;
        rem -= take;
        add(i, d.j, d.date, take);
      }
      surplus[k] = rem;
    });
    left.forEach((c, i) => {
      if (c > 0) add(i, -1, asOf, c);
    });
  }

  let raw = 0;
  let unpaid = 0;
  const perOb = obligations.map(() => ({ paidLate: 0, unpaid: 0, penaltyRaw: 0, lastDaysLate: 0 }));
  for (const c of chunks) {
    raw += c.cents * c.pct;
    const p = perOb[c.ob];
    p.penaltyRaw += c.cents * c.pct;
    if (c.dep === -1) {
      p.unpaid += c.cents;
      if (c.daysLate > 0) unpaid += c.cents;
    }
    if (c.daysLate > 0) p.lastDaysLate = Math.max(p.lastDaysLate, c.daysLate);
  }
  return {
    strategy,
    penaltyCents: Math.round(raw / 100),
    unpaidLateCents: unpaid,
    perObligation: perOb.map((p) => ({ ...p, penaltyCents: Math.round(p.penaltyRaw / 100) })),
    chunks,
    surplusCents: surplus.reduce((a, b) => a + b, 0),
  };
}

// Min-cost flow. Source -> deposit (cap = amount) -> obligation (cost = tier
// pct of the lateness at that deposit's date) -> sink (cap = amount owed).
// A pseudo-deposit "unpaid" with unlimited supply pays anything left over on
// the as-of date, so every dollar owed gets a price.
function minCostMatch(obligations, deps, asOf) {
  const nO = obligations.length;
  const nD = deps.length;
  const S = 0, T = 1, D0 = 2, O0 = 2 + nD + 1, U = 2 + nD;
  const N = O0 + nO;
  const g = Array.from({ length: N }, () => []);
  const edges = [];
  const addEdge = (u, v, cap, cost) => {
    edges.push({ v, cap, cost, flow: 0 });
    edges.push({ v: u, cap: 0, cost: -cost, flow: 0 });
    g[u].push(edges.length - 2);
    g[v].push(edges.length - 1);
    return edges.length - 2;
  };
  const INF = Number.MAX_SAFE_INTEGER / 4;
  const total = obligations.reduce((a, o) => a + o.cents, 0);
  const depEdges = deps.map((d, k) => addEdge(S, D0 + k, d.cents, 0));
  addEdge(S, U, INF, 0);
  const pairs = [];
  deps.forEach((d, k) => {
    obligations.forEach((o, i) => {
      if (o.accrued <= d.date) pairs.push({ k, i, e: addEdge(D0 + k, O0 + i, INF, penaltyPct(Math.max(0, daysBetween(o.due, d.date)))) });
    });
  });
  const unpaidPairs = obligations.map((o, i) => ({ i, e: addEdge(U, O0 + i, INF, penaltyPct(Math.max(0, daysBetween(o.due, asOf)))) }));
  obligations.forEach((o, i) => addEdge(O0 + i, T, o.cents, 0));

  let sent = 0;
  while (sent < total) {
    const dist = new Array(N).fill(Infinity);
    const prev = new Array(N).fill(-1);
    const inQ = new Array(N).fill(false);
    dist[S] = 0;
    const q = [S];
    while (q.length) {
      const u = q.shift();
      inQ[u] = false;
      for (const id of g[u]) {
        const e = edges[id];
        if (e.cap - e.flow > 0 && dist[u] + e.cost < dist[e.v]) {
          dist[e.v] = dist[u] + e.cost;
          prev[e.v] = id;
          if (!inQ[e.v]) { inQ[e.v] = true; q.push(e.v); }
        }
      }
    }
    if (dist[T] === Infinity) break;
    let push = total - sent;
    for (let v = T; v !== S; v = edges[prev[v] ^ 1].v) push = Math.min(push, edges[prev[v]].cap - edges[prev[v]].flow);
    for (let v = T; v !== S; v = edges[prev[v] ^ 1].v) {
      edges[prev[v]].flow += push;
      edges[prev[v] ^ 1].flow -= push;
    }
    sent += push;
  }
  const assign = [];
  for (const p of pairs) if (edges[p.e].flow > 0) assign.push({ ob: p.i, dep: p.k, cents: edges[p.e].flow });
  for (const p of unpaidPairs) if (edges[p.e].flow > 0) assign.push({ ob: p.i, dep: -1, cents: edges[p.e].flow });
  const surplus = deps.map((d, k) => d.cents - edges[depEdges[k]].flow);
  return { assign, surplus };
}

// ---------- top level ----------
export function analyse(input) {
  const asOf = parseDate(input.asOf);
  const sched = depositorSchedule({ newEmployer: input.newEmployer, lookbackTotal: input.lookbackTotal });
  const liabilities = parseRows(input.liabilities, "Payday").filter((r) => r.cents > 0);
  if (!liabilities.length) throw new Error("Enter at least one payday liability as date, amount");
  const deposits = parseRows(input.deposits, "Deposit");
  const future = deposits.filter((d) => d.date > asOf).length;
  const { obligations, notes, endSchedule } = buildObligations(liabilities, sched.schedule);
  const dflt = allocate(obligations, deposits, asOf, "default");
  const oldest = allocate(obligations, deposits, asOf, "oldest");
  const best = allocate(obligations, deposits, asOf, "optimal");
  const owed = obligations.reduce((a, o) => a + o.cents, 0);
  const depositedTotal = deposits.filter((d) => d.date <= asOf).reduce((a, d) => a + d.cents, 0);
  return {
    asOf,
    schedule: sched,
    endSchedule,
    obligations,
    notes: future ? [...notes, `${future} deposit(s) dated after ${asOf} were ignored.`] : notes,
    owedCents: owed,
    depositedCents: depositedTotal,
    default: dflt,
    oldest,
    optimal: best,
    savingCents: dflt.penaltyCents - best.penaltyCents,
  };
}

export function findings(r) {
  const f = [];
  if (r.default.penaltyCents > 0) {
    f.push({ severity: "high", title: `Penalty exposure ${fmt(r.default.penaltyCents)} under the default ordering`, detail: "Late deposits are priced at 2%, 5% or 10% by days late. Interest runs separately and is not included." });
  } else {
    f.push({ severity: "info", title: "No late-deposit penalty on these entries", detail: "Every dollar was deposited on or before its due date, or is not yet due." });
  }
  if (r.savingCents > 0) {
    f.push({ severity: "medium", title: `Designating deposits could cut the penalty by ${fmt(r.savingCents)}`, detail: "Penalty is set by which liability a deposit is applied to. The IRS applies deposits to the most recent liability first unless you designate otherwise, which can leave older liabilities in a higher tier. A designation is made within 90 days of a penalty notice; the optimal column is the cheapest legal matching of your own deposits." });
  }
  if (r.default.unpaidLateCents > 0) {
    f.push({ severity: "high", title: `${fmt(r.default.unpaidLateCents)} is past due and not covered by a deposit`, detail: `Penalty above assumes it is paid on ${r.asOf}; the 10% tier is already reached after 15 days late, and 15% applies if it stays unpaid ten days after a notice.` });
  }
  if (r.default.surplusCents > 0) {
    f.push({ severity: "info", title: `${fmt(r.default.surplusCents)} of deposits matched no liability`, detail: "A deposit dated before any liability accrued, or larger than what was owed, is shown as unmatched. It may be a prepayment for a later period." });
  }
  if (r.endSchedule !== r.schedule.schedule) {
    f.push({ severity: "medium", title: "You crossed $100,000 and became a semiweekly depositor", detail: "Check your records: the change applies to the remainder of the year and the following year." });
  }
  return f;
}
