// Illinois public works: the weekly certified payroll as the CSV the Illinois Department of Labor's
// Certified Transcript of Payroll (CTP) portal takes by "Full Import" (820 ILCS 130/5: contractors
// and subcontractors on Prevailing Wage Act work file their payroll with IDOL each month). Pure: it
// runs in the browser, so a worker's race, ethnicity, gender and veteran status, which the file
// carries, never reach our server.
//
// Sources, all read 2026-11-27 from labor.illinois.gov: IDOL's upload template
// (laws-rules/conmed/documents/ctp/Full-CTP-Upload.xlsx, linked from
// laws-rules/conmed/certifiedtranscriptofpayroll.html), the "2026 Prevailing Wage Certified
// Transcript of Payroll Training Slides" PDF on the same page and IDOL's Certified Transcript of
// Payroll FAQ (faqs/certifiedpayrollfaq.html). The 102 columns below are the template's header row
// exactly, its spellings kept ("Wednsday", "Satday") and its repeated names too (the contractor's and
// the public body's ContactFirstName, the project's and the contractor's Zip4): the slides say the
// upload must "Follow Template's Column Names", and the FAQ says "the excel template order cannot be
// changed".
//
// What each part comes from:
// - One row per worker per classification (FAQ 7: "enter that individual in the payroll for each
//   classification worked"), so one row per WH-347 row.
// - "Prevailing" hours, rates and gross are this project's (the WH-347's columns 3 to 7A). The day
//   columns are by weekday, Sunday to Saturday; a week that ends on another day still puts each
//   day's hours under its own weekday (FAQ 13: "If your payroll runs Thursday through Wednesday,
//   start your hours on Thursday").
// - "Non-prevailing" hours are the worker's hours that week on other projects (FAQ 3), typed on the
//   page; their gross is the WH-347's gross for all work (7B) less this project's (7A).
// - Net: the WH-347 has one net for the worker. Where the worker also had other work, the deductions
//   are split between this project and the other work in proportion to gross, unless the page's
//   override gives this project's net; the page says so. With no other work the net is the WH-347's.
// - Fringe: each WH-347 plan's hourly credit lands in one of IDOL's five hourly columns (pension,
//   health and welfare, vacation, training, other insurance), guessed from the plan's type and name
//   and changeable on the page. Cash in lieu has no column and is left out, with a warning.
// - Double time, AddOT15, AddOT20 and the county FIPS codes are written only where typed (the WH-347
//   has no double-time column); NoWorktoReport is 0 (FAQ 8: a week with no work needs no payroll).
//
// Nothing here decides prevailing-wage compliance, and passing the portal's upload does not make a
// payroll correct: the rates on IDOL's current prevailing rate schedule for the county are the
// contractor's to check.

import { z } from "zod";
import {
  type CertifiedPayroll,
  computeCertifiedPayroll,
  type Issue,
  weekDays,
} from "./certified-payroll";
import { fullStateName, US_STATES } from "./ny-cpr";

/** IDOL's template header row, column A to CX, exactly. */
export const IL_CTP_COLUMNS = [
  "PayrollStart",
  "PayrollEnd",
  "ContractNumber",
  "ProjectNumber",
  "ProjectAddress",
  "ProjectCounty",
  "ProjectCountyFIPSCode",
  "ProjectCity",
  "ProjectState",
  "ProjectZip5",
  "Zip4",
  "StateCapitalFunds",
  "CompanyName",
  "ContactFirstName",
  "ContactMiddleName",
  "ContactLastName",
  "PostalAddress",
  "CountyFIPSCode",
  "City",
  "State",
  "Zip5",
  "Zip4",
  "PrimaryPhone",
  "SecondaryPhone",
  "PrimaryEmail",
  "SecondaryEmail",
  "PublicBodyName",
  "ContactFirstName",
  "ContactMiddleName",
  "ContactLastName",
  "PostalAddress",
  "County",
  "CountyFIPSCode",
  "City",
  "State",
  "Zip5",
  "Zip4",
  "PrimaryPhone",
  "SecondaryPhone",
  "FirstName",
  "MiddleName",
  "LastName",
  "Last4SSN",
  "PrimaryPhone",
  "SecondaryPhone",
  "WorkClassification",
  "GeographicDivision",
  "ClassType",
  "ClassCode",
  "PostalAddress",
  "County",
  "CountyFIPSCode",
  "City",
  "State",
  "Zip5",
  "Zip4",
  "Race",
  "Ethnicity",
  "Gender",
  "IsaVeteran",
  "Journeyman",
  "Apprentice",
  "Foreman",
  "SundayPrevailingHoursWorked",
  "SundayNonPrevailingHoursWorked",
  "MondayPrevailingHoursWorked",
  "MondayNonPrevailingHoursWorked",
  "TuesdayPrevailingHoursWorked",
  "TuesdayNonPrevailingHoursWorked",
  "WednsdayPrevailingHoursWorked",
  "WednsdayNonPrevailingHoursWorked",
  "ThursdayPrevailingHoursWorked",
  "ThursdayNonPrevailingHoursWorked",
  "FridayPrevailingHoursWorked",
  "FridayNonPrevailingHoursWorked",
  "SatdayPrevailingHoursWorked",
  "SatdayNonPrevailingHoursWorked",
  "TotalPrevailingStraightHoursWorked",
  "TotalNonPrevailingStraightHoursWorked",
  "TotalPrevailingOTHoursWorked",
  "TotalNonPrevailingOTHoursWorked",
  "PrevailingHourlyWage",
  "NonPrevailingHourlyWage",
  "PrevailingOTWage",
  "NonPrevailingOTWage",
  "PrevailingGrossIncome",
  "PrevailingNetIncome",
  "NonPrevailingGrossIncome",
  "NonPrevailingNetIncome",
  "HourlyPensionRetirement",
  "HourlyHealthInsuranceWelfare",
  "HourlyVacationAccrued",
  "HourlyTrainingAccrued",
  "HourlyOtherInsurance",
  "AddOT15",
  "AddOT20",
  "IsFundJointlyManaged",
  "PrevailingDoubleTimeHours",
  "NonPrevailingDoubleTimeHours",
  "PrevailingDoubleTimeWageRate",
  "NonPrevailingDoubleTimeWageRate",
  "NoWorktoReport",
] as const;

/** The slides' dropdown options. */
export const IL_GEOGRAPHIC_DIVISIONS = ["ALL", "N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export const IL_CLASS_TYPES = ["ALL", "BLD", "FLT", "HWY", "O&C", "RIV"] as const;
export const IL_FRINGE_KINDS = ["pension", "health", "vacation", "training", "other"] as const;
export type IlFringeKind = (typeof IL_FRINGE_KINDS)[number];
export const IL_FRINGE_LABELS: Record<IlFringeKind, string> = {
  pension: "Pension / retirement",
  health: "Health insurance / welfare",
  vacation: "Vacation",
  training: "Training",
  other: "Other insurance",
};

const text = () => z.string().trim();
const cents = z.number().int().min(0).max(100_000_000);
const hundredths = z.number().int().min(0).max(2_400);

const addressSchema = z.object({
  address: text().default(""),
  county: text().default(""),
  fips: text().default(""),
  city: text().default(""),
  state: text().default(""),
  zip: text().default(""),
});

export const ilRowSchema = z.object({
  /** IDOL's classification name as on its prevailing rate schedule; "" = the WH-347's. */
  classification: text().default(""),
  region: z.enum(IL_GEOGRAPHIC_DIVISIONS).default("ALL"),
  classType: z.enum(IL_CLASS_TYPES).default("ALL"),
  /** 1 to 14 where the county's schedule numbers the class; null = blank. */
  classCode: z.number().int().min(1).max(14).nullable().default(null),
  foreman: z.boolean().default(false),
  /** Double-time hours (included in the WH-347 overtime) and their rate, if any. */
  dtHundredths: z.number().int().min(0).max(16_800).default(0),
  dtRateCents: cents.default(0),
});

export const ilWorkerSchema = addressSchema.extend({
  middleName: text().default(""),
  /** Last four of the SSN; "" = the WH-347 ID no. when it is four digits. */
  ssnLast4: text().default(""),
  phone1: text().default(""),
  phone2: text().default(""),
  /** Hours on other projects that week, by day of the WH-347 week (oldest first). */
  otherHours: z.array(hundredths).length(7).default([0, 0, 0, 0, 0, 0, 0]),
  /** Of those, overtime hours (the rest is straight time). */
  otherOtHundredths: z.number().int().min(0).max(16_800).default(0),
  otherStRateCents: cents.default(0),
  otherOtRateCents: cents.default(0),
  /** This project's net; null = the WH-347 net split by gross (all of it with no other work). */
  prevailingNetCents: cents.nullable().default(null),
  rows: z.array(ilRowSchema).default([]),
});

export const ilJobSchema = z.object({
  contractNumber: text().default(""),
  /** "" = the WH-347 project number. */
  projectNumber: text().default(""),
  project: addressSchema.default(() => addressSchema.parse({})),
  stateCapitalFunds: z.boolean().default(false),
  contactFirstName: text().default(""),
  contactMiddleName: text().default(""),
  contactLastName: text().default(""),
  contractor: addressSchema.default(() => addressSchema.parse({})),
  phone1: text().default(""),
  phone2: text().default(""),
  email1: text().default(""),
  email2: text().default(""),
  publicBodyName: text().default(""),
  publicBodyContactFirstName: text().default(""),
  publicBodyContactMiddleName: text().default(""),
  publicBodyContactLastName: text().default(""),
  publicBody: addressSchema.default(() => addressSchema.parse({})),
  publicBodyPhone1: text().default(""),
  publicBodyPhone2: text().default(""),
  /** IDOL column for each WH-347 fringe plan, in order; null = guessed. */
  planKinds: z.array(z.enum(IL_FRINGE_KINDS).nullable()).max(6).default([]),
  /** Per-hour AddOT15 / AddOT20 amounts where the schedule owes them; 0 = none. */
  addOt15Cents: cents.default(0),
  addOt20Cents: cents.default(0),
  jointlyManaged: z.boolean().default(false),
});

export type IlRowInput = z.input<typeof ilRowSchema>;
export type IlWorkerInput = z.input<typeof ilWorkerSchema>;
export type IlJobInput = z.input<typeof ilJobSchema>;

/** Held in memory on the page only: never saved with the draft, never sent to PayApps. */
export interface IlId {
  race: string;
  ethnicity: string;
  gender: string;
  veteran: boolean | null;
}

export function guessFringeKind(typeOrName: string): IlFringeKind {
  const s = typeOrName.toLowerCase();
  if (/pension|retire|401|annuit/.test(s)) return "pension";
  if (/health|welfare|medical|dental|vision/.test(s)) return "health";
  if (/vacation|holiday/.test(s)) return "vacation";
  if (/train|apprentic|education/.test(s)) return "training";
  return "other";
}

/** "Illinois" or "il" -> "IL"; anything else -> null. */
export function stateCode(s: string): string | null {
  const full = fullStateName(s);
  if (!full) return null;
  return Object.keys(US_STATES).find((k) => US_STATES[k] === full) ?? null;
}

/** Hundredths (of an hour or a dollar) as the template's plain number: 800 -> "8", 5250 -> "52.5". */
export function num(h: number): string {
  const whole = Math.floor(h / 100);
  const frac = h % 100;
  if (!frac) return String(whole);
  return `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}

/** YYYY-MM-DD -> MM/DD/YYYY, the slides' date format. */
export function usDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

const digits = (s: string) => s.replace(/\D/g, "");
const ZIP = /^(\d{5})(?:-?(\d{4}))?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface IlResult {
  rows: string[][];
  issues: Issue[];
  /** The file, or null while there are errors. */
  csv: string | null;
}

/**
 * IDOL's Full Import CSV for one project and one week. `workers` and `ids` follow
 * `payroll.workers` by position. Errors are fields the portal marks required or values it cannot
 * take; warnings point at things to look at.
 */
export function buildIlCtp(
  payroll: CertifiedPayroll,
  jobInput: IlJobInput,
  workersInput: readonly (IlWorkerInput | undefined)[],
  ids: readonly (IlId | undefined)[],
): IlResult {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) =>
    issues.push({ level: "warning", where, message });

  const parsedJob = ilJobSchema.safeParse(jobInput);
  if (!parsedJob.success)
    err("IDOL", "The Illinois details are not readable: clear and retype them");
  const job = parsedJob.success ? parsedJob.data : ilJobSchema.parse({});

  const wh = computeCertifiedPayroll(payroll);
  for (const i of wh.issues) if (i.where !== "Statement") issues.push(i);
  const days = weekDays(payroll.weekEnding);

  // An address block: [address, county, fips, city, state, zip5, zip4]; `need` = the slides' asterisks.
  const place = (
    where: string,
    a: z.output<typeof addressSchema>,
    need: { county?: boolean },
  ): { state: string; zip5: string; zip4: string; fips: string } => {
    if (!a.address) err(where, "Enter the street address");
    if (!a.city) err(where, "Enter the city");
    if (need.county && !a.county) err(where, "Enter the county");
    const state = stateCode(a.state);
    if (!state) err(where, "Enter the state (IL, or the state's name)");
    const z5 = ZIP.exec(a.zip);
    if (!z5) err(where, "Enter the ZIP code as 12345 or 12345-6789");
    const fips = digits(a.fips);
    if (a.fips && (fips.length < 3 || fips.length > 5)) {
      err(where, "A county FIPS code is 3 digits (or 5 with the state's 17 for Illinois)");
    }
    return { state: state ?? a.state, zip5: z5?.[1] ?? a.zip, zip4: z5?.[2] ?? "", fips };
  };
  const phone = (where: string, label: string, v: string, required: boolean): string => {
    const d = digits(v).replace(/^1(?=\d{10}$)/, "");
    if (!v) {
      if (required) err(where, `Enter the ${label}`);
      return "";
    }
    if (d.length !== 10) err(where, `The ${label} should be 10 digits`);
    return d;
  };

  // Project.
  const projectNumber = job.projectNumber || payroll.projectNumber;
  if (!projectNumber) err("Project", "Enter the project number (or a short name for the project)");
  if (!job.contractNumber) warn("Project", "The contract number column is blank");
  const proj = place("Project", job.project, { county: true });
  if (proj.state !== "IL" && stateCode(job.project.state)) {
    warn("Project", "The project is not in Illinois: IDOL's portal is for Illinois public works");
  }

  // Contractor (the business on the WH-347).
  if (!job.contactFirstName || !job.contactLastName) {
    err("Contractor", "Enter the contact person's first and last name");
  }
  const con = place("Contractor", job.contractor, {});
  const conPhone1 = phone("Contractor", "primary phone", job.phone1, true);
  const conPhone2 = phone("Contractor", "secondary phone", job.phone2, false);
  if (!EMAIL.test(job.email1)) {
    err("Contractor", "Enter the primary email (IDOL sends the PDF of the filed payroll there)");
  }
  if (job.email2 && !EMAIL.test(job.email2)) err("Contractor", "The secondary email is not valid");

  // Public body.
  if (!job.publicBodyName) err("Public body", "Enter the public body's name");
  const pb = place("Public body", job.publicBody, {});
  const pbPhone1 = phone("Public body", "primary phone", job.publicBodyPhone1, false);
  const pbPhone2 = phone("Public body", "secondary phone", job.publicBodyPhone2, false);

  const plans = payroll.fringePlans;
  const kinds = plans.map((p, k) => job.planKinds[k] ?? guessFringeKind(`${p.type} ${p.name}`));

  if (!payroll.workers.length) {
    err("Workers", "The file needs at least one worker (a week with no work needs no payroll)");
  }

  const out: string[][] = [];
  payroll.workers.forEach((w, wi) => {
    const who = `Worker ${wi + 1} (${w.lastName})`;
    const parsed = ilWorkerSchema.safeParse(workersInput[wi] ?? {});
    if (!parsed.success) err(who, "The Illinois details are not readable: retype them");
    const il = parsed.success ? parsed.data : ilWorkerSchema.parse({});
    const cw = wh.workers[wi];
    const id = ids[wi];

    const idNo = w.idNo.trim();
    const ssn4 = il.ssnLast4 || (/^\d{4}$/.test(idNo) ? idNo : "");
    if (!/^\d{4}$/.test(ssn4)) err(who, "Enter the last four digits of the worker's SSN");
    const home = place(who, il, {});
    const ph1 = phone(who, "worker's phone", il.phone1, false);
    const ph2 = phone(who, "worker's second phone", il.phone2, false);

    // Demographics (820 ILCS 130/5 asks for them; FAQ 15: "Ask your employees").
    const race = id?.race.trim() ?? "";
    const ethnicity = id?.ethnicity.trim() ?? "";
    const gender = id?.gender.trim() ?? "";
    if (!race || !ethnicity || !gender || id?.veteran == null) {
      err(
        who,
        "Enter race, ethnicity, gender and veteran status (the Prevailing Wage Act asks for them; IDOL's FAQ says to ask the worker)",
      );
    }

    // Other-project hours.
    const otherTotal = il.otherHours.reduce((a, b) => a + b, 0);
    if (il.otherOtHundredths > otherTotal) {
      err(who, "Overtime hours on other projects are more than the hours on other projects");
    }
    const otherGross = cw ? Math.max(0, cw.grossAllWorkCents - cw.grossProjectCents) : 0;
    if (otherTotal > 0 && otherGross === 0) {
      warn(
        who,
        "Hours on other projects but no other gross: enter gross for all work (7B) above so the file's non-prevailing gross is right",
      );
    }
    if (otherTotal === 0 && otherGross > 0) {
      warn(
        who,
        "Gross for all work is more than this project's, but no hours on other projects are entered",
      );
    }

    // Net: this project's share.
    const net = cw?.netCents ?? 0;
    const grossAll = cw?.grossAllWorkCents ?? 0;
    const grossHere = cw?.grossProjectCents ?? 0;
    let netHere: number;
    if (il.prevailingNetCents !== null) {
      netHere = il.prevailingNetCents;
      if (netHere > net) err(who, "This project's net is more than the worker's net for the week");
    } else if (otherGross > 0 && grossAll > 0) {
      netHere = Math.round((net * grossHere) / grossAll);
      warn(
        who,
        "Net pay is split between this project and other work in proportion to gross; type this project's net if your payroll splits it otherwise",
      );
    } else netHere = net;
    const netOther = Math.max(0, net - netHere);

    // Fringe: hourly credits by IDOL column.
    const fringe: Record<IlFringeKind, number> = {
      pension: 0,
      health: 0,
      vacation: 0,
      training: 0,
      other: 0,
    };
    w.fringeCreditsCents.slice(0, plans.length).forEach((c, k) => {
      const kind = kinds[k] ?? "other";
      fringe[kind] += c;
    });
    if (
      fringe.other > 0 &&
      plans.some((p, k) => kinds[k] === "other" && !/insur/i.test(`${p.type} ${p.name}`))
    ) {
      warn(
        who,
        'A fringe plan that is not insurance is in IDOL\'s "other insurance" column: check its column above',
      );
    }

    const rowGross = wh.rows.filter((r) => r.worker === w);
    let netLeft = netHere;
    w.rows.forEach((r, ri) => {
      const where = w.rows.length > 1 ? `${who}, row ${ri + 1}` : who;
      const ilr = il.rows[ri] ?? ilRowSchema.parse({});
      const classification = ilr.classification || r.classification;
      const stTotal = r.st.reduce((a, b) => a + b, 0);
      const otTotal = r.ot.reduce((a, b) => a + b, 0);
      if (r.cashInLieuHourlyCents > 0) {
        warn(
          where,
          "IDOL's file has no column for cash paid in lieu of fringe: it is left out of the file",
        );
      }
      if (ilr.dtHundredths > otTotal)
        err(where, "Double-time hours are more than the row's overtime hours");
      const g = rowGross[ri]?.grossProjectCents ?? 0;
      const last = ri === w.rows.length - 1;
      const rowNet = last ? netLeft : grossHere > 0 ? Math.round((netHere * g) / grossHere) : 0;
      netLeft -= rowNet;
      const first = ri === 0;

      const byWeekday = Array.from({ length: 7 }, () => ({ here: 0, other: 0 }));
      days.forEach((d, di) => {
        const wd = new Date(`${d.iso}T00:00:00Z`).getUTCDay();
        const slot = byWeekday[wd];
        if (!slot) return;
        slot.here = (r.st[di] ?? 0) + (r.ot[di] ?? 0);
        slot.other = first ? (il.otherHours[di] ?? 0) : 0;
      });
      const otherSt = first ? Math.max(0, otherTotal - il.otherOtHundredths) : 0;
      const otherOt = first ? il.otherOtHundredths : 0;

      out.push([
        usDate(days[0]?.iso ?? payroll.weekEnding),
        usDate(payroll.weekEnding),
        job.contractNumber,
        projectNumber,
        job.project.address,
        job.project.county,
        proj.fips,
        job.project.city,
        proj.state,
        proj.zip5,
        proj.zip4,
        job.stateCapitalFunds ? "1" : "0",
        payroll.businessName,
        job.contactFirstName,
        job.contactMiddleName,
        job.contactLastName,
        job.contractor.address,
        con.fips,
        job.contractor.city,
        con.state,
        con.zip5,
        con.zip4,
        conPhone1,
        conPhone2,
        job.email1,
        job.email2,
        job.publicBodyName,
        job.publicBodyContactFirstName,
        job.publicBodyContactMiddleName,
        job.publicBodyContactLastName,
        job.publicBody.address,
        job.publicBody.county,
        pb.fips,
        job.publicBody.city,
        pb.state,
        pb.zip5,
        pb.zip4,
        pbPhone1,
        pbPhone2,
        w.firstName,
        il.middleName || w.middleInitial,
        w.lastName,
        ssn4,
        ph1,
        ph2,
        classification,
        ilr.region,
        ilr.classType,
        ilr.classCode === null ? "" : String(ilr.classCode),
        il.address,
        il.county,
        home.fips,
        il.city,
        home.state,
        home.zip5,
        home.zip4,
        race,
        ethnicity,
        gender,
        id?.veteran ? "1" : "0",
        r.status === "J" ? "1" : "0",
        r.status === "RA" ? "1" : "0",
        ilr.foreman ? "1" : "0",
        ...byWeekday.flatMap((s) => [num(s.here), num(s.other)]),
        num(stTotal),
        num(otherSt),
        num(otTotal - ilr.dtHundredths),
        num(otherOt),
        num(r.stRateCents),
        num(first ? il.otherStRateCents : 0),
        num(r.otRateCents),
        num(first ? il.otherOtRateCents : 0),
        num(g),
        num(rowNet),
        num(first ? otherGross : 0),
        num(first ? netOther : 0),
        num(fringe.pension),
        num(fringe.health),
        num(fringe.vacation),
        num(fringe.training),
        num(fringe.other),
        num(job.addOt15Cents),
        num(job.addOt20Cents),
        job.jointlyManaged ? "1" : "0",
        num(ilr.dtHundredths),
        "0",
        num(ilr.dtHundredths ? ilr.dtRateCents : 0),
        "0",
        "0",
      ]);
    });
  });

  const seen = new Set<string>();
  const unique = issues.filter((i) => {
    const k = `${i.level}|${i.where}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const hasErr = unique.some((i) => i.level === "error") || !days.length;
  return {
    rows: out,
    issues: unique,
    csv: hasErr ? null : ilCtpCsv(out),
  };
}

export function ilCtpCsv(rows: readonly (readonly string[])[]): string {
  return `${[IL_CTP_COLUMNS, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** "il-ctp-PP-555-2026-08-01.csv". */
export function ilCtpFileName(projectNumber: string, weekEnding: string): string {
  const id =
    projectNumber
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "project";
  return `il-ctp-${id}-${weekEnding}.csv`;
}

/** Next week's Illinois extras: same addresses, phones and classifications; other-project hours cleared. */
export function ilNextWeek(w: IlWorkerInput): IlWorkerInput {
  return {
    ...w,
    otherHours: [0, 0, 0, 0, 0, 0, 0],
    otherOtHundredths: 0,
    prevailingNetCents: null,
    rows: (w.rows ?? []).map((r) => ({ ...r, dtHundredths: 0 })),
  };
}

export const IL_CTP_NOTICE =
  "Prepared with PayApps in the column layout of the Illinois Department of Labor's Certified Transcript of Payroll upload template (Full-CTP-Upload.xlsx, read from labor.illinois.gov, November 2026). Not an IDOL product and not legal advice. Upload it with the portal's Full Import, check the review page before you certify, and check every rate against IDOL's current prevailing rates for the county.";
