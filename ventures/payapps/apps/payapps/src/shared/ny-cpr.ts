// New York public work: the weekly certified payroll as the XML bulk-upload file the NYSDOL
// Certified Payroll portal takes (NYSDOL requires electronic certified payroll for Labor Law Article 8
// public work from 1 January 2026: docs/reports/2026-11-27-state-certified-payroll-filing-systems.md).
// Pure: it runs in the browser, so a worker's date of birth, which the file can carry, never reaches
// our server. "deductionsGrossEarnings" is the WH-347's gross for all work (7B), so gross less the
// deductions in the file is the net in the file, as on the PDF.
//
// Sources, all read 2026-11-27 from https://dol.ny.gov/bizserve/ep (Electronic Payroll Submission):
// the XSD "XML SCHEMA for electronic New York Certified Payroll Records Version 2.0"
// (dol.ny.gov/certpayrollxsd, NYDOL_CertPayroll UPDATED.xsd, dated 2026-10-01), the sample file
// (dol.ny.gov/certpayrollsamplexml), the Bulk Upload Formatting Guide (bizserve/ep/guide/buf) and its
// "XML Work Classification List" (src/shared/ny-classifications.ts). Every limit below is the XSD's
// or the guide's. Where they differ the XSD wins, since the portal validates against it: the guide
// says "deductionGrossEarnings" and rates up to 9,999.99; the XSD says "deductionsGrossEarnings" and
// 999.99 for the wage rates.
//
// It starts from the WH-347 payroll the page already holds (src/shared/certified-payroll.ts) and adds
// what NYSDOL asks for and the federal form does not: the project's PRC number, each worker's home
// address with the state spelled out, the last four digits of the SSN or else the date of birth (one,
// never both), whether the worker is a New York registered apprentice, a classification from the
// state's list for each row, and the deductions and supplements by type. The split never changes a
// total: state and local income tax come out of the WH-347 "withholding tax", disability/paid family
// leave and union dues out of its "other", so the PDF and the XML show the same deductions and net.
//
// Supplements: each fringe plan's hourly credit becomes a supplemental payment of the plan's NYSDOL
// type (guessed from its type and name, changeable on the page) on every classification the worker
// worked. Its overtime rate is the same hourly amount, or time and a half where the page says the
// schedule pays that plan at the overtime rate (New York schedules differ by trade). Cash paid in lieu
// is "Other Benefit (Type)" with an explanation, since the list has no cash type.
//
// Passing the XSD does not make a payroll correct, and nothing here decides prevailing-wage
// compliance: the rates on the project's prevailing rate schedule are the contractor's to check.

import { z } from "zod";
import {
  type CertifiedPayroll,
  computeCertifiedPayroll,
  type Issue,
  weekDays,
} from "./certified-payroll";
import { NY_CLASSIFICATIONS } from "./ny-classifications";

export const NY_MAX_EMPLOYEES = 500;
export const NY_MAX_DEDUCTIONS = 10;
export const NY_MAX_SUPPLEMENTS = 50;
/** The XSD caps the wage rates at 999.99 and a deduction at 9999.99. */
export const NY_MAX_RATE_CENTS = 99_999;
export const NY_MAX_DEDUCTION_CENTS = 999_999;
export const NY_MAX_SUPPLEMENT_RATE_CENTS = 1_000_000;
export const NY_MAX_PAY_CENTS = 99_999_999;

export const NY_SUPPLEMENT_TYPES = [
  "Health/Welfare",
  "Vacation/Holiday",
  "Apprenticeship/Training",
  "Pension",
  "Other Benefit (Type)",
] as const;
export type NySupplementType = (typeof NY_SUPPLEMENT_TYPES)[number];

export const NY_CASH_IN_LIEU_EXPLANATION = "Supplements paid to the worker in cash, in lieu";

const text = () => z.string().trim();
const cents = z.number().int().min(0).max(100_000_000);

export const nyRowSchema = z.object({
  /** The classification exactly as on NYSDOL's list; "" = the WH-347 classification if it matches. */
  category: text().default(""),
});

export const nyWorkerSchema = z.object({
  middleName: text().default(""),
  address1: text().default(""),
  address2: text().default(""),
  city: text().default(""),
  /** The state spelled out ("New York"); two letters are expanded. */
  state: text().default(""),
  zip: text().default(""),
  country: text().default("United States"),
  /** Last four digits of the SSN; "" = the WH-347 ID no. when it is four digits. */
  ssnLast4: text().default(""),
  /** null = a registered apprentice when any row is RA on the WH-347. */
  nysApprentice: z.boolean().nullable().default(null),
  /** Parts of the WH-347 withholding tax (the rest is federal). */
  stateTaxCents: cents.default(0),
  localTaxCents: cents.default(0),
  /** Parts of the WH-347 "other" deduction; what is left of it keeps its WH-347 description. */
  disabilityPflCents: cents.default(0),
  duesCents: cents.default(0),
  rows: z.array(nyRowSchema).default([]),
});

export const nyJobSchema = z.object({
  /** The project's prevailing rate case number, from the portal's dashboard (10 characters). */
  prcNumber: text().default(""),
  /** NYSDOL type of each fringe plan, in the order of the WH-347 plans; null = guessed. */
  planTypes: z.array(z.enum(NY_SUPPLEMENT_TYPES).nullable()).max(6).default([]),
  /** Per plan: the schedule pays this supplement at time and a half on overtime hours. */
  planOtTimeAndHalf: z.array(z.boolean()).max(6).default([]),
});

export type NyRowInput = z.input<typeof nyRowSchema>;
export type NyWorkerInput = z.input<typeof nyWorkerSchema>;
export type NyJobInput = z.input<typeof nyJobSchema>;

/** Kept apart from everything saved in the browser: the page holds these in memory only. */
export interface NyId {
  /** YYYY-MM-DD; used only when there is no SSN last four. */
  dob: string;
}

/** A plan's NYSDOL supplement type from its type or name. */
export function guessSupplementType(typeOrName: string): NySupplementType {
  const s = typeOrName.toLowerCase();
  if (/health|welfare|medical|dental|vision|insurance/.test(s)) return "Health/Welfare";
  if (/vacation|holiday/.test(s)) return "Vacation/Holiday";
  if (/pension|retire|401|annuit/.test(s)) return "Pension";
  if (/train|apprentic|education/.test(s)) return "Apprenticeship/Training";
  return "Other Benefit (Type)";
}

const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‐-―-]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
const BY_NORM = new Map(NY_CLASSIFICATIONS.map((n) => [normName(n), n]));

/** The list's own spelling of a classification ("Electrician - Inside" -> "Electrician – Inside"), or null. */
export function matchNyClassification(name: string): string | null {
  return BY_NORM.get(normName(name)) ?? null;
}

export const US_STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  PR: "Puerto Rico",
};
const STATE_NAMES = new Set(Object.values(US_STATES).map((s) => s.toLowerCase()));

/** "ny" -> "New York"; "new jersey" -> "New Jersey"; anything else -> null. */
export function fullStateName(s: string): string | null {
  const t = s.trim();
  const ab = US_STATES[t.toUpperCase()];
  if (ab) return ab;
  if (!STATE_NAMES.has(t.toLowerCase())) return null;
  return Object.values(US_STATES).find((n) => n.toLowerCase() === t.toLowerCase()) ?? null;
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

function parseIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

export interface NyWorkWeek {
  category: string;
  stRateCents: number;
  otRateCents: number;
  st: number[];
  ot: number[];
}

export interface NySupplement {
  type: NySupplementType;
  category: string;
  explanation: string;
  stRateCents: number;
  otRateCents: number;
}

export interface NyEmployee {
  firstName: string;
  middleName: string;
  lastName: string;
  dob: string;
  ssnLast4: string;
  apprentice: boolean;
  address: {
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    zipExt: string;
    country: string;
  };
  grossCents: number;
  netCents: number;
  workWeeks: NyWorkWeek[];
  deductions: { type: string; cents: number }[];
  supplements: NySupplement[];
}

export interface NyResult {
  employees: NyEmployee[];
  issues: Issue[];
  /** The file, or null while there are errors. */
  xml: string | null;
}

/**
 * The NYSDOL bulk-upload file for one project and one week. `workers` and `ids` follow
 * `payroll.workers` by position (missing entries are blank). Errors are what the portal's upload
 * rejects (the XSD, the guide's common errors) or what would make a total wrong; warnings point at
 * things to look at.
 */
export function buildNyCpr(
  payroll: CertifiedPayroll,
  jobInput: NyJobInput,
  workersInput: readonly (NyWorkerInput | undefined)[],
  ids: readonly (NyId | undefined)[],
): NyResult {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) =>
    issues.push({ level: "warning", where, message });
  const parsedJob = nyJobSchema.safeParse(jobInput);
  if (!parsedJob.success)
    err("NYSDOL", "The New York details are not readable: clear and retype them");
  const job = parsedJob.success ? parsedJob.data : nyJobSchema.parse({});
  const tooLong = (where: string, label: string, value: string, max: number) => {
    if (value.length > max) err(where, `NYSDOL allows ${max} characters for the ${label}`);
  };

  const wh = computeCertifiedPayroll(payroll);
  // The federal form's own checks still apply, except its statement reminders (the portal has its
  // own attestation) and the full-SSN check, which this file's own SSN rule replaces.
  for (const i of wh.issues) if (i.code !== "full-ssn" && i.where !== "Statement") issues.push(i);

  const prc = job.prcNumber.replace(/\s+/g, "");
  if (prc.length !== 10) {
    err(
      "NYSDOL",
      "Enter the project's PRC number (prevailing rate case number), 10 characters, from the portal's dashboard",
    );
  }
  const days = weekDays(payroll.weekEnding);

  const plans = payroll.fringePlans;
  const planType = plans.map(
    (p, k) => job.planTypes[k] ?? guessSupplementType(`${p.type} ${p.name}`),
  );

  if (!payroll.workers.length) err("Workers", "The file needs at least one worker");
  if (payroll.workers.length > NY_MAX_EMPLOYEES) {
    err("Workers", `NYSDOL takes at most ${NY_MAX_EMPLOYEES} employees per file`);
  }

  const employees: NyEmployee[] = [];
  const seen = new Map<string, number>();
  payroll.workers.forEach((w, wi) => {
    const who = `Worker ${wi + 1} (${w.lastName})`;
    const parsed = nyWorkerSchema.safeParse(workersInput[wi] ?? {});
    if (!parsed.success) err(who, "The New York details are not readable: retype them");
    const ny = parsed.success ? parsed.data : nyWorkerSchema.parse({});
    const cw = wh.workers[wi];

    tooLong(who, "first name", w.firstName, 45);
    tooLong(who, "last name", w.lastName, 45);
    const middleName = ny.middleName || w.middleInitial;
    tooLong(who, "middle name", middleName, 45);

    // Identity: the last four of the SSN, or else the date of birth; never both (the guide).
    const idNo = w.idNo.trim();
    const ssnLast4 = ny.ssnLast4 || (/^\d{4}$/.test(idNo) ? idNo : "");
    const dob = (ids[wi]?.dob ?? "").trim();
    if (ssnLast4 && !/^\d{4}$/.test(ssnLast4)) {
      err(who, "The SSN's last four must be four digits");
    }
    if (!ssnLast4 && !dob) {
      err(who, "Enter the last four digits of the worker's SSN, or the date of birth if none");
    }
    if (!ssnLast4 && dob && !parseIsoDate(dob)) {
      err(who, "Enter the date of birth as YYYY-MM-DD");
    }
    const dupKey = `${normName(w.firstName)}|${normName(w.lastName)}|${ssnLast4 || dob}`;
    const prev = seen.get(dupKey);
    if (prev !== undefined) {
      err(
        who,
        `Same worker as worker ${prev + 1}: NYSDOL rejects a duplicated employee. Put a second classification on the same worker as another row instead`,
      );
    } else seen.set(dupKey, wi);

    // Address.
    if (!ny.address1) err(who, "Enter the worker's street address");
    if (!ny.city) err(who, "Enter the worker's city");
    tooLong(who, "street address", ny.address1, 42);
    tooLong(who, "second address line", ny.address2, 42);
    tooLong(who, "city", ny.city, 40);
    const state = fullStateName(ny.state);
    if (!state) err(who, "Enter the worker's state (NY or New York: the file spells it out)");
    const zm = /^(\d{5})(?:-(\d{4}))?$/.exec(ny.zip);
    if (!zm) err(who, "Enter the ZIP code as 12345 or 12345-6789");
    const country = ny.country || "United States";
    tooLong(who, "country", country, 50);

    const apprentice = ny.nysApprentice ?? w.rows.some((r) => r.status === "RA");

    // Work weeks, one per WH-347 row, each with the list's classification.
    const workWeeks: NyWorkWeek[] = w.rows.map((r, ri) => {
      const where = w.rows.length > 1 ? `${who}, row ${ri + 1}` : who;
      const chosen = ny.rows[ri]?.category ?? "";
      const category = matchNyClassification(chosen || r.classification);
      if (!category) {
        err(
          where,
          `Pick this row's classification from NYSDOL's list ("${chosen || r.classification}" is not on it; the portal rejects it)`,
        );
      }
      for (const [label, c] of [
        ["straight-time", r.stRateCents],
        ["overtime", r.otRateCents],
      ] as const) {
        if (c > NY_MAX_RATE_CENTS) err(where, `NYSDOL's file allows ${label} rates up to $999.99`);
      }
      return {
        category: category ?? r.classification,
        stRateCents: r.stRateCents,
        otRateCents: r.otRateCents,
        st: r.st,
        ot: r.ot,
      };
    });
    const categories = [...new Set(workWeeks.map((x) => x.category))];
    if (categories.length < workWeeks.length) {
      warn(
        who,
        "Two rows have the same NYSDOL classification: the portal shows them as two work weeks in one classification",
      );
    }

    // Deductions: the WH-347 amounts split by type; a total never changes.
    if (ny.stateTaxCents + ny.localTaxCents > w.taxCents) {
      err(
        who,
        "State and local income tax are more than the withholding tax entered above (they are part of it)",
      );
    }
    if (ny.disabilityPflCents + ny.duesCents > w.otherCents) {
      err(
        who,
        "Disability/paid family leave and dues add up to more than the other deductions entered above (they are part of them)",
      );
    }
    const otherRest = Math.max(0, w.otherCents - ny.disabilityPflCents - ny.duesCents);
    const otherType = (w.otherNote || "Other").slice(0, 50);
    const deductions = [
      { type: "Federal Tax", cents: Math.max(0, w.taxCents - ny.stateTaxCents - ny.localTaxCents) },
      { type: "FICA", cents: w.ficaCents },
      { type: "State Tax", cents: ny.stateTaxCents },
      { type: "Local Tax", cents: ny.localTaxCents },
      { type: "Disability/Paid Family Leave", cents: ny.disabilityPflCents },
      { type: "Union Dues", cents: ny.duesCents },
      { type: otherType, cents: otherRest },
    ].filter((d) => d.cents > 0);
    if (w.otherNote.length > 50 && otherRest > 0) {
      warn(who, "The other deduction's description is cut to NYSDOL's 50 characters in the file");
    }
    if (deductions.length > NY_MAX_DEDUCTIONS) {
      err(who, `NYSDOL takes at most ${NY_MAX_DEDUCTIONS} deductions per worker`);
    }
    for (const d of deductions) {
      if (d.cents > NY_MAX_DEDUCTION_CENTS) {
        err(who, `NYSDOL's file takes deductions up to $9,999.99 each (${d.type})`);
      }
    }

    // Supplements: per classification, per plan with a credit, and cash in lieu.
    const supplements: NySupplement[] = [];
    workWeeks.forEach((ww, ri) => {
      const r = w.rows[ri];
      if (!r) return;
      w.fringeCreditsCents.slice(0, plans.length).forEach((c, k) => {
        if (c <= 0) return;
        const type = planType[k] ?? "Other Benefit (Type)";
        const plan = plans[k];
        supplements.push({
          type,
          category: ww.category,
          explanation:
            type === "Other Benefit (Type)"
              ? [plan?.name, plan?.type].filter(Boolean).join(", ").slice(0, 256) || "Other benefit"
              : "",
          stRateCents: c,
          otRateCents: job.planOtTimeAndHalf[k] ? Math.round((c * 3) / 2) : c,
        });
      });
      if (r.cashInLieuHourlyCents > 0) {
        supplements.push({
          type: "Other Benefit (Type)",
          category: ww.category,
          explanation: NY_CASH_IN_LIEU_EXPLANATION,
          stRateCents: r.cashInLieuHourlyCents,
          otRateCents: r.cashInLieuHourlyCents,
        });
      }
    });
    if (supplements.length > NY_MAX_SUPPLEMENTS) {
      err(who, `NYSDOL takes at most ${NY_MAX_SUPPLEMENTS} supplemental payments per worker`);
    }
    if (
      supplements.some(
        (s) =>
          s.stRateCents >= NY_MAX_SUPPLEMENT_RATE_CENTS ||
          s.otRateCents >= NY_MAX_SUPPLEMENT_RATE_CENTS,
      )
    ) {
      err(who, "NYSDOL's file takes supplement rates up to $10,000 an hour");
    }

    const grossCents = cw?.grossAllWorkCents ?? 0;
    const netCents = cw?.netCents ?? 0;
    if (grossCents > NY_MAX_PAY_CENTS || netCents > NY_MAX_PAY_CENTS) {
      err(who, "NYSDOL's file takes gross and net pay up to $999,999.99");
    }
    if (netCents < 0) err(who, "Net pay is below zero");

    employees.push({
      firstName: w.firstName,
      middleName,
      lastName: w.lastName,
      dob: ssnLast4 ? "" : dob,
      ssnLast4,
      apprentice,
      address: {
        address1: ny.address1,
        address2: ny.address2,
        city: ny.city,
        state: state ?? ny.state,
        zip: zm?.[1] ?? ny.zip,
        zipExt: zm?.[2] ?? "",
        country,
      },
      grossCents,
      netCents,
      workWeeks,
      deductions,
      supplements,
    });
  });

  const dedupe = new Set<string>();
  const unique = issues.filter((i) => {
    const k = `${i.level}|${i.where}|${i.message}`;
    if (dedupe.has(k)) return false;
    dedupe.add(k);
    return true;
  });
  const hasErr = unique.some((i) => i.level === "error") || !days.length;
  return {
    employees,
    issues: unique,
    xml: hasErr
      ? null
      : nyCprXml({
          prcNumber: prc,
          weekEnding: payroll.weekEnding,
          days: days.map((d) => d.iso),
          employees,
        }),
  };
}

/** The file itself, elements in the XSD's order, indented like NYSDOL's sample. */
export function nyCprXml(f: {
  prcNumber: string;
  weekEnding: string;
  days: string[];
  employees: NyEmployee[];
}): string {
  const out: string[] = [];
  let depth = 0;
  const pad = () => "  ".repeat(depth);
  const leaf = (tag: string, value: string) =>
    out.push(`${pad()}<${tag}>${xmlEscape(value)}</${tag}>`);
  const open = (tag: string, attrs = "") => {
    out.push(`${pad()}<${tag}${attrs}>`);
    depth++;
  };
  const close = (tag: string) => {
    depth--;
    out.push(`${pad()}</${tag}>`);
  };

  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  open(
    "ProjectRollup",
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="NYDOL_CertPayroll.xsd"',
  );
  leaf("prcNumber", f.prcNumber);
  leaf("weekEndingDate", `${f.weekEnding}T00:00:00.000Z`);
  open("employeeWorkWeeks");
  for (const e of f.employees) {
    open("employeeWorkWeek");
    open("employee");
    leaf("firstName", e.firstName);
    if (e.middleName) leaf("middleName", e.middleName);
    leaf("lastName", e.lastName);
    if (e.dob) leaf("dateOfBirth", e.dob);
    if (e.ssnLast4) leaf("ssnLast4", e.ssnLast4);
    leaf("nysRegisteredApprentice", String(e.apprentice));
    open("address");
    leaf("address1", e.address.address1);
    if (e.address.address2) leaf("address2", e.address.address2);
    leaf("city", e.address.city);
    leaf("state", e.address.state);
    leaf("postalCode", e.address.zip);
    if (e.address.zipExt) leaf("postalCodeExt", e.address.zipExt);
    leaf("country", e.address.country);
    close("address");
    close("employee");
    leaf("deductionsGrossEarnings", dec2(e.grossCents));
    leaf("netWages", dec2(e.netCents));
    open("workWeeks");
    for (const ww of e.workWeeks) {
      open("workWeek");
      leaf("workCategory", ww.category);
      leaf("stHourlyRate", dec2(ww.stRateCents));
      leaf("otHourlyRate", dec2(ww.otRateCents));
      open("days");
      f.days.forEach((iso, d) => {
        open("day");
        leaf("day", iso);
        leaf("standardTimeHours", dec2(ww.st[d] ?? 0));
        leaf("overTimeHours", dec2(ww.ot[d] ?? 0));
        close("day");
      });
      close("days");
      close("workWeek");
    }
    close("workWeeks");
    open("deductions");
    for (const d of e.deductions) {
      open("deduction");
      leaf("type", d.type);
      leaf("amount", dec2(d.cents));
      close("deduction");
    }
    close("deductions");
    open("supplementalPayments");
    for (const s of e.supplements) {
      open("supplementalPayment");
      leaf("type", s.type);
      leaf("workCategory", s.category);
      if (s.explanation) leaf("explanation", s.explanation);
      leaf("standardHourlyRate", dec2(s.stRateCents));
      leaf("overtimeHourlyRate", dec2(s.otRateCents));
      close("supplementalPayment");
    }
    close("supplementalPayments");
    close("employeeWorkWeek");
  }
  close("employeeWorkWeeks");
  close("ProjectRollup");
  return `${out.join("\n")}\n`;
}

/** "ny-cpr-1092381092-2026-08-02.xml" (NYSDOL suggests project and week in the name). */
export function nyCprFileName(prcNumber: string, weekEnding: string): string {
  const id = prcNumber.replace(/[^A-Za-z0-9]+/g, "").slice(0, 20) || "project";
  return `ny-cpr-${id}-${weekEnding}.xml`;
}

/** Next week's New York extras: the same addresses and classifications; the deduction split cleared. */
export function nyNextWeek(w: NyWorkerInput): NyWorkerInput {
  return { ...w, stateTaxCents: 0, localTaxCents: 0, disabilityPflCents: 0, duesCents: 0 };
}

export const NY_CPR_NOTICE =
  "Prepared with PayApps in the NYSDOL Certified Payroll bulk-upload XML format (schema version 2.0, read from dol.ny.gov, November 2026). Not a New York State Department of Labor product and not legal advice. NYSDOL suggests a small test upload first; whatever you upload enters its system of record, so check every figure against your payroll records and the project's prevailing rate schedule.";
