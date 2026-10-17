// Per-service profit and price floor for a dog grooming business. Pure functions, no DOM.
// Arithmetic on figures the user types; nothing here is a market price or a legal rate.

export const DEFAULTS = Object.freeze({
  overheadMonthly: 0,
  cardFeePct: 3,
  turnoverMinutes: 10,
  bookableHoursPerWeek: 30,
  weeksPerYear: 50,
  targetHourly: 35,
  tipPct: 0,
  commissionPct: 50,
  boothRentWeekly: 250,
  retentionIfRaised: 95,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Services: "name, price, minutes, supplies per dog, dogs per week" one per line. Header optional.
export function parseServices(text) {
  const rows = [], warnings = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 3) { skipped++; continue; }
    const price = num(cells[1], NaN), minutes = num(cells[2], NaN);
    if (!Number.isFinite(price) || !Number.isFinite(minutes)) { if (rows.length || !/price|service|name/i.test(line)) skipped++; continue; }
    const supplies = num(cells[3], 0), perWeek = num(cells[4], 1);
    if (price <= 0 || minutes <= 0 || !(supplies >= 0) || !(perWeek >= 0)) { skipped++; continue; }
    rows.push({ name: cells[0] || "Service", price, minutes, supplies, perWeek });
  }
  if (skipped) warnings.push(`${skipped} service line(s) skipped (need a name, a positive price and minutes).`);
  if (!rows.length) return { error: "Add at least one service: name, price, minutes, supplies cost per dog, dogs per week." };
  return { rows, warnings };
}

const clean = (opts) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (opts && opts[k] !== undefined) o[k] = num(opts[k], DEFAULTS[k]);
  return o;
};

export function analyze(services, opts = {}) {
  const o = clean(opts);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (o.cardFeePct >= 100) return { error: "Card fee must be under 100%." };
  if (o.bookableHoursPerWeek <= 0 || o.weeksPerYear <= 0) return { error: "Bookable hours and weeks per year must be above zero." };
  const warnings = [];
  const fee = o.cardFeePct / 100;
  const overheadPerHour = (o.overheadMonthly * 12) / (o.bookableHoursPerWeek * o.weeksPerYear);

  const lines = services.map((s) => {
    const slot = s.minutes + o.turnoverMinutes;
    const hours = slot / 60;
    const net = s.price * (1 - fee);
    const contribution = net - s.supplies;
    const contributionPerHour = contribution / hours;
    const profitPerHour = contributionPerHour - overheadPerHour;
    const floorPrice = ((o.targetHourly + overheadPerHour) * hours + s.supplies) / (1 - fee);
    return { ...s, slotMinutes: slot, net, contribution, contributionPerHour, profitPerHour, floorPrice, gap: floorPrice - s.price, meetsTarget: profitPerHour >= o.targetHourly - 1e-9 };
  });

  const dogs = lines.reduce((a, l) => a + l.perWeek, 0);
  const hoursUsed = lines.reduce((a, l) => a + (l.perWeek * l.slotMinutes) / 60, 0);
  const revenue = lines.reduce((a, l) => a + l.perWeek * l.price, 0);
  const feeCost = revenue * fee;
  const supplies = lines.reduce((a, l) => a + l.perWeek * l.supplies, 0);
  const contribution = revenue - feeCost - supplies;
  const overheadWeekly = (o.overheadMonthly * 12) / o.weeksPerYear;
  const ownShopWeekly = contribution - overheadWeekly;
  const tips = revenue * (o.tipPct / 100);
  const utilization = hoursUsed / o.bookableHoursPerWeek;
  if (utilization > 1) warnings.push(`The weekly mix needs ${hoursUsed.toFixed(1)} hours but you listed ${o.bookableHoursPerWeek} bookable hours; the mix does not fit.`);
  if (dogs === 0) warnings.push("Dogs per week are all zero, so weekly totals are zero.");

  const commissionWeekly = revenue * (o.commissionPct / 100) + tips;
  const boothWeekly = revenue - feeCost - supplies - o.boothRentWeekly + tips;
  const ownWithTips = ownShopWeekly + tips;
  const models = [
    { key: "own", label: "Own shop (you pay overhead, supplies, card fees)", weekly: ownWithTips },
    { key: "booth", label: `Booth rent ($${o.boothRentWeekly}/week, you buy supplies)`, weekly: boothWeekly },
    { key: "commission", label: `Commission (${o.commissionPct}% of price plus tips)`, weekly: commissionWeekly },
  ].map((m) => ({ ...m, perHour: hoursUsed > 0 ? m.weekly / hoursUsed : 0, annual: m.weekly * o.weeksPerYear }));
  const best = models.reduce((a, b) => (b.weekly > a.weekly ? b : a));

  // A price rise costs nothing until enough dogs leave. Fixed overhead does not shrink when they do.
  const raises = [5, 10, 15, 20].map((pct) => {
    const extra = revenue * (pct / 100) * (1 - fee);
    const breakEvenLoss = contribution + extra > 0 ? extra / (contribution + extra) : 0;
    const keep = o.retentionIfRaised / 100;
    const newContribution = (revenue * (1 + pct / 100) * (1 - fee) - supplies) * keep;
    return { pct, extraPerWeek: extra, breakEvenLoss, atRetention: newContribution - contribution };
  });

  const below = lines.filter((l) => !l.meetsTarget);
  let verdict;
  if (!below.length) verdict = `Every service clears your $${o.targetHourly}/hour target after overhead.`;
  else {
    const worst = below.reduce((a, b) => (b.profitPerHour < a.profitPerHour ? b : a));
    verdict = `${below.length} of ${lines.length} service(s) fall short of $${o.targetHourly}/hour after overhead; the weakest is ${worst.name} at $${worst.profitPerHour.toFixed(2)}/hour.`;
  }

  return {
    options: o,
    overheadPerHour,
    lines,
    week: { dogs, hoursUsed, utilization, revenue, feeCost, supplies, contribution, overheadWeekly, ownShopWeekly, tips },
    models,
    best,
    raises,
    verdict,
    warnings,
  };
}

export function sampleServices() {
  return "service,price,minutes,supplies per dog,dogs per week\nSmall bath and brush,55,60,4,6\nSmall full groom,75,90,5,6\nMedium full groom,95,120,6,5\nLarge full groom,125,150,8,3\nDeshed doodle,150,180,9,2\nNail trim only,20,10,0.5,5";
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "");
export function reportCsv(r) {
  const out = [["Service", "Price", "Slot minutes", "Net after fees", "Contribution", "Profit per hour after overhead", "Price for target", "Meets target"]];
  for (const l of r.lines) out.push([l.name, f2(l.price), l.slotMinutes, f2(l.net), f2(l.contribution), f2(l.profitPerHour), f2(l.floorPrice), l.meetsTarget ? "yes" : "no"]);
  out.push([]);
  out.push(["Model", "Weekly", "Per hour", "Annual"]);
  for (const m of r.models) out.push([m.label, f2(m.weekly), f2(m.perHour), f2(m.annual)]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
