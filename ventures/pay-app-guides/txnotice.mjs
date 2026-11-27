// Texas notice of claim for unpaid labor or materials (private works, original contracts entered
// into on or after 2022-01-01): the monthly notice date for each month of unpaid work, the
// retainage notice, the lien affidavit and its copies, the suit date, Saturday, Sunday and holiday
// extensions, and drafts of the statutory notice forms word for word.
//
// Source: Tex. Prop. Code §§ 53.001, 53.003, 53.052, 53.054, 53.055, 53.056, 53.057, 53.081,
// 53.101, 53.103, 53.106, 53.158 and 53.254, Tex. Gov't Code §§ 662.003 and 662.021, and H.B. 2237 (2021) SECTIONS
// 37-38, as published by the Texas Legislature, read 2026-11-27; snapshot in sources/tx-53.txt,
// which txnotice.test.mjs checks every quoted phrase and both forms against.
//
// Month counting: § 53.056(a-1) says "not later than the 15th day of the third month after the
// month during which" the labor or materials were provided (second month on a residential
// construction project), so March work is due 15 June (15 May residential).
//
// Weekends and holidays: § 53.003(e) extends a deadline that falls "on a Saturday, Sunday, or legal
// holiday" to "the next day that is not". Gov't Code § 662.021 says a legal holiday "includes only"
// the national holidays of § 662.003(a) and the state holidays of § 662.003(b)(1) through (6); this
// file counts those on the dates § 662.003 gives (not observed days, not 24 or 26 December, which are
// state holidays under (b)(7)-(8) but not legal holidays, and not § 662.003(c)'s optional
// holidays). Every result keeps the
// unmoved date as the one to plan on and reports the extended date separately, so no reading of
// "legal holiday" makes the plan late. Pure functions, no I/O.

const DAY = 86400000;

export function parseDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}
// "2026-03" -> index months since year 0 (year * 12 + month0), or NaN.
export function parseMonth(v) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(v ?? "").trim());
  if (!m || +m[2] < 1 || +m[2] > 12) return NaN;
  return +m[1] * 12 + (+m[2] - 1);
}
const monthLabel = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
export const isoDate = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (t, n) => t + n * DAY;
const days = (a, b) => Math.round((b - a) / DAY);
const fifteenth = (monthIndex) => Date.UTC(Math.floor(monthIndex / 12), monthIndex % 12, 15);
const monthOf = (t) => { const d = new Date(t); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };

export const HB2237_START = parseDate("2022-01-01"); // H.B. 2237 SECTIONS 37-38
export const NOTICE_MONTHS = { commercial: 3, residential: 2 }; // § 53.056(a-1)(1), (2)
export const AFFIDAVIT_MONTHS = { commercial: 4, residential: 3 }; // § 53.052(b), (c)
export const RETAINAGE_AFFIDAVIT_MONTHS = 3; // § 53.052(d)
export const RETAINAGE_NOTICE_DAYS = 30; // § 53.057(a-1)
export const RESERVED_FUNDS_DAYS = 30; // § 53.101(a), § 53.103(2)
export const AFFIDAVIT_COPY_DAYS = 5; // § 53.055(a)
export const MAX_MONTHS = 36;

// Gov't Code § 662.021 legal holidays for a year: § 662.003(a) national and (b)(1)-(6) state
// holidays, on the dates § 662.003 names. nth weekday: weekday 0 = Sunday; n = -1 means the last one in the month.
function nthWeekday(year, month0, weekday, n) {
  if (n === -1) {
    const last = new Date(Date.UTC(year, month0 + 1, 0));
    return Date.UTC(year, month0, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
  }
  const first = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  return Date.UTC(year, month0, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
}
export function holidays(year) {
  const d = (m, day) => Date.UTC(year, m - 1, day);
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  const list = [
    [d(1, 1), "New Year's Day"],
    [nthWeekday(year, 0, 1, 3), "Martin Luther King, Jr., Day"],
    [nthWeekday(year, 1, 1, 3), "Presidents' Day"],
    [nthWeekday(year, 4, 1, -1), "Memorial Day"],
    [d(7, 4), "Independence Day"],
    [nthWeekday(year, 8, 1, 1), "Labor Day"],
    [d(11, 11), "Veterans Day"],
    [thanksgiving, "Thanksgiving Day"],
    [d(12, 25), "Christmas Day"],
    [d(1, 19), "Confederate Heroes Day"],
    [d(3, 2), "Texas Independence Day"],
    [d(4, 21), "San Jacinto Day"],
    [d(6, 19), "Emancipation Day in Texas"],
    [d(8, 27), "Lyndon Baines Johnson Day"],
    [addDays(thanksgiving, 1), "the Friday after Thanksgiving Day"],
  ];
  // Two can share a day (Martin Luther King, Jr., Day and Confederate Heroes Day in 2026).
  const out = new Map();
  for (const [t, name] of list) out.set(t, out.has(t) ? `${out.get(t)} and ${name}` : name);
  return out;
}
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function closedReason(t) {
  const wd = new Date(t).getUTCDay();
  const h = holidays(new Date(t).getUTCFullYear()).get(t);
  if (h) return h;
  if (wd === 0 || wd === 6) return WEEKDAY[wd];
  return null;
}

// A deadline: the statutory date, and where § 53.003(e) moves it, the extended date and why.
export function deadline(t) {
  const why = [];
  let e = t;
  for (let r = closedReason(e); r; r = closedReason(e)) { why.push(`${isoDate(e)} is ${r}`); e = addDays(e, 1); }
  return { date: isoDate(t), extended: e === t ? null : isoDate(e), why, t, te: e };
}

function status(t, today) {
  if (Number.isNaN(today)) return null;
  const left = days(today, t);
  return { daysLeft: left, state: left < 0 ? "past" : left === 0 ? "today" : left <= 7 ? "soon" : "open" };
}
const withStatus = (dl, today) => ({ ...dl, status: status(dl.t, today), extendedStatus: dl.extended ? status(dl.te, today) : null });

// type: "commercial" | "residential". contract: date the owner signed the original contract (optional;
// before 2022 the page does not apply). fromMonth/toMonth: first and last month of unpaid work
// (YYYY-MM; toMonth defaults to fromMonth). lastMonth: last month any work was provided, for the lien
// affidavit (defaults to toMonth). today: YYYY-MM-DD.
export function monthlyDates({ type = "commercial", contract, fromMonth, toMonth, lastMonth, today } = {}) {
  const errors = [];
  const notes = [];
  if (!NOTICE_MONTHS[type]) errors.push("Choose whether this is a residential construction project.");
  const opt = (v, what) => {
    if (!v || !String(v).trim()) return null;
    const t = parseDate(v);
    if (Number.isNaN(t)) errors.push(`Enter ${what} as YYYY-MM-DD, or leave it blank.`);
    return t;
  };
  const c = opt(contract, "the original contract date");
  const from = parseMonth(fromMonth);
  if (Number.isNaN(from)) errors.push("Enter the first month of unpaid work as YYYY-MM.");
  const to = toMonth && String(toMonth).trim() ? parseMonth(toMonth) : from;
  if (Number.isNaN(to)) errors.push("Enter the last month of unpaid work as YYYY-MM, or leave it blank.");
  const last = lastMonth && String(lastMonth).trim() ? parseMonth(lastMonth) : to;
  if (Number.isNaN(last)) errors.push("Enter the last month you provided labor or materials as YYYY-MM, or leave it blank.");
  if (errors.length) return { errors };
  if (to < from) return { errors: ["The last month of unpaid work is before the first; check both months."] };
  if (last < to) return { errors: ["The last month you provided work is before the last unpaid month; check both months."] };
  if (to - from + 1 > MAX_MONTHS) return { errors: [`List at most ${MAX_MONTHS} months at a time.`] };
  if (c !== null && c < HB2237_START) {
    return { errors: [], oldLaw: true, notes: ["Original contracts entered into before 1 January 2022 are \"governed by the law as it existed immediately before the effective date of this Act\" (H.B. 2237, SECTION 37). The older rules had different notices for different tiers, and this page does not cover them."] };
  }
  if (c === null) notes.push("These are the rules for an original contract (the owner's contract with the general contractor) entered into on or after 1 January 2022 (H.B. 2237, SECTIONS 37-38). Ask the GC for the date if you do not know it.");
  const t = parseDate(today);
  const k = NOTICE_MONTHS[type];
  const months = [];
  for (let m = from; m <= to; m++) {
    const dl = withStatus(deadline(fifteenth(m + k)), t);
    months.push({ month: monthLabel(m), ...dl });
  }
  const open = months.filter((m) => !m.status || m.status.state !== "past");
  const passed = months.filter((m) => m.status && m.status.state === "past");
  if (passed.length) {
    notes.push(`${passed.length} month(s) are past the statutory date${passed.some((m) => m.extendedStatus && m.extendedStatus.state !== "past") ? " (one may still be inside its weekend or holiday extension, shown below)" : ""}. Each month has its own date, so a missed month loses the lien for that month's work, not for the months still open. Ask a Texas construction attorney about any bond, contract or prompt-payment claim for the rest.`);
  }
  const aff = withStatus(deadline(fifteenth(last + AFFIDAVIT_MONTHS[type])), t);
  const copyBy = withStatus(deadline(addDays(aff.t, AFFIDAVIT_COPY_DAYS)), t);
  const suit = withStatus(deadline(Date.UTC(new Date(aff.t).getUTCFullYear() + 1, new Date(aff.t).getUTCMonth(), new Date(aff.t).getUTCDate())), t);
  return {
    errors: [],
    type,
    months,
    next: open[0] ?? null,
    affidavit: { lastMonth: monthLabel(last), ...aff },
    affidavitCopy: copyBy,
    suit,
    notes,
  };
}

// Retainage: claimantDone = the day the claimant's own contract was completed, terminated or
// abandoned; originalEnded = the day the original contract was terminated or abandoned (optional);
// originalDone = the day the original contract was completed (optional), for the affidavit date.
export function retainageDates({ claimantDone, originalEnded, originalDone, today } = {}) {
  const errors = [];
  const opt = (v, what, required) => {
    if (!v || !String(v).trim()) { if (required) errors.push(`Enter ${what} as YYYY-MM-DD.`); return null; }
    const t = parseDate(v);
    if (Number.isNaN(t)) errors.push(`Enter ${what} as YYYY-MM-DD${required ? "" : ", or leave it blank"}.`);
    return t;
  };
  const cd = opt(claimantDone, "the day your contract was completed, terminated or abandoned", true);
  const oe = opt(originalEnded, "the day the original contract was terminated or abandoned", false);
  const od = opt(originalDone, "the day the original contract (the GC's) was completed", false);
  if (errors.length) return { errors };
  const t = parseDate(today);
  const candidates = [addDays(cd, RETAINAGE_NOTICE_DAYS)];
  if (oe !== null) candidates.push(addDays(oe, RETAINAGE_NOTICE_DAYS));
  const notice = withStatus(deadline(Math.min(...candidates)), t);
  const out = { errors: [], notice, noticeFrom: oe !== null && addDays(oe, 30) < addDays(cd, 30) ? "original" : "claimant", notes: [] };
  const end = [od, oe].filter((x) => x !== null);
  if (end.length) {
    const e = Math.min(...end);
    out.affidavit = withStatus(deadline(fifteenth(monthOf(e) + RETAINAGE_AFFIDAVIT_MONTHS)), t);
    out.reservedFunds = withStatus(deadline(addDays(e, RESERVED_FUNDS_DAYS)), t);
  } else {
    out.notes.push("Enter the day the original contract was completed, terminated or abandoned for the retainage lien affidavit date (§ 53.052(d)). Ask the GC, and watch for the owner's affidavit of completion or notice of termination.");
  }
  return out;
}

// § 53.056(a-2) and § 53.057(a-2), word for word. {{key}} marks a blank the statute prints as
// underscores; the label before it is the statute's own.
const HEAD = [
  "WARNING: This notice is provided to preserve lien rights.",
  "Owner's property may be subject to a lien if sufficient funds are not withheld from future payments to the original contractor to cover this debt.",
  "Date: {{date}}",
  "Project description and/or address: {{project}}",
  "Claimant's name: {{claimant}}",
  "Type of labor or materials provided: {{work}}",
  "Original contractor's name: {{gc}}",
  "Party with whom claimant contracted if different from original contractor: {{hiredBy}}",
];
const TAIL = ["{{contact}} (Claimant's contact person)", "{{address}} (Claimant's address)"];
export const FORMS = {
  monthly: ["NOTICE OF CLAIM FOR UNPAID LABOR OR MATERIALS", ...HEAD, "Claim amount: {{amount}}", ...TAIL],
  retainage: ["NOTICE OF CLAIM FOR UNPAID RETAINAGE", ...HEAD, "Total retainage unpaid: {{amount}}", ...TAIL],
};
// § 53.254(g): on a homestead the notice to the owner "must include or have attached" this statement.
export const HOMESTEAD_STATEMENT = [
  "If a subcontractor or supplier who furnishes materials or performs labor for construction of improvements on your property is not paid, your property may be subject to a lien for the unpaid amount if: (1) after receiving notice of the unpaid claim from the claimant, you fail to withhold payment to your contractor that is sufficient to cover the unpaid claim until the dispute is resolved; or (2) during construction and for 30 days after completion of your contractor's work, you fail to reserve 10 percent of the contract price or 10 percent of the value of the work performed by your contractor.",
  "If you have complied with the law regarding the reservation of 10 percent of the contract price or value of work and you have withheld payment to the contractor sufficient to cover any written notice of claim and have paid that amount, if any, to the claimant, any lien claim filed on your property by a subcontractor or supplier, other than a person who contracted directly with you, will not be a valid lien on your property. In addition, except for the required 10 percent reservation, you are not liable to a subcontractor or supplier for any amount paid to your contractor before you received written notice of the claim.",
];

export const FIELDS = [
  ["date", "date"], ["project", "project description or address"], ["claimant", "your company's name"],
  ["work", "type of labor or materials"], ["gc", "original contractor's name"], ["hiredBy", "who you contracted with, if not the GC"],
  ["amount", "claim amount"], ["contact", "your contact person"], ["address", "your address"],
];
const OPTIONAL = new Set(["hiredBy"]);
const BLANK = "_______________";
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

export function draftNotice(kind = "monthly", fields = {}, { homestead = false } = {}) {
  const form = FORMS[kind];
  if (!form) throw new Error(`unknown form ${kind}`);
  const missing = [];
  const fill = {};
  for (const [key, label] of FIELDS) {
    const v = clean(fields[key]);
    if (!v && !OPTIONAL.has(key)) missing.push(label);
    fill[key] = v || BLANK;
  }
  const lines = form.map((line) => line.replace(/\{\{(\w+)\}\}/g, (_, k) => fill[k]));
  if (homestead) lines.push(...HOMESTEAD_STATEMENT);
  return { lines, text: lines.join("\n\n"), missing };
}

// Delivery, § 53.003(b)-(d).
export const DELIVERY = [
  "In person to the party entitled to the notice or to that party's agent (§ 53.003(b)(1))",
  "By certified mail; depositing it in the mail in the required form is compliance (§ 53.003(b)(2), (c))",
  "By any other form of traceable, private delivery or mailing service that can confirm proof of receipt (§ 53.003(b)(3))",
];
