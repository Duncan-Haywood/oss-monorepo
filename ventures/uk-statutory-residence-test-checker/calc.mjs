// UK Statutory Residence Test (Finance Act 2013 Sch 45; HMRC guidance RDR3).
// Pure functions, no DOM, no network. Dates are UTC day numbers.
// Written from the published test without a live lookup: the output says which
// of HMRC's tests fired and why, and always names HMRC's own guidance as the
// source to verify. It never states anyone's tax residency.

export const MS_DAY = 86400000;
export const toDay = (y, m, d) => {
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? Math.floor(t / MS_DAY) : null;
};
export const dayIso = (n) => new Date(n * MS_DAY).toISOString().slice(0, 10);
export const parseDate = (s) => {
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(String(s ?? ""));
  return m ? toDay(+m[1], +m[2], +m[3]) : null;
};

/** A UK tax year runs 6 April to 5 April; `year` is the calendar year it starts in. */
export const taxYearBounds = (year) => ({ start: toDay(year, 4, 6), end: toDay(year + 1, 4, 5) });
export const taxYearLabel = (year) => `${year}/${String(year + 1).slice(2)}`;
export const taxYearOf = (day) => {
  const y = new Date(day * MS_DAY).getUTCFullYear();
  return day >= toDay(y, 4, 6) ? y : y - 1;
};

/** One stay per line: "arrive depart" (YYYY-MM-DD). Same-day in-and-out is transit and counts nothing. */
export function parseStays(text) {
  const stays = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) return;
    const parts = line.split(/[\s,;>–—-]+(?=\d{4}-)/).map((p) => p.trim()).filter(Boolean);
    const a = parseDate(parts[0]);
    const d = parseDate(parts[1]);
    if (parts.length !== 2 || a === null || d === null) errors.push(`Line ${i + 1}: expected "arrive depart" as two YYYY-MM-DD dates.`);
    else if (d < a) errors.push(`Line ${i + 1}: departure is before arrival.`);
    else stays.push({ from: a, to: d });
  });
  return { stays, errors };
}

/** Days in the UK = midnights spent there. Arrive 10th, leave 15th = midnights ending 10..14 = 5 days. */
export function ukDays(stays, year) {
  const { start, end } = taxYearBounds(year);
  const seen = new Set();
  for (const s of stays) for (let d = Math.max(s.from, start); d < s.to && d <= end; d += 1) seen.add(d);
  return seen.size;
}

/** Sufficient-ties thresholds: the number of ties that makes you resident, by days in the UK. */
export const TIE_TABLE = {
  leaver: [
    { min: 0, max: 15, needed: null, note: "Automatically not resident (first automatic overseas test)" },
    { min: 16, max: 45, needed: 4 },
    { min: 46, max: 90, needed: 3 },
    { min: 91, max: 120, needed: 2 },
    { min: 121, max: 182, needed: 1 },
    { min: 183, max: Infinity, needed: 0, note: "Automatically resident (first automatic UK test)" },
  ],
  arriver: [
    { min: 0, max: 45, needed: null, note: "Automatically not resident (second automatic overseas test)" },
    { min: 46, max: 90, needed: 4 },
    { min: 91, max: 120, needed: 3 },
    { min: 121, max: 182, needed: 2 },
    { min: 183, max: Infinity, needed: 0, note: "Automatically resident (first automatic UK test)" },
  ],
};
export const tieBand = (kind, days) => TIE_TABLE[kind].find((b) => days >= b.min && days <= b.max);

const yes = (v) => v === true || v === "yes" || v === "true" || v === "1";
const num = (v) => {
  const n = Number(String(v ?? "").trim());
  return v === "" || v === null || v === undefined || !Number.isFinite(n) || n < 0 ? 0 : Math.floor(n);
};

/**
 * Run the whole test for a given number of UK days. `ctx` holds everything that is not the day count.
 * Order, as HMRC sets it out: any automatic overseas test => not resident; else any automatic UK test
 * => resident; else the sufficient-ties test.
 */
export function verdictForDays(days, ctx) {
  const leaver = ctx.priorResident;
  const steps = [];
  const step = (id, label, met, detail) => steps.push({ id, label, met, detail });

  const o1 = leaver && days < 16;
  const o2 = !leaver && days < 46;
  step("overseas-1", "Automatic overseas test 1: was UK resident in one of the last 3 years and under 16 days here", leaver ? o1 : null, leaver ? `${days} day(s) in the UK; the limit is 15` : "Not applicable: you were not UK resident in any of the last 3 tax years");
  step("overseas-2", "Automatic overseas test 2: not UK resident in any of the last 3 years and under 46 days here", !leaver ? o2 : null, !leaver ? `${days} day(s) in the UK; the limit is 45` : "Not applicable: you were UK resident in one of the last 3 tax years");
  const o3 = ctx.fullTimeAbroad && days < 91 && ctx.ukWorkDays < 31;
  step("overseas-3", "Automatic overseas test 3: full-time work abroad, under 91 days and under 31 working days in the UK", o3,
    ctx.fullTimeAbroad ? `${days} UK day(s) (limit 90) and ${ctx.ukWorkDays} UK working day(s) of 3+ hours (limit 30)` : "You said you did not work full-time abroad with no significant break");
  if (o1 || o2 || o3) return { resident: false, basis: "automatic-overseas", steps, ties: null, days };

  const u1 = days >= 183;
  step("uk-1", "Automatic UK test 1: 183 days or more in the UK", u1, `${days} day(s)`);
  const u2 = ctx.ukHome && ctx.ukHomeDays >= 30 && (!ctx.overseasHome || ctx.overseasHomeDays < 30);
  step("uk-2", "Automatic UK test 2: a UK home you were at for 30+ days, and no overseas home or under 30 days at each", u2,
    !ctx.ukHome ? "No UK home available for 91+ days" : `UK home, ${ctx.ukHomeDays} day(s) there; ` + (ctx.overseasHome ? `overseas home, ${ctx.overseasHomeDays} day(s) at the most-used one` : "no overseas home"));
  const u3 = ctx.ukFullTimeWork;
  step("uk-3", "Automatic UK test 3: full-time work in the UK over a 365-day period", u3, u3 ? "You said you did" : "You said you did not");
  if (u1 || u2 || u3) return { resident: true, basis: "automatic-uk", steps, ties: null, days };

  const kind = leaver ? "leaver" : "arriver";
  const tiesList = [
    { id: "family", label: "Family tie", present: ctx.family },
    { id: "accommodation", label: "Accommodation tie", present: ctx.accommodation },
    { id: "work", label: "Work tie (3+ hours on 40+ UK days)", present: ctx.ukWorkDays >= 40 },
    { id: "ninety-day", label: "90-day tie (90+ UK days in either of the last 2 tax years)", present: ctx.prev1 >= 90 || ctx.prev2 >= 90 },
  ];
  if (leaver) tiesList.push({ id: "country", label: "Country tie (more days in the UK than in any other country)", present: days > ctx.mostElsewhere });
  const count = tiesList.filter((t) => t.present).length;
  const band = tieBand(kind, days);
  const resident = count >= band.needed;
  step("ties", `Sufficient ties (${kind}): ${band.needed} tie(s) needed at ${days} day(s)`, resident, `${count} tie(s) present`);
  return { resident, basis: "ties", steps, ties: { kind, list: tiesList, count, needed: band.needed }, days };
}

export function makeContext(i) {
  return {
    priorResident: yes(i.priorResident),
    fullTimeAbroad: yes(i.fullTimeAbroad),
    ukWorkDays: num(i.ukWorkDays),
    ukHome: yes(i.ukHome),
    ukHomeDays: num(i.ukHomeDays),
    overseasHome: yes(i.overseasHome),
    overseasHomeDays: num(i.overseasHomeDays),
    ukFullTimeWork: yes(i.ukFullTimeWork),
    family: yes(i.family),
    accommodation: yes(i.accommodation),
    prev1: num(i.prev1),
    prev2: num(i.prev2),
    mostElsewhere: num(i.mostElsewhere),
  };
}

/** Whole assessment from form-style inputs. */
export function assess(input) {
  const errors = [];
  const { stays, errors: parseErrors } = parseStays(input.stays);
  errors.push(...parseErrors);
  const year = Number.parseInt(input.taxYear, 10);
  if (!Number.isInteger(year) || year < 2013 || year > 2100) errors.push("Enter the tax year as the year it starts in, for example 2026 for 6 April 2026 to 5 April 2027.");
  if (errors.length) return { errors };

  const ctx = makeContext(input);
  const exceptional = Math.min(num(input.exceptional), 60);
  // Days in the UK in the two earlier years default to what the stays show, unless typed.
  if (String(input.prev1 ?? "").trim() === "") ctx.prev1 = ukDays(stays, year - 1);
  if (String(input.prev2 ?? "").trim() === "") ctx.prev2 = ukDays(stays, year - 2);
  const counted = ukDays(stays, year);
  const days = Math.max(0, counted - exceptional);
  const verdict = verdictForDays(days, ctx);

  // Sweep the day count to find where the answer flips.
  const at = (d) => verdictForDays(d, ctx).resident;
  let headroom = null;
  let firstResident = null;
  let reduceBy = null;
  let reduceTo = null;
  if (!verdict.resident) {
    let d = days;
    while (d < 366 && !at(d + 1)) d += 1;
    headroom = d >= 366 ? null : d - days;
    firstResident = d >= 366 ? null : d + 1;
  } else {
    let d = days;
    while (d > 0 && at(d - 1)) d -= 1;
    if (d > 0) { reduceTo = d - 1; reduceBy = days - reduceTo; }
  }
  const notices = [];
  if (exceptional > 0 && num(input.exceptional) > 60) notices.push("Exceptional-circumstances days are capped at 60 a year; 60 were removed.");
  if (verdict.ties) {
    const t = verdict.ties;
    const edge = TIE_TABLE[t.kind].find((b) => b.min > days && b.needed !== null);
    if (verdict.resident === false && t.count === t.needed - 1) notices.push(`You are one tie short of being resident at ${days} day(s).`);
    if (edge && edge.min - days <= 10 && edge.needed < t.needed + 1 && edge.needed <= t.count) notices.push(`${edge.min - days} more day(s) would move you into the ${edge.min}-${Number.isFinite(edge.max) ? edge.max : "+"} band, where ${edge.needed} tie(s) make you resident.`);
  }
  notices.push("Split-year treatment (arriving or leaving part-way through the year, or starting or ending full-time work abroad) is not modelled. It can make you resident for only part of a year that this test calls resident.");
  notices.push("Not modelled: days you are deemed to spend in the UK under the deeming rule, deaths in the year, and the special rules for some Crown and armed forces employees.");
  return {
    errors: [], year, stays, counted, exceptional, days, ctx, verdict, headroom, firstResident, reduceBy, reduceTo, notices,
  };
}

export function summaryText(r) {
  const v = r.verdict;
  const lines = [];
  lines.push(`UK Statutory Residence Test check for ${taxYearLabel(r.year)} (6 April ${r.year} to 5 April ${r.year + 1})`);
  lines.push(`Days in the UK (midnights): ${r.counted}${r.exceptional ? ` less ${r.exceptional} exceptional-circumstances = ${r.days}` : ""}`);
  lines.push(`Result under the test as modelled: ${v.resident ? "UK RESIDENT" : "NOT UK RESIDENT"} (${{ "automatic-overseas": "automatic overseas test", "automatic-uk": "automatic UK test", ties: "sufficient ties test" }[v.basis]})`);
  lines.push("");
  for (const s of v.steps) lines.push(`- ${s.label}: ${s.met === null ? "n/a" : s.met ? "MET" : "not met"} (${s.detail})`);
  if (v.ties) {
    lines.push("");
    lines.push(`Ties (${v.ties.kind}): ${v.ties.count} present, ${v.ties.needed} needed at ${r.days} day(s)`);
    for (const t of v.ties.list) lines.push(`  ${t.present ? "[x]" : "[ ]"} ${t.label}`);
  }
  lines.push("");
  if (r.headroom !== null && !v.resident) lines.push(`You can add ${r.headroom} more UK day(s) before the answer changes, if nothing else changes.`);
  if (r.reduceBy) lines.push(`Spending ${r.reduceBy} fewer UK day(s) (${r.reduceTo} in total) would change the answer, if nothing else changes.`);
  for (const n of r.notices) lines.push(`Note: ${n}`);
  lines.push("");
  lines.push("This is arithmetic on what you typed, not tax advice and not a statement of your residency. Verify against HMRC guidance RDR3 (Statutory Residence Test) or an adviser before relying on it.");
  return lines.join("\n");
}

export const SAMPLE = {
  stays: "2026-04-20 2026-05-30\n2026-07-01 2026-08-12\n2026-12-18 2027-01-06",
  taxYear: "2026",
  priorResident: "yes",
  exceptional: "0",
  fullTimeAbroad: "no",
  ukWorkDays: "10",
  ukHome: "yes",
  ukHomeDays: "20",
  overseasHome: "yes",
  overseasHomeDays: "200",
  ukFullTimeWork: "no",
  family: "yes",
  accommodation: "yes",
  prev1: "",
  prev2: "",
  mostElsewhere: "250",
};
