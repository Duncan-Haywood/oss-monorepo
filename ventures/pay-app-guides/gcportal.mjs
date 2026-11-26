// What to type into a GC's billing portal from one month's continuation-sheet (G703-style) figures,
// and the GCPay schedule-of-values check. The portal rules come from the vendors' own help pages as
// quoted in gc-portal-billing.html (read 2026-11-25 and 2026-11-26); nothing here is a portal's
// documented formula beyond those quotes, and the page says to check against the GC's own template.
//
// Money is in integer cents, like calc.mjs.
import { toCents } from "./calc.mjs";

const blank = (v) => v === undefined || v === null || String(v).trim() === "";

function money(v, label, errors, { optional = false } = {}) {
  if (blank(v)) {
    if (!optional) errors.push(`${label}: enter an amount (0 if none).`);
    return optional ? null : 0;
  }
  const c = toCents(v);
  if (Number.isNaN(c) || c < 0) {
    errors.push(`${label}: enter an amount like 12500 or 12,500.00, not negative.`);
    return 0;
  }
  return c;
}

// One SOV line this period.
//   scheduled: scheduled value (column C)
//   previous:  work completed from previous applications (column D)
//   thisPeriod: work completed this period (column E)
//   storedNow: materials presently stored, not in D or E (column F), at this period's end
//   storedBefore: column F on last month's application; blank on the first one here
export function portalLine({ scheduled, previous, thisPeriod, storedNow, storedBefore } = {}) {
  const errors = [];
  const c = money(scheduled, "Scheduled value", errors);
  const d = money(previous, "Work completed from previous applications", errors);
  const e = money(thisPeriod, "Work completed this period", errors);
  const f = money(storedNow, "Materials presently stored", errors);
  const fBefore = money(storedBefore, "Materials stored on last month's application", errors, { optional: true });
  if (errors.length) return { errors, warnings: [] };

  const g = d + e + f;
  const warnings = [];
  if (c > 0 && g > c) warnings.push("Completed and stored to date is more than the scheduled value: most portals refuse a line billed past 100%.");
  // New materials stored: the stored balance's rise. When it fell, some stored material was
  // installed, and anything delivered in the same month cannot be told from the balance alone.
  let newStored;
  if (fBefore === null) newStored = f;
  else if (f >= fBefore) newStored = f - fBefore;
  else {
    newStored = null;
    warnings.push("The stored balance fell since last month (material was installed). The amount newly delivered this month cannot be worked out from the balance: take it from your delivery tickets.");
  }
  return {
    errors,
    warnings,
    columns: { c, d, e, f, g, balance: c - g, percent: c > 0 ? g / c : null },
    procore: { workThisPeriod: e, materialsPresentlyStored: f, newMaterialsStored: newStored },
    textura: {
      thisPeriod: { workThisPeriod: e, materialStoredThisPeriod: newStored },
      toDate: { completedToDate: g, storedToDate: f },
    },
    // GCPay's guide names "$ This Period" and "% Work to Date" and says nothing about stored
    // materials, so work alone is given and the page says to ask the GC where stored materials go.
    gcpay: { thisPeriod: e, workToDatePercent: c > 0 ? (d + e) / c : null },
  };
}

// GCPay's SOV upload: three columns (Item Number, Description, Value) and lines that add up to the
// original contract value the GC entered. Lines are pasted as "item, description, value" or tabs.
export function gcpaySovCheck({ lines = "", contract } = {}) {
  const errors = [];
  const findings = [];
  const target = blank(contract) ? null : toCents(contract);
  if (blank(contract)) errors.push("Original contract value: enter the amount the GC entered in GCPay.");
  else if (Number.isNaN(target) || target <= 0) errors.push("Original contract value: enter an amount like 250000.");
  const rows = [];
  String(lines).split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const cells = raw.includes("\t") ? raw.split("\t") : splitComma(raw);
    const n = i + 1;
    if (cells.length < 3) {
      findings.push(`Row ${n}: needs three cells (item number, description, value).`);
      return;
    }
    if (cells.length > 3) findings.push(`Row ${n}: has ${cells.length} cells. GCPay's standard upload takes exactly three: remove the others before uploading.`);
    const [item, description, valueCell] = [cells[0].trim(), cells[1].trim(), cells[cells.length - 1].trim()];
    const value = valueCell === "" ? NaN : toCents(valueCell);
    if (Number.isNaN(value)) {
      findings.push(`Row ${n}: "${valueCell}" is not an amount.`);
      return;
    }
    if (/^(total|subtotal)\b/i.test(description) || /^(total|subtotal)\b/i.test(item)) {
      findings.push(`Row ${n}: looks like a total row. Leave totals out: GCPay adds the lines up itself.`);
      return;
    }
    if (!item) findings.push(`Row ${n}: no item number.`);
    if (/change order|\bCO\s*#?\d/i.test(description)) findings.push(`Row ${n}: looks like a change order. GCPay says change orders are added by the GC after the base schedule is approved, so leave it out of the upload.`);
    rows.push({ item, description, value });
  });
  if (!rows.length && !errors.length) errors.push("Paste at least one line.");
  const total = rows.reduce((s, r) => s + r.value, 0);
  const seen = new Set();
  for (const r of rows) {
    if (r.item && seen.has(r.item)) findings.push(`Item number ${r.item} is used twice.`);
    seen.add(r.item);
  }
  const difference = target === null || Number.isNaN(target) || errors.length ? null : total - target;
  return { errors, findings, rows, total, target, difference, matches: difference === 0 && !errors.length };
}

// Commas inside double quotes stay in the cell; "1,250.00" style amounts in a quoted cell survive.
function splitComma(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
