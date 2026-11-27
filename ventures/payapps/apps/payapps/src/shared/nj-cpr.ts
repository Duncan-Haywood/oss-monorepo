// New Jersey public works: the weekly certified payroll as NJDOL's fillable MW-562 ("Payroll
// Certification for Public Works Projects"), filled in so it can be uploaded to the NJ Wage Hub.
// New Jersey requires certified payroll on public works to be submitted online through the Wage
// Hub (P.L. 2023, c.138, in effect from August 2024); the Hub takes manual entry, a CSV template,
// or "an electronically filled out MW-562" dropped into its upload window (NJDOL's NJ Wage Hub
// Contractor User Guide, last updated 03/06/2026, Part 6 C).
//
// Sources, read 2026-11-27: the MW-562 itself (revision 2/25, the file NJDOL's Wage Hub FAQ links as
// "the latest version", https://www.nj.gov/labor/wageandhour/prevailing-rates/wagehubfaq.shtml),
// its field list (src/shared/nj-mw562-fields.ts, generated from the form), each field's length
// limit and its own format scripts (dates mm/dd/yyyy, day dates m/d, amounts as plain two-decimal
// numbers), and the User Guide. NJDOL's CSV template could not be fetched (njwages.nj.gov answers
// 403 from our build machines), which is why this fills the PDF instead.
//
// The PDF is NJDOL's, not ours, and is not kept in PayApps: the contractor downloads the blank form
// from NJDOL and PayApps fills it in the browser (src/shared/pdf/form-fill.ts). Nothing is sent to us.
//
// It starts from the WH-347 payroll the page already holds (src/shared/certified-payroll.ts) and adds
// what the MW-562 asks for and the federal form does not: the FEIN, the contractor's NJ public works
// registration number, the date wages were paid, each worker's address, sex, race and ethnicity, and
// the state income tax (split out of the WH-347's single withholding column). Totals never change.
//
// Nothing here decides prevailing-wage compliance: the rates are the contractor's to check against
// the project's NJ prevailing wage determination.

import { z } from "zod";
import {
  type CertifiedPayroll,
  computeCertifiedPayroll,
  formatHours,
  type Issue,
  weekDays,
} from "./certified-payroll";
import { centsToDecimal } from "./money";
import { MW562, MW562_TITLE } from "./nj-mw562-fields";
import type { FormField, FormValues } from "./pdf/form-fill";

export const NJ_ROWS = MW562.rows.length;
export const NJ_PLAN_ROWS = MW562.plans.length;

export const NJ_SEX = ["M", "F", "N"] as const;
export const NJ_SEX_LABELS: Record<(typeof NJ_SEX)[number], string> = {
  M: "M: male",
  F: "F: female",
  N: "N: non-binary",
};
export const NJ_RACE = ["W", "B", "A", "N", "I", "M"] as const;
export const NJ_RACE_LABELS: Record<(typeof NJ_RACE)[number], string> = {
  W: "W: White",
  B: "B: Black or African American",
  A: "A: Asian",
  N: "N: American Indian or Native Alaskan",
  I: "I: Native Hawaiian or Pacific Islander",
  M: "M: two or more",
};
export const NJ_ETHNICITY = ["H", "N"] as const;
export const NJ_ETHNICITY_LABELS: Record<(typeof NJ_ETHNICITY)[number], string> = {
  H: "H: Hispanic",
  N: "N: non-Hispanic",
};

/** Where the blank form is: NJDOL's own link, from its Wage Hub FAQ. */
export const NJ_MW562_URL =
  "https://www.nj.gov/labor/wageandhour/assets/PDFs/wagehub/MW-562%20(12_16B)Payroll%20Cert-Public%20Works%20test%2012%2016B%20(2).pdf";
export const NJ_WAGE_HUB_FAQ =
  "https://www.nj.gov/labor/wageandhour/prevailing-rates/wagehubfaq.shtml";

const text = () => z.string().trim();
const isoDate = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

export const njWorkerSchema = z.object({
  /** The worker's home address, printed after the name ("Employee Name and Address"). */
  address: text().default(""),
  sex: z.enum(["", ...NJ_SEX]).default(""),
  race: z.enum(["", ...NJ_RACE]).default(""),
  ethnicity: z.enum(["", ...NJ_ETHNICITY]).default(""),
  /** The NJ income tax part of the WH-347's withholding; the rest is federal. */
  stateTaxCents: z.number().int().min(0).max(100_000_000).default(0),
  /** "" = Journeyman, or Apprentice and its level, from the WH-347 status. */
  jobTitle: text().default(""),
});

export const njJobSchema = z.object({
  /** Federal Employer Identification Number, nine digits. */
  fein: text().default(""),
  /** The NJ Public Works Contractor Registration certificate number. */
  registration: text().default(""),
  /** "" = the WH-347 project or contract number. */
  projectId: text().default(""),
  /** The date the week's wages were due and paid. */
  wagesPaid: isoDate.default(""),
  /** No employee worked on the project this week. */
  noWork: z.boolean().default(false),
  /** Tick the form's electronic signature box, with the certifier's name and today's date. */
  sign: z.boolean().default(false),
});

export type NjWorkerInput = z.input<typeof njWorkerSchema>;
export type NjJobInput = z.input<typeof njJobSchema>;

export interface NjResult {
  issues: Issue[];
  /** Every field of the form (blank ones as "" or false, so a reused file is cleared), or null. */
  values: FormValues | null;
  rowsUsed: number;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const DAY_KEYS = ["su", "mo", "tu", "we", "th", "fr", "sa"] as const;

/** "2026-08-01" -> "08/01/2026"; with `short`, "08/01/26". */
export function njDate(iso: string, short = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return `${m[2]}/${m[3]}/${short ? (m[1] as string).slice(2) : m[1]}`;
}

/** "123456789" or "12-3456789" -> "12-3456789"; null when it is not nine digits. */
export function njFein(s: string): string | null {
  const d = s.replace(/[\s-]/g, "");
  return /^\d{9}$/.test(d) ? `${d.slice(0, 2)}-${d.slice(2)}` : null;
}

type PlanKind = "health" | "vacation" | "training" | "pension" | "other";
export function njPlanKind(typeOrName: string): PlanKind {
  const s = typeOrName.toLowerCase();
  if (/health|welfare|medical|dental|vision|insurance/.test(s)) return "health";
  if (/pension|retire|401|annuit/.test(s)) return "pension";
  if (/train|apprentic|education/.test(s)) return "training";
  if (/vacation|holiday/.test(s)) return "vacation";
  return "other";
}

/** Every field name the filler writes, to check a chosen file is the MW-562 PayApps knows. */
export function mw562FieldNames(): { text: string[]; boxes: string[] } {
  const text: string[] = [];
  for (const r of MW562.rows) {
    for (const [k, v] of Object.entries(r)) {
      if (k === "st" || k === "ot") text.push(...Object.values(v as Record<string, string>));
      else text.push(v as string);
    }
  }
  for (const p of MW562.plans) text.push(...Object.values(p));
  text.push(
    ...Object.values(MW562.dates),
    ...Object.values(MW562.header),
    ...Object.values(MW562.cert),
  );
  return { text, boxes: [...Object.values(MW562.boxes), ...Object.values(MW562.certBoxes)] };
}

/**
 * Null when `fields` (read from the chosen PDF) are the MW-562's; otherwise why not, for the page.
 */
export function mw562Problem(fields: ReadonlyMap<string, FormField>): string | null {
  const { text, boxes } = mw562FieldNames();
  const missing = [
    ...text.filter((n) => fields.get(n)?.kind !== "text"),
    ...boxes.filter((n) => fields.get(n)?.kind !== "checkbox"),
  ];
  if (missing.length === 0) return null;
  if (missing.length > 50) {
    return "This PDF is not NJDOL's fillable MW-562. Download the blank form from NJDOL's Wage Hub page and choose that file.";
  }
  return `This MW-562 is not the revision PayApps knows (${MW562_TITLE}): ${missing.length} field(s) differ, for example "${missing[0]}". NJDOL may have changed the form; enter this week in the Wage Hub directly and tell us.`;
}

/**
 * The MW-562 values for one week. `workers` follows `payroll.workers` by position (missing entries
 * are blank). `today` is the signature date (YYYY-MM-DD), used only when the job is signed.
 */
export function buildNjCpr(
  payroll: CertifiedPayroll,
  jobInput: NjJobInput,
  workersInput: readonly (NjWorkerInput | undefined)[],
  today: string,
): NjResult {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) =>
    issues.push({ level: "warning", where, message });
  const parsedJob = njJobSchema.safeParse(jobInput);
  if (!parsedJob.success)
    err("New Jersey", "The New Jersey details are not readable: clear and retype them");
  const job = parsedJob.success ? parsedJob.data : njJobSchema.parse({});

  let row = 0;
  const values: FormValues = {};
  const { text, boxes } = mw562FieldNames();
  for (const n of text) values[n] = "";
  for (const n of boxes) values[n] = false;
  const put = (field: string, value: string, where: string, label: string) => {
    const max = (MW562.maxLen as Record<string, number>)[field];
    if (max !== undefined && value.length > max) {
      err(
        where,
        `The MW-562 holds ${max} characters for the ${label}; shorten it (now ${value.length})`,
      );
    }
    values[field] = value;
  };
  /** A repeat of a page 1 value on page 2, cut to fit. */
  const repeat = (field: string, value: string) => {
    const max = (MW562.maxLen as Record<string, number>)[field];
    values[field] = max !== undefined ? value.slice(0, max) : value;
  };

  const days = weekDays(payroll.weekEnding);
  if (!days.length) err("Week", "Enter the week-ending date as YYYY-MM-DD");
  else if (new Date(`${payroll.weekEnding}T00:00:00Z`).getUTCDay() !== 6) {
    err(
      "Week",
      "The MW-562's day columns run Sunday to Saturday, so the week must end on a Saturday for this form",
    );
  }

  const H = MW562.header;
  put(H.contractorName, payroll.businessName, "Company", "contractor name");
  put(H.businessAddress, payroll.businessAddress, "Company", "business address");
  put(H.projectName, payroll.projectName, "Project", "project name");
  put(H.projectLocation, payroll.projectLocation, "Project", "project location");
  put(H.projectId, job.projectId || payroll.projectNumber, "Project", "contract or project ID");
  put(H.payrollNo, payroll.payrollNo, "Payroll", "payroll number");
  put(H.weekEnding, njDate(payroll.weekEnding), "Week", "week ending date");
  const fein = njFein(job.fein);
  if (!fein) err("New Jersey", "Enter the business's FEIN (nine digits)");
  else put(H.fein, fein, "New Jersey", "FEIN");
  if (!job.registration) {
    warn(
      "New Jersey",
      "Enter your NJ Public Works Contractor Registration number: every contractor and subcontractor on NJ public works must be registered",
    );
  } else put(H.registration, job.registration, "New Jersey", "contractor registration number");
  if (!job.wagesPaid) warn("New Jersey", "Enter the date the week's wages were due and paid");
  else put(H.wagesPaid, njDate(job.wagesPaid), "New Jersey", "date wages paid");

  values[MW562.boxes.contractor] = payroll.role === "prime";
  values[MW562.boxes.subcontractor] = payroll.role !== "prime";
  values[MW562.boxes.final] = payroll.final;
  values[MW562.boxes.noWork] = job.noWork;
  if (days.length) {
    DAY_KEYS.forEach((k, i) => {
      put(MW562.dates[k], days[i]?.label ?? "", "Week", "day date");
    });
  }

  const C = MW562.cert;
  repeat(C.contractorName, payroll.businessName);
  repeat(C.projectName, payroll.projectName);
  repeat(C.projectLocation, payroll.projectLocation);
  if (days.length) {
    put(C.start, njDate(days[0]?.iso ?? "", true), "Week", "payroll start date");
    put(C.end, njDate(payroll.weekEnding, true), "Week", "payroll end date");
  }
  put(C.name, payroll.certifierName, "Certification", "signer's name");
  put(C.title, payroll.certifierTitle, "Certification", "signer's title");
  if (job.sign) {
    if (!payroll.certifierName) {
      err("Certification", "Enter the certifying official's name to sign electronically");
    }
    values[MW562.certBoxes.eSign] = true;
    put(C.signDate, njDate(today, true), "Certification", "signature date");
  }

  if (job.noWork) {
    if (payroll.workers.some((w) => w.rows.some((r) => sum(r.st) + sum(r.ot) > 0))) {
      err("New Jersey", "The week is marked as no work, but workers have hours on it");
    }
    return done();
  }

  const wh = computeCertifiedPayroll(payroll);
  // The federal form's checks still apply, except its statement reminders: the MW-562 has its own.
  for (const i of wh.issues) if (i.where !== "Statement") issues.push(i);
  if (!payroll.workers.length) err("Workers", "Add the workers, or mark the week as no work");

  const totalRows = sum(payroll.workers.map((w) => w.rows.length));
  if (totalRows > NJ_ROWS) {
    err(
      "Workers",
      `The MW-562 has ${NJ_ROWS} rows and this week needs ${totalRows} (one per worker and classification). The Wage Hub keeps only the last submission for a week, so a second sheet would replace the first: enter this week in the Wage Hub directly or with its CSV template.`,
    );
    return done();
  }

  const plans = payroll.fringePlans;
  const kinds = plans.map((p) => njPlanKind(`${p.type} ${p.name}`));
  const otherNotes = new Set(
    payroll.workers.filter((w) => w.otherCents > 0).map((w) => w.otherNote || "Other"),
  );
  if (otherNotes.size === 1)
    put(H.otherLabel1, [...otherNotes][0] as string, "Deductions", "other deduction label");
  else if (otherNotes.size > 1) put(H.otherLabel1, "Other", "Deductions", "other deduction label");

  let planRow = 0;
  let missingDemo = 0;
  let cash = false;
  let funded = false;
  payroll.workers.forEach((w, wi) => {
    const who = `Worker ${wi + 1} (${w.lastName})`;
    const parsed = njWorkerSchema.safeParse(workersInput[wi] ?? {});
    if (!parsed.success) err(who, "The New Jersey details are not readable: retype them");
    const nj = parsed.success ? parsed.data : njWorkerSchema.parse({});
    const cw = wh.workers[wi];
    if (!nj.sex || !nj.race || !nj.ethnicity) missingDemo++;
    if (!nj.address) warn(who, "Enter the worker's address (the MW-562 asks for name and address)");
    if (nj.stateTaxCents > w.taxCents) {
      err(
        who,
        "The NJ income tax is more than the withholding tax on the WH-347 (which includes it)",
      );
    }
    const name = `${w.lastName}, ${w.firstName}${w.middleInitial ? ` ${w.middleInitial}` : ""}`;
    w.rows.forEach((r, ri) => {
      const R = MW562.rows[row++];
      if (!R) return;
      const where = w.rows.length > 1 ? `${who}, row ${ri + 1}` : who;
      put(
        R.employee,
        nj.address ? `${name}, ${nj.address}` : name,
        where,
        "employee name and address",
      );
      const title =
        nj.jobTitle ||
        (r.status === "RA"
          ? `Apprentice${r.apprenticeLevel ? ` ${r.apprenticeLevel}` : ""}`
          : "Journeyman");
      put(R.jobTitle, title, where, "job title");
      put(R.workCategory, r.classification, where, "work classification");
      values[R.sex] = nj.sex;
      values[R.race] = nj.race;
      values[R.ethnicity] = nj.ethnicity;
      const st = sum(r.st);
      const ot = sum(r.ot);
      DAY_KEYS.forEach((k, d) => {
        values[R.st[k]] = r.st[d] ? formatHours(r.st[d] as number) : "";
        values[R.ot[k]] = r.ot[d] ? formatHours(r.ot[d] as number) : "";
      });
      values[R.st.total] = formatHours(st);
      values[R.st.rate] = centsToDecimal(r.stRateCents);
      if (ot > 0) {
        values[R.ot.total] = formatHours(ot);
        values[R.ot.rate] = centsToDecimal(r.otRateCents);
      }
      if (r.cashInLieuHourlyCents > 0) cash = true;
      const cr = wh.rows.find((x) => x.worker === w && x.row === r);
      values[R.grossProject] = centsToDecimal(cr?.grossProjectCents ?? 0);
      if (ri === 0 && cw) {
        values[R.grossWeek] = centsToDecimal(cw.grossAllWorkCents);
        values[R.fica] = centsToDecimal(w.ficaCents);
        values[R.federalTax] = centsToDecimal(Math.max(w.taxCents - nj.stateTaxCents, 0));
        values[R.stateTax] = centsToDecimal(nj.stateTaxCents);
        if (w.otherCents) values[R.other1] = centsToDecimal(w.otherCents);
        values[R.totalDeductions] = centsToDecimal(cw.totalDeductionsCents);
        values[R.net] = centsToDecimal(cw.netCents);
        values[R.fringe] = centsToDecimal(cw.hourlyFringeCreditCents);
      }
    });

    // 4(c): one row per worker with fringe credits, amounts per hour by the form's benefit types.
    if (cw && cw.hourlyFringeCreditCents > 0) {
      if (plans.some((p, k) => p.funded && (w.fringeCreditsCents[k] ?? 0) > 0)) funded = true;
      const P = MW562.plans[planRow++];
      if (!P) {
        err(
          who,
          `Section 4(c) of the MW-562 has room for ${NJ_PLAN_ROWS} workers with fringe benefits`,
        );
        return;
      }
      const by: Record<PlanKind, number> = {
        health: 0,
        vacation: 0,
        training: 0,
        pension: 0,
        other: 0,
      };
      const otherNames: string[] = [];
      plans.forEach((p, k) => {
        const c = w.fringeCreditsCents[k] ?? 0;
        if (!c) return;
        const kind = kinds[k] as PlanKind;
        by[kind] += c;
        if (kind === "other") otherNames.push(p.type || p.name);
      });
      const used = plans.filter((_, k) => (w.fringeCreditsCents[k] ?? 0) > 0);
      repeat(P.program, `${name} (${w.rows[0]?.classification ?? ""})`);
      if (by.health) values[P.health] = centsToDecimal(by.health);
      if (by.vacation) values[P.vacation] = centsToDecimal(by.vacation);
      if (by.training) values[P.training] = centsToDecimal(by.training);
      if (by.pension) values[P.pension] = centsToDecimal(by.pension);
      if (by.other) {
        values[P.otherType] = otherNames.join(", ");
        values[P.otherAmount] = centsToDecimal(by.other);
      }
      values[P.administrator] = used.map((p) => p.name).join("; ");
      repeat(
        P.account,
        used
          .map((p) => p.planNo)
          .filter(Boolean)
          .join(", "),
      );
    }
  });
  values[MW562.certBoxes.fringePlans] = funded;
  values[MW562.certBoxes.fringeCash] = cash;
  if (missingDemo) {
    warn(
      "Workers",
      `${missingDemo} worker(s) have no sex, race or ethnicity: the MW-562 asks for all three, and the Wage Hub may list them as missing`,
    );
  }
  return done();

  function done(): NjResult {
    const hasErr = issues.some((i) => i.level === "error");
    return { issues, values: hasErr ? null : values, rowsUsed: row };
  }
}

/** "nj-mw562-2026-08-01.pdf". */
export function njCprFileName(weekEnding: string): string {
  return `nj-mw562-${weekEnding}.pdf`;
}

/** Next week's New Jersey extras: the same addresses and demographics; this week's tax is not kept. */
export function njNextWeek(w: NjWorkerInput): NjWorkerInput {
  return { ...w, stateTaxCents: 0 };
}

export const NJ_CPR_NOTICE =
  "Filled by PayApps into NJDOL's own MW-562 (revision 2/25, as linked from NJDOL's Wage Hub FAQ in November 2026). Not a New Jersey Department of Labor product and not legal advice. The Wage Hub keeps only the last submission for a week ending date, and you must also give the payroll to the public body: review what the Wage Hub reads from the file, and check every figure against your payroll records and the project's prevailing wage rates before you submit.";
