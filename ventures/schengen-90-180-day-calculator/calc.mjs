// Schengen 90/180-day rule: in any rolling 180-day period a short-stay
// visitor may spend at most 90 days in the Schengen area. The day of entry
// and the day of exit both count as days of stay. All dates are treated as
// calendar days (UTC), never as timestamps.

export const LIMIT = 90;
export const WINDOW = 180;
export const VERIFY = "Verify with the European Commission's short-stay calculator (home-affairs.ec.europa.eu) and your own visa or border authority before you travel.";

const DAY = 86400000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toDay(iso) {
  const m = ISO.exec(String(iso || "").trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return t / DAY;
}
export function fromDay(n) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

// One stay per line: two ISO dates (entry, exit), separated by anything.
export function parseStays(text) {
  const stays = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    const raw = line.trim();
    if (!raw) return;
    const dates = raw.match(/\d{4}-\d{2}-\d{2}/g) || [];
    if (dates.length !== 2) { errors.push(`Line ${i + 1}: expected an entry date and an exit date as YYYY-MM-DD.`); return; }
    const a = toDay(dates[0]), b = toDay(dates[1]);
    if (a === null || b === null) { errors.push(`Line ${i + 1}: not a real calendar date.`); return; }
    if (b < a) { errors.push(`Line ${i + 1}: exit is before entry.`); return; }
    stays.push({ entry: a, exit: b });
  });
  return { stays, errors };
}

// Set of individual days spent in the area (overlapping stays merge).
function dayset(stays) {
  const s = new Set();
  for (const { entry, exit } of stays) for (let d = entry; d <= exit; d++) s.add(d);
  return s;
}

// Days spent in the 180 days ending on (and including) `day`.
export function usedOn(days, day) {
  let n = 0;
  for (let d = day - WINDOW + 1; d <= day; d++) if (days.has(d)) n++;
  return n;
}

// Days in the area that already break the rule (more than 90 in the window ending that day).
export function overstays(days) {
  const out = [];
  const sorted = [...days].sort((a, b) => a - b);
  for (const d of sorted) if (usedOn(days, d) > LIMIT) out.push(d);
  return out;
}

// Longest continuous stay starting on `entry`, given the days already spent.
export function maxStay(days, entry, cap = 365) {
  const work = new Set(days);
  let n = 0;
  for (let d = entry; n < cap; d++) {
    work.add(d);
    if (usedOn(work, d) > LIMIT) break;
    n++;
  }
  return n;
}

// Earliest entry on/after `from` that allows `length` consecutive days.
export function earliestEntry(days, from, length, horizon = 400) {
  for (let d = from; d < from + horizon; d++) if (maxStay(days, d, length) >= length) return d;
  return null;
}

// When the days now in the window start dropping out: the dates on which
// the used-count first falls, so the traveller can see when allowance returns.
function freeUpDates(days, ref, count = 3) {
  const out = [];
  let prev = usedOn(days, ref);
  for (let d = ref + 1; d <= ref + WINDOW && out.length < count; d++) {
    const u = usedOn(days, d);
    if (u < prev) out.push({ date: d, used: u });
    prev = u;
  }
  return out;
}

export function compute(input) {
  const errors = [];
  const { stays, errors: pe } = parseStays(input.stays);
  errors.push(...pe);
  const ref = toDay(input.refDate);
  if (ref === null) errors.push("Enter the date to check from as YYYY-MM-DD.");
  const planned = String(input.planEntry || "").trim() ? toDay(input.planEntry) : null;
  if (String(input.planEntry || "").trim() && planned === null) errors.push("Planned entry date must be YYYY-MM-DD.");
  const planLenRaw = String(input.planLength ?? "").trim();
  const planLen = planLenRaw === "" ? null : Number(planLenRaw);
  if (planLen !== null && (!Number.isInteger(planLen) || planLen < 1 || planLen > 90)) errors.push("Planned length must be a whole number of days from 1 to 90.");
  if (errors.length) return { errors };

  const days = dayset(stays);
  const used = usedOn(days, ref);
  const bad = overstays(days);
  const r = {
    errors,
    ref,
    stays,
    used,
    remaining: Math.max(0, LIMIT - used),
    windowStart: ref - WINDOW + 1,
    overstayDays: bad.length,
    firstOverstay: bad.length ? bad[0] : null,
    freeUp: freeUpDates(days, ref),
    plan: null,
    findings: [],
  };

  if (planned !== null) {
    const allowed = maxStay(days, planned);
    r.plan = {
      entry: planned,
      maxDays: allowed,
      lastExit: allowed > 0 ? planned + allowed - 1 : null,
      wanted: planLen,
      fits: planLen === null ? null : allowed >= planLen,
      earliest: planLen !== null && allowed < planLen ? earliestEntry(days, planned, planLen) : null,
    };
  }

  if (bad.length) r.findings.push({ severity: "high", title: `${bad.length} day(s) in your history exceed 90 days in a 180-day window, the first on ${fromDay(bad[0])}. Check how that was handled at the border and with the authority before travelling again.` });
  if (used >= LIMIT) r.findings.push({ severity: "high", title: `You have used ${used} of 90 days in the 180 days to ${fromDay(ref)}. You cannot enter until days drop out of the window.` });
  else if (r.remaining <= 14) r.findings.push({ severity: "medium", title: `Only ${r.remaining} day(s) of allowance left on ${fromDay(ref)}.` });
  if (r.plan && r.plan.fits === false) r.findings.push({ severity: "high", title: `A ${r.plan.wanted}-day trip from ${fromDay(r.plan.entry)} would exceed the limit; the most you could stay is ${r.plan.maxDays} day(s).` });
  r.findings.push({ severity: "info", title: "Entry and exit days both count. Time in Schengen states only counts; Ireland, Cyprus and the UK are outside it. Long-stay visas, residence permits and bilateral visa agreements are not modelled." });
  return r;
}

export function summaryText(r) {
  const L = [];
  L.push("SCHENGEN 90/180-DAY CHECK");
  L.push(`Date checked: ${fromDay(r.ref)}`);
  L.push(`Window: ${fromDay(r.windowStart)} to ${fromDay(r.ref)}`);
  L.push(`Days used: ${r.used} of ${LIMIT}   Days remaining: ${r.remaining}`);
  if (r.overstayDays) L.push(`History exceeds the limit on ${r.overstayDays} day(s), first on ${fromDay(r.firstOverstay)}.`);
  for (const f of r.freeUp) L.push(`Allowance rises to ${LIMIT - f.used} days left on ${fromDay(f.date)}.`);
  if (r.plan) {
    L.push(`Planned entry ${fromDay(r.plan.entry)}: up to ${r.plan.maxDays} day(s)` + (r.plan.lastExit ? `, last permitted exit ${fromDay(r.plan.lastExit)}.` : "."));
    if (r.plan.wanted !== null) L.push(r.plan.fits ? `A ${r.plan.wanted}-day trip fits.` : `A ${r.plan.wanted}-day trip does not fit` + (r.plan.earliest ? `; earliest entry for it is ${fromDay(r.plan.earliest)}.` : "."));
  }
  L.push("");
  L.push(VERIFY);
  L.push("Not legal or immigration advice. Provided as-is without warranty.");
  return L.join("\n");
}

export const SAMPLE = {
  stays: "2026-06-01 2026-06-30\n2026-08-10 2026-09-20\n2026-11-02 2026-11-15",
  refDate: "2026-12-01",
  planEntry: "2026-12-10",
  planLength: "30",
};
