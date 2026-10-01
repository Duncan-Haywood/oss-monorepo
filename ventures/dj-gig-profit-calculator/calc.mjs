// Per-gig profit and price floor for a mobile DJ / event entertainment business. Pure functions, no DOM.
// Arithmetic on figures the user types; nothing here is a market price or a legal rate.

export const DEFAULTS = Object.freeze({
  overheadMonthly: 0,
  cardFeePct: 3,
  setupHours: 2,
  prepHours: 1,
  bookableHoursPerWeek: 25,
  weeksPerYear: 50,
  targetHourly: 40,
  tipPct: 0,
  leadFeePct: 15,
  agencyKeepPct: 55,
  agencyOverheadPct: 60,
  retentionIfRaised: 90,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Packages: "name, price, event hours, cost per gig, gigs per month" one per line. Header optional.
export function parseGigs(text) {
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
  if (skipped) warnings.push(`${skipped} package line(s) skipped (need a name, a positive price and event hours).`);
  if (!rows.length) return { error: "Add at least one package: name, price, event hours, cost per gig, gigs per month." };
  return { rows, warnings };
}

const clean = (opts) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (opts && opts[k] !== undefined) o[k] = num(opts[k], DEFAULTS[k]);
  return o;
};

export function analyze(gigs, opts = {}) {
  const o = clean(opts);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (o.cardFeePct >= 100 || o.leadFeePct >= 100) return { error: "Card fee and lead fee must be under 100%." };
  if (o.agencyKeepPct > 100 || o.agencyOverheadPct > 100) return { error: "Agency share and overhead share cannot exceed 100%." };
  if (o.bookableHoursPerWeek <= 0 || o.weeksPerYear <= 0) return { error: "Working hours and weeks per year must be above zero." };
  const warnings = [];
  const fee = o.cardFeePct / 100;
  const overheadPerHour = (o.overheadMonthly * 12) / (o.bookableHoursPerWeek * o.weeksPerYear);
  const perWeekOf = (g) => (g.perMonth * 12) / o.weeksPerYear;

  const lines = gigs.map((g) => {
    const slotHours = g.hours + o.setupHours + o.prepHours;
    const net = g.price * (1 - fee);
    const contribution = net - g.costs;
    const contributionPerHour = contribution / slotHours;
    const profitPerHour = contributionPerHour - overheadPerHour;
    const floorPrice = ((o.targetHourly + overheadPerHour) * slotHours + g.costs) / (1 - fee);
    return { ...g, perWeek: perWeekOf(g), slotHours, net, contribution, contributionPerHour, profitPerHour, floorPrice, gap: floorPrice - g.price, meetsTarget: profitPerHour >= o.targetHourly - 1e-9 };
  });

  const gigsWeek = lines.reduce((a, l) => a + l.perWeek, 0);
  const hoursUsed = lines.reduce((a, l) => a + l.perWeek * l.slotHours, 0);
  const revenue = lines.reduce((a, l) => a + l.perWeek * l.price, 0);
  const feeCost = revenue * fee;
  const costs = lines.reduce((a, l) => a + l.perWeek * l.costs, 0);
  const contribution = revenue - feeCost - costs;
  const overheadWeekly = (o.overheadMonthly * 12) / o.weeksPerYear;
  const ownWeekly = contribution - overheadWeekly;
  const tips = revenue * (o.tipPct / 100);
  const utilization = hoursUsed / o.bookableHoursPerWeek;
  if (utilization > 1) warnings.push(`The monthly mix needs ${hoursUsed.toFixed(1)} hours a week (including setup, travel and prep) but you listed ${o.bookableHoursPerWeek}; the mix does not fit.`);
  if (gigsWeek === 0) warnings.push("Gigs per month are all zero, so totals are zero.");

  const models = [
    { key: "own", label: "Direct clients (you pay overhead, costs and card fees)", weekly: ownWeekly + tips },
    { key: "lead", label: `Lead marketplace (${o.leadFeePct}% of price per booked gig, you do the rest)`, weekly: revenue * (1 - o.leadFeePct / 100) - feeCost - costs - overheadWeekly + tips },
    { key: "agency", label: `Agency subcontract (you keep ${o.agencyKeepPct}% of price plus tips, you still cover ${o.agencyOverheadPct}% of overhead and all gig costs)`, weekly: revenue * (o.agencyKeepPct / 100) + tips - costs - overheadWeekly * (o.agencyOverheadPct / 100) },
  ].map((m) => ({ ...m, perHour: hoursUsed > 0 ? m.weekly / hoursUsed : 0, annual: m.weekly * o.weeksPerYear }));
  const best = models.reduce((a, b) => (b.weekly > a.weekly ? b : a));

  // A price rise costs nothing until enough clients walk. Fixed overhead does not shrink when they do.
  const raises = [5, 10, 15, 20].map((pct) => {
    const extra = revenue * (pct / 100) * (1 - fee);
    const breakEvenLoss = contribution + extra > 0 ? extra / (contribution + extra) : 0;
    const keep = o.retentionIfRaised / 100;
    const newContribution = (revenue * (1 + pct / 100) * (1 - fee) - costs) * keep;
    return { pct, extraPerWeek: extra, breakEvenLoss, atRetention: newContribution - contribution };
  });

  const below = lines.filter((l) => !l.meetsTarget);
  let verdict;
  if (!below.length) verdict = `Every package clears your $${o.targetHourly}/hour target after overhead.`;
  else {
    const worst = below.reduce((a, b) => (b.profitPerHour < a.profitPerHour ? b : a));
    verdict = `${below.length} of ${lines.length} package(s) fall short of $${o.targetHourly}/hour after overhead; the weakest is ${worst.name} at $${worst.profitPerHour.toFixed(2)}/hour.`;
  }

  return {
    options: o,
    overheadPerHour,
    lines,
    week: { gigs: gigsWeek, hoursUsed, utilization, revenue, feeCost, costs, contribution, overheadWeekly, ownWeekly, tips },
    models,
    best,
    raises,
    verdict,
    warnings,
  };
}

export function sampleGigs() {
  return "package,price,event hours,cost per gig,gigs per month\nCorporate party (3h),900,3,60,2\nWedding reception (5h),1800,5,120,3\nWedding with ceremony and uplighting,2600,6,260,1\nSchool dance (3h),650,3,40,2\nBirthday or private party (3h),700,3,40,3\nBar mitzvah (4h),1500,4,90,1";
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "");
export function reportCsv(r) {
  const out = [["Package", "Price", "Slot hours", "Net after fees", "Contribution", "Profit per hour after overhead", "Price for target", "Meets target"]];
  for (const l of r.lines) out.push([l.name, f2(l.price), f2(l.slotHours), f2(l.net), f2(l.contribution), f2(l.profitPerHour), f2(l.floorPrice), l.meetsTarget ? "yes" : "no"]);
  out.push([]);
  out.push(["Model", "Weekly", "Per hour", "Annual"]);
  for (const m of r.models) out.push([m.label, f2(m.weekly), f2(m.perHour), f2(m.annual)]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
