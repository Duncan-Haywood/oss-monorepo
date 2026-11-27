// Oregon public works: when the weekly certified statements are due, and what a late filing holds back.
//
// Oregon's prevailing wage rate law asks every contractor and subcontractor on a public works job to
// file a certified statement for each week it has a worker on the job, "once a month, by the fifth
// business day of the following month", with the public agency (ORS 279C.845(4)). A late filing costs
// cash: the public agency retains 25 percent of any amount the prime contractor earned until the prime
// files (ORS 279C.845(7)), and the prime retains 25 percent of any amount a first-tier subcontractor
// earned until that sub files (ORS 279C.845(8)). OAR 839-025-0010(4) and (5) count the 25 percent on
// "the unpaid amount earned ... at the time each payroll and certified statement are due" since the
// last statements were filed, leave earlier holds out of it, and make the hold come on top of any other
// retainage ((6)); it is paid within 14 days of filing.
//
// The form is BOLI's Payroll and Certified Statement, WH-38, or the Enhanced WH-38 on a qualifying
// agency's public improvement contract over $3 million (OAR 839-025-0010(1)(a), (2)). A contractor may
// use its own form if it carries every WH-38 element and the WH-38's certification statement
// (OAR 839-025-0010(3)(a)); BOLI's handbook adds that a federal WH-347 alone does not meet the filing
// rule. PayApps does not print the WH-38 (BOLI's own file did not download for us), so the page says
// what to attach.
//
// Sources, read 2026-11-27 on the state's own sites: ORS 279C.845 and ORS 187.010
// (oregonlegislature.gov, 2025 edition), OAR 839-025-0010 (secure.sos.state.or.us, division 25), and
// BOLI's Prevailing Wage Rate Laws Handbook, 6.5.26 edition, "Certified Payroll" (oregon.gov/boli).
//
// Business days. Neither the statute nor the rule defines one. PayApps counts Monday to Friday less
// Oregon's legal holidays (ORS 187.010(1), with (2)'s shifts: a holiday on a Sunday is kept on the
// Monday, one on a Saturday on the Friday) and says so; days the Governor appoints (ORS 187.020) are
// not known in advance and are left out, which can only make a due date earlier, never later.
//
// Which month a week belongs to. The statute files "certified statements for each week" monthly and
// does not say where a week that runs across two months goes. PayApps puts it in the month of its
// first day, the earlier of the two due dates, and names the later one too. Pure functions, no I/O.

const DAY_MS = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const ymd = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** A real calendar date in YYYY-MM-DD form. */
export function isIsoDate(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  return ymd(Number(m[1]), Number(m[2]), Number(m[3])) === s;
}

/** The n-th `dow` (0 = Sunday) of a month; n = -1 is the last one. */
function nthWeekday(y: number, m: number, dow: number, n: number): string {
  if (n < 0) {
    const last = new Date(Date.UTC(y, m, 0));
    const back = (last.getUTCDay() - dow + 7) % 7;
    return ymd(y, m, last.getUTCDate() - back);
  }
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return ymd(y, m, 1 + ((dow - first + 7) % 7) + 7 * (n - 1));
}

/** Fixed-date holidays move by ORS 187.010(2): Saturday to the Friday before, Sunday to the Monday after. */
function observed(iso: string): string {
  const d = weekday(iso);
  return d === 6 ? addDays(iso, -1) : d === 0 ? addDays(iso, 1) : iso;
}

export interface OregonHoliday {
  /** The day the holiday is kept on (after ORS 187.010(2)'s shift). */
  on: string;
  name: string;
}

/** Oregon's legal holidays kept in `year` (ORS 187.010(1)(b)-(k) and (2)), Sundays aside. */
export function oregonHolidays(year: number): OregonHoliday[] {
  const list: OregonHoliday[] = [];
  // New Year's Day of the next year can be kept on 31 December of this one.
  for (const y of [year, year + 1]) {
    const fixed: [number, number, string][] = [
      [1, 1, "New Year's Day"],
      [6, 19, "Juneteenth"],
      [7, 4, "Independence Day"],
      [11, 11, "Veterans Day"],
      [12, 25, "Christmas Day"],
    ];
    for (const [m, d, name] of fixed) list.push({ on: observed(ymd(y, m, d)), name });
    list.push(
      { on: nthWeekday(y, 1, 1, 3), name: "Martin Luther King, Jr.'s Birthday" },
      { on: nthWeekday(y, 2, 1, 3), name: "Presidents Day" },
      { on: nthWeekday(y, 5, 1, -1), name: "Memorial Day" },
      { on: nthWeekday(y, 9, 1, 1), name: "Labor Day" },
      { on: nthWeekday(y, 11, 4, 4), name: "Thanksgiving Day" },
    );
  }
  return list.filter((h) => h.on.startsWith(`${year}-`)).sort((a, b) => a.on.localeCompare(b.on));
}

const holidayCache = new Map<number, Map<string, string>>();
function holidaysOf(year: number): Map<string, string> {
  let m = holidayCache.get(year);
  if (!m) {
    m = new Map(oregonHolidays(year).map((h) => [h.on, h.name]));
    holidayCache.set(year, m);
  }
  return m;
}

/** The Oregon legal holiday kept on `iso`, if any. */
export function oregonHolidayOn(iso: string): string | null {
  return holidaysOf(Number(iso.slice(0, 4))).get(iso) ?? null;
}

/** Monday to Friday and not an ORS 187.010 holiday. */
export function isOregonBusinessDay(iso: string): boolean {
  const d = weekday(iso);
  return d !== 0 && d !== 6 && oregonHolidayOn(iso) === null;
}

/** "2026-11" for a date. */
export const monthOf = (iso: string) => iso.slice(0, 7);

/** The month after "YYYY-MM". */
export function nextMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** The fifth business day of the month after `month`: when that month's statements are due. */
export function filingDueOn(month: string): string {
  let day = `${nextMonth(month)}-01`;
  let count = 0;
  for (;;) {
    if (isOregonBusinessDay(day)) count++;
    if (count === 5) return day;
    day = addDays(day, 1);
  }
}

export interface WeekFiling {
  /** The month the week is filed with (the month of its first day). */
  month: string;
  /** When that month's statements are due. */
  dueOn: string;
  /** A week that runs into the next month: that month and its due date, the later reading. */
  alsoMonth: string | null;
  alsoDueOn: string | null;
  /** Holidays that pushed the due date later, for the page to name. */
  holidaysSkipped: OregonHoliday[];
}

/** When the certified statement for the workweek `weekStart`..`weekEnd` is due. */
export function weekFiling(weekStart: string, weekEnd: string): WeekFiling {
  const month = monthOf(weekStart);
  const endMonth = monthOf(weekEnd);
  const dueOn = filingDueOn(month);
  const from = `${nextMonth(month)}-01`;
  const holidaysSkipped = oregonHolidays(Number(from.slice(0, 4))).filter(
    (h) => h.on >= from && h.on <= dueOn && weekday(h.on) !== 0 && weekday(h.on) !== 6,
  );
  const split = endMonth !== month;
  return {
    month,
    dueOn,
    alsoMonth: split ? endMonth : null,
    alsoDueOn: split ? filingDueOn(endMonth) : null,
    holidaysSkipped,
  };
}

/** Who holds the 25 percent when this company files late. */
export const OR_TIERS = ["prime", "first", "lower"] as const;
export type OrTier = (typeof OR_TIERS)[number];

export const OR_TIER_LABELS: Record<OrTier, string> = {
  prime: "The prime contractor (contract with the public agency)",
  first: "A first-tier subcontractor (contract with the prime)",
  lower: "A lower-tier subcontractor",
};

export interface LateHold {
  /** 25 percent of the earned amount, to the cent (half a cent rounds up). */
  holdCents: number;
  /** Who retains it, or null where the statute names no one (below the first tier). */
  heldBy: "public agency" | "prime contractor" | null;
  citation: string;
}

/**
 * The 25 percent held back when the statements are not filed on time: `earnedCents` is the unpaid
 * amount earned since the last statements were filed, leaving out amounts already held under this rule
 * (OAR 839-025-0010(4)(b), (5)(b)).
 */
export function lateHold(earnedCents: number, tier: OrTier): LateHold {
  const earned = Math.max(0, Math.round(earnedCents));
  const holdCents = Math.floor((earned + 2) / 4);
  if (tier === "prime")
    return { holdCents, heldBy: "public agency", citation: "ORS 279C.845(7); OAR 839-025-0010(4)" };
  if (tier === "first")
    return {
      holdCents,
      heldBy: "prime contractor",
      citation: "ORS 279C.845(8); OAR 839-025-0010(5)",
    };
  return { holdCents: 0, heldBy: null, citation: "ORS 279C.845(7), (8)" };
}

/** The held amount is paid within 14 days after the statements are filed (ORS 279C.845(7), (8)). */
export function releaseBy(filedOn: string): string {
  return addDays(filedOn, 14);
}

/** The statement for a week is due in this many calendar days from `today` (negative: late). */
export function daysUntil(today: string, dueOn: string): number {
  return Math.round((Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

export const OR_PWR_PAGE = "https://www.oregon.gov/boli/employers/Pages/prevailing-wage.aspx";
export const OR_ORS_279C = "https://www.oregonlegislature.gov/bills_laws/ors/ors279C.html";
export const OR_OAR_DIV25 =
  "https://secure.sos.state.or.us/oard/displayDivisionRules.action?selectedDivision=3850";

export const OR_PWR_NOTICE =
  "Dates and the 25% hold come from ORS 279C.845, OAR 839-025-0010 and ORS 187.010 as read on 2026-11-27. " +
  "Business days are counted Monday to Friday less Oregon's legal holidays; a day the Governor adds is not " +
  "known in advance. Not legal advice: your contract and the public agency may set earlier dates.";
