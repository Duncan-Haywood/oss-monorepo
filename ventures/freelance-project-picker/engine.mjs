// Freelance project picker: which of the project offers on the table should a
// freelancer or small studio accept? Each offer has a fee, an hours estimate and
// a deadline week; the person has a limited number of billable hours per week.
// Hours can be split across weeks, so a set of projects is deliverable exactly
// when, for every deadline week d, the hours of the chosen projects due by week d
// fit in the capacity of weeks 1..d. The set with the highest total fee under
// that rule is found exactly by dynamic programming over projects sorted by
// deadline (a knapsack whose capacity grows with each deadline), checked against
// trying every subset in the tests. Highest fee, best hourly rate and
// first-offered are scored beside it, because each can be wrong.
//
// Pure functions, no network, no dependencies.

export const MODEL_NOTE =
  "Plan value = the fees of the accepted projects. A set is deliverable when, for every deadline week, the hours due by then fit the hours you have by then. " +
  "Hours and fees are the ones you supply (hours estimates are usually optimistic); it is a decision aid, not a forecast.";

export const INPUT_NOTES = [
  { what: "capacity,,30,,default per week", detail: "Billable hours per week you can give to new work. The first capacity row without a week number is the default for every week." },
  { what: "capacity,,15,3,week 3", detail: "Capacity for one week (weeks count from 1, this week). Overrides the default for that week: use it for holidays, existing clients and time off." },
  { what: "project,6000,60,3,Brand site", detail: "An offer: kind,fee,hours,deadline week[,label]. Hours are all the hours you expect it to take, including revisions and calls. The deadline week is the last week you can still work on it." },
  { what: "Fee", detail: "Total for the project, after platform fees if you want a net number. A $ sign is ignored; write 6000, not 6,000 (a comma starts the next column)." },
  { what: "Hours", detail: "A whole number of hours (decimals are rounded up). Add a buffer for scope creep yourself, or use the buffer setting." },
  { what: "Header row and # comments", detail: "A first row starting with kind, blank lines and lines starting with # are skipped." },
];

const money = (n) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
export { money };

export function parseOffers(text) {
  const projects = [];
  const capacities = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(",").map((c) => c.trim());
    if (/^kind$/i.test(cells[0])) return;
    const kind = cells[0].toLowerCase();
    const where = `line ${i + 1}`;
    const num = (s) => Number(String(s).replace(/^\$/, ""));
    if (kind === "capacity") {
      const hours = num(cells[2]);
      const week = cells[3] === undefined || cells[3] === "" ? null : Number(cells[3]);
      if (!Number.isFinite(hours) || hours < 0 || cells[2] === "") return errors.push(`${where}: capacity needs hours per week, zero or more`);
      if (week !== null && !(Number.isInteger(week) && week >= 1)) return errors.push(`${where}: capacity week must be a whole number from 1`);
      capacities.push({ week, hours: Math.ceil(hours), line: i + 1 });
    } else if (kind === "project" || kind === "offer" || kind === "lead") {
      const fee = num(cells[1]);
      const hours = num(cells[2]);
      const deadline = Number(cells[3]);
      if (!Number.isFinite(fee) || fee < 0 || cells[1] === "") return errors.push(`${where}: fee must be a number, zero or more`);
      if (!Number.isFinite(hours) || hours <= 0) return errors.push(`${where}: hours must be more than zero`);
      if (!(Number.isInteger(deadline) && deadline >= 1)) return errors.push(`${where}: deadline week must be a whole number from 1`);
      projects.push({ line: i + 1, fee, hours: Math.ceil(hours), deadline, label: cells.slice(4).join(",").trim() });
    } else {
      errors.push(`${where}: kind "${cells[0]}" is not capacity or project`);
    }
  });
  return { projects, capacities, errors };
}

// cumulative capacity by the end of each week 1..horizon
export function cumulativeCapacity(capacities, horizon, buffer = 0) {
  const def = capacities.find((c) => c.week === null);
  const per = new Map(capacities.filter((c) => c.week !== null).map((c) => [c.week, c.hours]));
  const out = [0];
  for (let w = 1; w <= horizon; w += 1) {
    const h = per.has(w) ? per.get(w) : def ? def.hours : 0;
    out.push(out[w - 1] + h);
  }
  return out;
}

// hours as the planner sees them, with the optional scope-creep buffer
const planHours = (p, buffer) => Math.ceil(p.hours * (1 + buffer));

export function feasible(items, cum, buffer = 0) {
  const sorted = [...items].sort((a, b) => a.deadline - b.deadline);
  let used = 0;
  for (const p of sorted) {
    used += planHours(p, buffer);
    const cap = cum[Math.min(p.deadline, cum.length - 1)];
    if (used > cap) return false;
  }
  return true;
}

// Exact best subset. Items sorted by deadline; dp[h] = best fee using exactly h hours.
export function optimise(projects, cum, buffer = 0) {
  const items = projects.map((p, idx) => ({ ...p, idx })).sort((a, b) => a.deadline - b.deadline || a.idx - b.idx);
  const total = cum[cum.length - 1];
  const NEG = -Infinity;
  let dp = new Array(total + 1).fill(NEG);
  dp[0] = 0;
  const take = [];
  for (const it of items) {
    const w = planHours(it, buffer);
    const cap = cum[Math.min(it.deadline, cum.length - 1)];
    const next = dp.slice();
    const took = new Array(total + 1).fill(false);
    for (let h = w; h <= Math.min(cap, total); h += 1) {
      if (dp[h - w] !== NEG && dp[h - w] + it.fee > next[h]) {
        next[h] = dp[h - w] + it.fee;
        took[h] = true;
      }
    }
    dp = next;
    take.push(took);
  }
  let bestH = 0;
  for (let h = 0; h <= total; h += 1) if (dp[h] > dp[bestH]) bestH = h;
  const chosen = [];
  let h = bestH;
  for (let k = items.length - 1; k >= 0; k -= 1) {
    if (take[k][h]) {
      chosen.push(items[k]);
      h -= planHours(items[k], buffer);
    }
  }
  chosen.reverse();
  return { value: dp[bestH], chosen };
}

// First-fit rules: walk the offers in an order, accept one when it still fits.
function greedy(projects, cum, buffer, order) {
  const picked = [];
  for (const p of [...projects].sort(order)) {
    if (feasible([...picked, p], cum, buffer)) picked.push(p);
  }
  return { value: picked.reduce((s, p) => s + p.fee, 0), chosen: picked };
}

export function plan(parsed, opts = {}) {
  const buffer = Math.max(0, Number(opts.buffer) || 0) / 100;
  const { projects, capacities } = parsed;
  const horizon = Math.max(1, ...projects.map((p) => p.deadline), ...capacities.map((c) => c.week || 1));
  const cum = cumulativeCapacity(capacities, horizon);
  const best = optimise(projects, cum, buffer);
  const chosenIdx = new Set(best.chosen.map((p) => p.idx));
  const view = (p) => ({ ...p, planHours: planHours(p, buffer), rate: p.fee / planHours(p, buffer) });
  const chosen = best.chosen.map(view);
  const declined = projects
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => !chosenIdx.has(p.idx))
    .map((p) => {
      const alone = feasible([p], cum, buffer);
      const others = projects.filter((_, i) => i !== p.idx);
      // fee at which it would earn its place: the best plan without it, minus the best plan
      // of the others that still leaves room for it
      const forcedIn = optimiseForced(others, projects[p.idx], cum, buffer);
      return {
        ...view(p),
        reason: !alone
          ? `its ${planHours(p, buffer)} hours do not fit in the ${cum[Math.min(p.deadline, cum.length - 1)]} hours you have by week ${p.deadline}`
          : `taking it would push out projects worth more together`,
        breakEvenFee: forcedIn === null ? null : Math.max(0, best.value - forcedIn),
      };
    });
  const byFee = greedy(projects, cum, buffer, (a, b) => b.fee - a.fee);
  const byRate = greedy(projects, cum, buffer, (a, b) => b.fee / planHours(b, buffer) - a.fee / planHours(a, buffer));
  const byOrder = greedy(projects, cum, buffer, (a, b) => a.line - b.line);
  const hoursUsed = chosen.reduce((s, p) => s + p.planHours, 0);
  const totals = {
    plan: best.value,
    highestFeeFirst: byFee.value,
    bestRateFirst: byRate.value,
    listedOrder: byOrder.value,
    upliftVsHighestFee: best.value - byFee.value,
    upliftVsBestRate: best.value - byRate.value,
    upliftVsListedOrder: best.value - byOrder.value,
    hoursUsed,
    hoursAvailable: cum[cum.length - 1],
    effectiveRate: hoursUsed ? best.value / hoursUsed : 0,
  };
  // what ten more billable hours in every week would add
  const more = optimise(projects, cum.map((c, w) => c + 10 * w), buffer);
  const sensitivity = { extraTenHoursEveryWeek: more.value - best.value };
  const findings = [];
  if (!projects.length) findings.push({ severity: "error", rule: "no-projects", message: "No project rows found." });
  if (totals.upliftVsHighestFee > 0) findings.push({ severity: "info", rule: "fee-not-best", message: `Taking offers by highest fee would earn ${money(totals.upliftVsHighestFee)} less than this plan.` });
  if (totals.upliftVsBestRate > 0) findings.push({ severity: "info", rule: "rate-not-best", message: `Taking offers by best hourly rate would earn ${money(totals.upliftVsBestRate)} less: a high rate on a small project can leave hours nothing else fills.` });
  if (hoursUsed < totals.hoursAvailable * 0.8 && declined.length) findings.push({ severity: "warn", rule: "idle-hours", message: `The plan leaves ${totals.hoursAvailable - hoursUsed} hours unused because remaining offers do not fit their deadlines; ask those clients for a later deadline or split the project.` });
  return { chosen, declined, totals, sensitivity, findings, buffer, horizon, cumulative: cum };
}

// best total when `forced` must be included (null if it cannot fit at all)
function optimiseForced(others, forced, cum, buffer) {
  const sorted = [...others, { ...forced, fee: 0, __forced: true }];
  // include forced by giving it a huge fee, then strip it
  const BIG = 1e9;
  const withBig = optimise(sorted.map((p) => (p.__forced ? { ...p, fee: BIG } : p)), cum, buffer);
  if (withBig.value < BIG) return null;
  return withBig.value - BIG;
}

export function summarize(p) {
  if (!p.chosen.length) return { status: "none", text: "No offer fits your hours by its deadline. Ask for later deadlines or more capacity." };
  const t = p.totals;
  const up = Math.max(t.upliftVsHighestFee, t.upliftVsBestRate, t.upliftVsListedOrder);
  const base = `Accept ${p.chosen.length} of ${p.chosen.length + p.declined.length} offers for ${money(t.plan)} using ${t.hoursUsed} of ${t.hoursAvailable} hours (${money(t.effectiveRate)} per hour).`;
  return up > 0
    ? { status: "gain", text: `${base} That is ${money(up)} more than the best of highest-fee-first, best-rate-first and listed order.` }
    : { status: "same", text: `${base} The simple rules find the same set here.` };
}
