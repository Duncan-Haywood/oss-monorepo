// What a payer-enrollment (credentialing) delay costs when a new clinician starts seeing patients: visits that cannot be billed
// in-network until the effective date, how much of that is lost versus only deferred, and what filing earlier would have saved.
// Arithmetic on the numbers the user types; every payer sets its own effective-date and retro-billing rules.

export const SHARED_DEFAULTS = {
  providers: "", visitsPerWeek: "", allowed: "", restrictedPct: "", heldPct: "", retroDays: "", weeklyComp: "",
};
export const EXAMPLE_SHARED = {
  providers: "New PT hire A, 90\nNew PT hire B, 150\nNew NP C, 60",
  visitsPerWeek: "28",
  allowed: "95",
  restrictedPct: "70",
  heldPct: "40",
  retroDays: "0",
  weeklyComp: "2400",
};

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

const num = (t) => {
  const s = String(t ?? "").replace(/[$%\s,]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

export function parseProviders(text, warnings) {
  const out = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^(.*?)[\s,=:]+(\d+(?:\.\d+)?)\s*(?:days?|d)?$/i);
    if (!m || m[1].trim() === "") { warnings.push(`Line ${i + 1} ("${line}") is not "label, days of delay", so it was skipped.`); return; }
    out.push({ name: m[1].trim(), days: Number(m[2]) });
  });
  return out;
}

// Cost of one provider for a given number of delay days.
export function costOfDelay(p, days) {
  // Payers that backdate the effective date shorten the gap that cannot be billed.
  const gapDays = Math.max(0, days - p.retroDays);
  const gapWeeks = gapDays / 7;
  const blocked = p.visitsPerWeek * p.restrictedShare * p.allowed * gapWeeks;
  const lost = blocked * (1 - p.heldShare);
  const deferred = blocked * p.heldShare;
  // Pay that goes out while the restricted share of the schedule cannot be billed.
  const compUnbilled = p.weeklyComp * p.restrictedShare * gapWeeks;
  return { gapDays, blocked, lost, deferred, compUnbilled };
}

export function analyze(inputs) {
  const warnings = [];
  const providers = parseProviders(inputs.providers, warnings);
  const need = (k, label, min, max) => {
    const v = num(inputs[k]);
    if (v == null || Number.isNaN(v) || v < min || (max != null && v > max)) {
      warnings.push(`${label} must be a number${max != null ? ` from ${min} to ${max}` : ` of at least ${min}`}.`);
      return null;
    }
    return v;
  };
  const visitsPerWeek = need("visitsPerWeek", "Visits per week at a full schedule", 0);
  const allowed = need("allowed", "Average allowed amount per visit", 0);
  const restrictedPct = need("restrictedPct", "Share of visits from payers that need the clinician enrolled (%)", 0, 100);
  const heldPct = need("heldPct", "Share of those visits that wait and are billed later (%)", 0, 100);
  const retroDays = need("retroDays", "Days a payer backdates the effective date", 0);
  const weeklyComp = need("weeklyComp", "Weekly pay and benefits per clinician", 0);
  if (providers.length === 0) warnings.push("Enter at least one clinician, for example: New PT hire A, 90");
  if (providers.length === 0 || [visitsPerWeek, allowed, restrictedPct, heldPct, retroDays, weeklyComp].some((v) => v == null)) return { ok: false, warnings };
  const p = { visitsPerWeek, allowed, restrictedShare: restrictedPct / 100, heldShare: heldPct / 100, retroDays, weeklyComp };
  const rows = providers.map((pr) => {
    const c = costOfDelay(p, pr.days);
    const week = costOfDelay(p, pr.days + 7);
    return { ...pr, ...c, perExtraWeek: week.lost - c.lost, total: c.lost + c.compUnbilled };
  });
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const leads = [0, 30, 60, 90, 120];
  const sweep = leads.map((lead) => {
    const lost = sum((r) => costOfDelay(p, Math.max(0, r.days - lead)).lost);
    return { lead, lost };
  });
  const base = sweep[0].lost;
  sweep.forEach((s) => { s.saved = base - s.lost; });
  return {
    ok: true, warnings, rows, sweep,
    totals: {
      providers: rows.length, lost: sum((r) => r.lost), deferred: sum((r) => r.deferred), compUnbilled: sum((r) => r.compUnbilled),
      total: sum((r) => r.total), perWeekAllProviders: sum((r) => r.perExtraWeek),
    },
  };
}

export function toCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["clinician", "delay_days", "unbillable_days", "lost_revenue", "deferred_revenue", "pay_during_gap"].join(",")];
  for (const r of a.rows) lines.push([q(r.name), r.days, r.gapDays, r.lost.toFixed(2), r.deferred.toFixed(2), r.compUnbilled.toFixed(2)].join(","));
  return lines.join("\n") + "\n";
}
