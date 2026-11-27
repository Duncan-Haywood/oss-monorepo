// Washington public works: the weekly certified payroll as the XML file L&I's Prevailing Wage Intent
// and Affidavit (PWIA) system takes ("Submit Payroll in XML File"). Washington requires every
// contractor on a public works project to file certified payroll online with L&I at least once a
// month (RCW 39.12.120; L&I's XML Payroll Upload Guide). Pure: it runs in the browser, so a worker's
// full Social Security number, which this file must carry (RCW 39.12.120), never reaches our server.
//
// Sources, read 2026-11-27: L&I's XML schema (https://www.lni.wa.gov/licensing-permits/_docs/xmlschema.xsd,
// last modified 2020-06-23, the file L&I's guide and LCPtracker's WA guide point at), the XML Payroll
// Upload Guide (https://lni.wa.gov/licensing-permits/_docs/xml%20payroll%20guide.pdf, January 2020)
// and L&I's trade code list (src/shared/wa-codes.ts). Every limit below is the schema's or the guide's.
// The guide adds rules the schema does not hold: trade codes in capitals, the county in Title Case,
// the apprentice's state one of WA, OR, MT or AK, and the obsolete elements (WageID and the
// apprentice program IDs) left out.
//
// It starts from the WH-347 payroll the page already holds (src/shared/certified-payroll.ts) and adds
// what L&I asks for and the federal form does not: the project's Intent ID, each worker's full SSN
// and home address, a four-letter L&I trade and the county for each row, the apprentice's
// registration and step, and the fringe credits by L&I's benefit types. Totals never change: gross
// pay is the WH-347 gross for all work (7B), FICA and withholding are the form's, and the "other"
// deduction goes in under its own description.
//
// Hours: the WH-347 has straight time and overtime only; a row whose overtime hours are paid at double
// time can be marked so, and its overtime then goes in L&I's double-time hours and rate. A week with
// both pays two rows on the WH-347 (one per rate), as the form's instructions already ask.
//
// Passing the schema does not make a payroll correct, and nothing here decides prevailing-wage
// compliance: L&I's own upload step 5 compares the rates with the project's journey-level and
// apprentice wages, and the rates are the contractor's to check.

import { z } from "zod";
import {
  type CertifiedPayroll,
  computeCertifiedPayroll,
  type Issue,
  weekDays,
} from "./certified-payroll";
import { WA_COUNTIES, WA_TRADES } from "./wa-codes";

export const WA_MAX_NAME = 50;
export const WA_MAX_DEDUCTION_NAME = 50;
export const WA_MAX_JOB_CLASS = 500;
export const WA_APPRENTICE_STATES = ["WA", "OR", "MT", "AK"] as const;
/** The schema's xs:unsignedInt. */
export const WA_MAX_INTENT_ID = 4_294_967_295;

export const WA_BENEFIT_TYPES = [
  "pension",
  "medical",
  "vacation",
  "holiday",
  "training",
  "other",
] as const;
export type WaBenefitType = (typeof WA_BENEFIT_TYPES)[number];
export const WA_BENEFIT_LABELS: Record<WaBenefitType, string> = {
  pension: "Pension / retirement",
  medical: "Health and welfare",
  vacation: "Vacation",
  holiday: "Paid holiday",
  training: "Apprentice training fund",
  other: "Other (named in the file)",
};

export const WA_ETHNICITIES = [
  "Prefer not to answer",
  "American Indian/Alaskan Aleut",
  "Asian",
  "Black or African American",
  "Hispanic or Latino",
  "Native Hawaiian or other Pacific Islander",
  "White or Caucasian",
  "Other",
] as const;
export const WA_GENDERS = ["F", "M", "?"] as const;
export const WA_VETERAN = ["Y", "N", "?"] as const;

export const WA_CASH_IN_LIEU_NAME = "Cash in lieu of benefits";

const TRADE_CODES = new Set(WA_TRADES.map(([c]) => c));
const COUNTY_BY_LOWER = new Map(WA_COUNTIES.map((c) => [c.toLowerCase(), c]));

const text = () => z.string().trim();

export const waRowSchema = z.object({
  /** L&I's four-letter trade code ("ELEC"). */
  trade: text().default(""),
  /** L&I's job classification as on the wage lookup; "" = the WH-347 classification. */
  jobClass: text().default(""),
  /** "" = the job's county. */
  county: text().default(""),
  /** The row's overtime hours are paid at double time. */
  doubleTime: z.boolean().default(false),
  apprenticeId: text().default(""),
  apprenticeState: text().default("WA"),
  apprenticeOccupation: text().default(""),
  apprenticeStep: text().default(""),
  stepBeginHours: z.number().int().min(0).nullable().default(null),
  stepEndHours: z.number().int().min(0).nullable().default(null),
});

export const waWorkerSchema = z.object({
  address1: text().default(""),
  address2: text().default(""),
  city: text().default(""),
  /** Two letters. */
  state: text().default(""),
  zip: text().default(""),
  /** Optional on L&I's file; "" leaves the element out. */
  ethnicity: z.enum(["", ...WA_ETHNICITIES]).default(""),
  gender: z.enum(["", ...WA_GENDERS]).default(""),
  veteran: z.enum(["", ...WA_VETERAN]).default(""),
  rows: z.array(waRowSchema).default([]),
});

export const waJobSchema = z.object({
  /** The Statement of Intent to Pay Prevailing Wages ID L&I gave the project. */
  intentId: text().default(""),
  /** The county of the work, for every row that does not name its own. */
  county: text().default(""),
  /** L&I benefit type of each fringe plan, in the order of the WH-347 plans; null = guessed. */
  planTypes: z.array(z.enum(WA_BENEFIT_TYPES).nullable()).max(6).default([]),
  /** No employee worked on the project this week: the file says so, with no employees. */
  noWork: z.boolean().default(false),
});

export type WaRowInput = z.input<typeof waRowSchema>;
export type WaWorkerInput = z.input<typeof waWorkerSchema>;
export type WaJobInput = z.input<typeof waJobSchema>;

/** Kept apart from everything saved in the browser: the page holds these in memory only. */
export interface WaId {
  ssn: string;
}

/** A plan's L&I benefit type from its type or name. */
export function guessWaBenefitType(typeOrName: string): WaBenefitType {
  const s = typeOrName.toLowerCase();
  if (/health|welfare|medical|dental|vision|insurance/.test(s)) return "medical";
  if (/pension|retire|401|annuit/.test(s)) return "pension";
  if (/train|apprentic|education/.test(s)) return "training";
  if (/vacation/.test(s)) return "vacation";
  if (/holiday/.test(s)) return "holiday";
  return "other";
}

/** "elec" -> "ELEC" when it is one of L&I's codes, else null. */
export function waTradeCode(s: string): string | null {
  const t = s.trim().toUpperCase();
  return TRADE_CODES.has(t) ? t : null;
}

/** "king" or "KING county" -> "King"; anything else -> null. */
export function waCounty(s: string): string | null {
  const t = s
    .trim()
    .replace(/\s+county$/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  return COUNTY_BY_LOWER.get(t) ?? null;
}

/** "123-45-6789" -> "123456789"; anything else is returned trimmed. */
export function normalizeSsn(s: string): string {
  const t = s.trim();
  return /^\d{3}[- ]?\d{2}[- ]?\d{4}$/.test(t) ? t.replace(/[- ]/g, "") : t;
}

/** The SSA's never-issued numbers, which L&I's schema documentation says it rejects. */
export function ssnProblem(ssn: string): string | null {
  if (!/^\d{9}$/.test(ssn)) return "The SSN must be 9 digits (L&I needs the full number)";
  if (ssn.startsWith("9")) return "An SSN never starts with 9: L&I does not accept ITINs here";
  if (ssn.startsWith("666") || ssn.startsWith("000")) return "An SSN never starts with 666 or 000";
  if (ssn.slice(3, 5) === "00") return "An SSN never has 00 as its 4th and 5th digits";
  if (ssn.slice(5) === "0000") return "An SSN never ends in 0000";
  return null;
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
  const a = Math.abs(hundredths);
  return `${hundredths < 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

export interface WaTradeHoursWage {
  trade: string;
  jobClass: string;
  county: string;
  regularRateCents: number;
  /** null = no overtime (or double-time) hours of that kind on the row. */
  overtimeRateCents: number | null;
  doubletimeRateCents: number | null;
  pensionCents: number;
  medicalCents: number;
  vacationCents: number;
  holidayCents: number;
  trainingCents: number;
  apprentice: null | {
    id: string;
    state: string;
    occupation: string;
    step: string;
    begin: number;
    end: number;
  };
  regular: number[];
  overtime: number[] | null;
  doubletime: number[] | null;
  benefits: { name: string; cents: number }[];
}

export interface WaEmployee {
  firstName: string;
  midName: string;
  lastName: string;
  ssn: string;
  ethnicity: string;
  gender: string;
  veteran: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  grossCents: number;
  ficaCents: number;
  taxCents: number;
  otherDeductions: { name: string; cents: number }[];
  trades: WaTradeHoursWage[];
}

export interface WaResult {
  employees: WaEmployee[];
  issues: Issue[];
  /** The file, or null while there are errors. */
  xml: string | null;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * L&I's PWIA upload file for one project (Intent) and one week. `workers` and `ids` follow
 * `payroll.workers` by position (missing entries are blank). Errors are what the schema or the
 * guide's validation rejects, or what would make a total wrong; warnings point at things to check.
 */
export function buildWaCpr(
  payroll: CertifiedPayroll,
  jobInput: WaJobInput,
  workersInput: readonly (WaWorkerInput | undefined)[],
  ids: readonly (WaId | undefined)[],
): WaResult {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) =>
    issues.push({ level: "warning", where, message });
  const parsedJob = waJobSchema.safeParse(jobInput);
  if (!parsedJob.success)
    err("L&I", "The Washington details are not readable: clear and retype them");
  const job = parsedJob.success ? parsedJob.data : waJobSchema.parse({});
  const tooLong = (where: string, label: string, value: string, max: number) => {
    if (value.length > max) err(where, `L&I allows ${max} characters for the ${label}`);
  };

  const intent = job.intentId.replace(/\s+/g, "");
  if (!/^\d+$/.test(intent) || Number(intent) < 1 || Number(intent) > WA_MAX_INTENT_ID) {
    err(
      "L&I",
      "Enter the project's Intent ID (the number L&I gave your Statement of Intent to Pay Prevailing Wages), digits only",
    );
  }
  const days = weekDays(payroll.weekEnding);
  if (!days.length) err("Week", "Enter the week-ending date as YYYY-MM-DD");

  if (job.noWork) {
    if (payroll.workers.some((w) => w.rows.some((r) => sum(r.st) + sum(r.ot) > 0))) {
      err("L&I", "The week is marked as no work performed, but workers have hours on it");
    }
    const hasErr = issues.some((i) => i.level === "error");
    return {
      employees: [],
      issues,
      xml: hasErr
        ? null
        : waCprXml({ intentId: intent, weekEnding: payroll.weekEnding, employees: [] }),
    };
  }

  const wh = computeCertifiedPayroll(payroll);
  // The federal form's own checks still apply, except its statement reminders (L&I files its own
  // affidavit) and the check against a full SSN in "ID no.", since this file needs the full number.
  for (const i of wh.issues) if (i.code !== "full-ssn" && i.where !== "Statement") issues.push(i);

  const jobCounty = job.county ? waCounty(job.county) : null;
  if (job.county && !jobCounty) err("L&I", `"${job.county}" is not a Washington county`);

  const plans = payroll.fringePlans;
  const planType = plans.map(
    (p, k) => job.planTypes[k] ?? guessWaBenefitType(`${p.type} ${p.name}`),
  );

  if (!payroll.workers.length) {
    err("Workers", "Add the workers, or mark the week as no work performed");
  }

  const employees: WaEmployee[] = [];
  const seenSsn = new Map<string, number>();
  payroll.workers.forEach((w, wi) => {
    const who = `Worker ${wi + 1} (${w.lastName})`;
    const parsed = waWorkerSchema.safeParse(workersInput[wi] ?? {});
    if (!parsed.success) err(who, "The Washington details are not readable: retype them");
    const wa = parsed.success ? parsed.data : waWorkerSchema.parse({});
    const cw = wh.workers[wi];

    tooLong(who, "first name", w.firstName, WA_MAX_NAME);
    tooLong(who, "last name", w.lastName, WA_MAX_NAME);

    const ssn = normalizeSsn(ids[wi]?.ssn ?? "");
    if (!ssn)
      err(who, "Enter the worker's full Social Security number (L&I requires all 9 digits)");
    else {
      const p = ssnProblem(ssn);
      if (p) err(who, p);
      const prev = seenSsn.get(ssn);
      if (prev !== undefined) {
        err(
          who,
          `Same SSN as worker ${prev + 1}: L&I rejects a duplicated employee. Put a second trade on the same worker as another row instead`,
        );
      } else seenSsn.set(ssn, wi);
    }

    if (!wa.address1) err(who, "Enter the worker's street address");
    if (!wa.city) err(who, "Enter the worker's city");
    tooLong(who, "street address", wa.address1, 500);
    tooLong(who, "second address line", wa.address2, 500);
    tooLong(who, "city", wa.city, 100);
    const state = wa.state.toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) err(who, "Enter the worker's state as two letters (WA)");
    if (!/^\d{5}(?:-\d{4})?$/.test(wa.zip)) err(who, "Enter the ZIP code as 12345 or 12345-6789");

    // Fringe credits per hour by L&I's types; plans of one type add up, "other" plans keep their names.
    const fixed = { pension: 0, medical: 0, vacation: 0, holiday: 0, training: 0 };
    const otherBenefits: { name: string; cents: number }[] = [];
    w.fringeCreditsCents.slice(0, plans.length).forEach((c, k) => {
      if (c <= 0) return;
      const t = planType[k] ?? "other";
      if (t === "other") {
        const p = plans[k];
        otherBenefits.push({
          name: (p?.name || p?.type || "Other benefit").slice(0, 50),
          cents: c,
        });
      } else fixed[t] += c;
    });

    const trades: WaTradeHoursWage[] = w.rows.map((r, ri) => {
      const where = w.rows.length > 1 ? `${who}, row ${ri + 1}` : who;
      const row = wa.rows[ri] ?? waRowSchema.parse({});
      const trade = waTradeCode(row.trade);
      if (!trade) {
        err(
          where,
          row.trade
            ? `"${row.trade}" is not one of L&I's trade codes`
            : "Pick the row's L&I trade (the four-letter code)",
        );
      }
      const county = row.county ? waCounty(row.county) : jobCounty;
      if (!county) {
        err(
          where,
          row.county
            ? `"${row.county}" is not a Washington county`
            : "Enter the county of the work (for the job, or for this row)",
        );
      }
      const apprentice = r.status === "RA";
      const jobClass = apprentice ? "" : row.jobClass || r.classification;
      if (!apprentice) tooLong(where, "job classification", jobClass, WA_MAX_JOB_CLASS);
      if (r.stRateCents <= 0) err(where, "L&I needs a straight-time rate above zero");

      const ot = sum(r.ot) > 0;
      if (ot && r.otRateCents <= 0) err(where, "Enter the overtime rate for the overtime hours");
      if (row.doubleTime && ot && r.otRateCents > 0 && r.otRateCents < r.stRateCents * 2) {
        warn(
          where,
          "Marked as double time, but the overtime rate is under twice the straight rate",
        );
      }
      if (!row.doubleTime && r.otRateCents >= r.stRateCents * 2 && ot && r.stRateCents > 0) {
        warn(
          where,
          "The overtime rate is double the straight rate: if these hours are double time, mark the row so",
        );
      }

      let appr: WaTradeHoursWage["apprentice"] = null;
      if (apprentice) {
        if (!row.apprenticeId) err(where, "Enter the apprentice's registration ID (L&I's ARTS)");
        tooLong(where, "apprentice ID", row.apprenticeId, 50);
        const st = row.apprenticeState.toUpperCase();
        if (!(WA_APPRENTICE_STATES as readonly string[]).includes(st)) {
          err(where, "L&I takes apprentices registered in WA, OR, MT or AK");
        }
        if (!row.apprenticeOccupation) {
          err(where, "Enter the apprentice occupation as L&I's apprentice wage lookup names it");
        }
        tooLong(where, "apprentice occupation", row.apprenticeOccupation, 255);
        if (!row.apprenticeStep) err(where, "Enter the apprentice's step name (from L&I's lookup)");
        tooLong(where, "apprentice step name", row.apprenticeStep, 50);
        if (row.stepBeginHours === null || row.stepEndHours === null) {
          err(where, "Enter the step's begin and end hours (whole numbers, from L&I's lookup)");
        } else if (row.stepEndHours < row.stepBeginHours) {
          err(where, "The step's end hours are before its begin hours");
        }
        appr = {
          id: row.apprenticeId,
          state: st,
          occupation: row.apprenticeOccupation,
          step: row.apprenticeStep,
          begin: row.stepBeginHours ?? 0,
          end: row.stepEndHours ?? 0,
        };
      }

      const benefits = [...otherBenefits];
      if (r.cashInLieuHourlyCents > 0) {
        benefits.push({ name: WA_CASH_IN_LIEU_NAME, cents: r.cashInLieuHourlyCents });
      }
      return {
        trade: trade ?? row.trade,
        jobClass,
        county: county ?? row.county,
        regularRateCents: r.stRateCents,
        overtimeRateCents: ot && !row.doubleTime ? r.otRateCents : null,
        doubletimeRateCents: ot && row.doubleTime ? r.otRateCents : null,
        pensionCents: fixed.pension,
        medicalCents: fixed.medical,
        vacationCents: fixed.vacation,
        holidayCents: fixed.holiday,
        trainingCents: fixed.training,
        apprentice: appr,
        regular: r.st,
        overtime: ot && !row.doubleTime ? r.ot : null,
        doubletime: ot && row.doubleTime ? r.ot : null,
        benefits,
      };
    });

    const combos = new Set(
      trades.map((t) => `${t.trade}|${t.jobClass}|${t.county}|${t.regularRateCents}`),
    );
    if (combos.size < trades.length) {
      warn(
        who,
        "Two rows have the same trade, classification, county and rate: L&I expects one entry per combination",
      );
    }

    const otherDeductions =
      w.otherCents > 0
        ? [{ name: (w.otherNote || "Other").slice(0, WA_MAX_DEDUCTION_NAME), cents: w.otherCents }]
        : [];
    if (w.otherNote.length > WA_MAX_DEDUCTION_NAME && w.otherCents > 0) {
      warn(who, "The other deduction's description is cut to L&I's 50 characters in the file");
    }
    if ((cw?.netCents ?? 0) < 0) err(who, "Net pay is below zero");

    employees.push({
      firstName: w.firstName,
      midName: w.middleInitial,
      lastName: w.lastName,
      ssn,
      ethnicity: wa.ethnicity,
      gender: wa.gender,
      veteran: wa.veteran,
      address1: wa.address1,
      address2: wa.address2,
      city: wa.city,
      state,
      zip: wa.zip,
      grossCents: cw?.grossAllWorkCents ?? 0,
      ficaCents: w.ficaCents,
      taxCents: w.taxCents,
      otherDeductions,
      trades,
    });
  });

  const dedupe = new Set<string>();
  const unique = issues.filter((i) => {
    const k = `${i.level}|${i.where}|${i.message}`;
    if (dedupe.has(k)) return false;
    dedupe.add(k);
    return true;
  });
  const hasErr = unique.some((i) => i.level === "error");
  return {
    employees,
    issues: unique,
    xml: hasErr ? null : waCprXml({ intentId: intent, weekEnding: payroll.weekEnding, employees }),
  };
}

/** The file itself, elements in the schema's sequence order; an empty list means no work. */
export function waCprXml(f: {
  intentId: string;
  weekEnding: string;
  employees: WaEmployee[];
}): string {
  const out: string[] = [];
  let depth = 0;
  const pad = () => "  ".repeat(depth);
  const leaf = (tag: string, value: string) =>
    out.push(`${pad()}<${tag}>${xmlEscape(value)}</${tag}>`);
  const opt = (tag: string, value: string) => {
    if (value) leaf(tag, value);
  };
  const open = (tag: string) => {
    out.push(`${pad()}<${tag}>`);
    depth++;
  };
  const close = (tag: string) => {
    depth--;
    out.push(`${pad()}</${tag}>`);
  };

  out.push('<?xml version="1.0" encoding="utf-8"?>');
  open("WaPWCPR");
  open("projectIntent");
  leaf("intentId", f.intentId);
  close("projectIntent");
  open("payroll");
  open("payrollWeek");
  leaf("endOfWeekDate", f.weekEnding);
  leaf("noWorkPerformFlag", String(f.employees.length === 0));
  if (f.employees.length) {
    open("employees");
    for (const e of f.employees) {
      open("employee");
      leaf("firstName", e.firstName);
      opt("midName", e.midName);
      leaf("lastName", e.lastName);
      leaf("ssn", e.ssn);
      opt("ethnicity", e.ethnicity);
      opt("gender", e.gender);
      opt("veteranStatus", e.veteran);
      leaf("address1", e.address1);
      opt("address2", e.address2);
      leaf("city", e.city);
      leaf("state", e.state);
      leaf("zip", e.zip);
      leaf("grossPay", dec2(e.grossCents));
      leaf("fica", dec2(e.ficaCents));
      leaf("taxWitholding", dec2(e.taxCents));
      if (e.otherDeductions.length) {
        open("otherDeductions");
        for (const d of e.otherDeductions) {
          open("otherDeduction");
          leaf("deductionName", d.name);
          leaf("deductionHourlyAmt", dec2(d.cents));
          close("otherDeduction");
        }
        close("otherDeductions");
      }
      open("tradeHoursWages");
      for (const t of e.trades) {
        open("tradeHoursWage");
        leaf("trade", t.trade);
        if (!t.apprentice) leaf("jobClass", t.jobClass);
        leaf("county", t.county);
        leaf("regularHourRateAmt", dec2(t.regularRateCents));
        if (t.overtimeRateCents !== null) leaf("overtimeHourRateAmt", dec2(t.overtimeRateCents));
        if (t.doubletimeRateCents !== null) {
          leaf("doubletimeHourRateAmt", dec2(t.doubletimeRateCents));
        }
        leaf("hourlyPensionRateAmt", dec2(t.pensionCents));
        leaf("hourlyMedicalAmt", dec2(t.medicalCents));
        leaf("hourlyVacationAmt", dec2(t.vacationCents));
        leaf("hourlyHolidayAmt", dec2(t.holidayCents));
        leaf("apprenticeBenefitAmt", dec2(t.trainingCents));
        leaf("apprenticeFlg", String(t.apprentice !== null));
        if (t.apprentice) {
          leaf("apprenticeId", t.apprentice.id);
          leaf("apprenticeState", t.apprentice.state);
          leaf("apprenticeOccpnName", t.apprentice.occupation);
          leaf("apprenticeStepName", t.apprentice.step);
          leaf("apprenticeStepBeginHours", String(t.apprentice.begin));
          leaf("apprenticeStepEndHours", String(t.apprentice.end));
        }
        for (const [d, h] of (t.regular ?? []).entries()) leaf(`regularDay${d + 1}Hours`, dec2(h));
        for (const [d, h] of (t.overtime ?? []).entries())
          leaf(`overtimeDay${d + 1}Hours`, dec2(h));
        for (const [d, h] of (t.doubletime ?? []).entries())
          leaf(`doubletimeDay${d + 1}Hours`, dec2(h));
        if (t.benefits.length) {
          open("tradeBenefits");
          for (const b of t.benefits) {
            open("tradeBenefit");
            leaf("benefitHourlyName", b.name);
            leaf("benefitHourlyAmt", dec2(b.cents));
            close("tradeBenefit");
          }
          close("tradeBenefits");
        }
        close("tradeHoursWage");
      }
      close("tradeHoursWages");
      close("employee");
    }
    close("employees");
  }
  close("payrollWeek");
  close("payroll");
  close("WaPWCPR");
  return `${out.join("\n")}\n`;
}

/** "wa-cpr-123456-2026-08-01.xml". */
export function waCprFileName(intentId: string, weekEnding: string): string {
  const id = intentId.replace(/[^0-9]+/g, "").slice(0, 12) || "intent";
  return `wa-cpr-${id}-${weekEnding}.xml`;
}

/** Next week's Washington extras: the same addresses, trades and apprentice steps. */
export function waNextWeek(w: WaWorkerInput): WaWorkerInput {
  return { ...w };
}

export const WA_CPR_NOTICE =
  "Prepared with PayApps in the XML format of Washington L&I's PWIA certified payroll upload (L&I's published schema, read from lni.wa.gov, November 2026). Not a Washington State Department of Labor & Industries product and not legal advice. The upload replaces a week already filed for the same Intent, so check every figure against your payroll records and the project's prevailing wage rates before you submit.";
