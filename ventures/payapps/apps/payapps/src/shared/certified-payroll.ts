// Davis-Bacon weekly certified payroll (pure): what a contractor or subcontractor on a Federal or
// federally assisted construction job reports each week (29 CFR 5.5(a)(3)(ii)), in the columns of
// the Department of Labor's optional Form WH-347 (Rev. January 2025, OMB 1235-0008, expires
// 01/31/2028). Runs in the browser (live totals and checks) and the Worker (the PDF).
//
// Source: the form itself (www.dol.gov/sites/dolgov/files/WHD/legacy/files/wh347.pdf) and DOL's
// instructions (www.dol.gov/agencies/whd/forms/wh347instr), both read 2026-11-26. The statement of
// compliance on page 2 is printed in the form's own words (STATEMENT_OF_COMPLIANCE below); DOL accepts
// "page 2 of the WH-347 or another document with identical wording".
//
// What is computed, never typed: the dates of the week (seven days ending on the week-ending date),
// column 5 (hours), 6B (the worker's total hourly fringe credit from page 2 times the row's hours),
// 6C (the row's hourly cash in lieu times its hours), the deduction total and column 9 (gross for all
// work minus deductions). Column 7A (gross for this project) is typed from the contractor's payroll,
// or, left blank, filled as ST hours x ST rate + OT hours x OT rate + 6C, which the screen says. 7B
// left blank is the worker's 7A (no other work that week).
//
// Nothing here decides compliance. The checks are arithmetic (a full Social Security number, hours
// over 24 in a day, deductions over gross) or point at things to look at (more than 40 hours in the
// week as straight time, an overtime rate under 1.5 times the straight rate, a rate under the wage
// determination's rate the contractor typed for that row, an unfunded plan, which needs DOL's prior
// approval under 29 CFR 5.28).
//
// Nothing is stored: the form is posted, the PDF comes back, and workers' names and numbers stay in
// the browser and the download.

import { z } from "zod";

/** Rows (worker x classification) per page 1 of the form; DOL numbers entry 9 as row 1 of page 2. */
export const ROWS_PER_PAGE = 8;
export const MAX_ROWS = 200;
/** The form's page 2 has room for three apprenticeship programs and six fringe benefit plans. */
export const MAX_APPRENTICESHIP_PROGRAMS = 3;
export const MAX_FRINGE_PLANS = 6;
/** Hours are hundredths of an hour (8.5 h = 850), money is cents. */
export const MAX_DAY_HUNDREDTHS = 2400;

export const FORM_REVISION = "Rev. January 2025, OMB No. 1235-0008, expires 01/31/2028";

const text = (max: number) => z.string().trim().max(max);
const cents = z.number().int().min(0).max(100_000_000);
const rateCents = z.number().int().min(0).max(1_000_000);
const dayHours = z.number().int().min(0).max(MAX_DAY_HUNDREDTHS);
const week = z.array(dayHours).length(7);

export const certifiedPayrollRowSchema = z.object({
  classification: text(120).min(1, "Enter the labor classification"),
  status: z.enum(["J", "RA"]),
  /** For a registered apprentice: the level of progression in the program (e.g. "2nd year, 60%"). */
  apprenticeLevel: text(60).default(""),
  st: week,
  ot: week,
  stRateCents: rateCents,
  otRateCents: rateCents,
  /** Cash paid in lieu of fringe benefits, per hour (column 6C is this times the row's hours). */
  cashInLieuHourlyCents: rateCents.default(0),
  /** Column 7A as the payroll shows it; null = hours x rates + 6C. */
  grossProjectCents: cents.nullable().default(null),
  /** The wage determination's rates for this classification, if typed: only used for a warning. */
  requiredBasicCents: rateCents.nullable().default(null),
  requiredFringeCents: rateCents.nullable().default(null),
});

export const certifiedPayrollWorkerSchema = z.object({
  lastName: text(60).min(1, "Enter the worker's last name"),
  firstName: text(60).min(1, "Enter the worker's first name"),
  middleInitial: text(2).default(""),
  /** Last four digits of the SSN or any number specific to the worker; never the full SSN. */
  idNo: text(20).default(""),
  rows: z.array(certifiedPayrollRowSchema).min(1).max(6),
  /** Column 7B; null = the worker's 7A (no other work that week). */
  grossAllWorkCents: cents.nullable().default(null),
  taxCents: cents.default(0),
  ficaCents: cents.default(0),
  otherCents: cents.default(0),
  /** What "other" is (printed under Additional Remarks). */
  otherNote: text(200).default(""),
  /** Hourly credit claimed under each fringe plan, in the order of `fringePlans`. */
  fringeCreditsCents: z.array(rateCents).max(MAX_FRINGE_PLANS).default([]),
});

export const certifiedPayrollSchema = z.object({
  final: z.boolean().default(false),
  role: z.enum(["prime", "sub"]).default("sub"),
  projectName: text(200).min(1, "Enter the project name"),
  projectNumber: text(120).default(""),
  payrollNo: text(20).min(1, "Enter the certified payroll number (1 for the first week)"),
  businessName: text(200).min(1, "Enter the business's legal name"),
  businessAddress: text(300).min(1, "Enter the business address"),
  projectLocation: text(300).min(1, "Enter the project's address, or its county and state"),
  wageDeterminations: text(300).min(1, "Enter the wage determination number(s) and revision"),
  weekEnding: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  workers: z.array(certifiedPayrollWorkerSchema).max(MAX_ROWS).default([]),
  apprenticeships: z
    .array(
      z.object({
        program: text(160).min(1),
        registeredWith: z.enum(["OA", "SAA"]),
        classification: text(120).default(""),
      }),
    )
    .max(MAX_APPRENTICESHIP_PROGRAMS, "The form has room for three programs: attach an addendum")
    .default([]),
  fringePlans: z
    .array(
      z.object({
        name: text(120).min(1),
        type: text(80).default(""),
        planNo: text(60).default(""),
        funded: z.boolean().default(true),
      }),
    )
    .max(MAX_FRINGE_PLANS, "The form has room for six plans: attach an addendum")
    .default([]),
  /** Statement box 5: fringe benefits paid in cash and/or to bona fide plans; null = when any is. */
  fringeBox: z.boolean().nullable().default(null),
  remarks: text(1500).default(""),
  certifierName: text(120).default(""),
  certifierTitle: text(120).default(""),
  certifierPhone: text(40).default(""),
  certifierEmail: text(200).default(""),
});

export type CertifiedPayrollInput = z.input<typeof certifiedPayrollSchema>;
export type CertifiedPayroll = z.output<typeof certifiedPayrollSchema>;
export type CertifiedPayrollWorker = z.output<typeof certifiedPayrollWorkerSchema>;
export type CertifiedPayrollRow = z.output<typeof certifiedPayrollRowSchema>;

export interface Issue {
  level: "error" | "warning";
  /** "Worker 2 (Lopez), row 1" or "Week" etc. */
  where: string;
  message: string;
  /** A stable tag for an issue another format treats differently ("full-ssn": the California eCPR needs the full number). */
  code?: string;
}

export interface ComputedRow {
  entryNo: number;
  worker: CertifiedPayrollWorker;
  row: CertifiedPayrollRow;
  /** First row of the worker: carries 7B, 8 and 9. */
  first: boolean;
  stTotal: number;
  otTotal: number;
  fringeCreditCents: number; // 6B
  cashInLieuCents: number; // 6C
  grossProjectCents: number; // 7A
  grossProjectComputed: boolean;
}

export interface ComputedWorker {
  entryNo: number;
  worker: CertifiedPayrollWorker;
  hourlyFringeCreditCents: number;
  grossProjectCents: number;
  grossAllWorkCents: number;
  totalDeductionsCents: number;
  netCents: number;
}

export interface ComputedPayroll {
  input: CertifiedPayroll;
  /** Seven days ending on the week-ending date: ISO dates, and the form's letters. */
  days: { iso: string; letter: string; label: string }[];
  rows: ComputedRow[];
  workers: ComputedWorker[];
  /** Statement boxes 1-6 as printed. */
  boxes: [boolean, boolean, boolean, boolean, boolean, boolean];
  totals: { hours: number; grossProjectCents: number; netCents: number };
  issues: Issue[];
}

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === iso ? d : null;
}

/** The seven days of the workweek ending on `weekEnding` (oldest first); [] for a bad date. */
export function weekDays(weekEnding: string): ComputedPayroll["days"] {
  const end = parseIso(weekEnding);
  if (!end) return [];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(end.getTime() - (6 - i) * 86_400_000);
    return {
      iso: d.toISOString().slice(0, 10),
      letter: LETTERS[d.getUTCDay()] as string,
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
    };
  });
}

/** hundredths of an hour x cents per hour, rounded half up to the cent. */
export function payFor(hundredths: number, rate: number): number {
  return Math.round((hundredths * rate) / 100);
}

/** 850 -> "8.5", 800 -> "8", 825 -> "8.25". */
export function formatHours(hundredths: number): string {
  const s = (hundredths / 100).toFixed(2);
  return s.replace(/\.?0+$/, "");
}

/** "8.5" -> 850; "" -> 0; null when not a number of hours with up to two decimals. */
export function parseHours(input: string): number | null {
  const s = input.trim();
  if (s === "") return 0;
  const m = /^(\d{1,2})(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** A full SSN: nine digits, with or without dashes or spaces. */
export function looksLikeFullSsn(id: string): boolean {
  return /^\d{3}[- ]?\d{2}[- ]?\d{4}$/.test(id.trim());
}

const dollars = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function computeCertifiedPayroll(input: CertifiedPayroll): ComputedPayroll {
  const issues: Issue[] = [];
  const days = weekDays(input.weekEnding);
  if (!days.length) {
    issues.push({ level: "error", where: "Week", message: "The week-ending date is not a date" });
  }
  const plans = input.fringePlans;
  const rows: ComputedRow[] = [];
  const workers: ComputedWorker[] = [];

  input.workers.forEach((w, wi) => {
    const entryNo = wi + 1;
    const who = `Worker ${entryNo} (${w.lastName})`;
    if (looksLikeFullSsn(w.idNo)) {
      issues.push({
        level: "error",
        code: "full-ssn",
        where: who,
        message:
          "The identifying number looks like a full Social Security number. DOL says full SSNs must not be included: use the last four digits or another number specific to the worker.",
      });
    }
    if (w.fringeCreditsCents.length > plans.length) {
      issues.push({
        level: "error",
        where: who,
        message: "Fringe credits are entered for more plans than are listed",
      });
    }
    const hourlyFringe = sum(w.fringeCreditsCents.slice(0, plans.length));
    if (w.fringeCreditsCents.some((c, i) => c > 0 && plans[i] && !plans[i].funded)) {
      issues.push({
        level: "warning",
        where: who,
        message:
          "A credit is claimed under an unfunded plan: 29 CFR 5.28 requires the Department of Labor's approval before that credit is taken.",
      });
    }

    let workerGross = 0;
    let workerSt = 0;
    const daily = [0, 0, 0, 0, 0, 0, 0];
    w.rows.forEach((r, ri) => {
      const where = w.rows.length > 1 ? `${who}, row ${ri + 1}` : who;
      const stTotal = sum(r.st);
      const otTotal = sum(r.ot);
      const hours = stTotal + otTotal;
      for (let d = 0; d < 7; d++) daily[d] = (daily[d] ?? 0) + (r.st[d] ?? 0) + (r.ot[d] ?? 0);
      workerSt += stTotal;
      const fringeCreditCents = payFor(hours, hourlyFringe);
      const cashInLieuCents = payFor(hours, r.cashInLieuHourlyCents);
      const byRates = payFor(stTotal, r.stRateCents) + payFor(otTotal, r.otRateCents);
      const computed = byRates + cashInLieuCents;
      const grossProjectCents = r.grossProjectCents ?? computed;
      workerGross += grossProjectCents;
      if (stTotal > 0 && r.stRateCents === 0) {
        issues.push({ level: "error", where, message: "Enter the straight-time rate paid" });
      }
      if (otTotal > 0 && r.otRateCents === 0) {
        issues.push({ level: "error", where, message: "Enter the overtime rate paid" });
      }
      if (otTotal > 0 && r.otRateCents > 0 && r.otRateCents * 2 < r.stRateCents * 3) {
        issues.push({
          level: "warning",
          where,
          message: `The overtime rate (${dollars(r.otRateCents)}) is under 1.5 times the straight-time rate (${dollars(r.stRateCents)}).`,
        });
      }
      if (r.grossProjectCents !== null && r.grossProjectCents < byRates) {
        issues.push({
          level: "warning",
          where,
          message: `Gross for this project (${dollars(r.grossProjectCents)}) is less than hours times rates (${dollars(byRates)}).`,
        });
      }
      if (r.status === "RA" && !r.apprenticeLevel) {
        issues.push({
          level: "warning",
          where,
          message:
            "For a registered apprentice, DOL asks for the level of progression in the program",
        });
      }
      if (r.requiredBasicCents !== null && r.stRateCents < r.requiredBasicCents && stTotal > 0) {
        issues.push({
          level: "warning",
          where,
          message: `The straight-time rate (${dollars(r.stRateCents)}) is under the wage determination's basic rate typed for this row (${dollars(r.requiredBasicCents)}).`,
        });
      }
      if (r.requiredFringeCents !== null && hours > 0) {
        const paid = hourlyFringe + r.cashInLieuHourlyCents;
        const basicOver = Math.max(0, r.stRateCents - (r.requiredBasicCents ?? r.stRateCents));
        if (paid + basicOver < r.requiredFringeCents) {
          issues.push({
            level: "warning",
            where,
            message: `Fringe credit and cash in lieu (${dollars(paid)} an hour) are under the wage determination's fringe typed for this row (${dollars(r.requiredFringeCents)}).`,
          });
        }
      }
      rows.push({
        entryNo,
        worker: w,
        row: r,
        first: ri === 0,
        stTotal,
        otTotal,
        fringeCreditCents,
        cashInLieuCents,
        grossProjectCents,
        grossProjectComputed: r.grossProjectCents === null,
      });
    });

    daily.forEach((h, d) => {
      if (h > MAX_DAY_HUNDREDTHS) {
        issues.push({
          level: "error",
          where: who,
          message: `More than 24 hours on ${days[d]?.label ?? `day ${d + 1}`}`,
        });
      }
    });
    if (workerSt > 4000) {
      issues.push({
        level: "warning",
        where: who,
        message: `${formatHours(workerSt)} straight-time hours in the week. On contracts under the Contract Work Hours and Safety Standards Act, hours over 40 in the week (on and off this job) are overtime.`,
      });
    }
    const grossAll = w.grossAllWorkCents ?? workerGross;
    if (grossAll < workerGross) {
      issues.push({
        level: "error",
        where: who,
        message: `Gross for all work (${dollars(grossAll)}) is less than gross for this project (${dollars(workerGross)}).`,
      });
    }
    const totalDeductions = w.taxCents + w.ficaCents + w.otherCents;
    if (totalDeductions > grossAll) {
      issues.push({ level: "error", where: who, message: "Deductions are more than gross pay" });
    }
    if (w.otherCents > 0 && !w.otherNote) {
      issues.push({
        level: "warning",
        where: who,
        message:
          "Say what the other deduction is (printed under Additional Remarks; several deductions need an itemized addendum).",
      });
    }
    workers.push({
      entryNo,
      worker: w,
      hourlyFringeCreditCents: hourlyFringe,
      grossProjectCents: workerGross,
      grossAllWorkCents: grossAll,
      totalDeductionsCents: totalDeductions,
      netCents: grossAll - totalDeductions,
    });
  });

  if (!input.workers.length) {
    issues.push({ level: "warning", where: "Workers", message: "No workers on this payroll" });
  }
  if (rows.length > MAX_ROWS) {
    issues.push({ level: "error", where: "Workers", message: `At most ${MAX_ROWS} rows` });
  }
  const anyApprentice = rows.some((r) => r.row.status === "RA");
  if (anyApprentice && !input.apprenticeships.length) {
    issues.push({
      level: "error",
      where: "Apprentices",
      message:
        "A worker is paid as a registered apprentice: list the apprenticeship program, OA or SAA, and the classification (statement box 4).",
    });
  }
  const anyCredit = workers.some((w) => w.hourlyFringeCreditCents > 0);
  const anyCash = rows.some((r) => r.cashInLieuCents > 0);
  if (plans.length && !anyCredit) {
    issues.push({
      level: "warning",
      where: "Fringe benefits",
      message: "Plans are listed but no worker has an hourly credit under them",
    });
  }
  if (!input.certifierName) {
    issues.push({
      level: "warning",
      where: "Statement",
      message: "Enter the certifying official's name and title (printed above the signature)",
    });
  }

  const boxes: ComputedPayroll["boxes"] = [
    true,
    true,
    true,
    anyApprentice,
    input.fringeBox ?? (anyCredit || anyCash),
    true,
  ];
  return {
    input,
    days,
    rows,
    workers,
    boxes,
    totals: {
      hours: sum(rows.map((r) => r.stTotal + r.otTotal)),
      grossProjectCents: sum(workers.map((w) => w.grossProjectCents)),
      netCents: sum(workers.map((w) => w.netCents)),
    },
    issues,
  };
}

export const hasErrors = (p: ComputedPayroll) => p.issues.some((i) => i.level === "error");

/** "certified-payroll-3-2026-11-21.pdf" */
export function certifiedPayrollFileName(p: CertifiedPayroll): string {
  const no = p.payrollNo.replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 20) || "x";
  return `certified-payroll-${no}-${p.weekEnding}.pdf`;
}

/**
 * The statement of compliance as printed on page 2 of Form WH-347 (Rev. January 2025), word for
 * word, box by box. Box 4 is followed by the apprenticeship table, box 5 by the fringe table.
 */
export const STATEMENT_INTRO =
  "I paid or supervised the payment of the laborers or mechanics working on the above project during the stated time period. I certify the following:";

export const STATEMENT_OF_COMPLIANCE = [
  "The payroll information submitted with this statement is correct and complete for the above project during the above period, and the wage and fringe benefit rates paid to the workers, including credit taken for the reasonably anticipated costs of a bona fide fringe benefit plan, fund or program, are not less than the applicable wage and fringe benefits rates for the classification(s) of work actually performed, as specified in the wage determination(s) incorporated into the contract.",
  "All regular payrolls and all other basic records that the contractor is required to maintain for this payroll period are complete and accurate and will be made available upon request from the agency or the Department of Labor.",
  "The classifications reported for each laborer or mechanic are the classification(s) of work that each worker actually performed.",
  "Any workers paid as apprentices during the above period are duly registered in a bona fide apprenticeship program registered with the Office of Apprenticeship, Employment and Training Administration, United States Department of Labor (“OA”), or a State Apprenticeship Agency (“SAA”) recognized by Department of Labor. I have verified the registered apprenticeship program information provided below as accurate and applicable to any apprentices identified on page 1 of this form.",
  "Fringe benefits have been paid in cash and/or to bona fide fringe benefit plans, funds, or programs. Where the contractor is claiming an hourly credit for their contributions to or reasonably anticipated costs of a bona fide fringe benefit plan, fund, or program, provide plan information and the hourly credit claimed for each worker listed on the previous page of this form.",
  "All workers on the project have been paid the full weekly wages earned, and no rebates or deductions have been or will be made either directly or indirectly, other than permissible deductions as defined in 29 CFR part 3.",
] as const;

export const FRINGE_TABLE_NOTE =
  "If an amount is listed in (6B) on the first page of this certified payroll form, enter the hourly credit claimed under each plan name, type and number for each worker and check whether the plan is funded or unfunded.";

export const FALSIFICATION_WARNING =
  "THE WILLFUL FALSIFICATION OF ANY OF THE ABOVE STATEMENTS MAY SUBJECT THE CONTRACTOR OR SUBCONTRACTOR TO CIVIL OR CRIMINAL PROSECUTION (SEE SECTION 1001 OF TITLE 18 AND SECTION 3729 OF TITLE 31 OF THE UNITED STATES CODE), AS WELL AS DEBARMENT FROM FUTURE FEDERAL AND FEDERALLY-ASSISTED CONTRACTS. INFORMATION REPORTED IN CERTIFIED PAYROLLS MAY BE SUBJECT TO DISCLOSURE IN RESPONSE TO A FREEDOM OF INFORMATION ACT REQUEST.";

export const CERTIFIED_PAYROLL_NOTICE =
  "Prepared with PayApps in the columns of Form WH-347 (Rev. January 2025), which DOL makes optional; the statement of compliance is the form's own wording. Not a Department of Labor product and not legal advice. Check every figure against your payroll records, and sign only what you know to be true.";
