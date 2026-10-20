// Per-job profit and price floor for a wedding / event photographer. Pure functions, no DOM.
// The point: coverage hours are the minority of the hours a job takes. Culling and editing
// time is counted on every package. Arithmetic on figures the user types; no market prices.

export const DEFAULTS = Object.freeze({
  overheadMonthly: 0,
  cardFeePct: 3,
  travelHours: 1.5,
  clientHours: 3,
  editRatio: 2.5,
  gearWearPerHour: 10,
  bookableHoursPerWeek: 35,
  weeksPerYear: 48,
  targetHourly: 50,
  leadFeePct: 10,
  associateRatePerHour: 60,
  associateOverheadPct: 30,
  retentionIfRaised: 90,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Packages: "name, price, coverage hours, cost per job, jobs per month" one per line. Header optional.
export function parsePackages(text) {
  const rows = [], warnings = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 3) { skipped++; continue; }
    const price = num(cells[1], NaN), hours = num(cells[2], NaN);
    if (!Number.isFinite(price) || !Number.isFinite(hours)) { if (rows.length || !/price|package|name/i.test(line)) skipped++; continue; }
    const costs = num(cells[3], 0), perMonth = num(cells[4], 1);
    if (price <= 0 || hours <= 0 || !(costs >= 0) || !(perMonth >= 0)) { skipped++; continue; }
    rows.push({ name: cells[0] || "Package", price, hours, costs, perMonth });
  }
  if (skipped) warnings.push(`${skipped} package line(s) skipped (need a name, a positive price and coverage hours).`);
  if (!rows.length) return { error: "Add at least one package: name, price, coverage hours, cost per job, jobs per month." };
  return { rows, warnings };
}

const clean = (opts) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (opts && opts[k] !== undefined) o[k] = num(opts[k], DEFAULTS[k]);
  return o;
};

export function analyze(packages, opts = {}) {
  const o = clean(opts);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (o.cardFeePct >= 100 || o.leadFeePct >= 100) return { error: "Card fee and lead fee must be under 100%." };
  if (o.associateOverheadPct > 100) return { error: "Associate overhead share cannot exceed 100%." };
  if (o.bookableHoursPerWeek <= 0 || o.weeksPerYear <= 0) return { error: "Working hours and weeks per year must be above zero." };
  const warnings = [];
  const fee = o.cardFeePct / 100;
  const overheadPerHour = (o.overheadMonthly * 12) / (o.bookableHoursPerWeek * o.weeksPerYear);
  const perWeekOf = (g) => (g.perMonth * 12) / o.weeksPerYear;

  const lines = packages.map((g) => {
    const editHours = g.hours * o.editRatio;
    const slotHours = g.hours + o.travelHours + o.clientHours + editHours;
    const gear = g.hours * o.gearWearPerHour;
    const net = g.price * (1 - fee);
    const contribution = net - g.costs - gear;
    const profitPerHour = contribution / slotHours - overheadPerHour;
    const floorPrice = ((o.targetHourly + overheadPerHour) * slotHours + g.costs + gear) / (1 - fee);
    return {
      ...g, perWeek: perWeekOf(g), editHours, slotHours, gear, net, contribution,
      headlinePerHour: g.price / g.hours, editShare: editHours / slotHours,
      profitPerHour, floorPrice, gap: floorPrice - g.price, meetsTarget: profitPerHour >= o.targetHourly - 1e-9,
    };
  });

  const gigsWeek = lines.reduce((a, l) => a + l.perWeek, 0);
  const hoursUsed = lines.reduce((a, l) => a + l.perWeek * l.slotHours, 0);
  const coverageHours = lines.reduce((a, l) => a + l.perWeek * l.hours, 0);
  const revenue = lines.reduce((a, l) => a + l.perWeek * l.price, 0);
  const feeCost = revenue * fee;
  const costs = lines.reduce((a, l) => a + l.perWeek * (l.costs + l.gear), 0);
  const contribution = revenue - feeCost - costs;
  const overheadWeekly = (o.overheadMonthly * 12) / o.weeksPerYear;
  const ownWeekly = contribution - overheadWeekly;
  const utilization = hoursUsed / o.bookableHoursPerWeek;
  if (utilization > 1) warnings.push(`The monthly mix needs ${hoursUsed.toFixed(1)} hours a week (coverage, travel, client time and editing) but you listed ${o.bookableHoursPerWeek}; the mix does not fit.`);
  if (gigsWeek === 0) warnings.push("Jobs per month are all zero, so totals are zero.");

  const gearWeekly = lines.reduce((a, l) => a + l.perWeek * l.gear, 0);
  const assocHours = lines.reduce((a, l) => a + l.perWeek * (l.hours + o.travelHours), 0);
  const assocWeekly = coverageHours * o.associateRatePerHour - gearWeekly - overheadWeekly * (o.associateOverheadPct / 100);
  const models = [
    { key: "own", label: "Your own clients (you shoot, edit and deliver)", weekly: ownWeekly, hours: hoursUsed },
    { key: "lead", label: `Lead marketplace (${o.leadFeePct}% of booked price, you do the rest)`, weekly: revenue * (1 - o.leadFeePct / 100) - feeCost - costs - overheadWeekly, hours: hoursUsed },
    { key: "associate", label: `Associate shooter for a studio ($${o.associateRatePerHour}/coverage hour, no editing, you cover ${o.associateOverheadPct}% of overhead and gear wear)`, weekly: assocWeekly, hours: assocHours },
  ].map((m) => ({ ...m, perHour: m.hours > 0 ? m.weekly / m.hours : 0, annual: m.weekly * o.weeksPerYear }));
  const best = models.reduce((a, b) => (b.weekly > a.weekly ? b : a));
  const bestPerHour = models.reduce((a, b) => (b.perHour > a.perHour ? b : a));

  const editHoursWeekly = lines.reduce((a, l) => a + l.perWeek * l.editHours, 0);

  const raises = [5, 10, 15, 20].map((pct) => {
    const extra = revenue * (pct / 100) * (1 - fee);
    const breakEvenLoss = contribution + extra > 0 ? extra / (contribution + extra) : 0;
    const keep = o.retentionIfRaised / 100;
    const newContribution = (revenue * (1 + pct / 100) * (1 - fee) - costs) * keep;
    return { pct, extraPerWeek: extra, breakEvenLoss, atRetention: newContribution - contribution };
  });

  const below = lines.filter((l) => !l.meetsTarget);
  let verdict;
  if (!below.length) verdict = `Every package clears your $${o.targetHourly}/hour target per hour worked, editing included.`;
  else {
    const worst = below.reduce((a, b) => (b.profitPerHour < a.profitPerHour ? b : a));
    verdict = `${below.length} of ${lines.length} package(s) fall short of $${o.targetHourly}/hour once editing is counted; the weakest is ${worst.name} at $${worst.profitPerHour.toFixed(2)}/hour worked against a headline $${worst.headlinePerHour.toFixed(2)} per coverage hour.`;
  }

  return {
    options: o,
    overheadPerHour,
    lines,
    week: { gigs: gigsWeek, hoursUsed, coverageHours, editHours: editHoursWeekly, utilization, revenue, feeCost, costs, contribution, overheadWeekly, ownWeekly },
    models,
    best,
    bestPerHour,
    raises,
    verdict,
    warnings,
  };
}

export function samplePackages() {
  return "package,price,coverage hours,cost per job,jobs per month\nElopement or courthouse (2h),900,2,40,1\nMicro wedding (4h),2200,4,120,1\nFull-day wedding (8h),4200,8,350,2\nFull-day wedding with second shooter (8h),5400,8,900,1\nEngagement session (1h),450,1,25,2\nCorporate event (3h),1100,3,60,2";
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "");
export function reportCsv(r) {
  const out = [["Package", "Price", "Coverage hours", "Hours worked in total", "Editing share of hours", "Headline per coverage hour", "Profit per hour worked after overhead", "Price for target", "Meets target"]];
  for (const l of r.lines) out.push([l.name, f2(l.price), f2(l.hours), f2(l.slotHours), f2(l.editShare * 100) + "%", f2(l.headlinePerHour), f2(l.profitPerHour), f2(l.floorPrice), l.meetsTarget ? "yes" : "no"]);
  out.push([]);
  out.push(["Model", "Weekly", "Per hour worked", "Annual"]);
  for (const m of r.models) out.push([m.label, f2(m.weekly), f2(m.perHour), f2(m.annual)]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
