// New Jersey public works: the weekly certified payroll on NJDOL's own fillable form MW-562
// ("Payroll Certification for Public Works Projects", revision 2/25), filled from the WH-347 payroll
// the page already holds. New Jersey requires certified payroll on public works to be filed in the
// NJ Wage Hub (P.L. 2023, c.138; pay periods ending on or after 15 August 2024), and the Wage Hub
// takes "an electronically filled out MW-562": dragged into "Add Certified Payroll", its values fill
// steps 1-4 for review (NJWH Contractor User Guide, last updated 03/06/2026, part 6 C). Pure: the
// values are built here and written into the contractor's copy of the form in the browser
// (src/shared/pdf/form-fill.ts), so workers' names, addresses and demographics never reach our server.
//
// Sources, read 2026-11-27: the form itself (nj.gov prevailing-rates updates page, "MW-562 (2-25)
// Payroll Cert-Public Works"; its field names are mapped in nj-mw562-fields.ts) and the Contractor
// User Guide (www.nj.gov/labor/wageandhour/assets/PDFs/wagehub/NJWH_Contractor_User_Guide.pdf). The
// form is NJDOL's file and is not copied into PayApps: the contractor downloads the blank from NJDOL
// and PayApps fills that copy.
//
// What the MW-562 asks for that the WH-347 does not: the FEIN, the contractor's New Jersey public works
// registration number, the date wages were due and paid, each worker's address and demographics (sex,
// race, ethnicity, by the form's own keys), state tax as its own deduction, and the fringe benefit
// cost per hour by type (health and welfare, vacation and holiday, apprenticeship and training,
// pension, other). Totals never change: federal tax is the WH-347 withholding less the state tax, and
// the WH-347 "other" is split into the New Jersey worker contributions (UI, DI and FLI) and the rest.
//
// The layout: one MW-562 row per WH-347 row (worker x classification), ten rows a sheet. Each day's
// hours go in the column of its weekday (the form prints SU to SA), dated. The week's gross, the
// deductions and the net pay sit on the worker's first row, as on the WH-347. More than ten rows make
// more sheets, each with "additional sheets attached" ticked; the guide asks contractors with more
// than ten employees to use its CSV upload instead, which PayApps cannot make yet (the template is
// behind the Wage Hub's sign-in wall).
//
// Nothing here decides prevailing-wage compliance: the rates on the project's wage determination are
// the contractor's to check, and the Wage Hub shows its own list of invalid or missing entries.

import { z } from "zod";
import {
  type CertifiedPayroll,
  computeCertifiedPayroll,
  formatHours,
  type Issue,
  weekDays,
} from "./certified-payroll";
import {
  MW562_DATES,
  MW562_HEADER,
  MW562_PAGE2,
  MW562_ROWS,
  mw562ProgramRow,
} from "./nj-mw562-fields";

export const MW562_REVISION = "MW-562 (2/25)";
export const MW562_ROWS_PER_SHEET = MW562_ROWS.length;
export const MW562_PROGRAM_ROWS = 18;
/** Where NJDOL publishes the current blank form. */
export const MW562_SOURCE_URL =
  "https://www.nj.gov/labor/wageandhour/prevailing-rates/updates.shtml";

export const NJ_SEX = { M: "Male", F: "Female", N: "Non-binary" } as const;
export const NJ_RACE = {
  W: "White",
  B: "Black or African American",
  A: "Asian",
  N: "American Indian or Native Alaskan",
  I: "Native Hawaiian or Pacific Islander",
  M: "2 or more",
} as const;
export const NJ_ETHNICITY = { H: "Hispanic", N: "Non-Hispanic" } as const;

export const NJ_BENEFIT_TYPES = ["health", "vacation", "training", "pension", "other"] as const;
export type NjBenefitType = (typeof NJ_BENEFIT_TYPES)[number];
export const NJ_BENEFIT_LABELS: Record<NjBenefitType, string> = {
  health: "Health/welfare",
  vacation: "Vacation/holiday",
  training: "Apprenticeship/training",
  pension: "Pension",
  other: "Other",
};

const text = () => z.string().trim();
const cents = z.number().int().min(0).max(100_000_000);
const iso = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

export const njWorkerSchema = z.object({
  /** Home address, printed under the name in column 1. */
  address: text().max(200).default(""),
  sex: z.enum(["", "M", "F", "N"]).default(""),
  race: z.enum(["", "W", "B", "A", "N", "I", "M"]).default(""),
  ethnicity: z.enum(["", "H", "N"]).default(""),
  /** Part of the WH-347 withholding tax (the rest is federal). */
  stateTaxCents: cents.default(0),
  /** Part of the WH-347 "other": the worker's New Jersey UI, DI and FLI contributions. */
  njContribCents: cents.default(0),
});

export const njJobSchema = z.object({
  fein: text().max(20).default(""),
  /** The contractor's New Jersey public works contractor registration number. */
  registrationNo: text().max(40).default(""),
  /** "Date wages due & paid"; "" = left blank. */
  datePaid: iso.default(""),
  /** NJ benefit type of each fringe plan, in the order of the WH-347 plans; null = guessed. */
  planTypes: z.array(z.enum(NJ_BENEFIT_TYPES).nullable()).max(6).default([]),
  /** Tick the form's electronic signature box (the certifier's own choice, off by default). */
  eSign: z.boolean().default(false),
  signDate: iso.default(""),
});

export type NjWorkerInput = z.input<typeof njWorkerSchema>;
export type NjJobInput = z.input<typeof njJobSchema>;

/** A plan's MW-562 benefit type from its type or name. */
export function guessNjBenefitType(typeOrName: string): NjBenefitType {
  const s = typeOrName.toLowerCase();
  if (/health|welfare|medical|dental|vision|insurance/.test(s)) return "health";
  if (/vacation|holiday/.test(s)) return "vacation";
  if (/pension|retire|401|annuit/.test(s)) return "pension";
  if (/train|apprentic|education/.test(s)) return "training";
  return "other";
}

/** Cents as the form's number fields take them: "1234.56", no "$" or commas. */
export const njMoney = (c: number) => (c / 100).toFixed(2);
const blankIfZero = (s: string, n: number) => (n === 0 ? "" : s);

function parseIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s ? d : null;
}
/** The form's date formats: "mm/dd/yyyy" (week ending), "mm/dd/yy" (page 2), "m/d" (day columns). */
export function njDate(s: string, style: "mm/dd/yyyy" | "mm/dd/yy" | "m/d"): string {
  const d = parseIso(s);
  if (!d) return "";
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  if (style === "m/d") return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  const y = String(d.getUTCFullYear());
  return `${mm}/${dd}/${style === "mm/dd/yy" ? y.slice(2) : y}`;
}

export type Mw562Values = Record<string, string | boolean>;

export interface NjResult {
  /** One set of field values per sheet (ten rows each; at least one sheet). */
  sheets: Mw562Values[];
  issues: Issue[];
  rows: number;
  programRows: number;
}

/**
 * The MW-562 field values for the week, sheet by sheet. Every field the form has is set (blank where
 * there is nothing), so a blank copy that came with sample entries is filled clean.
 */
export function buildMw562(
  payroll: CertifiedPayroll,
  jobInput: NjJobInput,
  workersInput: readonly (NjWorkerInput | undefined)[],
): NjResult {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) =>
    issues.push({ level: "warning", where, message });
  const parsedJob = njJobSchema.safeParse(jobInput);
  if (!parsedJob.success)
    err("MW-562", "The New Jersey details are not readable: clear and retype them");
  const job = parsedJob.success ? parsedJob.data : njJobSchema.parse({});

  const wh = computeCertifiedPayroll(payroll);
  // The federal form's checks still apply, except its statement reminders (the MW-562 has its own
  // certification) and the full-SSN check (the MW-562 has no ID number column, so none is printed).
  for (const i of wh.issues) if (i.code !== "full-ssn" && i.where !== "Statement") issues.push(i);

  if (!job.fein) warn("MW-562", "Enter the business's FEIN (the form asks for it)");
  if (!job.registrationNo) {
    warn("MW-562", "Enter your New Jersey public works contractor registration number");
  }
  if (job.eSign && !payroll.certifierName) {
    err("MW-562", "Enter the certifier's name (in the WH-347 statement) to sign electronically");
  }

  const days = weekDays(payroll.weekEnding);
  // Column of each day: the form's SU..SA, by the day's weekday.
  const col = days.map((d) => (parseIso(d.iso) as Date).getUTCDay());

  const plans = payroll.fringePlans;
  const planType = plans.map(
    (p, k) => job.planTypes[k] ?? guessNjBenefitType(`${p.type} ${p.name}`),
  );

  const workers = payroll.workers.map((w, wi) => {
    const parsed = njWorkerSchema.safeParse(workersInput[wi] ?? {});
    const where = `Worker ${wi + 1} (${w.lastName})`;
    if (!parsed.success)
      err(where, "The New Jersey details are not readable: clear and retype them");
    const nj = parsed.success ? parsed.data : njWorkerSchema.parse({});
    if (nj.stateTaxCents > w.taxCents) {
      err(where, "State tax is part of the WH-347 withholding tax, so it cannot be more than it");
    }
    if (nj.njContribCents > w.otherCents) {
      err(where, 'UI/DI/FLI is part of the WH-347 "other" deduction, so it cannot be more than it');
    }
    if (!nj.sex || !nj.race || !nj.ethnicity) {
      warn(
        where,
        "Sex, race and ethnicity are blank: the MW-562 asks for each worker's (column 3)",
      );
    }
    if (!nj.address) warn(where, "Enter the worker's address (column 1 is name and address)");
    return nj;
  });

  // --- page 1 rows ---
  type Row = Record<string, string | string[]>;
  const rowValues: Row[] = [];
  for (const r of wh.rows) {
    const wi = wh.workers.findIndex((cw) => cw.entryNo === r.entryNo);
    const cw = wh.workers[wi];
    const nj = workers[wi] ?? njWorkerSchema.parse({});
    if (!cw) continue;
    const w = r.worker;
    const name = `${w.lastName}, ${w.firstName}${w.middleInitial ? ` ${w.middleInitial}` : ""}`;
    const v: Row = {};
    v.employee = nj.address ? `${name}\n${nj.address}` : name;
    v.jobTitle =
      r.row.status === "RA"
        ? `Apprentice${r.row.apprenticeLevel ? `, ${r.row.apprenticeLevel}` : ""}`
        : "Journeyman";
    v.workCategory = r.row.classification;
    v.sex = nj.sex;
    v.race = nj.race;
    v.ethnicity = nj.ethnicity;
    const st = ["", "", "", "", "", "", ""];
    const ot = ["", "", "", "", "", "", ""];
    r.row.st.forEach((h, i) => {
      const c = col[i];
      if (c !== undefined && h) st[c] = formatHours(h);
    });
    r.row.ot.forEach((h, i) => {
      const c = col[i];
      if (c !== undefined && h) ot[c] = formatHours(h);
    });
    v.st = st;
    v.ot = ot;
    v.stTotal = formatHours(r.stTotal);
    v.stRate = njMoney(r.row.stRateCents);
    v.otTotal = blankIfZero(formatHours(r.otTotal), r.otTotal);
    v.otRate = r.otTotal || r.row.otRateCents ? njMoney(r.row.otRateCents) : "";
    v.grossProject = njMoney(r.grossProjectCents);
    if (r.first) {
      const fed = w.taxCents - Math.min(nj.stateTaxCents, w.taxCents);
      const contrib = Math.min(nj.njContribCents, w.otherCents);
      v.grossWeek = njMoney(cw.grossAllWorkCents);
      v.fica = njMoney(w.ficaCents);
      v.withholding = njMoney(fed);
      v.stateTax = njMoney(Math.min(nj.stateTaxCents, w.taxCents));
      v.other1 = njMoney(w.otherCents - contrib);
      v.other2 = njMoney(contrib);
      v.totalDeductions = njMoney(cw.totalDeductionsCents);
      v.net = njMoney(cw.netCents);
    }
    v.totalFringe = njMoney(cw.hourlyFringeCreditCents + r.row.cashInLieuHourlyCents);
    rowValues.push(v);
  }

  // --- page 2: 4(c), the benefit programs per hour, one row per classification and credit set ---
  const groups = new Map<string, { label: string; credits: number[]; names: string[] }>();
  for (const r of wh.rows) {
    const credits = plans.map((_, k) => r.worker.fringeCreditsCents[k] ?? 0);
    if (!credits.some((c) => c > 0)) continue;
    const key = `${r.row.classification}\u0000${credits.join(",")}`;
    const g = groups.get(key) ?? { label: r.row.classification, credits, names: [] };
    if (!g.names.includes(r.worker.lastName)) g.names.push(r.worker.lastName);
    groups.set(key, g);
  }
  const byClass = new Map<string, number>();
  for (const g of groups.values()) byClass.set(g.label, (byClass.get(g.label) ?? 0) + 1);
  const programs = [...groups.values()].map((g) => ({
    ...g,
    label: (byClass.get(g.label) ?? 0) > 1 ? `${g.label}: ${g.names.join(", ")}` : g.label,
  }));
  if (programs.length > MW562_PROGRAM_ROWS) {
    err(
      "MW-562",
      `Section 4(c) has room for ${MW562_PROGRAM_ROWS} benefit rows and this week needs ${programs.length}: attach the rest on a separate sheet`,
    );
  }
  const page2: Mw562Values = {
    [MW562_PAGE2.contractorName]: payroll.businessName,
    [MW562_PAGE2.projectName]: payroll.projectName,
    [MW562_PAGE2.projectLocation]: payroll.projectLocation,
    [MW562_PAGE2.startDate]: njDate(days[0]?.iso ?? "", "mm/dd/yy"),
    [MW562_PAGE2.endDate]: njDate(payroll.weekEnding, "mm/dd/yy"),
    [MW562_PAGE2.fringePlans]: wh.rows.some((r) => r.fringeCreditCents > 0),
    [MW562_PAGE2.fringeCash]: wh.rows.some((r) => r.cashInLieuCents > 0),
    [MW562_PAGE2.eSign]: job.eSign && !!payroll.certifierName,
    [MW562_PAGE2.name]: payroll.certifierName,
    [MW562_PAGE2.title]: payroll.certifierTitle,
    [MW562_PAGE2.signDate]: njDate(job.signDate, "mm/dd/yy"),
  };
  for (let k = 0; k < MW562_PROGRAM_ROWS; k++) {
    const f = mw562ProgramRow(k);
    const g = programs[k];
    const sumOf = (t: NjBenefitType) =>
      g ? g.credits.reduce((s, c, i) => s + (planType[i] === t ? c : 0), 0) : 0;
    const otherPlans = g
      ? plans.filter((_, i) => planType[i] === "other" && (g.credits[i] ?? 0) > 0)
      : [];
    const used = g ? plans.filter((_, i) => (g.credits[i] ?? 0) > 0) : [];
    page2[f.program] = g?.label ?? "";
    page2[f.health] = g ? blankIfZero(njMoney(sumOf("health")), sumOf("health")) : "";
    page2[f.vacation] = g ? blankIfZero(njMoney(sumOf("vacation")), sumOf("vacation")) : "";
    page2[f.training] = g ? blankIfZero(njMoney(sumOf("training")), sumOf("training")) : "";
    page2[f.pension] = g ? blankIfZero(njMoney(sumOf("pension")), sumOf("pension")) : "";
    page2[f.otherType] = otherPlans.map((p) => p.type || p.name).join("; ");
    page2[f.otherAmount] = g ? blankIfZero(njMoney(sumOf("other")), sumOf("other")) : "";
    page2[f.administrator] = used.map((p) => p.name).join("; ");
    page2[f.filingNo] = used
      .map((p) => p.planNo)
      .filter(Boolean)
      .join("; ");
    page2[f.trustee] = "";
  }

  // --- sheets ---
  const count = Math.max(1, Math.ceil(rowValues.length / MW562_ROWS_PER_SHEET));
  const sheets: Mw562Values[] = [];
  for (let s = 0; s < count; s++) {
    const v: Mw562Values = {
      [MW562_HEADER.contractor]: payroll.role === "prime",
      [MW562_HEADER.subcontractor]: payroll.role === "sub",
      [MW562_HEADER.contractorName]: payroll.businessName,
      [MW562_HEADER.fein]: job.fein,
      [MW562_HEADER.businessAddress]: payroll.businessAddress,
      [MW562_HEADER.projectLocation]: payroll.projectLocation,
      [MW562_HEADER.projectName]: payroll.projectName,
      [MW562_HEADER.projectId]: payroll.projectNumber,
      [MW562_HEADER.registration]: job.registrationNo,
      [MW562_HEADER.payrollNo]: payroll.payrollNo,
      [MW562_HEADER.datePaid]: njDate(job.datePaid, "mm/dd/yyyy"),
      [MW562_HEADER.weekEnd]: njDate(payroll.weekEnding, "mm/dd/yyyy"),
      [MW562_HEADER.final]: payroll.final,
      [MW562_HEADER.noWorkWeek]: rowValues.length === 0,
      [MW562_HEADER.additionalSheets]: count > 1,
      [MW562_HEADER.otherLabel1]: "Other",
      [MW562_HEADER.otherLabel2]: "UI/DI/FLI",
      ...page2,
    };
    days.forEach((d, i) => {
      const c = col[i];
      if (c !== undefined) v[MW562_DATES[c] as string] = njDate(d.iso, "m/d");
    });
    for (const name of MW562_DATES) if (!(name in v)) v[name] = "";
    for (let k = 0; k < MW562_ROWS_PER_SHEET; k++) {
      const f = MW562_ROWS[k] as (typeof MW562_ROWS)[number];
      const r = rowValues[s * MW562_ROWS_PER_SHEET + k] ?? {};
      for (const [key, name] of Object.entries(f)) {
        const got = r[key];
        if (Array.isArray(name)) {
          name.forEach((n: string, i: number) => {
            v[n] = Array.isArray(got) ? (got[i] ?? "") : "";
          });
        } else {
          v[name as string] = typeof got === "string" ? got : "";
        }
      }
    }
    sheets.push(v);
  }
  if (count > 1) {
    warn(
      "MW-562",
      `${rowValues.length} rows make ${count} MW-562 sheets: NJDOL suggests its CSV upload for more than ten employees`,
    );
  }
  return { sheets, issues, rows: rowValues.length, programRows: programs.length };
}

/** "mw-562-3-2026-11-21.pdf", or "...-sheet-2-of-3.pdf". */
export function mw562FileName(payrollNo: string, weekEnding: string, sheet = 1, of = 1): string {
  const no = payrollNo.replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 20) || "x";
  return `mw-562-${no}-${weekEnding}${of > 1 ? `-sheet-${sheet}-of-${of}` : ""}.pdf`;
}

/** Next week's New Jersey extras: the same address and demographics; the deduction split cleared. */
export function njNextWeek(w: NjWorkerInput): NjWorkerInput {
  return { ...w, stateTaxCents: 0, njContribCents: 0 };
}

export const NJ_MW562_NOTICE =
  "Filled by PayApps into your copy of NJDOL's form MW-562 (2/25). Not a New Jersey Department of Labor product and not legal advice. The Wage Hub fills its steps 1 to 4 from the file and lists what it finds invalid or missing: check every figure there against your payroll records and the project's wage determination before you submit, and send the public body its copy as NJDOL asks.";
