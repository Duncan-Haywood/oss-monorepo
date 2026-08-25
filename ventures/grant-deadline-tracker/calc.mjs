export const SAMPLE_GRANTS = [
  { name: "Community food program", funder: "Local foundation", status: "awarded", award: 24000, spent: 8500, nextDate: "2026-09-15", nextType: "Report" },
  { name: "Youth arts application", funder: "County arts council", status: "pending", award: 12000, spent: 0, nextDate: "2026-10-01", nextType: "Application" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeGrant(input) {
  const grant = {
    name: String(input.name ?? "").trim(),
    funder: String(input.funder ?? "").trim(),
    status: String(input.status ?? "pending").trim(),
    award: Number(input.award ?? 0),
    spent: Number(input.spent ?? 0),
    nextDate: String(input.nextDate ?? "").trim(),
    nextType: String(input.nextType ?? "Report").trim(),
  };
  if (!grant.name) throw new Error("Each grant needs a name.");
  if (!grant.nextDate || !DATE_RE.test(grant.nextDate) || Number.isNaN(Date.parse(grant.nextDate))) throw new Error(`Invalid date for ${grant.name}.`);
  if (![grant.award, grant.spent].every((value) => Number.isFinite(value) && value >= 0)) throw new Error(`Amounts for ${grant.name} must be non-negative numbers.`);
  if (grant.spent > grant.award && grant.award > 0) throw new Error(`Spent cannot exceed the award for ${grant.name}.`);
  return grant;
}

export function summarize(grants, today = new Date()) {
  const normalized = grants.map(normalizeGrant);
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return normalized.map((grant) => {
    const days = Math.round((Date.parse(`${grant.nextDate}T00:00:00`) - todayMs) / 86400000);
    return { ...grant, remaining: Math.max(0, grant.award - grant.spent), days, urgency: days < 0 ? "overdue" : days <= 30 ? "soon" : "upcoming" };
  }).sort((a, b) => a.days - b.days);
}

export function csvReport(rows) {
  const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return ["Grant,Funder,Status,Award,Spent,Remaining,Next obligation,Date,Days,Priority", ...rows.map((row) => [row.name, row.funder, row.status, row.award, row.spent, row.remaining, row.nextType, row.nextDate, row.days, row.urgency].map(escape).join(","))].join("\n") + "\n";
}
