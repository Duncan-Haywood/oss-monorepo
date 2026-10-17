// UK Making Tax Digital for Income Tax (MTD ITSA) check: does it apply to you, from which date,
// and what are the quarterly and final deadlines. Pure functions, no I/O. Bad input is rejected
// with a message, never clamped.
// Written from memory WITHOUT network access in the building session. The thresholds (above
// GBP 50,000 from 6 April 2026, above GBP 30,000 from 6 April 2027, above GBP 20,000 from
// 6 April 2028) are the ones HMRC announced, each tested on qualifying income two tax years
// earlier. HMRC guidance and penalty detail move, so every result names its source to verify.

export const VERIFY = "GOV.UK 'Use Making Tax Digital for Income Tax' and 'Check if your sole trader or landlord business needs to use Making Tax Digital' (HMRC); Finance Act 2024 and the Income Tax (Digital Requirements) Regulations 2021 as amended";

export const STEPS = [
  { start: "2026-04-06", year: 2026, threshold: 50_000, basis: "2024-25", field: "y2425" },
  { start: "2027-04-06", year: 2027, threshold: 30_000, basis: "2025-26", field: "y2526" },
  { start: "2028-04-06", year: 2028, threshold: 20_000, basis: "2026-27", field: "y2627" },
];

const NUM = ["se2425", "prop2425", "se2526", "prop2526", "se2627", "prop2627"];

export function parse(input) {
  const i = input || {};
  const errors = [];
  const n = {};
  for (const k of NUM) {
    const raw = i[k] === undefined || i[k] === "" || i[k] === null ? 0 : Number(i[k]);
    if (!Number.isFinite(raw) || raw < 0) { errors.push(`Enter an amount of zero or more for ${k}.`); n[k] = 0; } else n[k] = raw;
  }
  const yn = (v) => v === true || v === "yes";
  return {
    errors, n,
    partner: yn(i.partner), digitalExcluded: yn(i.digitalExcluded), joint: yn(i.joint),
    calendar: yn(i.calendar),
  };
}

export function qualifying(p) {
  return { y2425: p.n.se2425 + p.n.prop2425, y2526: p.n.se2526 + p.n.prop2526, y2627: p.n.se2627 + p.n.prop2627 };
}

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function deadlines(startYear, calendar) {
  const y = startYear;
  const std = [
    { period: `6 Apr ${y} – 5 Jul ${y}`, due: iso(y, 8, 7) },
    { period: `6 Jul ${y} – 5 Oct ${y}`, due: iso(y, 11, 7) },
    { period: `6 Oct ${y} – 5 Jan ${y + 1}`, due: iso(y + 1, 2, 7) },
    { period: `6 Jan ${y + 1} – 5 Apr ${y + 1}`, due: iso(y + 1, 5, 7) },
  ];
  const cal = [
    { period: `1 Apr ${y} – 30 Jun ${y}`, due: iso(y, 8, 7) },
    { period: `1 Jul ${y} – 30 Sep ${y}`, due: iso(y, 11, 7) },
    { period: `1 Oct ${y} – 31 Dec ${y}`, due: iso(y + 1, 2, 7) },
    { period: `1 Jan ${y + 1} – 31 Mar ${y + 1}`, due: iso(y + 1, 5, 7) },
  ];
  return { quarters: calendar ? cal : std, finalDeclaration: iso(y + 2, 1, 31), taxYear: `${y}-${String(y + 1).slice(2)}` };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const q = qualifying(p);
  const checks = STEPS.map((s) => ({ ...s, income: q[s.field], applies: q[s.field] > s.threshold }));
  const first = checks.find((c) => c.applies) || null;
  const findings = [];
  const obligations = [];

  if (p.digitalExcluded) {
    findings.push({ severity: "medium", title: "You said it is not reasonably practical to use digital tools. HMRC can exempt you, but only if you apply and it agrees; until then the rules apply." });
  }
  if (p.partner) {
    findings.push({ severity: "info", title: "Partnership profit is not counted and partners are not yet required to join. Only your own self-employment and property income count." });
  }
  if (p.joint) {
    findings.push({ severity: "info", title: "For jointly held property only your share of the gross rent counts towards the threshold." });
  }
  for (const c of checks) {
    const gap = c.income - c.threshold;
    if (Math.abs(gap) <= c.threshold * 0.1 && Math.abs(gap) > 0) {
      findings.push({ severity: "medium", title: `Within 10% of the GBP ${c.threshold.toLocaleString("en-GB")} line for ${c.start} (${c.basis} income ${gap > 0 ? "above" : "below"} by GBP ${Math.abs(gap).toLocaleString("en-GB")}). Check the gross figure on your return, not profit.` });
    }
    if (gap === 0) findings.push({ severity: "medium", title: `Exactly GBP ${c.threshold.toLocaleString("en-GB")} for ${c.basis}: the rule is more than the threshold, so you are not caught at that step.` });
  }

  let schedule = null;
  if (first) {
    schedule = deadlines(first.year, p.calendar);
    findings.unshift({ severity: "high", title: `Required from ${first.start}: ${first.basis} qualifying income of GBP ${first.income.toLocaleString("en-GB")} is above GBP ${first.threshold.toLocaleString("en-GB")}.` });
    obligations.push(
      { ref: "Records", title: "Keep digital records", why: "Record each business transaction in MTD-compatible software (or a spreadsheet bridged to it); paper-only records are no longer enough." },
      { ref: "Quarterly updates", title: "Send four quarterly updates", why: `Income and expenses summaries via software by 7 August, 7 November, 7 February and 7 May of tax year ${schedule.taxYear}.` },
      { ref: "Final declaration", title: "Submit a final declaration", why: `Replaces the Self Assessment tax return for ${schedule.taxYear}; due ${schedule.finalDeclaration}. One declaration covers all your sources of income.` },
      { ref: "Sign up", title: "Sign up before your start date", why: "Sign up through your agent or HMRC's service, using compatible software; HMRC is writing to people it identifies, but sign-up is your duty." },
      { ref: "Penalties", title: "Points-based late-submission penalties", why: "Late quarterly updates earn points; reaching the threshold triggers a fixed penalty. HMRC announced a lighter first year; confirm the current terms." },
    );
  } else {
    findings.unshift({ severity: "info", title: "On these figures MTD for Income Tax is not mandatory for you at any of the three announced steps. You can still join voluntarily." });
    obligations.push(
      { ref: "Voluntary", title: "Voluntary sign-up is open", why: "You can join early if you want quarterly visibility of tax due; you can leave Self Assessment-style annual filing behind only once you are in." },
      { ref: "Watch", title: "Re-test each January", why: "The 2026-27 return decides the 2028 step at GBP 20,000, so a good year can pull you in; re-run this with the new figures." },
    );
  }
  return { errors: [], checks, first, schedule, findings, obligations, qualifying: q };
}

export const SAMPLE = { se2425: 42000, prop2425: 12000, se2526: 45000, prop2526: 12500, se2627: 46000, prop2627: 12500, partner: "no", digitalExcluded: "no", joint: "no", calendar: "no" };

export function summaryText(r) {
  const L = ["UK MTD for Income Tax check", ""];
  for (const c of r.checks) L.push(`${c.start}: ${c.basis} income GBP ${c.income.toLocaleString("en-GB")} vs more than GBP ${c.threshold.toLocaleString("en-GB")} -> ${c.applies ? "REQUIRED" : "not required"}`);
  L.push("");
  if (r.first) {
    L.push(`Start: ${r.first.start}`);
    for (const x of r.schedule.quarters) L.push(`  Quarter ${x.period}: due ${x.due}`);
    L.push(`  Final declaration for ${r.schedule.taxYear}: due ${r.schedule.finalDeclaration}`);
  } else L.push("Not mandatory on these figures.");
  L.push("", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
