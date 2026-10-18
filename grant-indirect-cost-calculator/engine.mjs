/**
 * Grant indirect-cost math: modified total direct costs (MTDC) and the
 * indirect (F&A) charge on a proposed budget. Deterministic, no dependencies.
 *
 * Rules applied (U.S. federal Uniform Guidance, 2 CFR 200.1 "Modified total
 * direct cost" and 2 CFR 200.414, as revised effective October 1, 2024):
 *   - MTDC = direct salaries and wages, fringe benefits, materials and
 *     supplies, services, travel, and the first $50,000 of EACH subaward.
 *   - MTDC excludes equipment (per-unit cost at or above $10,000), capital
 *     expenditures, charges for patient care, rental costs, tuition remission,
 *     scholarships and fellowships, participant support costs, and the part of
 *     each subaward over $50,000.
 *   - An organisation with no negotiated rate may elect a de minimis rate of
 *     up to 15% of MTDC.
 * Other funders (foundations, states, NIH/NSF program terms) set their own
 * bases and caps; the base can also be total direct costs. Every threshold is
 * an input so the user can match their own funder's notice.
 */

export const DEFAULTS = {
  salaries: 120000, fringe: 33600, supplies: 6000, travel: 8000, services: 12000, otherDirect: 4000,
  tuition: 0, participantSupport: 0, rental: 0, patientCare: 0,
  equipment: "", subawards: "",
  ratePct: 15, base: "mtdc", equipmentThreshold: 10000, subawardCap: 50000, awardCap: 0,
};

export const INPUT_NOTES = [
  { what: "Salaries, fringe, supplies, travel, services, other direct", detail: "Included in MTDC. Fringe is whatever you typed: apply your own fringe rate first." },
  { what: "Equipment (one price per line or comma separated)", detail: "A unit at or above the equipment threshold ($10,000 by default) is excluded from MTDC; a cheaper unit is treated as a supply and included." },
  { what: "Subawards (one amount per line or comma separated)", detail: "Only the first $50,000 of each subaward is in MTDC, however many years it spans. Enter each subaward's total amount." },
  { what: "Tuition remission, participant support, rental, patient care", detail: "Direct costs excluded from MTDC. They are still part of the total direct cost." },
  { what: "Rate and base", detail: "Rate is a percent. Base is MTDC (default) or total direct costs. 15% is the de minimis ceiling for an organisation without a negotiated rate; use your negotiated rate if you have one." },
  { what: "Award cap (optional)", detail: "If the funder caps the total request, the calculator shows the largest direct budget that fits under it with indirect included." },
];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function money(n) {
  const text = `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export function pct(n, digits = 1) {
  return `${(n * 100).toFixed(digits)}%`;
}

function num(v, name, { min = 0, max = Infinity, fallback = 0 } = {}) {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number.`);
  if (n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return n;
}

/** Parse "12,000, 8500\n40000" into [12000, 8500, 40000]. A comma inside a number (12,000) is a thousands separator. */
export function parseAmounts(text, name = "amount") {
  if (Array.isArray(text)) return text.map((v) => num(v, name));
  if (text === null || text === undefined) return [];
  const src = String(text);
  const NUMBER = /\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$?\d+(?:\.\d+)?/g;
  const found = src.match(NUMBER) || [];
  if (src.replace(NUMBER, "").replace(/[\s,;]+/g, "")) throw new Error(`Each ${name} must be a number; separate entries with new lines, spaces after commas, or semicolons.`);
  if (found.length > 200) throw new Error(`Too many ${name} entries (200 max).`);
  return found.map((p) => num(p, name));
}

export function computeBudget(input = {}) {
  const o = { ...DEFAULTS, ...input };
  const salaries = num(o.salaries, "Salaries");
  const fringe = num(o.fringe, "Fringe");
  const supplies = num(o.supplies, "Supplies");
  const travel = num(o.travel, "Travel");
  const services = num(o.services, "Services");
  const otherDirect = num(o.otherDirect, "Other direct");
  const tuition = num(o.tuition, "Tuition remission");
  const participantSupport = num(o.participantSupport, "Participant support");
  const rental = num(o.rental, "Rental");
  const patientCare = num(o.patientCare, "Patient care");
  const ratePct = num(o.ratePct, "Indirect rate", { max: 100 });
  const eqThreshold = num(o.equipmentThreshold, "Equipment threshold", { fallback: 10000 });
  const subCap = num(o.subawardCap, "Subaward cap", { fallback: 50000 });
  const awardCap = num(o.awardCap, "Award cap");
  const base = o.base === "tdc" ? "tdc" : "mtdc";
  const equipment = parseAmounts(o.equipment, "equipment price");
  const subawards = parseAmounts(o.subawards, "subaward");

  let equipmentIncluded = 0;
  let equipmentExcluded = 0;
  for (const e of equipment) {
    if (e >= eqThreshold) equipmentExcluded += e;
    else equipmentIncluded += e;
  }
  let subIncluded = 0;
  let subExcluded = 0;
  for (const s of subawards) {
    subIncluded += Math.min(s, subCap);
    subExcluded += Math.max(0, s - subCap);
  }

  const includedLines = [
    ["Salaries and wages", salaries], ["Fringe benefits", fringe], ["Materials and supplies", supplies],
    ["Travel", travel], ["Services and consultants", services], ["Other direct costs", otherDirect],
    [`Equipment under ${money(eqThreshold)} a unit (treated as supplies)`, equipmentIncluded],
    [`First ${money(subCap)} of each subaward`, subIncluded],
  ].filter(([, v]) => v > 0);
  const excludedLines = [
    [`Equipment at or over ${money(eqThreshold)} a unit`, equipmentExcluded], ["Tuition remission", tuition],
    ["Participant support costs", participantSupport], ["Rental costs", rental], ["Patient care charges", patientCare],
    [`Subaward amount over ${money(subCap)} each`, subExcluded],
  ].filter(([, v]) => v > 0);

  const mtdc = round2(includedLines.reduce((a, [, v]) => a + v, 0));
  const excluded = round2(excludedLines.reduce((a, [, v]) => a + v, 0));
  const direct = round2(mtdc + excluded);
  const baseAmount = base === "tdc" ? direct : mtdc;
  const indirect = round2((baseAmount * ratePct) / 100);
  const total = round2(direct + indirect);

  const scenarios = [...new Set([10, 15, ratePct])].sort((a, b) => a - b).map((r) => {
    const ind = round2((baseAmount * r) / 100);
    return { ratePct: r, indirect: ind, total: round2(direct + ind), effectiveOnDirect: direct ? ind / direct : 0, current: r === ratePct };
  });

  // Largest direct budget that fits under an award cap, holding the mix of
  // MTDC-eligible vs excluded costs constant: total = D * (1 + rate * share).
  let fit = null;
  if (awardCap > 0 && direct > 0) {
    const share = baseAmount / direct;
    const maxDirect = round2(awardCap / (1 + (ratePct / 100) * share));
    fit = {
      awardCap, fits: total <= awardCap, over: round2(Math.max(0, total - awardCap)),
      maxDirect, directCut: round2(Math.max(0, direct - maxDirect)), maxIndirect: round2(awardCap - maxDirect),
    };
  }

  return {
    base, ratePct, mtdc, excluded, direct, baseAmount, indirect, total, includedLines, excludedLines, scenarios, fit,
    excludedShare: direct ? excluded / direct : 0,
    effectiveOnDirect: direct ? indirect / direct : 0,
    effectiveOnTotal: total ? indirect / total : 0,
    // What the same rate would have yielded if the user had applied it to total direct costs by mistake.
    overChargeIfAppliedToTdc: round2((direct * ratePct) / 100 - (mtdc * ratePct) / 100),
  };
}

export function summarize(r) {
  if (r.direct === 0) return { status: "error", text: "Enter at least one direct cost." };
  const baseWord = r.base === "tdc" ? "total direct costs" : "MTDC";
  let text = `Indirect at ${r.ratePct}% of ${baseWord} (${money(r.baseAmount)}) is ${money(r.indirect)}; total request ${money(r.total)}.`;
  if (r.base === "mtdc" && r.excluded > 0) {
    text += ` ${money(r.excluded)} of your ${money(r.direct)} direct budget (${pct(r.excludedShare, 0)}) is excluded from the base, so the rate is only ${pct(r.effectiveOnDirect)} of direct costs.`;
  }
  let status = "ok";
  if (r.fit) {
    if (r.fit.fits) text += ` Under the ${money(r.fit.awardCap)} cap by ${money(r.fit.awardCap - r.total)}.`;
    else {
      status = "warn";
      text += ` Over the ${money(r.fit.awardCap)} cap by ${money(r.fit.over)}: keep direct costs to ${money(r.fit.maxDirect)} (cut ${money(r.fit.directCut)}).`;
    }
  }
  return { status, text };
}
