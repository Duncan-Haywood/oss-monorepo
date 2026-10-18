// Federal Heavy Highway Vehicle Use Tax (IRS Form 2290), IRC 4481. Pure arithmetic over what the user types in.
// Tax period runs July 1 to June 30. Standard rate: $100 at 55,000 lb plus $22 per further 1,000 lb, capped at $550 above
// 75,000 lb. Logging trucks pay 75% of that. A first-use month after July prorates by whole months left in the period.
// Vehicles expected to run 5,000 miles or fewer (7,500 for agricultural use) are tax-suspended but still file.

export const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const FULL = ["July", "August", "September", "October", "November", "December", "January", "February", "March", "April", "May", "June"];
export const MIN_TAXABLE_LB = 55000;
export const CAP_LB = 75000;

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function categoryFor(lb) {
  if (!(lb >= MIN_TAXABLE_LB)) return null;
  if (lb > CAP_LB) return "V";
  return String.fromCharCode(65 + Math.floor((lb - MIN_TAXABLE_LB) / 1000));
}

// Full-year tax for one vehicle at a taxable gross weight, in dollars.
export function annualTax(lb, logging = false) {
  if (!(lb >= MIN_TAXABLE_LB)) return 0;
  const standard = lb > CAP_LB ? 550 : 100 + 22 * Math.floor((lb - MIN_TAXABLE_LB) / 1000);
  return logging ? round2(standard * 0.75) : standard;
}

export function monthIndex(text) {
  const t = String(text ?? "").trim().toLowerCase();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 12 ? (n + 5) % 12 : -1; // calendar month 7 -> 0
  }
  if (t.length < 3) return -1;
  return FULL.findIndex((m) => m.toLowerCase().startsWith(t.slice(0, 3)));
}

// Months of the July-June period remaining, counting the first-use month.
export const monthsLeft = (idx) => 12 - idx;

export function dueDate(idx, periodStartYear) {
  // Due the last day of the month after first use.
  const calMonth = (idx + 6) % 12; // 0 = Jan
  const year = idx < 6 ? periodStartYear : periodStartYear + 1;
  const d = new Date(Date.UTC(year, calMonth + 2, 0));
  return d.toISOString().slice(0, 10);
}

export function parseVehicles(text) {
  const out = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split(",").map((s) => s.trim());
    const lb = Number((p[1] ?? "").replace(/[ _]/g, ""));
    const idx = monthIndex(p[2] ?? "Jul");
    const kind = (p[3] || "standard").toLowerCase();
    const miles = p[4] === undefined || p[4] === "" ? null : Number(p[4]);
    if (!p[0] || !Number.isFinite(lb) || lb <= 0) return errors.push(`Line ${i + 1}: need "name, weight in lb, first-use month".`);
    if (idx < 0) return errors.push(`Line ${i + 1}: "${p[2]}" is not a month.`);
    if (!["standard", "logging", "agricultural"].includes(kind)) return errors.push(`Line ${i + 1}: type must be standard, logging or agricultural.`);
    if (miles !== null && !(miles >= 0)) return errors.push(`Line ${i + 1}: miles must be a number.`);
    out.push({ name: p[0], lb, idx, kind, miles });
  });
  return { vehicles: out, errors };
}

export function plan(input) {
  const { vehicles, errors } = parseVehicles(input.vehicles);
  const periodStartYear = Number(input.periodStartYear) || new Date().getUTCFullYear();
  if (errors.length) return { error: errors[0], errors };
  if (!vehicles.length) return { error: "Add at least one vehicle: name, weight in lb, first-use month." };

  const rows = vehicles.map((v) => {
    const limit = v.kind === "agricultural" ? 7500 : 5000;
    const suspended = v.miles !== null && v.miles <= limit;
    const taxable = v.lb >= MIN_TAXABLE_LB;
    const annual = annualTax(v.lb, v.kind === "logging");
    const left = monthsLeft(v.idx);
    const due = round2((annual * left) / 12);
    const owed = suspended ? 0 : due;
    const nextWeight = taxable && v.lb <= CAP_LB ? Math.floor((v.lb - MIN_TAXABLE_LB) / 1000) * 1000 + MIN_TAXABLE_LB + 1000 : null;
    return {
      name: v.name, lb: v.lb, kind: v.kind, month: MONTHS[v.idx], monthsLeft: left,
      category: suspended && taxable ? "W" : categoryFor(v.lb), taxable, suspended, annual, owed,
      due: dueDate(v.idx, periodStartYear),
      toNext: nextWeight && nextWeight <= CAP_LB ? { lb: nextWeight, extra: round2(annualTax(nextWeight, v.kind === "logging") - annual) } : null,
    };
  });

  const total = round2(rows.reduce((s, r) => s + r.owed, 0));
  const filable = rows.filter((r) => r.taxable);
  const advice = [];
  advice.push(`Estimated Form 2290 tax: $${total.toFixed(2)} across ${filable.length} taxable vehicle${filable.length === 1 ? "" : "s"}.`);
  if (filable.length >= 25) advice.push("25 or more vehicles: the IRS requires electronic filing of Form 2290.");
  for (const r of rows) {
    if (!r.taxable) advice.push(`${r.name}: ${r.lb.toLocaleString("en-US")} lb is under 55,000 lb, so no heavy-vehicle use tax applies.`);
    else if (r.suspended) advice.push(`${r.name}: tax suspended at ${r.kind === "agricultural" ? "7,500" : "5,000"} miles or fewer a year. You still file Form 2290 to claim the suspension, and tax is due if the vehicle goes over.`);
    else if (r.toNext && r.toNext.extra > 0) advice.push(`${r.name}: adding ${(r.toNext.lb - r.lb).toLocaleString("en-US")} lb to the taxable weight moves it to the next category, +$${r.toNext.extra.toFixed(2)} a year.`);
  }
  const miles = Number(input.annualMiles);
  const costPerMile = miles > 0 ? round2((total / miles) * 100) / 100 : null;
  if (costPerMile !== null) advice.push(`Spread over ${miles.toLocaleString("en-US")} miles that is about ${(total / miles * 100).toFixed(2)} cents per mile.`);
  return { rows, total, advice, periodStartYear, costPerMile };
}

export function sampleInput() {
  return {
    periodStartYear: 2026,
    annualMiles: 90000,
    vehicles: [
      "Tractor 1, 80000, Jul",
      "Tractor 2, 78000, Oct",
      "Log truck, 72000, Jul, logging",
      "Spare day cab, 58500, Jul, standard, 3000",
      "Box truck, 26000, Jul",
    ].join("\n"),
  };
}

export function toCsv(r) {
  const head = "vehicle,taxable_gross_lb,type,first_use_month,category,annual_tax,tax_due,suspended,file_by";
  const lines = r.rows.map((x) => [x.name, x.lb, x.kind, x.month, x.category ?? "", x.annual.toFixed(2), x.owed.toFixed(2), x.suspended ? "yes" : "no", x.due].map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(","));
  return [head, ...lines, `total,,,,,,${r.total.toFixed(2)},,`].join("\n") + "\n";
}
