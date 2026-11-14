// Travel time between sites (2026-11-14): what does a roster that ignores it post, and what does honouring it cost?
//
// Made-up weeks (seeded): two shops 7 days a week with split shifts allowed (rest rule 0, daily cap 10 h), so one person
// may work a short shift at one shop and another later the same day: a split-shift restaurant week. Main runs lunch 11-3
// (2 people), an afternoon 3-5 (1) and dinner 5-10 (2); Harbour lunch 11:30-2:30 (1) and dinner 5:30-9:30 (1, 2 Fri-Sun).
// So the tightest hops are 30 min (Harbour lunch to Main's afternoon, Main's afternoon to Harbour dinner) and 60 min.
// N people (argv[3], default 10), everyone allowed at both shops,
// 1-3 random days off, 24-40 h caps, $15-22 wages. For each trip time T (0 = the rule off, as before today):
//   hops        - person-days where one person works at both shops;
//   under u     - hops where a shift at one shop starts less than u minutes after their shift at the other ends
//                 (counted on every roster against every u, so the T = 0 roster shows what ignoring the trip posts);
//   open hours and payroll of the roster built with --travel T.
// The script stops if a roster built with travel T has any hop tighter than T.
//
// Run: node eval/travel-between-sites.mjs > eval/travel-between-sites.out.txt
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIFTS = [
  "Mon-Sun, 11am, 3pm, 2, Lunch, site: Main", "Mon-Sun, 3pm, 5pm, 1, Afternoon, site: Main", "Mon-Sun, 5pm, 10pm, 2, Dinner, site: Main",
  "Mon-Sun, 11:30am, 2:30pm, 1, Lunch, site: Harbour", "Mon-Sun, 5:30pm, 9:30pm, 1, Dinner, site: Harbour", "Fri-Sun, 5:30pm, 9:30pm, 1, Dinner, site: Harbour",
].join("\n");

function staffText(seed) {
  const r = rng(seed);
  const rows = [];
  for (let k = 0; k < N; k++) {
    const off = new Set();
    const nOff = 1 + Math.floor(r() * 3);
    while (off.size < nOff) off.add(Math.floor(r() * 7));
    const avail = DAYS.filter((_, d) => !off.has(d)).map((d) => `${d} 9-23`).join("; ");
    rows.push(`P${k + 1}, ${15 + Math.round(r() * 7)}, ${[24, 32, 40][Math.floor(r() * 3)]}, 0, ${avail}, sites: Main | Harbour`);
  }
  return "name,wage,max,min,availability\n" + rows.join("\n");
}

// One entry per person-day with shifts at both shops: the smallest gap (minutes) between a shift at one and one at the other.
function hops(r) {
  const by = new Map();
  for (const a of r.assignments) if (a.person) {
    const k = `${a.person}|${a.slot.day}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(a.slot);
  }
  const out = [];
  for (const [k, list] of by) {
    let gap = Infinity;
    for (const a of list) for (const b of list) if (a.site !== b.site && b.start >= a.end) gap = Math.min(gap, b.start - a.end);
    if (gap < Infinity) out.push({ k, gap });
  }
  return out;
}

const TS = [0, 30, 45, 60];
const N = Number(process.argv[3] || 10);
const SEEDS = Number(process.argv[2] || 30);
const BASE = { exact: "auto", seed: 1, minRestHours: 0, maxDailyHours: 10 };
const tot = Object.fromEntries(TS.map((t) => [t, { open: 0, cost: 0, hops: 0, tight: Object.fromEntries(TS.map((u) => [u, 0])), worse: 0, ms: 0 }]));
const lines = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const st = parseStaff(staffText(seed)), sh = parseShifts(SHIFTS);
  if (st.errors.length || sh.errors.length) throw new Error([...st.errors, ...sh.errors].join("; "));
  const cells = [`seed ${String(seed).padStart(2)}`];
  let open0 = null;
  for (const T of TS) {
    const t0 = Date.now();
    const r = buildRoster(st.staff, sh.slots, { ...BASE, ...(T ? { travel: T } : {}) });
    const R = tot[T];
    R.ms += Date.now() - t0;
    const hs = hops(r);
    for (const u of TS) R.tight[u] += hs.filter((h) => h.gap < u).length;
    if (T && hs.some((h) => h.gap < T)) throw new Error(`seed ${seed}: travel ${T} roster has a ${hs.find((h) => h.gap < T).gap} min hop`);
    if (T === 0) open0 = r.unfilledHours;
    else if (r.unfilledHours > open0 + 1e-9) R.worse++;
    R.open += r.unfilledHours; R.cost += r.cost; R.hops += hs.length;
    cells.push(`T=${T}: ${String(r.unfilledHours).padStart(4)} h $${r.cost.toFixed(0).padStart(5)} ${hs.length} hops (${hs.filter((h) => h.gap < 30).length} < 30 min)`);
  }
  lines.push(cells.join(" | "));
}
console.log(`Travel between two shops, ${SEEDS} made-up weeks, split shifts allowed (rest 0, daily cap 10 h), ${N} people at both shops.`);
console.log(`Main 10-2 and 2-10 (2 each), Harbour 11-2 and 2-9 (1 Mon-Thu, 2 Fri-Sun). Same engine, exact check "auto".\n`);
lines.forEach((l) => console.log(l));
console.log(`\nTotals over ${SEEDS} weeks (hops = person-days at both shops; "under u" = hops with less than u minutes between the two):`);
for (const T of TS) {
  const R = tot[T];
  const tight = TS.filter((u) => u).map((u) => `under ${u}: ${R.tight[u]}`).join(", ");
  console.log(`  travel ${String(T).padStart(2)} min  open ${R.open} h, payroll $${R.cost.toFixed(0)}; ${R.hops} hops (${tight}); more open hours than T = 0 in ${R.worse} weeks; ${(R.ms / SEEDS / 1000).toFixed(1)} s a build`);
}
