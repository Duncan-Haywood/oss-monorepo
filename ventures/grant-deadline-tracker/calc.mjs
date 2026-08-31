export const SAMPLE_GRANTS = [
  {
    name: "Community food program",
    funder: "Local foundation",
    status: "awarded",
    award: 24000,
    spent: 8500,
    nextDate: "2026-09-15",
    nextType: "Report",
    awardDate: "2026-03-15",
    intervalMonths: 6,
  },
  {
    name: "Youth arts application",
    funder: "County arts council",
    status: "pending",
    award: 12000,
    spent: 0,
    nextDate: "2026-10-01",
    nextType: "Application",
  },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(value) {
  if (!value || !DATE_RE.test(String(value))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addMonths(value, months) {
  const date = parseDate(value);
  if (!date || !Number.isFinite(months) || months < 1) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + Math.floor(months));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

/**
 * Next reporting date from an award date and a repeating interval.
 * If earlier intervals have already passed, return the current (possibly
 * overdue) period rather than the first interval after the award.
 */
export function nextDueFromInterval(awardDate, intervalMonths, today) {
  const first = addMonths(awardDate, Number(intervalMonths));
  if (!first || !parseDate(today)) return null;
  let due = first;
  let prev = first;
  while (due && due < today) {
    const next = addMonths(due, Number(intervalMonths));
    if (!next || next === due) break;
    prev = due;
    due = next;
  }
  // `due` lands exactly on `today` when today is itself an interval
  // boundary. Without this check, `prev < today` is also true in that
  // case (prev is always a strictly earlier boundary once the loop has
  // run), so the day a report becomes due it was reported as overdue by
  // a full interval, only to "improve" to correct the very next day.
  if (due === today) return due;
  return prev < today ? prev : due;
}

export function loadGrants(value) {
  if (!value) return [];
  try {
    const grants = JSON.parse(value);
    return Array.isArray(grants)
      ? grants.filter((grant) => grant && typeof grant === "object")
      : [];
  } catch {
    return [];
  }
}

export function removeGrant(grants, index) {
  if (!Array.isArray(grants)) return [];
  if (!Number.isInteger(index) || index < 0 || index >= grants.length) {
    return grants.slice();
  }
  return grants.filter((_, i) => i !== index);
}

function todayStamp(today) {
  if (typeof today === "string") {
    if (!parseDate(today)) throw new Error("Invalid as-of date.");
    return today;
  }
  const date = today instanceof Date ? today : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("Invalid as-of date.");
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function normalizeGrant(input, today) {
  const grant = {
    name: String(input.name ?? "").trim(),
    funder: String(input.funder ?? "").trim(),
    status: String(input.status ?? "pending").trim() || "pending",
    award: Number(input.award ?? 0),
    spent: Number(input.spent ?? 0),
    nextDate: String(input.nextDate ?? "").trim(),
    nextType: String(input.nextType ?? "Report").trim() || "Report",
    awardDate: String(input.awardDate ?? "").trim(),
    intervalMonths: input.intervalMonths === "" || input.intervalMonths == null
      ? null
      : Number(input.intervalMonths),
  };
  if (!grant.name) throw new Error("Each grant needs a name.");
  if (!grant.nextDate && grant.awardDate && grant.intervalMonths) {
    grant.nextDate = nextDueFromInterval(
      grant.awardDate,
      grant.intervalMonths,
      todayStamp(today ?? new Date()),
    ) || "";
  }
  if (!grant.nextDate || !parseDate(grant.nextDate)) {
    throw new Error(`Invalid date for ${grant.name}.`);
  }
  if (![grant.award, grant.spent].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error(`Amounts for ${grant.name} must be non-negative numbers.`);
  }
  if (grant.spent > grant.award && grant.award > 0) {
    throw new Error(`Spent cannot exceed the award for ${grant.name}.`);
  }
  if (grant.intervalMonths != null && (!Number.isFinite(grant.intervalMonths) || grant.intervalMonths < 1)) {
    throw new Error(`Reporting interval for ${grant.name} must be a whole number of months.`);
  }
  if (grant.awardDate && !parseDate(grant.awardDate)) {
    throw new Error(`Invalid award date for ${grant.name}.`);
  }
  return grant;
}

export function summarize(grants, today = new Date()) {
  const asOf = todayStamp(today);
  const asOfMs = parseDate(asOf).getTime();
  return grants.map((raw, sourceIndex) => {
    const grant = normalizeGrant(raw, asOf);
    const days = Math.round((parseDate(grant.nextDate).getTime() - asOfMs) / 86400000);
    return {
      ...grant,
      sourceIndex,
      remaining: Math.max(0, grant.award - grant.spent),
      days,
      urgency: days < 0 ? "overdue" : days <= 30 ? "soon" : "upcoming",
    };
  }).sort((a, b) => a.days - b.days || a.sourceIndex - b.sourceIndex);
}

function number(value, name, { allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number.`);
  if (result < 0) throw new Error(`${name} must be at least 0.`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero.`);
  return result;
}

/**
 * Compare missing a report versus filing it yourself versus hiring a
 * contract grant writer, scored against the cash that typically stops
 * when the report is late: unspent award, the next installment, an
 * optional renewal, and an optional clawback of money already spent.
 *
 * This is planning arithmetic, not a funder's determination. A late
 * report does not always trigger every line; the user types only the
 * amounts their award letter actually withholds.
 */
export function compareLateReport(input = {}, today = new Date()) {
  const award = number(input.award ?? 0, "Award");
  const spent = number(input.spent ?? 0, "Spent so far");
  if (spent > award && award > 0) {
    throw new Error("Spent cannot exceed the award.");
  }
  const nextInstallment = number(input.nextInstallment ?? 0, "Next installment at risk");
  const renewalAtRisk = number(input.renewalAtRisk ?? 0, "Renewal at risk");
  const clawbackPercent = number(input.clawbackPercent ?? 0, "Clawback percent");
  if (clawbackPercent > 100) {
    throw new Error("Clawback percent must be at most 100.");
  }
  const edHours = number(input.edHours ?? 0, "Hours if you write it");
  const edRate = number(input.edRate ?? 0, "Your loaded hourly rate");
  const writerHours = number(input.writerHours ?? 0, "Grant-writer hours");
  const writerRate = number(input.writerRate ?? 0, "Grant-writer hourly rate");

  const remaining = Math.max(0, award - spent);
  const clawback = spent * clawbackPercent / 100;
  const remainingAtRisk = remaining + nextInstallment + renewalAtRisk + clawback;

  const edCost = edHours * edRate;
  const writerCost = writerHours * writerRate;
  const writerPremium = writerCost - edCost;

  const miss = {
    path: "miss",
    cost: 0,
    cashKept: 0,
    net: -remainingAtRisk,
  };
  const yourself = {
    path: "yourself",
    cost: edCost,
    cashKept: remainingAtRisk,
    net: remainingAtRisk - edCost,
  };
  const writer = {
    path: "writer",
    cost: writerCost,
    cashKept: remainingAtRisk,
    net: remainingAtRisk - writerCost,
  };

  const asOf = todayStamp(today);
  const dueRaw = String(input.nextDate ?? "").trim();
  const due = dueRaw && parseDate(dueRaw) ? dueRaw : null;
  const days = due ? Math.round((parseDate(due).getTime() - parseDate(asOf).getTime()) / 86400000) : null;
  const urgency = days == null ? "unknown" : days < 0 ? "overdue" : days <= 30 ? "soon" : "upcoming";

  const writerStillPays = writerCost < remainingAtRisk;
  const edStillPays = edCost < remainingAtRisk;
  const cheaperFiler = edCost <= writerCost ? "yourself" : "writer";
  const writerWorseThanMissing = writer.net < miss.net;

  return {
    award,
    spent,
    remaining,
    nextInstallment,
    renewalAtRisk,
    clawbackPercent,
    clawback,
    remainingAtRisk,
    edHours,
    edRate,
    edCost,
    writerHours,
    writerRate,
    writerCost,
    writerPremium,
    miss,
    yourself,
    writer,
    asOf,
    nextDate: due,
    days,
    urgency,
    writerStillPays,
    edStillPays,
    cheaperFiler,
    writerWorseThanMissing,
  };
}

/**
 * One paragraph a coordinator can paste into a board or ED thread.
 * Arithmetic only — it does not tell them to hire, write, or miss.
 */
export function lateReportNote(comparison) {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const dueLine = comparison.days == null
    ? "The report date is not set."
    : comparison.days < 0
      ? `The report is ${Math.abs(comparison.days)} day${Math.abs(comparison.days) === 1 ? "" : "s"} overdue.`
      : `The report is ${comparison.days} day${comparison.days === 1 ? "" : "s"} away.`;
  const atRisk = `Unspent award ${money(comparison.remaining)} plus the next installment ${money(comparison.nextInstallment)}${comparison.renewalAtRisk ? ` plus a renewal ${money(comparison.renewalAtRisk)}` : ""}${comparison.clawback ? ` plus a ${comparison.clawbackPercent}% clawback ${money(comparison.clawback)}` : ""} is ${money(comparison.remainingAtRisk)} at risk if the report is late.`;
  const miss = `Missing it keeps $0.00 of that cash (a ${money(Math.abs(comparison.miss.net))} hole).`;
  const self = comparison.edStillPays
    ? `Filing it yourself (${comparison.edHours} h at ${money(comparison.edRate)}/hr = ${money(comparison.edCost)}) keeps ${money(comparison.yourself.net)} after your time.`
    : `Filing it yourself would cost ${money(comparison.edCost)} against only ${money(comparison.remainingAtRisk)} at risk — more than the cash the report protects.`;
  const hire = comparison.writerWorseThanMissing
    ? `Hiring a writer (${comparison.writerHours} h at ${money(comparison.writerRate)}/hr = ${money(comparison.writerCost)}) finishes ${money(Math.abs(comparison.writer.net))} worse than missing the report.`
    : comparison.writerStillPays
      ? `Hiring a writer (${comparison.writerHours} h at ${money(comparison.writerRate)}/hr = ${money(comparison.writerCost)}) still leaves ${money(comparison.writer.net)} — ${money(comparison.writerCost)} to protect ${money(comparison.remainingAtRisk)}.`
      : `Hiring a writer would cost ${money(comparison.writerCost)} against only ${money(comparison.remainingAtRisk)} at risk.`;
  return [dueLine, atRisk, miss, self, hire].join(" ");
}

export function csvReport(rows) {
  const headers = [
    "Grant",
    "Funder",
    "Status",
    "Award",
    "Spent",
    "Remaining",
    "Next obligation",
    "Date",
    "Days",
    "Priority",
  ];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    headers.join(","),
    ...rows.map((row) => [
      row.name,
      row.funder,
      row.status,
      row.award,
      row.spent,
      row.remaining,
      row.nextType,
      row.nextDate,
      row.days,
      row.urgency,
    ].map(escape).join(",")),
  ].join("\n") + "\n";
}
