// Franchise Item 19 reality check. Pure arithmetic on numbers the user types or pastes
// from a Franchise Disclosure Document. Nothing here reads or sends anything.

const num = (v) => {
  if (v === null || v === undefined) return NaN;
  const s = String(v).replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (s === "") return NaN;
  const m = /^(-?\d*\.?\d+)([kKmM]?)$/.exec(s);
  if (!m) return NaN;
  const x = parseFloat(m[1]);
  const suffix = m[2].toLowerCase();
  return suffix === "k" ? x * 1e3 : suffix === "m" ? x * 1e6 : x;
};

export function parseNumber(v) {
  return num(v);
}

// One tier per line: "label, units, average revenue". Separator may be comma, tab or "|".
// Lines starting with # are ignored. Returns { tiers, errors }.
export function parseTiers(text) {
  const tiers = [];
  const errors = [];
  String(text || "")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith("#")) return;
      const parts = line.split(/\t|\||,(?!\d{3}\b)/).map((p) => p.trim());
      if (parts.length < 3) {
        errors.push(`Line ${i + 1}: need "label, units, average revenue".`);
        return;
      }
      const [label, u, r] = parts;
      const units = num(u);
      const revenue = num(r);
      if (!(units > 0) || !Number.isInteger(units)) {
        errors.push(`Line ${i + 1}: units must be a whole number above zero (got "${u}").`);
        return;
      }
      if (!(revenue >= 0)) {
        errors.push(`Line ${i + 1}: average revenue must be a number (got "${r}").`);
        return;
      }
      tiers.push({ label: label || `Tier ${tiers.length + 1}`, units, revenue });
    });
  return { tiers, errors };
}

const round = (x, d = 0) => {
  const f = 10 ** d;
  return Math.round((x + Number.EPSILON) * f) / f;
};

// Owner earnings for one unit at a given revenue.
export function unitPnl(revenue, costs) {
  const variablePct = costs.royaltyPct + costs.adFundPct + costs.cogsPct + costs.variableLaborPct + costs.otherVariablePct;
  const variable = (revenue * variablePct) / 100;
  const fixed = costs.fixedPerYear;
  return {
    revenue,
    royalty: (revenue * costs.royaltyPct) / 100,
    adFund: (revenue * costs.adFundPct) / 100,
    variable,
    fixed,
    ownerEarnings: revenue - variable - fixed,
  };
}

export function breakEvenRevenue(costs, targetEarnings = 0) {
  const variablePct = costs.royaltyPct + costs.adFundPct + costs.cogsPct + costs.variableLaborPct + costs.otherVariablePct;
  const margin = 1 - variablePct / 100;
  if (margin <= 0) return null;
  return (costs.fixedPerYear + targetEarnings) / margin;
}

export const DEFAULTS = {
  royaltyPct: 6,
  adFundPct: 2,
  cogsPct: 30,
  variableLaborPct: 0,
  otherVariablePct: 3,
  fixedPerYear: 180000,
  investment: 350000,
  ownerSalary: 70000,
  systemUnits: 0,
  nonReportingPct: 60,
};

export function fieldsToCosts(f) {
  const pick = (k) => {
    const n = num(f[k]);
    return Number.isFinite(n) ? n : DEFAULTS[k];
  };
  return {
    royaltyPct: pick("royaltyPct"),
    adFundPct: pick("adFundPct"),
    cogsPct: pick("cogsPct"),
    variableLaborPct: pick("variableLaborPct"),
    otherVariablePct: pick("otherVariablePct"),
    fixedPerYear: pick("fixedPerYear"),
    investment: pick("investment"),
    ownerSalary: pick("ownerSalary"),
    systemUnits: Number.isFinite(num(f.systemUnits)) ? num(f.systemUnits) : 0,
    nonReportingPct: pick("nonReportingPct"),
  };
}

export function analyze({ text, costs }) {
  const c = { ...DEFAULTS, ...(costs || {}) };
  const { tiers, errors } = parseTiers(text);
  const out = { errors: [...errors], tiers: [], notices: [] };
  if (!tiers.length) {
    out.errors.push("Add at least one tier of reported units.");
    return out;
  }
  const variablePct = c.royaltyPct + c.adFundPct + c.cogsPct + c.variableLaborPct + c.otherVariablePct;
  if (variablePct >= 100) out.errors.push("Percentage costs add up to 100% or more of revenue; no sales level can be profitable.");

  const reporting = tiers.reduce((s, t) => s + t.units, 0);
  const totalRevenue = tiers.reduce((s, t) => s + t.units * t.revenue, 0);
  const avg = totalRevenue / reporting;

  // Unit-weighted median: the tier containing the middle unit.
  const sorted = [...tiers].sort((a, b) => a.revenue - b.revenue);
  let seen = 0;
  let median = sorted[sorted.length - 1].revenue;
  for (const t of sorted) {
    seen += t.units;
    if (seen >= reporting / 2) {
      median = t.revenue;
      break;
    }
  }
  const belowAvgUnits = tiers.filter((t) => t.revenue < avg).reduce((s, t) => s + t.units, 0);
  const lowest = sorted[0].revenue;
  const highest = sorted[sorted.length - 1].revenue;

  out.reporting = reporting;
  out.average = avg;
  out.median = median;
  out.lowest = lowest;
  out.highest = highest;
  out.belowAvgPct = (belowAvgUnits / reporting) * 100;
  out.meanToMedian = median > 0 ? avg / median : null;

  // Coverage: how much of the system the figures describe.
  out.systemUnits = c.systemUnits > 0 ? c.systemUnits : null;
  if (out.systemUnits) {
    if (reporting > out.systemUnits) {
      out.errors.push("Reporting units exceed the system total you entered.");
    }
    out.coveragePct = Math.min(100, (reporting / out.systemUnits) * 100);
    const missing = Math.max(0, out.systemUnits - reporting);
    const missingRevenue = (avg * c.nonReportingPct) / 100;
    out.systemWideAverage = (totalRevenue + missing * missingRevenue) / Math.max(out.systemUnits, reporting);
    out.nonReportingPct = c.nonReportingPct;
    if (out.coveragePct < 80) {
      out.notices.push(
        `Only ${round(out.coveragePct)}% of units are in the figures. Ask why the other ${round(100 - out.coveragePct)}% are left out (new, closed, company-owned, under 12 months, "not comparable").`
      );
    }
  }
  if (out.meanToMedian && out.meanToMedian > 1.15) {
    out.notices.push(
      `The average (${round(out.meanToMedian, 2)}x the median) is pulled up by the top tier. A new buyer is more likely to land near the median than the mean.`
    );
  }
  if (out.belowAvgPct >= 60) {
    out.notices.push(`${round(out.belowAvgPct)}% of reporting units sit below the average the brochure quotes.`);
  }

  const evalAt = (revenue) => {
    const p = unitPnl(revenue, c);
    const afterSalary = p.ownerEarnings - c.ownerSalary;
    return {
      ...p,
      afterSalary,
      cashOnCash: c.investment > 0 ? (p.ownerEarnings / c.investment) * 100 : null,
      paybackYears: p.ownerEarnings > 0 && c.investment > 0 ? c.investment / p.ownerEarnings : null,
    };
  };

  out.tiers = tiers.map((t) => ({ ...t, sharePct: (t.units / reporting) * 100, ...evalAt(t.revenue) }));
  out.atAverage = evalAt(avg);
  out.atMedian = evalAt(median);
  out.atSystemWide = out.systemWideAverage != null ? evalAt(out.systemWideAverage) : null;
  out.atLowest = evalAt(lowest);
  out.unprofitablePct = (out.tiers.filter((t) => t.ownerEarnings <= 0).reduce((s, t) => s + t.units, 0) / reporting) * 100;
  out.belowSalaryPct = (out.tiers.filter((t) => t.afterSalary < 0).reduce((s, t) => s + t.units, 0) / reporting) * 100;
  out.breakEvenRevenue = breakEvenRevenue(c);
  out.salaryRevenue = breakEvenRevenue(c, c.ownerSalary);
  out.paybackRevenue5y = c.investment > 0 ? breakEvenRevenue(c, c.investment / 5) : null;
  out.feesPerYearAtMedian = out.atMedian.royalty + out.atMedian.adFund;
  out.costs = c;
  return out;
}

const usd = (n) => (n == null || !Number.isFinite(n) ? "n/a" : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US"));
const yrs = (n) => (n == null ? "never at this level" : round(n, 1) + " years");

export function toCsv(r) {
  const rows = [["tier", "units", "share_pct", "avg_revenue", "royalty", "ad_fund", "owner_earnings", "after_owner_salary", "cash_on_cash_pct", "payback_years"]];
  for (const t of r.tiers) {
    rows.push([t.label, t.units, round(t.sharePct, 1), round(t.revenue), round(t.royalty), round(t.adFund), round(t.ownerEarnings), round(t.afterSalary), t.cashOnCash == null ? "" : round(t.cashOnCash, 1), t.paybackYears == null ? "" : round(t.paybackYears, 1)]);
  }
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return rows.map((row) => row.map(esc).join(",")).join("\n");
}

export function toText(r) {
  const L = [];
  L.push("Franchise Item 19 reality check");
  L.push(`Reporting units: ${r.reporting}${r.coveragePct != null ? ` (${round(r.coveragePct)}% of ${r.systemUnits})` : ""}`);
  L.push(`Average revenue: ${usd(r.average)}   Median tier: ${usd(r.median)}   Lowest: ${usd(r.lowest)}`);
  L.push(`Owner earnings at average: ${usd(r.atAverage.ownerEarnings)}; at median: ${usd(r.atMedian.ownerEarnings)}; at lowest tier: ${usd(r.atLowest.ownerEarnings)}`);
  L.push(`Payback at median: ${yrs(r.atMedian.paybackYears)}`);
  L.push(`Share of reporting units below your salary target after costs: ${round(r.belowSalaryPct)}%`);
  L.push(`Break-even revenue: ${usd(r.breakEvenRevenue)}; revenue to also pay yourself ${usd(r.costs.ownerSalary)}: ${usd(r.salaryRevenue)}`);
  for (const n of r.notices) L.push(`Note: ${n}`);
  return L.join("\n");
}

export const EXAMPLE_TIERS = [
  "Top quartile, 24, 1450000",
  "Second quartile, 24, 1020000",
  "Third quartile, 24, 810000",
  "Bottom quartile, 24, 560000",
].join("\n");
