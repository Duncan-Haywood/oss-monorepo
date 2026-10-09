// Childcare enrollment mix optimizer. Pure functions, no DOM, no network.
// A centre has a fixed amount of usable floor space and several age groups, each with its own weekly tuition, staff-to-child
// ratio, largest allowed group, floor space per child and number of families who want a place. Staffing is a staircase: the
// ninth infant can cost a whole extra teacher. This chooses how many children to enrol in each group to maximise weekly profit,
// by dynamic programming over (children, floor space) so the answer is exact, not a rule of thumb. It also compares the answer
// with the two ways owners usually fill rooms, shows where each hire is triggered, and what more floor space or a tighter
// ratio rule would do.

export const MAX_GROUPS = 6;
export const MAX_STATES = 1_500_000;
export const SHARED_DEFAULTS = { areaSqft: 0, licensedCap: 0, wage: 22, openHours: 50, coverage: 1.15, collectionPct: 95, fixedWeekly: 0 };
export const ITEM_DEFAULTS = { name: "", tuition: 0, ratio: 0, maxGroup: 0, sqftPerChild: 35, demand: 0, varCost: 0 };

// Placeholder example figures, not any centre's tuition, wages or the rules of any state.
export const EXAMPLE_SHARED = { areaSqft: 3150, licensedCap: 0, wage: 22, openHours: 50, coverage: 1.15, collectionPct: 95, fixedWeekly: 2600 };
export const EXAMPLE_ITEMS = [
  { name: "Infants", tuition: 420, ratio: 4, maxGroup: 8, sqftPerChild: 35, demand: 14, varCost: 28 },
  { name: "Toddlers", tuition: 300, ratio: 6, maxGroup: 12, sqftPerChild: 35, demand: 18, varCost: 22 },
  { name: "Twos", tuition: 270, ratio: 8, maxGroup: 16, sqftPerChild: 35, demand: 16, varCost: 20 },
  { name: "Preschool", tuition: 235, ratio: 10, maxGroup: 20, sqftPerChild: 35, demand: 30, varCost: 18 },
  { name: "School age", tuition: 120, ratio: 15, maxGroup: 30, sqftPerChild: 35, demand: 25, varCost: 9 },
];

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");

export function cleanShared(s = {}) {
  const D = SHARED_DEFAULTS;
  return {
    areaSqft: Math.min(20000, Math.max(0, Math.floor(num(s.areaSqft, D.areaSqft)))),
    licensedCap: Math.min(200, Math.max(0, Math.floor(num(s.licensedCap, D.licensedCap)))),
    wage: Math.max(0, num(s.wage, D.wage)),
    openHours: Math.min(168, Math.max(1, num(s.openHours, D.openHours))),
    coverage: Math.min(3, Math.max(1, num(s.coverage, D.coverage))),
    collectionPct: Math.min(100, Math.max(0, num(s.collectionPct, D.collectionPct))),
    fixedWeekly: Math.max(0, num(s.fixedWeekly, D.fixedWeekly)),
  };
}

export function cleanItems(items = []) {
  const out = [];
  const warnings = [];
  items.slice(0, MAX_GROUPS).forEach((raw, i) => {
    const t = raw || {};
    const tuition = num(t.tuition);
    const demand = Math.floor(num(t.demand));
    const name = String(t.name ?? "").trim() || `Group ${i + 1}`;
    if (tuition <= 0 && demand <= 0) return; // untouched row
    const ratio = num(t.ratio);
    const sqft = Math.round(num(t.sqftPerChild, 35));
    if (tuition <= 0) { warnings.push(`${name}: enter the weekly tuition per child; the group was left out.`); return; }
    if (ratio < 1) { warnings.push(`${name}: enter how many children one teacher may supervise (1 or more); the group was left out.`); return; }
    if (sqft < 1) { warnings.push(`${name}: enter the floor space required per child; the group was left out.`); return; }
    if (demand < 1) { warnings.push(`${name}: enter how many children want a place; the group was left out.`); return; }
    const ratioInt = Math.floor(ratio);
    out.push({
      name, tuition, ratio: ratioInt, sqft, demand: Math.min(200, demand),
      maxGroup: Math.max(1, Math.floor(num(t.maxGroup)) || 1000),
      varCost: Math.max(0, num(t.varCost)),
    });
  });
  return { items: out, warnings };
}

// Teachers for n children in a group: split into the fewest rooms the group-size rule allows, spread evenly, each room
// staffed to the ratio (and never fewer than one teacher per open room).
export function roomsFor(n, maxGroup) { return n <= 0 ? 0 : Math.ceil(n / maxGroup); }
export function teachersFor(n, ratio, maxGroup) {
  if (n <= 0) return 0;
  const c = roomsFor(n, maxGroup);
  const base = Math.floor(n / c), extra = n % c;
  return extra * Math.ceil((base + 1) / ratio) + (c - extra) * Math.max(1, Math.ceil(base / ratio));
}

function weeklyTeacherCost(shared) { return shared.wage * shared.openHours * shared.coverage; }

export function groupProfit(g, n, shared, ratioDelta = 0) {
  if (n <= 0) return 0;
  const ratio = Math.max(1, g.ratio + ratioDelta);
  const revenue = n * g.tuition * (shared.collectionPct / 100);
  return revenue - n * g.varCost - teachersFor(n, ratio, g.maxGroup) * weeklyTeacherCost(shared);
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

// Exact solve. Returns the best plan plus the best profit at every floor-space level up to the area.
export function solve(groups, shared, opts = {}) {
  const ratioDelta = opts.ratioDelta || 0;
  const wageFactor = opts.wageFactor || 1;
  const sh = wageFactor === 1 ? shared : { ...shared, wage: shared.wage * wageFactor };
  const G = groups.length;
  const unit = groups.reduce((a, g) => gcd(a, g.sqft), 0) || 1;
  const A = Math.floor(shared.areaSqft / unit);
  const maxByArea = groups.map((g) => Math.min(g.demand, Math.floor(shared.areaSqft / g.sqft)));
  const cap = Math.min(shared.licensedCap > 0 ? shared.licensedCap : Infinity, maxByArea.reduce((a, b) => a + b, 0), Math.floor(shared.areaSqft / Math.min(...groups.map((g) => g.sqft))));
  const W = A + 1;
  const states = (cap + 1) * W;
  if (states * G > MAX_STATES * 2) return { tooLarge: true };
  const profits = groups.map((g, i) => Array.from({ length: maxByArea[i] + 1 }, (_, n) => groupProfit(g, n, sh, ratioDelta)));
  let cur = new Float64Array(states).fill(-Infinity);
  cur[0] = 0;
  const choice = [];
  for (let i = 0; i < G; i++) {
    const next = new Float64Array(states).fill(-Infinity);
    const pick = new Int16Array(states).fill(-1);
    const u = groups[i].sqft / unit;
    for (let h = 0; h <= cap; h++) {
      for (let a = 0; a <= A; a++) {
        const v = cur[h * W + a];
        if (v === -Infinity) continue;
        const top = Math.min(maxByArea[i], cap - h, Math.floor((A - a) / u));
        for (let n = 0; n <= top; n++) {
          const idx = (h + n) * W + a + n * u;
          const w = v + profits[i][n];
          if (w > next[idx] + 1e-9) { next[idx] = w; pick[idx] = n; }
        }
      }
    }
    choice.push(pick);
    cur = next;
  }
  // Best profit per floor-space level (prefix maximum across children counts).
  const bestAt = new Float64Array(W).fill(-Infinity);
  const argAt = new Int32Array(W).fill(-1);
  for (let h = 0; h <= cap; h++) for (let a = 0; a <= A; a++) {
    const v = cur[h * W + a];
    if (v > bestAt[a] + 1e-9) { bestAt[a] = v; argAt[a] = h; }
  }
  let bestA = 0;
  for (let a = 0; a <= A; a++) if (bestAt[a] > bestAt[bestA] + 1e-9) bestA = a;
  const counts = new Array(G).fill(0);
  let h = argAt[bestA], a = bestA;
  for (let i = G - 1; i >= 0; i--) {
    const n = choice[i][h * W + a];
    counts[i] = n;
    h -= n; a -= n * (groups[i].sqft / unit);
  }
  const frontier = [];
  let run = -Infinity;
  for (let x = 0; x <= A; x++) {
    if (bestAt[x] > run + 1e-9) { run = bestAt[x]; frontier.push({ sqft: x * unit, profit: run }); }
  }
  return { counts, profit: bestAt[bestA], frontier, unit };
}

function planProfit(groups, counts, shared, ratioDelta = 0) {
  return groups.reduce((t, g, i) => t + groupProfit(g, counts[i], shared, ratioDelta), 0);
}

// What an owner does without a solver: fill one group at a time in a fixed order, as full as demand, space and the cap allow.
function greedy(groups, shared, order) {
  const counts = new Array(groups.length).fill(0);
  let area = shared.areaSqft, kids = shared.licensedCap > 0 ? shared.licensedCap : Infinity;
  for (const i of order) {
    const n = Math.max(0, Math.min(groups[i].demand, Math.floor(area / groups[i].sqft), kids));
    counts[i] = n; area -= n * groups[i].sqft; kids -= n;
  }
  return { counts, profit: planProfit(groups, counts, shared) };
}

export function hirePoints(g, limit) {
  const pts = [];
  let prev = 0;
  for (let n = 1; n <= limit; n++) {
    const t = teachersFor(n, g.ratio, g.maxGroup);
    if (t > prev) pts.push(n);
    prev = t;
  }
  return pts;
}

export function analyze(rawItems, rawShared) {
  const shared = cleanShared(rawShared);
  const { items: groups, warnings } = cleanItems(rawItems);
  const res = { ok: false, warnings: [...warnings], shared, groups };
  if (!groups.length) { res.warnings.push("Enter at least one age group with a weekly tuition, a ratio, floor space per child and how many children want a place."); return res; }
  if (shared.areaSqft < Math.min(...groups.map((g) => g.sqft))) { res.warnings.push("Enter the usable floor space for children, in square feet."); return res; }
  if (shared.wage <= 0) { res.warnings.push("Enter what a teacher costs per hour, including payroll taxes and benefits."); return res; }
  const sol = solve(groups, shared);
  if (sol.tooLarge) { res.warnings.push("That combination of floor space and licensed capacity is too large to check exactly. Lower the floor space or enter a licensed capacity."); return res; }

  const perTeacher = weeklyTeacherCost(shared);
  const rows = groups.map((g, i) => {
    const n = sol.counts[i];
    const teachers = teachersFor(n, g.ratio, g.maxGroup);
    const revenue = n * g.tuition * (shared.collectionPct / 100);
    const limit = Math.min(g.demand, Math.floor(shared.areaSqft / g.sqft));
    const hires = hirePoints(g, limit);
    const nextHire = hires.find((h) => h > n) || null;
    return {
      name: g.name, children: n, demand: g.demand, rooms: roomsFor(n, g.maxGroup), teachers,
      revenue, staff: teachers * perTeacher, other: n * g.varCost, profit: groupProfit(g, n, shared),
      sqft: n * g.sqft, perSqft: n ? groupProfit(g, n, shared) / (n * g.sqft) : 0,
      nextChild: n < limit ? groupProfit(g, n + 1, shared) - groupProfit(g, n, shared) : null,
      freeBeforeHire: nextHire ? nextHire - 1 - n : null,
      hires,
    };
  });
  const kids = sol.counts.reduce((a, b) => a + b, 0);
  const byTuition = greedy(groups, shared, groups.map((_, i) => i).sort((a, b) => groups[b].tuition - groups[a].tuition));
  const bySpace = greedy(groups, shared, groups.map((_, i) => i).sort((a, b) => groups[b].tuition / groups[b].sqft - groups[a].tuition / groups[a].sqft));
  const shortcutBest = Math.max(byTuition.profit, bySpace.profit);
  const wide = solve(groups, { ...shared, areaSqft: Math.min(20000, Math.ceil(shared.areaSqft * 1.6)) });
  const next = wide.tooLarge ? null : wide.frontier.find((f) => f.sqft > shared.areaSqft - 1e-9 && f.profit > sol.profit + 1e-9) || null;
  const stricter = solve(groups, shared, { ratioDelta: -1 });
  const dearer = solve(groups, shared, { wageFactor: 1.1 });

  res.ok = true;
  res.rows = rows;
  res.children = kids;
  res.rooms = rows.reduce((t, r) => t + r.rooms, 0);
  res.teachers = rows.reduce((t, r) => t + r.teachers, 0);
  res.profit = sol.profit;
  res.net = sol.profit - shared.fixedWeekly;
  res.netYear = res.net * 52;
  res.spaceUsed = rows.reduce((t, r) => t + r.sqft, 0);
  res.revenue = rows.reduce((t, r) => t + r.revenue, 0);
  res.byTuition = { ...byTuition, names: groups.map((g, i) => `${byTuition.counts[i]} ${g.name}`) };
  res.bySpace = { ...bySpace, names: groups.map((g, i) => `${bySpace.counts[i]} ${g.name}`) };
  res.shortcutLoss = Math.max(0, sol.profit - shortcutBest);
  res.nextSpace = next && { extraSqft: next.sqft - shared.areaSqft, extraProfit: next.profit - sol.profit };
  res.stricter = { profit: stricter.profit, change: stricter.profit - sol.profit, counts: stricter.counts };
  res.dearer = { profit: dearer.profit, change: dearer.profit - sol.profit, counts: dearer.counts };
  res.unfilled = rows.filter((r) => r.children < r.demand).map((r) => r.name);
  res.losing = rows.filter((r) => r.children > 0 && r.profit <= 0).map((r) => r.name);
  return res;
}

export function toCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["group", "children", "waiting for a place", "rooms", "teachers", "weekly revenue", "weekly teacher cost", "weekly other cost", "weekly profit", "sq ft used", "next child changes profit by"].join(",")];
  for (const r of a.rows) {
    lines.push([q(r.name), r.children, r.demand, r.rooms, r.teachers, r.revenue.toFixed(2), r.staff.toFixed(2), r.other.toFixed(2), r.profit.toFixed(2), r.sqft, r.nextChild == null ? "" : r.nextChild.toFixed(2)].join(","));
  }
  return lines.join("\n") + "\n";
}
