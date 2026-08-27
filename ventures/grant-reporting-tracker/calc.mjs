export function parseDate(value) {
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

export function reviewGrant(grant, today = new Date().toISOString().slice(0, 10)) {
  const nextReport = addMonths(grant.awardDate, Number(grant.intervalMonths));
  const days = nextReport ? Math.ceil((parseDate(nextReport) - parseDate(today)) / 86400000) : null;
  const restrictedBalance = Number(grant.awardAmount) - Number(grant.spentAmount);
  return {
    ...grant,
    nextReport,
    daysUntilReport: days,
    restrictedBalance,
    status: days === null ? 'Check inputs' : days < 0 ? 'Overdue' : days <= 30 ? 'Due soon' : 'On track',
  };
}

export function reviewAll(grants, today) {
  return grants.map((grant) => reviewGrant(grant, today)).sort((a, b) => (a.daysUntilReport ?? Infinity) - (b.daysUntilReport ?? Infinity));
}

export function toCsv(rows) {
  const fields = ['name', 'funder', 'nextReport', 'status', 'restrictedBalance'];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [fields.join(','), ...rows.map((row) => fields.map((field) => quote(row[field])).join(','))].join('\n');
}

// Saved awards come back from localStorage, which is user-writable and can be
// left damaged by an interrupted write or an older version of this page. A
// single null or string row used to reach reviewGrant and throw on
// `grant.awardDate`, blanking the whole queue — so drop anything that is not an
// object rather than trusting the parsed shape.
export function loadGrants(value) {
  if (!value) return [];
  try {
    const grants = JSON.parse(value);
    return Array.isArray(grants) ? grants.filter((grant) => grant && typeof grant === 'object') : [];
  } catch {
    return [];
  }
}
