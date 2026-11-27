// California public works: the weekly certified payroll as the DIR eCPR XML file (schema version
// 2.0) that a contractor uploads to the Department of Industrial Relations' Public Works portal
// (Labor Code § 1776; § 1771.4 makes the electronic submission the rule for public works). Pure: it
// runs in the browser, so workers' full Social Security numbers and home addresses, which the file
// must carry, never reach our server.
//
// Sources, all read 2026-11-26 from www.dir.ca.gov/Public-Works/Certified-Payroll-Reporting.html:
// the XSD (Public-Works/CPR/eCPR-v2.xsd), the commented blank file (CPR/V2-Blank-XML-Schema.xml), the
// sample (CPR/V2-eCPR-Sample-Schema.xml), "eCPR XML Guidelines V2" and the V2 FAQ (V1 files are
// accepted until 13 January 2027). Every limit below is the XSD's or the blank file's comment.
//
// It starts from the WH-347 payroll the page already holds (src/shared/certified-payroll.ts) and adds
// what DIR asks for and the federal form does not: the contractor's PWCR (10 digits) and DIR project
// ID, each worker's home address, full SSN or ITIN and check number, the craft per classification,
// the apprentice period (1-10), doubletime hours and rate, travel and subsistence, and the deductions
// split into DIR's categories. The split never changes a total: state income tax comes out of the
// WH-347 "withholding tax", and SDI, fund administration, savings and dues out of its "other", so
// the PDF and the XML show the same deductions and the same net pay.
//
// Fringe: DIR wants hourly amounts in five categories. Each fringe plan's hourly credit goes to the
// category the plan is mapped to (guessed from its type and name, changeable on the page); cash paid
// in lieu of fringe goes to "other" with paidToEmployee true, since DIR has no cash category.
//
// DIR does not recompute the "source of truth" fields (the total hourly rates, total deductions,
// gross for this project, gross for all work, net); this file computes each from the same inputs as
// the PDF. Passing the XSD does not make a payroll correct (the FAQ says so), and nothing here decides
// prevailing-wage compliance.

import { z } from "zod";
import {
  type CertifiedPayroll,
  computeCertifiedPayroll,
  type Issue,
  payFor,
  weekDays,
} from "./certified-payroll";

export const ECPR_NAMESPACE = "https://www.dir.ca.gov/Public-Works/CPR/eCPR-v2.xsd";
export const ECPR_VERSION = "2.0";
export const ECPR_MAX_EMPLOYEES = 500;
/** The earliest week DIR accepts: the week starting 2010-01-01. */
export const ECPR_EARLIEST_WEEK_ENDING = "2010-01-07";

export const ECPR_FRINGE_CATEGORIES = [
  "healthWelfare",
  "vacationHoliday",
  "pension",
  "training",
  "other",
] as const;
export type EcprFringeCategory = (typeof ECPR_FRINGE_CATEGORIES)[number];
export const ECPR_FRINGE_LABELS: Record<EcprFringeCategory, string> = {
  healthWelfare: "Health and welfare",
  vacationHoliday: "Vacation and holiday",
  pension: "Pension",
  training: "Training",
  other: "Other",
};

/** Lengths are checked in buildEcpr and reported, so a long value never throws. */
const text = (_max: number) => z.string().trim();
const cents = z.number().int().min(0).max(100_000_000);
const dayHours = z.number().int().min(0).max(2400);

export const ecprRowSchema = z.object({
  /** DIR's craft for this classification ("Laborer", "Electrician"): required by the file. */
  craft: text(100).default(""),
  /** The apprenticeship period, 1 to 10; null = read the first number in the WH-347 level text. */
  apprenticePeriod: z.number().int().min(1).max(10).nullable().default(null),
  dt: z.array(dayHours).length(7).default([0, 0, 0, 0, 0, 0, 0]),
  dtRateCents: z.number().int().min(0).max(1_000_000).default(0),
});

export const ecprWorkerSchema = z.object({
  middleName: text(56).default(""),
  street: text(100).default(""),
  city: text(250).default(""),
  state: text(2).default(""),
  zip: text(10).default(""),
  /** Check or transaction number, or "CASH". */
  checkNum: text(20).default(""),
  travelSubsCents: cents.default(0),
  /** Part of the WH-347 withholding tax that is California income tax (the rest is federal). */
  stateTaxCents: cents.default(0),
  /** Parts of the WH-347 "other" deduction; what is left of it is reported as other. */
  sdiCents: cents.default(0),
  fundAdminCents: cents.default(0),
  savingsCents: cents.default(0),
  duesCents: cents.default(0),
  notes: text(256).default(""),
  /** In the order of the worker's WH-347 rows. */
  rows: z.array(ecprRowSchema).default([]),
});

export const ecprJobSchema = z.object({
  /** Public Works Contractor Registration number, 10 digits. */
  pwcr: z.string().trim().default(""),
  /** The project's ID in DIR's Public Works portal. */
  projectId: z.string().trim().default(""),
  awardingBody: text(56).default(""),
  /** No work this week: the file says so and carries no employees. */
  nonPerformance: z.boolean().default(false),
  /** Report a classification with no fringe recorded as fringe paid to the worker (in the wage). */
  noFringeIsPaidToEmployee: z.boolean().default(false),
  /** The DIR category of each fringe plan, in the order of the WH-347 plans; null = guessed. */
  planCategories: z.array(z.enum(ECPR_FRINGE_CATEGORIES).nullable()).max(6).default([]),
});

export type EcprRowInput = z.input<typeof ecprRowSchema>;
export type EcprWorkerInput = z.input<typeof ecprWorkerSchema>;
export type EcprJobInput = z.input<typeof ecprJobSchema>;
export type EcprRow = z.output<typeof ecprRowSchema>;
export type EcprWorker = z.output<typeof ecprWorkerSchema>;
export type EcprJob = z.output<typeof ecprJobSchema>;

/** Kept apart from everything saved in the browser: the page holds these in memory only. */
export interface EcprId {
  ssn: string;
  itin: string;
}

/** A plan's DIR category from its type or name ("Health", "Pension Trust", "Apprenticeship fund"). */
export function guessFringeCategory(typeOrName: string): EcprFringeCategory {
  const s = typeOrName.toLowerCase();
  if (/health|welfare|medical|dental|vision|insurance/.test(s)) return "healthWelfare";
  if (/vacation|holiday/.test(s)) return "vacationHoliday";
  if (/pension|retire|401|annuit/.test(s)) return "pension";
  if (/train|apprentic|education/.test(s)) return "training";
  return "other";
}

/** "2nd period, 60%" -> 2; "" or "Year 12" -> null. */
export function periodFromLevel(level: string): number | null {
  const m = /\d+/.exec(level);
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 1 && n <= 10 ? n : null;
}

/** "123-45-6789" -> "123456789"; anything else is returned trimmed for the check to refuse. */
export function normalizeTaxId(id: string): string {
  const t = id.trim();
  return /^\d{3}[- ]?\d{2}[- ]?\d{4}$/.test(t) ? t.replace(/[- ]/g, "") : t;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Cents, or hundredths of an hour, as the file's two-decimal number: 850 -> "8.50". */
export function dec2(hundredths: number): string {
  const sign = hundredths < 0 ? "-" : "";
  const a = Math.abs(hundredths);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const ZEROS = [0, 0, 0, 0, 0, 0, 0];

export interface EcprClassification {
  name: string;
  craft: string;
  level: "journeyman" | "apprentice";
  period: number | null;
  st: number[];
  ot: number[];
  dt: number[];
  paidToEmployee: boolean;
  paidToBenefitPlan: boolean;
  /** Hourly cents per DIR category. */
  fringe: Record<EcprFringeCategory, number>;
  stRateCents: number;
  otRateCents: number;
  dtRateCents: number;
}

export interface EcprEmployee {
  firstName: string;
  lastName: string;
  middleName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  ssn: string;
  itin: string;
  notes: string;
  classifications: EcprClassification[];
  travelSubsCents: number;
  deductions: {
    fedTax: number;
    FICA: number;
    stateTax: number;
    SDI: number;
    fundAdmin: number;
    savings: number;
    dues: number;
    other: number;
  };
  totalDeductionsCents: number;
  grossThisProjectCents: number;
  grossAllWorkCents: number;
  netCents: number;
  checkNum: string;
}

export interface EcprResult {
  employees: EcprEmployee[];
  issues: Issue[];
  /** The file, or null while there are errors. */
  xml: string | null;
  nonPerformance: boolean;
}

/**
 * The eCPR for one week. `workers` and `ids` follow `payroll.workers` by position (missing entries
 * are blank). Errors are what DIR's upload rejects or what would make a source-of-truth field wrong;
 * warnings point at things to look at.
 */
export function buildEcpr(
  payroll: CertifiedPayroll,
  jobInput: EcprJobInput,
  workersInput: readonly (EcprWorkerInput | undefined)[],
  ids: readonly (EcprId | undefined)[],
): EcprResult {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", where, message });
  const parsedJob = ecprJobSchema.safeParse(jobInput);
  if (!parsedJob.success)
    err("DIR", "The California details are not readable: clear and retype them");
  const job = parsedJob.success ? parsedJob.data : ecprJobSchema.parse({});
  const tooLong = (where: string, label: string, value: string, max: number) => {
    if (value.length > max) err(where, `DIR allows ${max} characters for the ${label}`);
  };
  tooLong("DIR", "awarding body", job.awardingBody, 56);
  const warn = (where: string, message: string) =>
    issues.push({ level: "warning", where, message });

  const wh = computeCertifiedPayroll(payroll);
  // The federal form's own checks still apply (hours over 24, deductions over gross...), except
  // the one against a full SSN in "ID no.": that field is not used here, and DIR needs the number.
  for (const i of wh.issues) if (i.code !== "full-ssn" && i.where !== "Statement") issues.push(i);

  const pwcr = job.pwcr.replace(/\s+/g, "");
  if (!/^\d{10}$/.test(pwcr)) {
    err("DIR", "Enter the contractor's PWCR: exactly 10 digits, as registered with DIR");
  }
  const projectId = job.projectId.replace(/\s+/g, "");
  if (!/^\d{1,18}$/.test(projectId)) {
    err("DIR", "Enter the project's DIR project ID (digits only, from the Public Works portal)");
  }
  const contractorName = payroll.businessName.trim();
  if (contractorName.length > 56) {
    err("DIR", "DIR allows 56 characters for the contractor's name: shorten the business name");
  }
  const days = weekDays(payroll.weekEnding);
  if (days.length && payroll.weekEnding < ECPR_EARLIEST_WEEK_ENDING) {
    err("Week", `DIR accepts weeks ending ${ECPR_EARLIEST_WEEK_ENDING} or later`);
  }

  const totalHours = wh.totals.hours;
  const employees: EcprEmployee[] = [];
  const plans = payroll.fringePlans;
  const planCategory = plans.map(
    (p, k) => job.planCategories[k] ?? guessFringeCategory(`${p.type} ${p.name}`),
  );

  if (!job.nonPerformance) {
    if (payroll.workers.length > ECPR_MAX_EMPLOYEES) {
      err("Workers", `DIR takes at most ${ECPR_MAX_EMPLOYEES} employees per file`);
    }
    const seenSsn = new Map<string, number>();
    payroll.workers.forEach((w, wi) => {
      const who = `Worker ${wi + 1} (${w.lastName})`;
      const parsedCa = ecprWorkerSchema.safeParse(workersInput[wi] ?? {});
      if (!parsedCa.success) err(who, "The California details are not readable: retype them");
      const ca = parsedCa.success ? parsedCa.data : ecprWorkerSchema.parse({});
      tooLong(who, "middle name", ca.middleName, 56);
      tooLong(who, "street", ca.street, 100);
      tooLong(who, "city", ca.city, 250);
      tooLong(who, "check number", ca.checkNum, 20);
      tooLong(who, "notes", ca.notes, 256);
      const id = ids[wi] ?? { ssn: "", itin: "" };
      const cw = wh.workers[wi];
      if (w.firstName.length > 56 || w.lastName.length > 56) {
        err(who, "DIR allows 56 characters for a first or last name");
      }
      if (!ca.street) err(who, "Enter the worker's street address");
      if (!ca.city) err(who, "Enter the worker's city");
      const state = ca.state.toUpperCase();
      if (!/^[A-Z]{2}$/.test(state)) err(who, "Enter the worker's state as two letters (CA)");
      if (!/^\d{5}(-\d{4})?$/.test(ca.zip)) err(who, "Enter the ZIP code as 12345 or 12345-6789");
      const ssn = normalizeTaxId(id.ssn);
      const itin = normalizeTaxId(id.itin);
      if (ssn && !/^\d{9}$/.test(ssn)) err(who, "The SSN must be 9 digits");
      if (itin && !/^\d{9}$/.test(itin)) err(who, "The ITIN must be 9 digits");
      if (!ssn && !itin) err(who, "Enter the worker's SSN, or the ITIN of a worker with no SSN");
      if (/^\d{9}$/.test(ssn)) {
        const prev = seenSsn.get(ssn);
        if (prev !== undefined) {
          err(who, `Same SSN as worker ${prev + 1}: DIR rejects every employee sharing one`);
        } else seenSsn.set(ssn, wi);
        if (ssn.startsWith("9")) {
          warn(who, "An SSN never starts with 9: if this is an ITIN, enter it as the ITIN");
        }
      }
      if (/^\d{9}$/.test(itin) && !ssn && !itin.startsWith("9")) {
        warn(who, "An ITIN starts with 9: check whether this is the worker's SSN");
      }
      if (!ca.checkNum) err(who, 'Enter the check or transaction number, or "CASH"');

      const hourlyFringe = cw?.hourlyFringeCreditCents ?? 0;
      const planFringe: Record<EcprFringeCategory, number> = {
        healthWelfare: 0,
        vacationHoliday: 0,
        pension: 0,
        training: 0,
        other: 0,
      };
      w.fringeCreditsCents.slice(0, plans.length).forEach((c, k) => {
        const cat = planCategory[k] ?? "other";
        planFringe[cat] += c;
      });

      let dtPayComputed = 0;
      const daily = [...ZEROS];
      const classifications: EcprClassification[] = w.rows.map((r, ri) => {
        const where = w.rows.length > 1 ? `${who}, row ${ri + 1}` : who;
        const parsedRow = ecprRowSchema.safeParse(ca.rows[ri] ?? {});
        if (!parsedRow.success)
          err(where, "The doubletime or craft entry is not readable: retype it");
        const cr = parsedRow.success ? parsedRow.data : ecprRowSchema.parse({});
        const craft = cr.craft;
        tooLong(where, "craft", craft, 100);
        if (!craft) err(where, "Enter the craft for this classification (DIR requires it)");
        const level = r.status === "RA" ? "apprentice" : "journeyman";
        const period =
          level === "apprentice"
            ? (cr.apprenticePeriod ?? periodFromLevel(r.apprenticeLevel))
            : null;
        if (level === "apprentice" && period === null) {
          err(where, "Enter the apprentice's period, a whole number from 1 to 10");
        }
        const dtTotal = sum(cr.dt);
        if (dtTotal > 0 && cr.dtRateCents === 0) err(where, "Enter the doubletime rate paid");
        if (dtTotal > 0 && cr.dtRateCents > 0 && cr.dtRateCents < r.stRateCents * 2) {
          warn(where, "The doubletime rate is under twice the straight-time rate");
        }
        if (r.grossProjectCents === null) dtPayComputed += payFor(dtTotal, cr.dtRateCents);
        for (let d = 0; d < 7; d++) {
          daily[d] = (daily[d] ?? 0) + (r.st[d] ?? 0) + (r.ot[d] ?? 0) + (cr.dt[d] ?? 0);
        }
        const fringe = { ...planFringe, other: planFringe.other + r.cashInLieuHourlyCents };
        const paidToEmployee =
          r.cashInLieuHourlyCents > 0 || (hourlyFringe === 0 && job.noFringeIsPaidToEmployee);
        const paidToBenefitPlan = hourlyFringe > 0;
        if (!paidToEmployee && !paidToBenefitPlan) {
          err(
            where,
            'No fringe is recorded. DIR needs fringe paid to the worker or to a plan: enter the plan credit or cash in lieu, or, if the whole rate is paid as wages, tick "no fringe recorded means paid to the worker".',
          );
        }
        for (const [label, c] of [
          ["straight-time", r.stRateCents],
          ["overtime", r.otRateCents],
          ["doubletime", cr.dtRateCents],
        ] as const) {
          if (c >= 1_000_000) err(where, `DIR allows ${label} rates under $10,000`);
          else if (c + sum(Object.values(fringe)) >= 1_000_000) {
            err(where, `The total ${label} rate with fringe must be under $10,000`);
          }
        }
        return {
          name: r.classification,
          craft,
          level,
          period,
          st: r.st,
          ot: r.ot,
          dt: cr.dt,
          paidToEmployee,
          paidToBenefitPlan,
          fringe,
          stRateCents: r.stRateCents,
          otRateCents: r.otRateCents,
          dtRateCents: cr.dtRateCents,
        };
      });
      daily.forEach((h, d) => {
        if (h > 2400) {
          err(who, `More than 24 hours with doubletime on ${days[d]?.label ?? `day ${d + 1}`}`);
        }
      });

      const otherSplit = ca.sdiCents + ca.fundAdminCents + ca.savingsCents + ca.duesCents;
      if (ca.stateTaxCents > w.taxCents) {
        err(
          who,
          "State income tax is more than the withholding tax entered above (it is part of it)",
        );
      }
      if (otherSplit > w.otherCents) {
        err(
          who,
          "SDI, fund administration, savings and dues add up to more than the other deductions entered above (they are part of them)",
        );
      }
      const deductions = {
        fedTax: Math.max(0, w.taxCents - ca.stateTaxCents),
        FICA: w.ficaCents,
        stateTax: ca.stateTaxCents,
        SDI: ca.sdiCents,
        fundAdmin: ca.fundAdminCents,
        savings: ca.savingsCents,
        dues: ca.duesCents,
        other: Math.max(0, w.otherCents - otherSplit),
      };
      const totalDeductions = sum(Object.values(deductions));
      const grossThisProject = (cw?.grossProjectCents ?? 0) + dtPayComputed;
      const grossAll = w.grossAllWorkCents ?? grossThisProject;
      if (grossAll < grossThisProject) {
        err(who, "Gross for all work is less than gross for this project with doubletime");
      }
      if (totalDeductions > grossAll) err(who, "Deductions are more than gross pay");
      if (dtPayComputed > 0) {
        warn(
          who,
          "Doubletime pay is added to gross for this file only: the WH-347 has no doubletime column, so its PDF shows gross without it.",
        );
      }
      employees.push({
        firstName: w.firstName,
        lastName: w.lastName,
        middleName: ca.middleName || w.middleInitial,
        street: ca.street,
        city: ca.city,
        state,
        zip: ca.zip,
        ssn: /^\d{9}$/.test(ssn) ? ssn : "",
        itin: /^\d{9}$/.test(itin) && !/^\d{9}$/.test(ssn) ? itin : "",
        notes: ca.notes.replace(/<[^>]*>/g, ""),
        classifications,
        travelSubsCents: ca.travelSubsCents,
        deductions,
        totalDeductionsCents: totalDeductions,
        grossThisProjectCents: grossThisProject,
        grossAllWorkCents: grossAll,
        netCents: grossAll - totalDeductions,
        checkNum: ca.checkNum,
      });
    });
    const dtHours = sum(
      payroll.workers.flatMap((_, wi) =>
        (workersInput[wi]?.rows ?? []).map((r) => sum(r?.dt ?? [])),
      ),
    );
    if (totalHours + dtHours === 0) {
      err(
        "Workers",
        'No hours this week: enter the hours, or tick "no work this week" to file a statement of non-performance',
      );
    }
  } else if (totalHours > 0) {
    warn(
      "Workers",
      "A statement of non-performance carries no employees: the hours entered are left out of the file",
    );
  }

  const seen = new Set<string>();
  const unique = issues.filter((i) => {
    const k = `${i.level}|${i.where}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const hasErr = unique.some((i) => i.level === "error");
  return {
    employees,
    issues: unique,
    nonPerformance: job.nonPerformance,
    xml: hasErr
      ? null
      : ecprXml({
          contractorName,
          pwcr,
          awardingBody: job.awardingBody,
          projectId,
          nonPerformance: job.nonPerformance,
          weekEnding: payroll.weekEnding,
          days: days.map((d) => d.iso),
          employees,
        }),
  };
}

/** The file itself, elements in the XSD's order, two-space indented like DIR's sample. */
export function ecprXml(f: {
  contractorName: string;
  pwcr: string;
  awardingBody: string;
  projectId: string;
  nonPerformance: boolean;
  weekEnding: string;
  days: string[];
  employees: EcprEmployee[];
}): string {
  const out: string[] = [];
  let depth = 0;
  const pad = () => "  ".repeat(depth);
  const leaf = (tag: string, value: string) =>
    out.push(`${pad()}<CPR:${tag}>${xmlEscape(value)}</CPR:${tag}>`);
  const open = (tag: string, attrs = "") => {
    out.push(`${pad()}<CPR:${tag}${attrs}>`);
    depth++;
  };
  const close = (tag: string) => {
    depth--;
    out.push(`${pad()}</CPR:${tag}>`);
  };

  out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  open("eCPR", ` xmlns:CPR="${ECPR_NAMESPACE}"`);
  leaf("version", ECPR_VERSION);
  open("contractorInfo");
  leaf("contractorName", f.contractorName);
  leaf("contractorPWCR", f.pwcr);
  close("contractorInfo");
  open("projectInfo");
  leaf("awardingBody", f.awardingBody);
  leaf("projectID", f.projectId);
  close("projectInfo");
  open("payrollInfo");
  leaf("statementOfNP", f.nonPerformance ? "true" : "false");
  leaf("forWeekEnding", f.weekEnding);
  if (!f.nonPerformance) {
    open("employees");
    for (const e of f.employees) {
      open("employee");
      leaf("firstName", e.firstName);
      leaf("lastName", e.lastName);
      leaf("middleName", e.middleName);
      open("address");
      leaf("street", e.street);
      leaf("city", e.city);
      leaf("state", e.state);
      leaf("zip", e.zip);
      close("address");
      leaf("ssn", e.ssn);
      leaf("itin", e.itin);
      leaf("notes", e.notes);
      open("classifications");
      for (const c of e.classifications) {
        open("classification", ` name="${xmlEscape(c.name)}"`);
        leaf("craft", c.craft);
        leaf("employeeLevel", c.level);
        leaf("apprenticeLevel", c.period === null ? "" : String(c.period));
        open("hrsWorkedEachDay");
        f.days.forEach((iso, d) => {
          open("day", ` id="${d + 1}"`);
          leaf("date", iso);
          leaf("straightTime", dec2(c.st[d] ?? 0));
          leaf("overtime", dec2(c.ot[d] ?? 0));
          leaf("doubletime", dec2(c.dt[d] ?? 0));
          close("day");
        });
        close("hrsWorkedEachDay");
        open("fringePaid");
        leaf("paidToEmployee", String(c.paidToEmployee));
        leaf("paidToBenefitPlan", String(c.paidToBenefitPlan));
        close("fringePaid");
        open("fringe");
        for (const k of ECPR_FRINGE_CATEGORIES) leaf(k, dec2(c.fringe[k]));
        close("fringe");
        open("totHrs");
        leaf("totHrsStraightTime", dec2(sum(c.st)));
        leaf("totHrsOvertime", dec2(sum(c.ot)));
        leaf("totHrsDoubletime", dec2(sum(c.dt)));
        close("totHrs");
        const fringe = sum(ECPR_FRINGE_CATEGORIES.map((k) => c.fringe[k]));
        open("hrlyPayRate");
        leaf("hrlyPayRateStraightTime", dec2(c.stRateCents));
        leaf("hrlyPayRateOvertime", dec2(c.otRateCents));
        leaf("hrlyPayRateDoubletime", dec2(c.dtRateCents));
        leaf("totalHrlyPayRateStraightTime", dec2(c.stRateCents + fringe));
        leaf("totalHrlyPayRateOvertime", dec2(c.otRateCents + fringe));
        leaf("totalHrlyPayRateDoubletime", dec2(c.dtRateCents + fringe));
        close("hrlyPayRate");
        close("classification");
      }
      close("classifications");
      open("payments");
      leaf("travelSubs", dec2(e.travelSubsCents));
      close("payments");
      open("deductions");
      const d = e.deductions;
      leaf("fedTax", dec2(d.fedTax));
      leaf("FICA", dec2(d.FICA));
      leaf("stateTax", dec2(d.stateTax));
      leaf("SDI", dec2(d.SDI));
      leaf("fundAdmin", dec2(d.fundAdmin));
      leaf("savings", dec2(d.savings));
      leaf("dues", dec2(d.dues));
      leaf("other", dec2(d.other));
      leaf("totalDeductions", dec2(e.totalDeductionsCents));
      close("deductions");
      open("earnings");
      leaf("grossThisProject", dec2(e.grossThisProjectCents));
      leaf("grossAllWork", dec2(e.grossAllWorkCents));
      leaf("netWagePaidWeek", dec2(e.netCents));
      leaf("checkNum", e.checkNum);
      close("earnings");
      close("employee");
    }
    close("employees");
  }
  close("payrollInfo");
  close("eCPR");
  return `${out.join("\n")}\n`;
}

/** "ecpr-100004-2026-07-12.xml" (DIR has no naming rule beyond the .xml extension). */
export function ecprFileName(projectId: string, weekEnding: string): string {
  const id = projectId.replace(/\D+/g, "").slice(0, 18) || "project";
  return `ecpr-${id}-${weekEnding}.xml`;
}

/**
 * Next week's California extras: the same addresses, crafts, periods and rates; check numbers,
 * travel, the deduction split and doubletime hours cleared.
 */
export function ecprNextWeek(w: EcprWorkerInput): EcprWorkerInput {
  return {
    ...w,
    checkNum: "",
    travelSubsCents: 0,
    stateTaxCents: 0,
    sdiCents: 0,
    fundAdminCents: 0,
    savingsCents: 0,
    duesCents: 0,
    rows: (w.rows ?? []).map((r) => ({ ...r, dt: [...ZEROS] })),
  };
}

export const ECPR_NOTICE =
  "Prepared with PayApps in the California DIR eCPR XML format, schema version 2.0 (read from dir.ca.gov, November 2026). Not a Department of Industrial Relations product and not legal advice. Upload it as a draft first where the portal offers one, and check every figure against your payroll records: DIR stores the totals as you send them.";
