// Machine hour rates for a job shop: what one billable hour on each machine costs, built from the
// shop's own numbers. No built-in rate, price, life or utilization: every figure is the user's.
//
// Per machine, per year:
//   ownership   = lease per year, if given; else straight-line depreciation (cost - salvage) / life
//                 plus the cost of money on the average investment, (cost + salvage) / 2 x rate
//   space       = floor area x the shop's occupancy cost per square foot per year
//   maintenance = the user's yearly maintenance, service contracts and repairs
//   overhead    = the shop's overhead not tied to any machine, shared by billable hours
//   billable h  = scheduled hours x utilization (the share of them that a quote can charge for)
// Per billable hour:
//   power       = kW x average load x price per kWh
//   tooling     = the user's tooling and consumables per spindle hour
//   operator    = loaded wage / machines per operator / utilization (the operator is paid for
//                 every scheduled hour, and only the billable ones recover it)
// machine rate  = (ownership + space + maintenance + overhead) / billable h + power + tooling
// with operator = machine rate + operator
// quoted rate   = with operator x (1 + markup)

const num = (v) => {
  if (v === null || v === undefined) return null;
  let s = String(v).trim().replace(/[$\s]/g, "").replace(/%$/, "");
  // A comma is read by its shape: thousands grouping (12,500 or 1,250,000.50) is dropped; any
  // other comma (a decimal comma such as 29,99) is refused rather than read as 2999.
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,(?=\d{3})/g, "");
  else if (s.includes(",")) return NaN;
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

export const MACHINE_FIELDS = [
  "name", "cost", "salvage", "lifeYears", "interestPct", "leasePerYear", "sqft",
  "kw", "loadPct", "maintenancePerYear", "toolingPerHour", "hoursPerYear", "utilizationPct",
  "operatorWage", "machinesPerOperator",
];

function readMachine(m, i, errors, notes, shop) {
  const label = (m.name && String(m.name).trim()) || `Machine ${i + 1}`;
  const v = {};
  for (const k of MACHINE_FIELDS.slice(1)) {
    v[k] = num(m[k]);
    if (Number.isNaN(v[k])) errors.push(`${label}: "${m[k]}" is not a number (${k})`);
    else if (v[k] !== null && v[k] < 0) errors.push(`${label}: ${k} cannot be negative`);
  }
  if (v.hoursPerYear === null || v.hoursPerYear === 0) errors.push(`${label}: scheduled hours per year are needed`);
  if (v.utilizationPct === null || v.utilizationPct === 0) errors.push(`${label}: utilization is needed (the share of scheduled hours you can bill)`);
  else if (v.utilizationPct > 100) errors.push(`${label}: utilization cannot be over 100%`);
  const hasLease = v.leasePerYear !== null && v.leasePerYear > 0;
  const hasCost = v.cost !== null && v.cost > 0;
  if (hasCost && !hasLease) {
    if (v.lifeYears === null || v.lifeYears === 0) errors.push(`${label}: a useful life in years is needed to spread the cost`);
    if (v.salvage !== null && v.salvage > v.cost) errors.push(`${label}: salvage value is more than the cost`);
  }
  if (hasLease && hasCost) notes.push(`${label}: both a lease and a purchase cost were given; the lease is used and the cost ignored.`);
  if (!hasLease && !hasCost) notes.push(`${label}: no cost or lease, so the rate carries no ownership cost (fine for a machine that is paid off and fully depreciated, otherwise too low).`);
  if (v.sqft && shop.rentPerSqft === null) notes.push(`${label}: floor area given but no occupancy cost per square foot, so space is not charged.`);
  if (v.kw && v.loadPct === null) notes.push(`${label}: no average load given, so power is charged at the full rated kW.`);
  if (v.kw && shop.powerPrice === null) notes.push(`${label}: rated kW given but no electricity price, so power is not charged.`);
  if (v.operatorWage && !v.machinesPerOperator) v.machinesPerOperator = 1;
  return { label, ...v, hasLease, hasCost };
}

export function machineRates(input) {
  const errors = [];
  const notes = [];
  const shop = {
    overheadPerYear: num(input.overheadPerYear),
    rentPerSqft: num(input.rentPerSqft),
    powerPrice: num(input.powerPrice),
    markupPct: num(input.markupPct),
  };
  for (const [k, val] of Object.entries(shop)) {
    if (Number.isNaN(val)) errors.push(`shop: "${input[k]}" is not a number (${k})`);
    else if (val !== null && val < 0) errors.push(`shop: ${k} cannot be negative`);
  }
  const rows = (input.machines || []).filter((m) => MACHINE_FIELDS.some((k) => m[k] !== undefined && m[k] !== null && String(m[k]).trim() !== ""));
  if (!rows.length) errors.push("add at least one machine");
  const ms = rows.map((m, i) => readMachine(m, i, errors, notes, shop));
  if (errors.length) return { errors, notes, machines: [] };

  const z = (x) => x ?? 0;
  const billable = ms.map((m) => m.hoursPerYear * m.utilizationPct / 100);
  const totalBillable = billable.reduce((a, b) => a + b, 0);
  const overhead = z(shop.overheadPerYear);

  const machines = ms.map((m, i) => {
    const hours = billable[i];
    const depreciation = m.hasLease || !m.hasCost ? 0 : (m.cost - z(m.salvage)) / m.lifeYears;
    const interest = m.hasLease || !m.hasCost ? 0 : (m.cost + z(m.salvage)) / 2 * z(m.interestPct) / 100;
    const lease = m.hasLease ? m.leasePerYear : 0;
    const space = z(m.sqft) * z(shop.rentPerSqft);
    const maintenance = z(m.maintenancePerYear);
    const overheadShare = totalBillable ? overhead * hours / totalBillable : 0;
    const fixedPerYear = depreciation + interest + lease + space + maintenance + overheadShare;
    const power = z(m.kw) * (m.loadPct === null ? 1 : m.loadPct / 100) * z(shop.powerPrice);
    const tooling = z(m.toolingPerHour);
    const operator = m.operatorWage ? m.operatorWage / m.machinesPerOperator / (m.utilizationPct / 100) : 0;
    const machineRate = fixedPerYear / hours + power + tooling;
    const withOperator = machineRate + operator;
    const quoted = shop.markupPct === null ? null : withOperator * (1 + shop.markupPct / 100);
    // The same machine at 10 points more and less utilization: only the yearly costs and the
    // operator's idle time move, which is why an optimistic utilization flatters every quote.
    const at = (u) => {
      if (u <= 0 || u > 100) return null;
      const h = m.hoursPerYear * u / 100;
      // Overhead stays shared by the shop's hours as entered: this moves one machine, not all.
      return (fixedPerYear - overheadShare) / h + overheadShare / hours + power + tooling +
        (m.operatorWage ? m.operatorWage / m.machinesPerOperator / (u / 100) : 0);
    };
    return {
      name: m.label,
      billableHours: hours,
      perYear: { depreciation, interest, lease, space, maintenance, overhead: overheadShare, total: fixedPerYear },
      perHour: {
        ownership: (depreciation + interest + lease) / hours,
        space: space / hours,
        maintenance: maintenance / hours,
        overhead: overheadShare / hours,
        power, tooling, operator,
      },
      machineRate, withOperator, quoted,
      fixedShare: withOperator ? (fixedPerYear / hours) / withOperator : 0,
      lowerUtilization: { pct: m.utilizationPct - 10, rate: at(m.utilizationPct - 10) },
      higherUtilization: { pct: m.utilizationPct + 10, rate: at(m.utilizationPct + 10) },
    };
  });

  const totalCost = machines.reduce((a, m) => a + m.withOperator * m.billableHours, 0);
  const blended = totalBillable ? totalCost / totalBillable : null;
  if (shop.overheadPerYear === null) notes.push("No shop overhead entered: office wages, insurance, software and the rest are not in these rates. Add them or the rates are too low.");
  return {
    errors: [], notes, machines,
    shop: {
      billableHours: totalBillable,
      blendedRate: blended,
      blendedQuoted: blended === null || shop.markupPct === null ? null : blended * (1 + shop.markupPct / 100),
      yearlyCost: totalCost,
    },
  };
}

// CSV with formula-safe cells: a cell that starts with = + - @ (or a tab or CR) is prefixed with '.
const cell = (v) => {
  let s = v === null || v === undefined ? "" : typeof v === "number" ? (Math.round(v * 100) / 100).toString() : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function ratesCsv(report) {
  const head = ["machine", "billable_hours_per_year", "ownership_per_h", "space_per_h", "maintenance_per_h", "overhead_per_h", "power_per_h", "tooling_per_h", "machine_rate", "operator_per_h", "rate_with_operator", "quoted_rate"];
  const lines = [head.join(",")];
  for (const m of report.machines) {
    const p = m.perHour;
    lines.push([m.name, m.billableHours, p.ownership, p.space, p.maintenance, p.overhead, p.power, p.tooling, m.machineRate, p.operator, m.withOperator, m.quoted].map(cell).join(","));
  }
  return lines.join("\n") + "\n";
}

// An invented shop, labelled as such on the page. Not a benchmark: no figure here is a typical cost.
export const EXAMPLE = {
  overheadPerYear: "180000", rentPerSqft: "12", powerPrice: "0.16", markupPct: "20",
  machines: [
    { name: "3-axis VMC (invented)", cost: "160000", salvage: "30000", lifeYears: "10", interestPct: "7", sqft: "200", kw: "22", loadPct: "40", maintenancePerYear: "5000", toolingPerHour: "6", hoursPerYear: "4000", utilizationPct: "60", operatorWage: "38", machinesPerOperator: "2" },
    { name: "5-axis (invented)", leasePerYear: "96000", sqft: "300", kw: "37", loadPct: "40", maintenancePerYear: "12000", toolingPerHour: "10", hoursPerYear: "4000", utilizationPct: "55", operatorWage: "45", machinesPerOperator: "1" },
    { name: "Manual mill (invented)", sqft: "120", kw: "4", loadPct: "50", maintenancePerYear: "800", toolingPerHour: "2", hoursPerYear: "2000", utilizationPct: "50", operatorWage: "34", machinesPerOperator: "1" },
  ],
};
