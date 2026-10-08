// Good Faith Estimate generator for uninsured and self-pay patients.
// Pure functions, no dependencies, nothing leaves the caller.
//
// The No Surprises Act (45 CFR 149.610) asks a provider or facility to give an
// uninsured or self-pay patient a Good Faith Estimate of expected charges for
// scheduled care. This file does the arithmetic around that duty: the delivery
// deadline, the total, a completeness check, and the $400 dispute test. It
// carries no fee schedule, no code set and no legal authority; every figure
// and date rule below is stated as an assumption the caller can see.

export const DISPUTE_THRESHOLD = 400; // billed minus estimate, per provider or facility
export const DISPUTE_WINDOW_DAYS = 120; // from the date of the initial bill

const DAY = 86400000;

export function parseISO(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t;
}

export function fmtISO(t) {
  return new Date(t).toISOString().slice(0, 10);
}

const nthWeekday = (y, m, wd, n) => {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return Date.UTC(y, m, 1 + ((wd - first + 7) % 7) + (n - 1) * 7);
};
const lastWeekday = (y, m, wd) => {
  const last = new Date(Date.UTC(y, m + 1, 0));
  return Date.UTC(y, m, last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7));
};
// A Saturday holiday is observed on Friday, a Sunday holiday on Monday.
const observed = (t) => {
  const wd = new Date(t).getUTCDay();
  return wd === 6 ? t - DAY : wd === 0 ? t + DAY : t;
};

// U.S. federal holidays for a year, as ISO dates (observed days). Juneteenth
// exists from 2021. Whether the delivery rule counts federal holidays as
// non-business days is an assumption the caller toggles; this only supplies them.
export function federalHolidays(y) {
  const days = [
    observed(Date.UTC(y, 0, 1)),
    nthWeekday(y, 0, 1, 3),
    nthWeekday(y, 1, 1, 3),
    lastWeekday(y, 4, 1),
    ...(y >= 2021 ? [observed(Date.UTC(y, 5, 19))] : []),
    observed(Date.UTC(y, 6, 4)),
    nthWeekday(y, 8, 1, 1),
    nthWeekday(y, 9, 1, 2),
    observed(Date.UTC(y, 10, 11)),
    nthWeekday(y, 10, 4, 4),
    observed(Date.UTC(y, 11, 25)),
  ];
  return new Set(days.map(fmtISO));
}

export function isBusinessDay(t, useHolidays = true) {
  const wd = new Date(t).getUTCDay();
  if (wd === 0 || wd === 6) return false;
  if (!useHolidays) return true;
  const y = new Date(t).getUTCFullYear();
  // Check next year too: Jan 1 can be observed on the previous Dec 31.
  return !federalHolidays(y).has(fmtISO(t)) && !federalHolidays(y + 1).has(fmtISO(t));
}

// The date n business days after t (day 1 is the first business day after t).
export function addBusinessDays(t, n, useHolidays = true) {
  let cur = t;
  let left = n;
  while (left > 0) {
    cur += DAY;
    if (isBusinessDay(cur, useHolidays)) left -= 1;
  }
  return cur;
}

// Business days strictly between two dates (neither end counted). This is the
// conservative reading of "scheduled at least N business days before the
// service": counting fewer days can only move a case into the stricter tier.
export function businessDaysBetween(from, to, useHolidays = true) {
  let n = 0;
  for (let t = from + DAY; t < to; t += DAY) if (isBusinessDay(t, useHolidays)) n += 1;
  return n;
}

// When must the estimate reach the patient?
//   scheduled 10+ business days ahead -> within 3 business days of scheduling
//   scheduled 3-9 business days ahead -> within 1 business day of scheduling
//   scheduled under 3 business days   -> no scheduled-care estimate due
//   requested without scheduling      -> within 3 business days of the request
export function gfeDeadline({ kind = "scheduled", scheduledOn, serviceOn, requestedOn, useHolidays = true } = {}) {
  if (kind === "request") {
    const r = parseISO(requestedOn);
    if (r === null) return { ok: false, error: "Enter the date the patient asked for an estimate." };
    return {
      ok: true,
      required: true,
      tier: "request",
      businessDays: 3,
      dueBy: fmtISO(addBusinessDays(r, 3, useHolidays)),
      note: "Patient asked for an estimate without scheduling: due within 3 business days of the request.",
    };
  }
  const s = parseISO(scheduledOn);
  const v = parseISO(serviceOn);
  if (s === null) return { ok: false, error: "Enter the date the care was scheduled." };
  if (v === null) return { ok: false, error: "Enter the date of service." };
  if (v < s) return { ok: false, error: "The service date is before the scheduling date." };
  const lead = businessDaysBetween(s, v, useHolidays);
  if (lead >= 10) {
    return {
      ok: true,
      required: true,
      tier: "10+",
      leadBusinessDays: lead,
      businessDays: 3,
      dueBy: fmtISO(addBusinessDays(s, 3, useHolidays)),
      note: `Scheduled ${lead} business days ahead (10 or more): due within 3 business days of scheduling.`,
    };
  }
  if (lead >= 3) {
    return {
      ok: true,
      required: true,
      tier: "3-9",
      leadBusinessDays: lead,
      businessDays: 1,
      dueBy: fmtISO(addBusinessDays(s, 1, useHolidays)),
      note: `Scheduled ${lead} business days ahead (3 to 9): due within 1 business day of scheduling.`,
    };
  }
  return {
    ok: true,
    required: false,
    tier: "under-3",
    leadBusinessDays: lead,
    note: `Scheduled only ${lead} business days ahead (under 3): the scheduled-care estimate is not triggered. Give one if the patient asks.`,
  };
}

export function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v !== "string") return NaN;
  const t = v.replace(/[$,\s]/g, "");
  if (t === "") return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function money(n) {
  const v = Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "-$" : "$") + s;
}

const round2 = (n) => Math.round(n * 100) / 100;

export function lineTotal(line) {
  const q = num(line.qty);
  const p = num(line.charge);
  if (!(q > 0) || !(p >= 0)) return 0;
  return round2(q * p);
}

// Total expected charges, grouped by who bills them. Lines with no billing
// provider go to the primary provider, because the dispute test compares the
// bill of each provider or facility with what that provider was expected to bill.
export function estimateTotals(lines, primaryName = "Primary provider") {
  const groups = new Map();
  let total = 0;
  for (const line of lines) {
    const t = lineTotal(line);
    const who = (line.billedBy || "").trim() || primaryName;
    groups.set(who, round2((groups.get(who) || 0) + t));
    total = round2(total + t);
  }
  return { total, byProvider: [...groups].map(([name, amount]) => ({ name, amount })) };
}

const CPT_OR_HCPCS = /^([0-9]{4}[0-9FTU]|[A-V][0-9]{4})$/i;
const ICD10 = /^[A-TV-Z][0-9][0-9A-Z](\.?[0-9A-Z]{1,4})?$/i;
const NPI = /^\d{10}$/;

// Completeness and sanity check of an estimate before it goes to a patient.
// Returns findings sorted most serious first. Format checks are shape checks
// only: a code that looks right can still be the wrong code.
export function checkEstimate(g) {
  const out = [];
  const add = (level, text) => out.push({ level, text });
  const p = g.provider || {};
  const pt = g.patient || {};
  const lines = (g.lines || []).filter((l) => (l.description || "").trim() || (l.code || "").trim() || num(l.charge) > 0);

  if (!(p.name || "").trim()) add("missing", "Provider or facility name is empty.");
  if (!NPI.test((p.npi || "").trim())) add("missing", "NPI should be 10 digits.");
  if (!(p.tin || "").trim()) add("missing", "Tax ID (TIN) is empty.");
  if (!(p.address || "").trim()) add("missing", "Provider or facility address is empty.");
  if (!(pt.name || "").trim()) add("missing", "Patient name is empty.");
  if (parseISO(pt.dob) === null) add("missing", "Patient date of birth is missing or not a valid date.");
  if (!(g.primaryService || "").trim()) add("missing", "Describe the primary service in plain language.");
  if (parseISO(g.serviceOn) === null) add("missing", "Expected date of service is missing or not a valid date.");

  if (lines.length === 0) add("missing", "No service lines. List every item and service you expect to bill.");
  lines.forEach((l, i) => {
    const n = i + 1;
    if (!CPT_OR_HCPCS.test((l.code || "").trim())) add("missing", `Line ${n}: service code does not look like a CPT or HCPCS code.`);
    if (!(l.description || "").trim()) add("warn", `Line ${n}: add a description the patient can read.`);
    if (!(num(l.qty) > 0)) add("missing", `Line ${n}: quantity must be above zero.`);
    if (!(num(l.charge) >= 0)) add("missing", `Line ${n}: enter the expected charge.`);
    const dx = (l.dx || "").trim();
    if (dx && !ICD10.test(dx)) add("warn", `Line ${n}: diagnosis code does not look like ICD-10.`);
    if (!dx) add("warn", `Line ${n}: no diagnosis code. Add one if you have it; otherwise note the diagnosis is not yet known.`);
  });

  const seen = new Set();
  for (const l of lines) {
    const key = `${(l.code || "").trim().toUpperCase()}|${(l.billedBy || "").trim()}`;
    if (key !== "|" && seen.has(key)) add("warn", `Code ${(l.code || "").trim()} appears twice; raise its quantity instead unless they are different encounters.`);
    seen.add(key);
  }

  const totals = estimateTotals(lines, p.name || "Primary provider");
  if (lines.length && totals.total === 0) add("warn", "Every line is $0.00. An estimate of nothing will read as a decision not to charge.");
  if (g.expectsOtherProviders && !(g.otherProviders || "").trim()) {
    add("warn", "You said other providers may bill for this care but listed none. Name them, or say none are expected.");
  }

  const rank = { missing: 0, warn: 1 };
  out.sort((a, b) => rank[a.level] - rank[b.level]);
  return { findings: out, complete: out.every((f) => f.level !== "missing"), totals };
}

// Patient-provider dispute test: may the patient start dispute resolution?
// True when this provider's billed charges are at least $400 above its estimate.
export function disputeCheck({ estimated, billed, billDate, today } = {}) {
  const e = num(estimated);
  const b = num(billed);
  if (!(e >= 0) || !(b >= 0)) return { ok: false, error: "Enter both the estimate and the billed amount." };
  const over = round2(b - e);
  const res = { ok: true, over, eligible: over >= DISPUTE_THRESHOLD, threshold: DISPUTE_THRESHOLD, headroom: round2(DISPUTE_THRESHOLD - over) };
  const bd = parseISO(billDate);
  if (bd !== null) {
    res.deadline = fmtISO(bd + DISPUTE_WINDOW_DAYS * DAY);
    const td = parseISO(today);
    if (td !== null) res.daysLeft = Math.round((bd + DISPUTE_WINDOW_DAYS * DAY - td) / DAY);
  }
  return res;
}

// Parse "case, code, estimate, actual" rows from history. Blank lines and a
// header row are skipped. Returns the parsed rows plus the lines it could not read.
export function parseHistory(text) {
  const rows = [];
  const bad = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[,\t]/).map((s) => s.trim());
    if (parts.length < 4) return void bad.push({ line: i + 1, text: raw });
    const est = num(parts[2]);
    const act = num(parts[3]);
    if (!Number.isFinite(est) || !Number.isFinite(act)) {
      if (i === 0 && /case|id/i.test(parts[0])) return; // header
      return void bad.push({ line: i + 1, text: raw });
    }
    rows.push({ caseId: parts[0], code: parts[1].toUpperCase(), estimate: est, actual: act });
  });
  return { rows, bad };
}

// Past estimates versus what was billed. Per case: the overrun in dollars, and
// whether it would have crossed the dispute threshold. Per code: how far actual
// charges drift from what was estimated, so the estimate basis can be corrected.
export function exceedanceReport(rows, threshold = DISPUTE_THRESHOLD) {
  const cases = new Map();
  const codes = new Map();
  for (const r of rows) {
    const c = cases.get(r.caseId) || { caseId: r.caseId, estimate: 0, actual: 0 };
    c.estimate = round2(c.estimate + r.estimate);
    c.actual = round2(c.actual + r.actual);
    cases.set(r.caseId, c);
    const k = codes.get(r.code) || { code: r.code, n: 0, estimate: 0, actual: 0, under: 0 };
    k.n += 1;
    k.estimate = round2(k.estimate + r.estimate);
    k.actual = round2(k.actual + r.actual);
    if (r.actual > r.estimate) k.under += 1;
    codes.set(r.code, k);
  }
  const caseList = [...cases.values()].map((c) => ({ ...c, over: round2(c.actual - c.estimate), disputable: c.actual - c.estimate >= threshold }));
  const disputable = caseList.filter((c) => c.disputable);
  const codeList = [...codes.values()]
    .map((k) => ({
      code: k.code,
      n: k.n,
      meanEstimate: round2(k.estimate / k.n),
      meanActual: round2(k.actual / k.n),
      meanDrift: round2((k.actual - k.estimate) / k.n),
      driftPct: k.estimate > 0 ? (k.actual - k.estimate) / k.estimate : null,
      underEstimated: k.under,
      totalOver: round2(Math.max(0, k.actual - k.estimate)),
    }))
    .sort((a, b) => b.totalOver - a.totalOver || a.code.localeCompare(b.code));
  const sum = (f) => caseList.reduce((s, c) => s + f(c), 0);
  return {
    cases: caseList.length,
    disputable: disputable.length,
    disputableRate: caseList.length ? disputable.length / caseList.length : 0,
    meanOver: caseList.length ? round2(sum((c) => c.over) / caseList.length) : 0,
    worst: caseList.slice().sort((a, b) => b.over - a.over).slice(0, 5),
    codes: codeList,
  };
}

function wrap(label, value) {
  return `${label}: ${value || "________________"}`;
}

// The estimate as plain text, for pasting into a letter or an EHR note.
export function renderText(g, deadline) {
  const p = g.provider || {};
  const pt = g.patient || {};
  const lines = (g.lines || []).filter((l) => (l.description || "").trim() || (l.code || "").trim() || num(l.charge) > 0);
  const totals = estimateTotals(lines, p.name || "Primary provider");
  const out = [];
  out.push("GOOD FAITH ESTIMATE OF EXPECTED CHARGES");
  out.push("");
  out.push(wrap("Patient", pt.name));
  out.push(wrap("Date of birth", pt.dob));
  out.push(wrap("Date prepared", g.preparedOn));
  out.push(wrap("Expected date of service", g.serviceOn));
  out.push("");
  out.push(wrap("Provider or facility", p.name));
  out.push(wrap("NPI", p.npi));
  out.push(wrap("Tax ID", p.tin));
  out.push(wrap("Address", p.address));
  out.push("");
  out.push(wrap("Primary service", g.primaryService));
  out.push("");
  out.push("EXPECTED ITEMS AND SERVICES");
  lines.forEach((l, i) => {
    const who = (l.billedBy || "").trim();
    out.push(
      `${i + 1}. ${(l.code || "").trim() || "no code"}  ${(l.description || "").trim()}  dx ${(l.dx || "").trim() || "n/a"}  ` +
        `${num(l.qty) || 0} x ${money(num(l.charge) || 0)} = ${money(lineTotal(l))}${who ? `  (billed by ${who})` : ""}`,
    );
  });
  out.push("");
  for (const b of totals.byProvider) out.push(`Subtotal, ${b.name}: ${money(b.amount)}`);
  out.push(`TOTAL EXPECTED CHARGES: ${money(totals.total)}`);
  if ((g.otherProviders || "").trim()) {
    out.push("");
    out.push("Other providers or facilities who may bill separately for this care:");
    out.push(g.otherProviders.trim());
  }
  if ((g.notes || "").trim()) {
    out.push("");
    out.push("Notes:");
    out.push(g.notes.trim());
  }
  out.push("");
  out.push("IMPORTANT");
  out.push("This is an estimate of expected charges, not a bill and not a contract. It does not require you to receive the care listed. Actual charges may differ if your care changes.");
  out.push(`If a provider or facility bills you ${money(DISPUTE_THRESHOLD)} or more above its estimate, you may be able to dispute the bill through the patient-provider dispute resolution process. Start it within ${DISPUTE_WINDOW_DAYS} calendar days of the date of the bill. Keep this estimate. Information: www.cms.gov/nosurprises or 1-800-985-3059.`);
  if (deadline && deadline.ok && deadline.dueBy) {
    out.push("");
    out.push(`(Internal: delivery due by ${deadline.dueBy}. ${deadline.note})`);
  }
  return out.join("\n");
}

export const EXAMPLE = {
  provider: { name: "Riverside Family Medicine", npi: "1234567893", tin: "12-3456789", address: "100 Example St, Springfield, ST 00000" },
  patient: { name: "Jordan Example", dob: "1985-04-12" },
  primaryService: "Annual physical with blood tests",
  serviceOn: "2026-11-23",
  preparedOn: "2026-10-08",
  scheduledOn: "2026-10-08",
  lines: [
    { code: "99396", description: "Preventive visit, established patient, 40-64", dx: "Z00.00", qty: "1", charge: "245", billedBy: "" },
    { code: "36415", description: "Blood draw", dx: "Z00.00", qty: "1", charge: "20", billedBy: "" },
    { code: "80053", description: "Comprehensive metabolic panel", dx: "Z00.00", qty: "1", charge: "58", billedBy: "Example Reference Lab" },
    { code: "85025", description: "Complete blood count", dx: "Z00.00", qty: "1", charge: "34", billedBy: "Example Reference Lab" },
  ],
  expectsOtherProviders: true,
  otherProviders: "Example Reference Lab, NPI 1098765432, bills its own tests.",
  notes: "",
  history:
    "case,code,estimate,actual\nA1,99396,245,245\nA1,80053,58,58\nA2,99214,150,190\nA2,36415,20,20\nA3,99214,150,185\nA3,93000,60,160\nA4,99213,110,110\nA5,99214,150,640\nA5,81002,15,15",
};
