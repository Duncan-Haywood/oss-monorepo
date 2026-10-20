// Prices a veterinary in-house wellness plan: what the included services cost the patient a la carte, what the practice
// really collects per member after the plan discount, billing fees and members who never use everything, and the monthly
// fee that reaches a target margin. Arithmetic on the numbers the user types; no clinical or pricing advice.

export const SHARED_DEFAULTS = {
  services: "", discountPct: "", feeMode: "", monthlyFee: "", targetMarginPct: "", usePct: "", billingFeePct: "",
  members: "", newMemberCost: "", churnPct: "",
};
export const EXAMPLE_SHARED = {
  services: "Annual exam, 2, 70, 28\nVaccine set, 1, 95, 30\nFecal test, 1, 45, 14\nHeartworm and tick test, 1, 60, 22\nDental scale and polish, 1, 450, 190\nBloodwork panel, 1, 160, 58",
  discountPct: "15",
  feeMode: "target",
  monthlyFee: "55",
  targetMarginPct: "35",
  usePct: "85",
  billingFeePct: "3.5",
  members: "120",
  newMemberCost: "40",
  churnPct: "20",
};

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (t) => {
  const s = String(t ?? "").replace(/[$%\s,]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

// "name, quantity per year, list price, practice cost" per line.
export function parseServices(text, warnings) {
  const out = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(",").map((s) => s.trim());
    const nums = parts.slice(1).map(num);
    if (parts.length !== 4 || parts[0] === "" || nums.some((v) => v == null || Number.isNaN(v) || v < 0) || nums[0] === 0) {
      warnings.push(`Line ${i + 1} ("${line}") is not "service, quantity per year, list price, your cost", so it was skipped.`);
      return;
    }
    out.push({ name: parts[0], qty: nums[0], price: nums[1], cost: nums[2] });
  });
  return out;
}

// Economics of one member-year at a given monthly fee.
export function memberYear(services, p, monthlyFee) {
  const listValue = services.reduce((s, x) => s + x.qty * x.price, 0);
  const planValue = listValue * (1 - p.discount);
  const fullCost = services.reduce((s, x) => s + x.qty * x.cost, 0);
  // Members who skip services cost the practice nothing for those services (the fee is already paid).
  const cost = fullCost * p.use;
  const collected = monthlyFee * 12;
  const fees = collected * p.billingFee;
  const margin = collected - fees - cost;
  return {
    listValue, planValue, fullCost, cost, collected, fees, margin,
    marginPct: collected > 0 ? margin / collected : 0,
    // What the patient pays a la carte for what they would actually use, versus the plan.
    patientSavings: listValue * p.use - collected,
    // Same visits sold a la carte at list price: the practice margin it gives up or gains by moving to the plan.
    alaCarteMargin: listValue * p.use - cost,
  };
}

// Fee that reaches the target margin: collected * (1 - billingFee - target) = cost.
export function feeForMargin(services, p, target) {
  const denom = 1 - p.billingFee - target;
  if (denom <= 0) return null;
  const cost = services.reduce((s, x) => s + x.qty * x.cost, 0) * p.use;
  return cost / denom / 12;
}

export function analyze(inputs) {
  const warnings = [];
  const services = parseServices(inputs.services, warnings);
  const need = (k, label, min, max) => {
    const v = num(inputs[k]);
    if (v == null || Number.isNaN(v) || v < min || (max != null && v > max)) {
      warnings.push(`${label} must be a number${max != null ? ` from ${min} to ${max}` : ` of at least ${min}`}.`);
      return null;
    }
    return v;
  };
  const discountPct = need("discountPct", "Plan discount on list prices (%)", 0, 100);
  const usePct = need("usePct", "Share of included services members actually use (%)", 0, 100);
  const billingFeePct = need("billingFeePct", "Billing and card fees (% of plan payments)", 0, 50);
  const members = need("members", "Members enrolled", 0);
  const newMemberCost = need("newMemberCost", "Cost to sign up a member ($)", 0);
  const churnPct = need("churnPct", "Members who leave each year (%)", 0, 100);
  const targetMarginPct = need("targetMarginPct", "Target margin on plan payments (%)", 0, 95);
  const mode = inputs.feeMode === "fixed" ? "fixed" : "target";
  let fixedFee = null;
  if (mode === "fixed") fixedFee = need("monthlyFee", "Monthly plan fee ($)", 0);
  if (services.length === 0) warnings.push("Enter at least one included service, for example: Annual exam, 2, 70, 28");
  if (services.length === 0 || [discountPct, usePct, billingFeePct, members, newMemberCost, churnPct, targetMarginPct].some((v) => v == null) || (mode === "fixed" && fixedFee == null)) return { ok: false, warnings };
  const p = { discount: discountPct / 100, use: usePct / 100, billingFee: billingFeePct / 100 };
  const suggested = feeForMargin(services, p, targetMarginPct / 100);
  if (suggested == null) { warnings.push("Billing fees plus the target margin leave nothing to cover service costs; lower one of them."); return { ok: false, warnings }; }
  const fee = mode === "fixed" ? fixedFee : suggested;
  const base = memberYear(services, p, fee);
  const lines = services.map((s) => ({ ...s, listTotal: s.qty * s.price, costTotal: s.qty * s.cost, marginPct: s.price > 0 ? (s.price - s.cost) / s.price : 0 }));
  // Utilisation sweep: the risk in a plan is members who use more than priced.
  const sweep = [60, 80, 100, 120].map((u) => {
    const y = memberYear(services, { ...p, use: u / 100 }, fee);
    return { use: u, margin: y.margin, marginPct: y.marginPct };
  });
  const breakEvenUse = (() => {
    const fullCost = base.fullCost;
    if (fullCost <= 0) return null;
    return (base.collected - base.fees) / fullCost;
  })();
  // Fee ladder around the chosen fee.
  const ladder = [-10, -5, 0, 5, 10].map((d) => {
    const f = Math.max(0, fee + d);
    const y = memberYear(services, p, f);
    return { fee: f, margin: y.margin, marginPct: y.marginPct, patientSavings: y.patientSavings };
  });
  // Cohort: members keep paying through the year; replacing churned members costs sign-up spend.
  const churned = members * (churnPct / 100);
  const signupSpend = churned * newMemberCost;
  const annualMargin = base.margin * members - signupSpend;
  return {
    ok: true, warnings, mode, fee, suggested, base, lines, sweep, breakEvenUse, ladder,
    cohort: { members, churned, signupSpend, annualMargin, perMember: members > 0 ? annualMargin / members : 0 },
  };
}

export function toCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["service", "qty_per_year", "list_total", "cost_total", "item_margin_pct"].join(",")];
  for (const r of a.lines) lines.push([q(r.name), r.qty, r.listTotal.toFixed(2), r.costTotal.toFixed(2), (r.marginPct * 100).toFixed(1)].join(","));
  lines.push("");
  lines.push(["monthly_fee", "annual_collected", "billing_fees", "service_cost_at_use", "margin", "margin_pct"].join(","));
  const b = a.base;
  lines.push([a.fee.toFixed(2), b.collected.toFixed(2), b.fees.toFixed(2), b.cost.toFixed(2), b.margin.toFixed(2), (b.marginPct * 100).toFixed(1)].join(","));
  return lines.join("\n") + "\n";
}
