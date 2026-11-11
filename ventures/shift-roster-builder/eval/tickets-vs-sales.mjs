// Staff to money or to customers? (2026-11-11)
//
// Every plan so far set heads from sales (money per labor hour). A bakery's morning baguette rush is many small
// tickets; a lunch hour is fewer, bigger ones. If the work is serving people, tickets per hour may be the better
// driver. `--count tickets` (demand.mjs readSales) now counts each distinct ticket, order or receipt number once.
//
// Which driver is right is not in any sales file: that needs a labour standard (minutes per ticket vs per euro), which
// no file here has. What this measures is what the choice moves:
//   1. Shape: each hour's share of the week's sales and of its tickets, and where they part.
//   2. Cross-scoring, week by week out of sample (as backtestSales does: each full week after 4 warm-up weeks is
//      planned from the weeks before it, plain average, priced cut, shortest shift 4, longest 8, minimum staff 1):
//      a plan from sales and one from tickets, each scored against the heads that week's sales needed and the heads its
//      tickets needed. The ticket rate is matched to the sales rate by the file's average ticket (tplh = splh x tickets
//      / sales), so both plans staff about the same hours and differ only in where.
//   3. The third real file, a bakery's transactions with no prices at all ("BreadBasket_DMS.csv", described as an Edinburgh bakery; 2016-10-30 to
//      2017-04-09, columns Date,Time,Transaction,Item): read by ticket, backtested, half-life auto.
// Files are downloaded and checked by SHA-256 (not committed).
//   node eval/tickets-vs-sales.mjs [korean.csv french.csv breadbasket.csv]     output: eval/tickets-vs-sales.out.txt
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readSales, averageSales, headcount, cutShifts, backtestSales, demandShifts } from "../demand.mjs";
import { DAYS } from "../calc.mjs";

const FILES = [
  { id: "korean", url: "https://raw.githubusercontent.com/mkzia/eas503/master/old/fall2024/week13/Bakery%20Sales.csv", sha: "dbe0fa12b06f82b504d09ee262bb4cbe270ec63d0f35645e2931ea4dc9e10b7b", splhs: [15000, 30000, 60000], cur: "won", count: "rows" },
  { id: "french", url: "https://raw.githubusercontent.com/beviu/dbdm/HEAD/Bakery%20sales.csv", sha: "af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2", splhs: [20, 40, 80], cur: "EUR", count: "tickets" },
  { id: "breadbasket", url: "https://raw.githubusercontent.com/viktree/curly-octo-chainsaw/master/BreadBasket_DMS.csv", sha: "72d21cc42c084d1e54a7b9183b0294d8b4142cf4b5a224eb41a21228a71797a8" },
];

async function load(f, path) {
  const bytes = path ? await readFile(path) : Buffer.from(await (await fetch(f.url)).arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== f.sha) { console.error(`${f.id}: SHA-256 ${got} is not the file this was measured on.`); process.exit(1); }
  return bytes.toString("utf8");
}
const DAY_MS = 86400000;
const keyMs = (k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function paired(xs, base) {
  const d = xs.map((x, i) => x - base[i]), m = mean(d);
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, d.length - 1));
  const h = 1.96 * sd / Math.sqrt(d.length);
  return { m, lo: m - h, hi: m + h };
}
const f1 = (x) => (x >= 0 ? " " : "") + x.toFixed(1);
const ci = (p) => `${f1(p.m)} (${p.lo.toFixed(1)} to ${p.hi.toFixed(1)})`;

// One entry per date and hour, summed (as backtestSales does).
function dated(text, count) {
  const r = readSales(text, count ? { count } : {});
  const agg = new Map();
  for (const e of r.entries) {
    if (!e.key) continue;
    const k = `${e.key}|${e.hour}`, x = agg.get(k);
    if (x) x.amount += e.amount; else agg.set(k, { ...e });
  }
  return { entries: [...agg.values()], total: r.entries.reduce((a, e) => a + e.amount, 0) };
}

function weeksOf(entries) {
  let lo = Infinity, hi = -Infinity;
  for (const e of entries) { const t = keyMs(e.key); if (t < lo) lo = t; if (t > hi) hi = t; }
  const monday0 = lo - ((new Date(lo).getUTCDay() + 6) % 7) * DAY_MS;
  const nWeeks = Math.floor((hi - monday0) / DAY_MS / 7) + 1;
  const full = (hi - monday0) / DAY_MS % 7 === 6 ? nWeeks : nWeeks - 1;
  return { monday0, full };
}

// Week-by-week plan from `train` entries at `rate`, cut into shifts with the priced cut at r = 1.
function plan(entries, start, rate, minStaff) {
  const train = entries.filter((e) => keyMs(e.key) < start);
  const a = averageSales(train, { newest: start - DAY_MS, splh: rate, priceCut: true });
  const prof = headcount(a.avg, a.observed, { splh: rate, minStaff, seen: a.seen });
  const staffed = prof.map((p, d) => {
    const row = new Array(24).fill(0);
    for (const [x, y] of cutShifts(p, 4, 8, a.tail ? { tail: a.tail[d], r: 1, minStaff } : null)) for (let t = x; t < y; t++) row[t]++;
    return row;
  });
  return { prof, staffed };
}
function need(entries, start, rate) {
  const act = DAYS.map(() => new Array(24).fill(0));
  for (const e of entries) { const t = keyMs(e.key); if (t >= start && t < start + 7 * DAY_MS) act[e.day][e.hour] += e.amount; }
  return act.map((row) => row.map((v) => Math.ceil(v / rate - 1e-9)));
}
function score(p, needRaw, minStaff) {
  let short = 0, over = 0, sched = 0;
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) {
    const n = p.prof[d][h] > 0 ? Math.max(minStaff, needRaw[d][h]) : needRaw[d][h];
    sched += p.staffed[d][h];
    if (n > p.staffed[d][h]) short += n - p.staffed[d][h]; else over += p.staffed[d][h] - n;
  }
  return { short, over, sched, miss: short + over };
}

const out = [];
const say = (s = "") => { out.push(s); console.log(s); };
const texts = {};
for (const [i, f] of FILES.entries()) texts[f.id] = await load(f, process.argv[2 + i]);

for (const f of FILES.slice(0, 2)) {
  const S = dated(texts[f.id]), T = dated(texts[f.id], f.count);
  const avgTicket = S.total / T.total;
  say(`== ${f.id}: ${Math.round(S.total)} ${f.cur} over ${Math.round(T.total)} ${f.count === "rows" ? "orders (one row each)" : "tickets"}, average ticket ${avgTicket.toFixed(2)} ${f.cur}`);
  // 1. Shape, all days pooled per hour of day.
  const byHour = (E) => { const v = new Array(24).fill(0); for (const e of E) v[e.hour] += e.amount; const s = v.reduce((a, x) => a + x, 0); return v.map((x) => x / s); };
  const hs = byHour(S.entries), ht = byHour(T.entries);
  say("hour   sales%  tickets%  average ticket vs the file's");
  for (let h = 0; h < 24; h++) if (hs[h] > 0.002 || ht[h] > 0.002) say(`${String(h).padStart(2)}:00  ${(hs[h] * 100).toFixed(1).padStart(6)}  ${(ht[h] * 100).toFixed(1).padStart(8)}  ${(hs[h] / ht[h]).toFixed(2).padStart(6)}x`);
  // 2. Cross-scoring.
  const { monday0, full } = weeksOf(S.entries);
  say("rate (sales/h, tickets/h)   tested  plan from sales: on sales need, on ticket need | plan from tickets: on sales, on tickets | tickets-plan minus sales-plan, on ticket need (95% CI) | on sales need");
  for (const splh of f.splhs) {
    const tplh = splh / avgTicket;
    const rows = { ss: [], st: [], ts: [], tt: [], hS: [], hT: [] };
    for (let w = 4; w < full; w++) {
      const start = monday0 + w * 7 * DAY_MS;
      const pS = plan(S.entries, start, splh, 1), pT = plan(T.entries, start, tplh, 1);
      const nS = need(S.entries, start, splh), nT = need(T.entries, start, tplh);
      const a = score(pS, nS, 1), b = score(pS, nT, 1), c = score(pT, nS, 1), d = score(pT, nT, 1);
      rows.ss.push(a.miss); rows.st.push(b.miss); rows.ts.push(c.miss); rows.tt.push(d.miss); rows.hS.push(a.sched); rows.hT.push(d.sched);
    }
    say(`${String(splh).padStart(6)} ${tplh.toFixed(2).padStart(7)}          ${String(rows.ss.length).padStart(3)}    ${mean(rows.ss).toFixed(1).padStart(6)} ${mean(rows.st).toFixed(1).padStart(6)}  (${mean(rows.hS).toFixed(0)} h/wk)      | ${mean(rows.ts).toFixed(1).padStart(6)} ${mean(rows.tt).toFixed(1).padStart(6)}  (${mean(rows.hT).toFixed(0)} h/wk) | ${ci(paired(rows.tt, rows.st))} | ${ci(paired(rows.ts, rows.ss))}`);
  }
  say();
}

// 3. The Bread Basket: tickets only.
{
  const text = texts.breadbasket;
  const T = dated(text, "tickets");
  const { full } = weeksOf(T.entries);
  say(`== breadbasket: ${T.total} tickets, ${full} full weeks; no prices, so tickets are the only driver`);
  for (const tplh of [5, 10, 20]) {
    for (const minStaff of [1, 2]) {
      const b = backtestSales(text, { splh: tplh, minStaff, shifts: true });
      const m = Object.fromEntries(b.methods.map((x) => [x.id, x]));
      const r = demandShifts(text, { splh: tplh, minStaff, halfLife: "auto" });
      const pick = r.halfLife ? `half-life ${r.halfLife}` : "equal weights";
      say(`tplh ${String(tplh).padStart(2)} min ${minStaff}: ${b.weeks} weeks; plain ${m.all.miss.toFixed(1)} (short ${m.all.short.toFixed(1)}, over ${m.all.over.toFixed(1)}, ${m.all.scheduled.toFixed(0)} h/wk); ` +
        ["hl8", "hl4", "hl2", "last4", "last1"].map((id) => `${id} ${f1(m[id].vsDefault)} (${m[id].ci[0].toFixed(1)} to ${m[id].ci[1].toFixed(1)})`).join(", ") + `; auto picks ${pick}; plan ${r.scheduled} h/wk`);
    }
  }
}

if (!process.env.NO_WRITE) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(new URL("./tickets-vs-sales.out.txt", import.meta.url), out.join("\n") + "\n");
}
