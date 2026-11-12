// How much does a planned month churn once people take dated days off, and what does "keep last week's shifts" (keepValue)
// buy and cost? Plans the café sample and each built-in template for 4 weeks with leave scattered at random at several rates
// (share of person-days off; no real leave records were reachable from this host, so the rate is swept, not assumed), once
// with keepValue 0 (the planner before this change) and once per KEEP value. Prints, summed over seeds: weeks reused, weeks
// proven, open hours, pay, and churn = person-shift pairs that differ between week k-1 and week k (k >= 2; adds plus drops).
// "forced" counts the drops whose holder is off that day in week k: those must move whatever the setting.
//   node eval/steady-plan.mjs [seeds=3] [weeks=4]       RATES=0,0.01,0.02,0.04  KEEP=0.1,0.25  EXACT=auto|off
import { planWeeks, TEMPLATES, sampleStaff, sampleShifts, slotKey } from "../calc.mjs";
const seeds = Number(process.argv[2] || 3), weeks = Number(process.argv[3] || 4);
const rates = (process.env.RATES || "0,0.01,0.02,0.04").split(",").map(Number);
const keeps = [0, ...(process.env.KEEP || "0.1,0.25").split(",").map(Number)];
const exact = process.env.EXACT === "off" ? false : "auto";
const page = { minRestHours: 10, maxConsecDays: 6, maxDailyHours: 0, otAfter: 40, otMult: 1.5, burdenPct: 0, balance: 25, toughBalance: 0, exact, exactMs: 4000 };
const weekStart = "2026-11-16";
const iso = (k) => new Date(Date.UTC(2026, 10, 16 + k)).toISOString().slice(0, 10);
const proven = (r) => r.optimality?.status === "optimal" || r.optimality?.status === "improved";
// Each person-day of the plan is off with probability `rate` (an LCG, so a seed gives the same leave every run).
function withLeave(staffText, rate, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
  const offByName = new Map();
  const text = staffText.split("\n").map((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#") || /^name\b/i.test(t)) return line;
    const off = [];
    for (let d = 0; d < 7 * weeks; d++) if (rnd() < rate) off.push(iso(d));
    offByName.set(t.split(/[,\t]/)[0].trim().toLowerCase(), new Set(off));
    return off.length ? `${line}, off: ${off.join("; ")}` : line;
  }).join("\n");
  return { text, offByName };
}
const pairs = (r) => new Set(r.assignments.filter((a) => a.person).map((a) => `${a.person.toLowerCase()}@${slotKey(a.slot)}`));
function churn(plan, offByName) {
  let moved = 0, forced = 0;
  for (let k = 1; k < plan.weeks.length; k++) {
    const a = pairs(plan.weeks[k - 1].roster), b = pairs(plan.weeks[k].roster);
    for (const x of b) if (!a.has(x)) moved++;
    for (const x of a) if (!b.has(x)) {
      moved++;
      const [name, key] = x.split("@"), day = Number(key.split("|")[0]);
      if (offByName.get(name)?.has(iso(7 * k + day))) forced++;
    }
  }
  return { moved, forced };
}
const cases = [["cafe-sample", sampleStaff(), sampleShifts()], ...Object.entries(TEMPLATES).map(([k, t]) => [k, t.staff(), t.shifts()])];
const fields = ["weeks", "reused", "proven", "open", "pay", "moved", "forced", "ms"];
const blank = () => Object.fromEntries(fields.map((f) => [f, 0]));
const line = (r) => `weeks ${r.weeks} reused ${String(r.reused).padStart(2)} proven ${String(r.proven).padStart(2)} open ${String(r.open).padStart(4)} h pay $${r.pay.toFixed(2).padStart(9)} churn ${String(r.moved).padStart(4)} (forced ${String(r.forced).padStart(3)}) ${r.ms} ms`;
const sum = new Map();
for (const rate of rates) for (const [name, st, sh] of cases) {
  const row = new Map(keeps.map((kv) => [kv, blank()]));
  for (let sd = 0; sd < seeds; sd++) {
    const { text, offByName } = withLeave(st, rate, 1000 * sd + Math.round(rate * 1000) + name.length);
    for (const kv of keeps) {
      const t0 = Date.now();
      const p = planWeeks(text, sh, { ...page, weeks, weekStart, keepValue: kv });
      if (p.error) { console.log(`${name} rate ${rate} seed ${sd}: ${p.error}`); continue; }
      const r = row.get(kv), c = churn(p, offByName);
      r.ms += Date.now() - t0; r.weeks += p.weeks.length; r.reused += p.weeks.filter((w) => w.sameAs).length;
      r.proven += p.weeks.filter((w) => proven(w.roster)).length; r.open += p.totalOpenHours; r.pay += p.totalCost;
      r.moved += c.moved; r.forced += c.forced;
    }
  }
  for (const [kv, r] of row) {
    console.log(`${name.padEnd(12)} leave ${String(rate).padEnd(5)} keep ${String(kv).padEnd(4)} ${line(r)}`);
    const k = `${rate}|${kv}`, t = sum.get(k) || blank();
    for (const f of fields) t[f] += r[f];
    sum.set(k, t);
  }
}
console.log(`\nall ${cases.length} cases, ${seeds} seeds, ${weeks} weeks, exact ${exact}`);
for (const [k, t] of sum) {
  const [rate, kv] = k.split("|");
  console.log(`leave ${rate.padEnd(5)} keep ${kv.padEnd(4)} ${line(t)}`);
}
