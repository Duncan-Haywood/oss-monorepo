// Contractor's sworn statement (pure): every subcontractor, supplier and laborer on the job, what each
// was contracted for, has been paid and is owed now, and what is left, sent with a pay application.
// Runs in the browser (live totals and checks) and the Worker (the PDF).
//
// Illinois (770 ILCS 60/5) has the contractor give the owner a statement of everyone furnishing labor
// or materials and the amounts due or to become due to each before the owner pays. Michigan (MCL
// 570.1110) has the contractor give one to the owner or lessee when payment is due or requested, and
// a subcontractor give one to the contractor, in columns for name, address and phone, type of
// improvement, total contract price, amount already paid, amount currently owing, balance to complete
// (optional), unpaid wages and unpaid fringe benefits and withholdings. Lenders and title companies
// ask for the same table elsewhere. Read 2026-11-25 for the public guide
// (oss-monorepo ventures/pay-app-guides/sworn-statement.html, sworn.mjs), the checks below are a port
// of its builder's.
//
// This builds and checks the table; it is not the statutory form's wording or oath. The PDF prints our
// own heading and a generic jurat with blanks, the same as the application's notary block, and says
// so. Nothing decides what the law requires of a particular job.
//
// Nothing is stored: the form is posted, the PDF comes back. The rows can be prefilled from the job's
// purchase orders and subcontracts (job costing), with what each vendor has invoiced to date as a
// cross-check on paid + owing + retainage.

import { z } from "zod";
import type { JobCostCommitmentDto, PayAppDto, ProjectDetailDto } from "./api/types";
import { formatCents } from "./money";

export const MAX_SWORN_ROWS = 300;

const text = (max: number) => z.string().trim().max(max);
const cents = z.number().int().min(0).max(100_000_000_000);
const signedCents = z.number().int().min(-100_000_000_000).max(100_000_000_000);

export const SWORN_STATES = ["IL", "MI", "other"] as const;
export type SwornState = (typeof SWORN_STATES)[number];
export const SWORN_STATE_LABELS: Record<SwornState, string> = {
  IL: "Illinois (770 ILCS 60/5)",
  MI: "Michigan (MCL 570.1110)",
  other: "Other (a lender's or title company's form)",
};

export const swornRowSchema = z.object({
  name: text(160).min(1, "Enter each party's name"),
  address: text(300).default(""),
  phone: text(40).default(""),
  /** Type of improvement or work furnished. */
  work: text(200).default(""),
  contractCents: cents,
  /** Change orders to the party's contract; negative for a deduct. */
  changesCents: signedCents.default(0),
  retainageCents: cents.default(0),
  paidCents: cents.default(0),
  owingCents: cents.default(0),
  wagesCents: cents.default(0),
  fringeCents: cents.default(0),
  /** What the party has invoiced to date (from job costing), only for a cross-check; null = unknown. */
  billedToDateCents: signedCents.nullable().default(null),
});

export const swornStatementSchema = z.object({
  state: z.enum(SWORN_STATES).default("IL"),
  /** Who signs: the contractor to the owner, or a subcontractor to the contractor above it. */
  role: z.enum(["contractor", "subcontractor"]).default("subcontractor"),
  projectName: text(200).min(1, "Enter the project name"),
  projectLocation: text(300).default(""),
  ownerName: text(200).default(""),
  /** Who the statement goes to (the owner, or the GC for a sub). */
  givenTo: text(200).default(""),
  contractorName: text(200).min(1, "Enter your company's name"),
  contractorAddress: text(300).default(""),
  /** The pay application it goes with, as printed ("No. 4, period to 2026-10-31"). */
  payApp: text(120).default(""),
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  /** Your own contract with change orders; null = not checked. */
  contractSumCents: cents.nullable().default(null),
  /** What the pay application asks for this period; null = not checked. */
  requestedCents: cents.nullable().default(null),
  rows: z.array(swornRowSchema).min(1, "List at least one party").max(MAX_SWORN_ROWS),
  affiantName: text(120).default(""),
  affiantTitle: text(120).default(""),
  notary: z.boolean().default(true),
});

export type SwornRowInput = z.input<typeof swornRowSchema>;
export type SwornRow = z.output<typeof swornRowSchema>;
export type SwornStatementInput = z.input<typeof swornStatementSchema>;
export type SwornStatement = z.output<typeof swornStatementSchema>;

export interface SwornIssue {
  level: "error" | "warning" | "note";
  where: string;
  message: string;
}

export interface ComputedSwornRow extends SwornRow {
  /** Contract with change orders. */
  adjustedCents: number;
  /** Earned to date: paid + owing + retainage. */
  completedCents: number;
  /** Left to pay, retainage included: adjusted - paid - owing. */
  balanceCents: number;
  ownForces: boolean;
}

export interface SwornTotals {
  contractCents: number;
  changesCents: number;
  adjustedCents: number;
  completedCents: number;
  retainageCents: number;
  paidCents: number;
  owingCents: number;
  balanceCents: number;
  wagesCents: number;
  fringeCents: number;
}

export interface WaiverToCollect {
  name: string;
  kind: "conditional" | "unconditional";
  amountCents: number;
}

export interface ComputedSwornStatement {
  input: SwornStatement;
  rows: ComputedSwornRow[];
  totals: SwornTotals;
  issues: SwornIssue[];
  /** Lien waivers to collect from each listed party (own forces left out). */
  waivers: WaiverToCollect[];
}

const OWN_FORCES = /\b(own forces|self[- ]performed|our own|own work)\b/i;
export const isOwnForces = (name: string) => OWN_FORCES.test(name);
export const OWN_FORCES_NAME = "Own forces (labor, overhead and profit)";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function computeSwornStatement(input: SwornStatement): ComputedSwornStatement {
  const issues: SwornIssue[] = [];
  const add = (level: SwornIssue["level"], where: string, message: string) =>
    issues.push({ level, where, message });
  const rows: ComputedSwornRow[] = input.rows.map((r) => {
    const adjustedCents = r.contractCents + r.changesCents;
    const completedCents = r.paidCents + r.owingCents + r.retainageCents;
    return {
      ...r,
      adjustedCents,
      completedCents,
      balanceCents: adjustedCents - r.paidCents - r.owingCents,
      ownForces: isOwnForces(r.name),
    };
  });

  rows.forEach((r, i) => {
    const who = `Row ${i + 1} (${r.name || "no name"})`;
    if (r.adjustedCents < 0) add("error", who, "Change orders take the contract below zero");
    else if (r.completedCents > r.adjustedCents) {
      add(
        "error",
        who,
        `Paid, owing and retainage come to ${formatCents(r.completedCents)}, more than the contract with change orders (${formatCents(r.adjustedCents)}). A change order is missing or an amount is wrong; a statement showing more earned than contracted will be questioned`,
      );
    }
    if (r.billedToDateCents !== null && r.billedToDateCents !== r.completedCents && !r.ownForces) {
      add(
        "warning",
        who,
        `Invoiced to date in job costing is ${formatCents(r.billedToDateCents)}, but paid + owing + retainage is ${formatCents(r.completedCents)}. What a party has billed is either paid, owing now or held as retainage; check the row or the costs entered against its purchase order or subcontract`,
      );
    }
    if (!r.address && !r.ownForces) {
      add(
        "warning",
        who,
        `No address. Both the Illinois and Michigan statutes ask for each party's address${input.state === "MI" ? "; Michigan's form also has a phone column" : ""}`,
      );
    }
    if (input.state === "MI" && !r.work && !r.ownForces) {
      add("note", who, "No type of improvement: Michigan's form has a column for it");
    }
    if (r.wagesCents > 0 || r.fringeCents > 0) {
      add(
        "note",
        who,
        `Unpaid wages ${formatCents(r.wagesCents)}, fringe benefits and withholdings ${formatCents(r.fringeCents)}. Michigan's form lists these in their own columns; an owner can pay laborers directly from what it withholds`,
      );
    }
  });

  const seen = new Map<string, number>();
  for (const r of rows) seen.set(norm(r.name), (seen.get(norm(r.name)) ?? 0) + 1);
  for (const [k, n] of seen) {
    if (n > 1 && k) {
      add(
        "note",
        rows.find((r) => norm(r.name) === k)?.name ?? k,
        `Listed ${n} times. Fine for separate contracts; otherwise combine the rows so each party's totals are clear`,
      );
    }
  }

  const totals: SwornTotals = {
    contractCents: sum(rows.map((r) => r.contractCents)),
    changesCents: sum(rows.map((r) => r.changesCents)),
    adjustedCents: sum(rows.map((r) => r.adjustedCents)),
    completedCents: sum(rows.map((r) => r.completedCents)),
    retainageCents: sum(rows.map((r) => r.retainageCents)),
    paidCents: sum(rows.map((r) => r.paidCents)),
    owingCents: sum(rows.map((r) => r.owingCents)),
    balanceCents: sum(rows.map((r) => r.balanceCents)),
    wagesCents: sum(rows.map((r) => r.wagesCents)),
    fringeCents: sum(rows.map((r) => r.fringeCents)),
  };

  if (input.contractSumCents !== null) {
    const gap = input.contractSumCents - totals.adjustedCents;
    if (gap > 0) {
      add(
        "warning",
        "Totals",
        `The rows add up to ${formatCents(totals.adjustedCents)}, ${formatCents(gap)} less than your contract sum of ${formatCents(input.contractSumCents)}. Most sworn statements carry a row for your own work, overhead and profit so the total equals the contract; add one, or list the party that is missing. A lender or title company will ask`,
      );
    } else if (gap < 0) {
      add(
        "error",
        "Totals",
        `The rows add up to ${formatCents(totals.adjustedCents)}, ${formatCents(-gap)} more than your contract sum of ${formatCents(input.contractSumCents)}. Either your contract sum is missing a change order, or more is committed to subs and suppliers than the job pays you`,
      );
    }
  }
  if (input.requestedCents !== null) {
    if (totals.owingCents > input.requestedCents) {
      add(
        "warning",
        "Totals",
        `The statement shows ${formatCents(totals.owingCents)} owing but the pay application asks for ${formatCents(input.requestedCents)}. In Michigan the owner may withhold, and must on the contractor's written demand, enough to pay the amounts shown; under Illinois' statute an owner who pays without keeping back enough for the listed claims risks paying twice, so asking for less than you owe will be noticed`,
      );
    } else if (totals.owingCents < input.requestedCents) {
      add(
        "warning",
        "Totals",
        `The pay application asks for ${formatCents(input.requestedCents)} but the statement shows ${formatCents(totals.owingCents)} owing. Usually the difference is your own forces' share; put it in that row's "owing" so the statement matches the request`,
      );
    }
  }
  if (!input.affiantName) {
    add(
      "note",
      "Signature",
      "Enter the signer's name and title (printed under the signature line)",
    );
  }

  const waivers: WaiverToCollect[] = rows
    .filter((r) => !r.ownForces)
    .flatMap((r) => [
      ...(r.paidCents > 0
        ? [{ name: r.name, kind: "unconditional" as const, amountCents: r.paidCents }]
        : []),
      ...(r.owingCents > 0
        ? [{ name: r.name, kind: "conditional" as const, amountCents: r.owingCents }]
        : []),
    ]);

  const order = { error: 0, warning: 1, note: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  return { input, rows, totals, issues, waivers };
}

export const swornHasErrors = (s: ComputedSwornStatement) =>
  s.issues.some((i) => i.level === "error");

/** "sworn-statement-pay-app-4-2026-11-26.pdf" */
export function swornStatementFileName(s: SwornStatement): string {
  const app = s.payApp.match(/\d+/)?.[0];
  return `sworn-statement${app ? `-pay-app-${app}` : ""}-${s.statementDate}.pdf`;
}

/**
 * Rows from the job's purchase orders and subcontracts: one per vendor (several commitments to one
 * vendor are combined), contract = the committed amounts, invoiced to date as the cross-check, and
 * an own-forces row for whatever of the contract sum is not committed. Paid, owing and retainage are
 * left at 0 for the user to fill in from their books: PayApps records costs, not what was paid on
 * them, so it never guesses.
 */
export function swornRowsFromCommitments(
  commitments: readonly Pick<
    JobCostCommitmentDto,
    "vendor" | "description" | "kind" | "amountCents" | "invoicedCents" | "afterAsOf"
  >[],
  contractSumCents: number | null,
): SwornRowInput[] {
  const byVendor = new Map<string, SwornRowInput & { works: string[] }>();
  for (const c of commitments) {
    const key = norm(c.vendor);
    if (!key) continue;
    const work = c.description?.trim() || (c.kind === "subcontract" ? "Subcontract" : "Materials");
    const row = byVendor.get(key);
    const billed = c.afterAsOf ? 0 : c.invoicedCents;
    if (row) {
      row.contractCents += c.amountCents;
      row.billedToDateCents = (row.billedToDateCents ?? 0) + billed;
      if (!row.works.includes(work)) row.works.push(work);
    } else {
      byVendor.set(key, {
        name: c.vendor.trim(),
        contractCents: c.amountCents,
        billedToDateCents: billed,
        works: [work],
      });
    }
  }
  const rows: SwornRowInput[] = [...byVendor.values()].map(({ works, ...r }) => ({
    ...r,
    work: works.join("; ").slice(0, 200),
  }));
  const committed = sum(rows.map((r) => r.contractCents));
  if (contractSumCents !== null && contractSumCents > committed) {
    rows.unshift({ name: OWN_FORCES_NAME, contractCents: contractSumCents - committed });
  }
  return rows;
}

/** The pay application a statement goes with: the latest one (drafts included), or null. */
export function latestPayApp<T extends Pick<PayAppDto, "number">>(apps: readonly T[]): T | null {
  return apps.reduce<T | null>((a, b) => (a && a.number >= b.number ? a : b), null);
}

/** The header fields from the job and its latest pay application. */
export function swornHeaderFromProject(
  p: Pick<
    ProjectDetailDto,
    "name" | "location" | "ownerName" | "gcName" | "sovTotalCents" | "payApps"
  >,
  orgName: string,
  today: string,
): Omit<SwornStatementInput, "rows"> {
  const app = latestPayApp(p.payApps);
  return {
    state: "IL",
    role: "subcontractor",
    projectName: p.name,
    projectLocation: p.location ?? "",
    ownerName: p.ownerName ?? "",
    givenTo: p.gcName,
    contractorName: orgName,
    contractorAddress: "",
    payApp: app ? `No. ${app.number}, period to ${app.periodTo}` : "",
    statementDate: today,
    contractSumCents: p.sovTotalCents,
    requestedCents: app ? app.currentPaymentDueCents : null,
    affiantName: "",
    affiantTitle: "",
    notary: true,
  };
}

/** The oath line above the signature: our own words, not a statute's form. */
export function swornAffirmation(s: Pick<SwornStatement, "contractorName">): string {
  return `The undersigned, for ${s.contractorName || "the contractor"}, states that the parties listed above are all who have furnished or are to furnish labor, services or materials for its work on this project under contract with it, that the amounts shown are correct, and that nothing is owed to anyone else for that work except as shown.`;
}

export const SWORN_STATEMENT_NOTICE =
  "Prepared with PayApps from the figures entered. The columns follow what Illinois (770 ILCS 60/5) and Michigan (MCL 570.1110) ask a sworn statement to list; the heading, affirmation and notary block are our own words, not either statute's form. Where the owner, lender, title company or statute prescribes a form, copy these figures onto it. Not legal advice. Sign only what you know to be true: a knowingly false sworn statement can be a crime.";
