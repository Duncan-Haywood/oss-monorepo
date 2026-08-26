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
