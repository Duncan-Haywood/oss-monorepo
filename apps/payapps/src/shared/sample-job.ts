// The sample job a new company can add in one click, to see PayApps working before typing in a job
// of its own: an electrical subcontract three months in, with a schedule of values (a bond line at 0%
// retainage), an approved change order that adds a line, one still waiting on the GC, three
// submitted applications (paid in full, paid short, sent and not yet paid) and this month's draft.
// Every date is relative to the day it is created, so the cash report always has something to show.
// The names are invented and say "sample"; the seeder (services/payapps/sample.ts) runs it through the
// same services as a real job, so the sample obeys every rule a real job does.

export interface SampleEntry {
  /** Index into `sov` (original lines), or "co1" for the line the approved change order adds. */
  line: number | "co1";
  workCents: number;
}

export interface SamplePayApp {
  periodFrom: string;
  periodTo: string;
  applicationDate: string;
  entries: SampleEntry[];
  /** What happens after it is submitted. */
  outcome: "draft" | "submitted" | "paid" | "paid_short";
  /** Date the GC's check arrived (paid and paid_short). */
  paidOn?: string;
  reference?: string;
}

export interface SampleJobPlan {
  project: {
    name: string;
    number: string;
    location: string;
    gcName: string;
    gcAddress: string;
    gcBillingName: string;
    gcBillingEmail: string;
    gcPmName: string;
    gcPmEmail: string;
    ownerName: string;
    architectName: string;
    contractDate: string;
    originalContractSumCents: number;
    retainagePctBps: number;
    storedRetainagePctBps: number;
    payTermsDays: number;
  };
  sov: {
    itemNumber: string;
    description: string;
    originalCents: number;
    retainagePctBps?: number;
  }[];
  approvedChangeOrder: {
    number: string;
    description: string;
    submittedOn: string;
    approvedOn: string;
    scheduleDays: number;
    newLine: { itemNumber: string; description: string };
    amountCents: number;
  };
  pendingChangeOrder: {
    number: string;
    description: string;
    submittedOn: string;
    scheduleDays: number;
    /** Index into `sov`. */
    line: number;
    amountCents: number;
  };
  payApps: SamplePayApp[];
  /** How much less than certified the GC paid on the paid-short application. */
  shortByCents: number;
}

export const SAMPLE_PROJECT_NAME = "Sample job: Maple Street Medical Office";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** First and last day of the month `offset` months from `today`'s month (UTC). */
function month(today: Date, offset: number) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + offset;
  return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
}
function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}
const notAfter = (isoDate: string, limit: string) => (isoDate > limit ? limit : isoDate);

/** The sample job as of `today`. Pure; amounts in cents. */
export function sampleJobPlan(today: Date): SampleJobPlan {
  const t = iso(today);
  const m3 = month(today, -3);
  const m2 = month(today, -2);
  const m1 = month(today, -1);
  const m0 = month(today, 0);
  const contractDate = addDays(month(today, -4).from, 14);
  return {
    project: {
      name: SAMPLE_PROJECT_NAME,
      number: "SAMPLE-1",
      location: "100 Maple Street (sample address)",
      gcName: "Example Builders, Inc. (sample)",
      gcAddress: "1 Example Plaza (sample address)",
      // example.com is reserved (RFC 2606): a draft opened from the sample job reaches no one.
      gcBillingName: "Accounts Payable (sample)",
      gcBillingEmail: "ap@example.com",
      gcPmName: "Project Manager (sample)",
      gcPmEmail: "pm@example.com",
      ownerName: "Sample Clinic Holdings (sample)",
      architectName: "Sample Design Studio (sample)",
      contractDate,
      originalContractSumCents: 24_850_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
      payTermsDays: 30,
    },
    sov: [
      // The subcontract bills its bond without retainage: the line's own rate.
      {
        itemNumber: "1",
        description: "Mobilization and bonds",
        originalCents: 650_000,
        retainagePctBps: 0,
      },
      { itemNumber: "2", description: "Underground and slab conduit", originalCents: 2_800_000 },
      { itemNumber: "3", description: "Rough-in, level 1", originalCents: 5_200_000 },
      { itemNumber: "4", description: "Rough-in, level 2", originalCents: 4_800_000 },
      { itemNumber: "5", description: "Switchgear and panels", originalCents: 6_400_000 },
      { itemNumber: "6", description: "Lighting fixtures and devices", originalCents: 3_800_000 },
      { itemNumber: "7", description: "Fire alarm", originalCents: 1_200_000 },
    ],
    approvedChangeOrder: {
      number: "CO-1",
      description: "Add four EV charger circuits in the parking lot (owner request)",
      submittedOn: addDays(m2.from, 2),
      approvedOn: addDays(m2.from, 9),
      scheduleDays: 3,
      newLine: { itemNumber: "8", description: "CO-1 EV charger circuits" },
      amountCents: 980_000,
    },
    pendingChangeOrder: {
      number: "CO-2",
      description: "Relocate panel LP-2 per RFI 14",
      // Waiting longer than 30 days, so the cash report asks for the signed change order.
      submittedOn: notAfter(addDays(t, -35), t),
      scheduleDays: 0,
      line: 4,
      amountCents: 345_000,
    },
    payApps: [
      {
        periodFrom: m3.from,
        periodTo: m3.to,
        applicationDate: m3.to,
        entries: [
          { line: 0, workCents: 650_000 },
          { line: 1, workCents: 2_800_000 },
          { line: 2, workCents: 1_300_000 },
        ],
        outcome: "paid",
        paidOn: notAfter(addDays(m3.to, 28), t),
        reference: "Check 10412",
      },
      {
        periodFrom: m2.from,
        periodTo: m2.to,
        applicationDate: m2.to,
        entries: [
          { line: 2, workCents: 2_600_000 },
          { line: 3, workCents: 1_200_000 },
          { line: "co1", workCents: 400_000 },
        ],
        outcome: "paid_short",
        paidOn: notAfter(addDays(m2.to, 30), t),
        reference: "Check 10587",
      },
      {
        periodFrom: m1.from,
        periodTo: m1.to,
        applicationDate: m1.to,
        entries: [
          { line: 2, workCents: 1_300_000 },
          { line: 3, workCents: 2_000_000 },
          { line: 4, workCents: 3_000_000 },
          { line: 6, workCents: 300_000 },
          { line: "co1", workCents: 580_000 },
        ],
        outcome: "submitted",
      },
      {
        periodFrom: m0.from,
        periodTo: m0.to,
        applicationDate: m0.to,
        entries: [],
        outcome: "draft",
      },
    ],
    shortByCents: 125_000,
  };
}
