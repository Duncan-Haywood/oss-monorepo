// Percentage-rent (retail / restaurant lease) statement checker.
//
// Many retail and restaurant leases charge base rent plus a percentage of gross sales above a breakpoint. The landlord's year-end
// statement bills the overage. This module recomputes it from the tenant's own sales records and the lease terms the user types:
// natural breakpoint (base rent / percentage) or a stated artificial one, a lease exclusion list (sales tax, refunds, gift-card
// sales, ...), an optional annual cap and the estimates already paid. It ships no lease language and decides nothing about who is right;
// it prices the gap and names the record that would prove each line.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function num(v, name, { min = 0, max = Infinity, fallback } = {}) {
  if (v === "" || v === null || v === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${name} is required`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  if (n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return n;
}

export function money(n) {
  const v = Math.round(Math.abs(n) * 100) / 100;
  return (n < 0 ? "-$" : "$") + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Natural breakpoint: the sales level at which the percentage rate produces exactly the base rent.
export function naturalBreakpoint(baseRent, ratePct) {
  const base = num(baseRent, "base rent", { min: 0 });
  const rate = num(ratePct, "percentage rate", { min: 0.01, max: 25 });
  return round2(base / (rate / 100));
}

// Percentage rent on a sales figure: rate x (sales - breakpoint), never below zero, optionally capped.
export function percentageRent({ sales, breakpoint, ratePct, cap = null }) {
  const s = num(sales, "gross sales", { min: 0 });
  const b = num(breakpoint, "breakpoint", { min: 0 });
  const r = num(ratePct, "percentage rate", { min: 0.01, max: 25 });
  let rent = Math.max(0, s - b) * (r / 100);
  if (cap !== null && cap !== undefined && cap !== "") rent = Math.min(rent, num(cap, "percentage rent cap", { min: 0 }));
  return round2(rent);
}

const EVIDENCE = {
  arithmetic: "The lease's percentage-rent clause (rate, breakpoint, cap) and the landlord's statement; the calculation is redone from those two documents.",
  gap: "Your POS or accounting gross-sales report for the same lease-year dates, tied to your sales-tax returns for the period.",
  exclusion: "The lease's definition of 'Gross Sales' and its exclusion list, plus the POS report or ledger line that shows this amount.",
};

const EXCLUSION_HELP = {
  default: "Check the exclusion appears in the lease's Gross Sales definition; many leases exclude it, but the wording controls.",
};

// Add whole days to a YYYY-MM-DD string in UTC; returns YYYY-MM-DD.
export function addDays(dateStr, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) throw new Error("statement date must be YYYY-MM-DD");
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dateStr) throw new Error("statement date is not a real date");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function auditPercentageRent(input = {}) {
  const ratePct = num(input.ratePct, "percentage rate", { min: 0.01, max: 25 });
  const mode = input.breakpointMode === "artificial" ? "artificial" : "natural";
  let breakpoint;
  if (mode === "natural") {
    const base = num(input.baseRent, "base rent for the period", { min: 0.01 });
    breakpoint = naturalBreakpoint(base, ratePct);
  } else {
    breakpoint = round2(num(input.artificialBreakpoint, "artificial breakpoint", { min: 0 }));
  }
  const cap = input.cap === "" || input.cap === null || input.cap === undefined ? null : num(input.cap, "percentage rent cap", { min: 0 });

  const landlordSales = round2(num(input.landlordSales, "gross sales on the landlord's statement", { min: 0 }));
  const ownSales = round2(num(input.ownSales, "gross sales in your records", { min: 0, fallback: landlordSales }));
  const billed = round2(num(input.billed, "percentage rent billed", { min: 0 }));
  const paid = round2(num(input.paid, "percentage rent already paid", { min: 0, fallback: 0 }));

  const exclusions = (input.exclusions || [])
    .filter((e) => e && !(e.amount === "" || e.amount === undefined || e.amount === null))
    .map((e, i) => ({
      label: String(e.label || `Exclusion ${i + 1}`).trim() || `Exclusion ${i + 1}`,
      amount: round2(num(e.amount, `${e.label || "exclusion"} amount`, { min: 0 })),
      leaseExcludes: e.leaseExcludes !== false && e.leaseExcludes !== "false",
    }));
  const excluded = round2(exclusions.filter((e) => e.leaseExcludes).reduce((s, e) => s + e.amount, 0));
  if (excluded > ownSales) throw new Error("excluded amounts cannot exceed the gross sales in your records");

  const rentOf = (sales, withCap = true) => percentageRent({ sales, breakpoint, ratePct, cap: withCap ? cap : null });
  const correctSales = round2(ownSales - excluded);
  const landlordConsistent = rentOf(landlordSales);
  const correct = rentOf(correctSales);
  const overcharge = round2(billed - correct);

  const items = [];
  const arithmetic = round2(billed - landlordConsistent);
  if (arithmetic !== 0) {
    items.push({
      kind: "arithmetic",
      title: "Billed amount does not follow from the landlord's own sales figure",
      dollars: -arithmetic,
      detail: `On the landlord's own ${money(landlordSales)} and a ${money(breakpoint)} breakpoint at ${ratePct}%${cap !== null ? ` (cap ${money(cap)})` : ""}, the clause gives ${money(landlordConsistent)}; the statement bills ${money(billed)}. Ask which breakpoint, rate, cap or period the landlord used.`,
      evidence: EVIDENCE.arithmetic,
    });
  }
  const gap = round2(landlordSales - ownSales);
  if (gap !== 0) {
    const d = round2(landlordConsistent - rentOf(ownSales));
    items.push({
      kind: "gap",
      title: gap > 0 ? "Landlord counted more sales than your records show" : "Your records show more sales than the landlord counted",
      dollars: -d,
      detail: `${money(Math.abs(gap))} ${gap > 0 ? "more" : "less"} gross sales on the statement than in your records for the same period. Priced alone: ${money(Math.abs(d))} of percentage rent.${gap < 0 ? " This line goes against you; fix your own records before you write." : ""}`,
      evidence: EVIDENCE.gap,
    });
  }
  for (const e of exclusions) {
    if (!e.leaseExcludes) {
      items.push({
        kind: "included",
        title: `${e.label}: you marked this as counted under your lease`,
        dollars: 0,
        detail: `${money(e.amount)} stays in gross sales, so it is not disputed.`,
        evidence: EVIDENCE.exclusion,
      });
      continue;
    }
    const d = round2(rentOf(ownSales) - rentOf(ownSales - e.amount));
    items.push({
      kind: "exclusion",
      title: `${e.label} should come out of gross sales`,
      dollars: -d,
      detail: `${money(e.amount)} excluded from gross sales by your lease. Priced alone: ${money(d)} of percentage rent${d === 0 ? " (it sits below the breakpoint, so it changes nothing by itself)" : ""}. ${EXCLUSION_HELP.default}`,
      evidence: EVIDENCE.exclusion,
    });
  }
  const deadline =
    input.statementDate && input.auditWindowDays !== "" && input.auditWindowDays !== undefined && input.auditWindowDays !== null
      ? addDays(input.statementDate, Math.round(num(input.auditWindowDays, "review window (days)", { min: 0, max: 1095 })))
      : null;

  return {
    breakpoint,
    breakpointMode: mode,
    ratePct,
    cap,
    landlordSales,
    ownSales,
    excluded,
    correctSales,
    billed,
    landlordConsistent,
    correct,
    overcharge,
    arithmetic,
    owedByLandlordStatement: round2(billed - paid),
    owedCorrected: round2(correct - paid),
    items,
    deadline,
  };
}

export function disputeNote(r, meta = {}) {
  const tenant = String(meta.tenant || "[tenant name]").trim() || "[tenant name]";
  const period = String(meta.period || "[lease year]").trim() || "[lease year]";
  const clause = String(meta.clause || "").trim();
  const lines = [];
  lines.push(`Re: percentage rent statement for ${period} -- ${tenant}`);
  lines.push("");
  lines.push(`I reviewed the percentage rent statement billing ${money(r.billed)}${clause ? ` against ${clause} of the lease` : ""}. Using the lease terms (${r.ratePct}% over a ${money(r.breakpoint)} ${r.breakpointMode} breakpoint${r.cap !== null ? `, capped at ${money(r.cap)}` : ""}) and our sales records, I calculate ${money(r.correct)}.`);
  const disputed = r.items.filter((i) => i.dollars < 0);
  if (disputed.length) {
    lines.push("");
    lines.push("Items I am asking you to review:");
    disputed.forEach((i, n) => lines.push(`${n + 1}. ${i.title} (${money(-i.dollars)} priced alone). ${i.detail}`));
  }
  lines.push("");
  if (r.overcharge > 0) lines.push(`That is a difference of ${money(r.overcharge)} against the statement. Please send the sales report and the calculation behind the figure so we can reconcile them, and hold the balance until we have.`);
  else if (r.overcharge < 0) lines.push(`My calculation is ${money(-r.overcharge)} higher than the statement, so I am not disputing the amount billed; please confirm the statement.`);
  else lines.push("My calculation agrees with the statement.");
  if (r.deadline) lines.push(`I understand the review window runs to ${r.deadline}; please treat this note as sent within it.`);
  lines.push("");
  lines.push("This is a request to review and reconcile, not a legal position. Please reply with the supporting detail.");
  return lines.join("\n");
}
