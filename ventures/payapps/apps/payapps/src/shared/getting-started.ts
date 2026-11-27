// The getting-started checklist on the Projects page: the steps from signing up to a first paid
// application, each done or not, computed on read from what the company already has. Nothing is
// stored and nothing can be ticked by hand, so a step is done only when the work is. The sample
// job never counts (it was built for them), and every step names where to do it next.
import type { PayAppStatus } from "./enums";

export interface GettingStartedJob {
  id: string;
  name: string;
  /** Lines on its schedule of values. */
  sovLineCount: number;
  /** Its applications, oldest first; `paymentCount` = payments recorded against each. */
  payApps: { id: string; number: number; status: PayAppStatus; paymentCount: number }[];
}

export interface GettingStartedInput {
  /** Real jobs only (no sample), oldest first. */
  jobs: GettingStartedJob[];
  hasSample: boolean;
  /** Members of the company, including the one reading. */
  memberCount: number;
  pendingInvitationCount: number;
  quickbooksConnected: boolean;
  /** QuickBooks needs Crew or up; on a lower plan the step says so instead of linking. */
  quickbooksOnPlan: boolean;
}

export const GETTING_STARTED_STEPS = [
  "job",
  "sov",
  "pay-app",
  "send",
  "paid",
  "team",
  "quickbooks",
] as const;
export type GettingStartedKey = (typeof GETTING_STARTED_STEPS)[number];

/** Where the step is done: the Projects page, a job, a pay application, or an org page. */
export type GettingStartedTarget =
  | { page: "projects" }
  | { page: "project"; projectId: string }
  | { page: "pay-app"; projectId: string; payAppId: string }
  | { page: "team" }
  | { page: "quickbooks" }
  | { page: "billing" };

export interface GettingStartedStep {
  key: GettingStartedKey;
  title: string;
  /** What to do next (or what was done), in one sentence. */
  detail: string;
  done: boolean;
  /** Optional steps never hold the checklist open. */
  optional: boolean;
  /** Where to go to do it; null once done. */
  target: GettingStartedTarget | null;
}

export interface GettingStarted {
  steps: GettingStartedStep[];
  /** Required steps done, of `requiredTotal`. */
  requiredDone: number;
  requiredTotal: number;
  /** Every required step is done: the page stops showing the checklist. */
  complete: boolean;
}

const SENT: ReadonlySet<PayAppStatus> = new Set(["submitted", "certified", "paid"]);

export function gettingStarted(input: GettingStartedInput): GettingStarted {
  const { jobs } = input;
  const first = jobs[0];
  const withLines = jobs.filter((j) => j.sovLineCount > 0);
  const apps = jobs.flatMap((j) => j.payApps.map((a) => ({ job: j, app: a })));
  const sent = apps.filter(({ app }) => SENT.has(app.status));
  const paid = sent.filter(({ app }) => app.status === "paid" || app.paymentCount > 0);

  const steps: GettingStartedStep[] = [];
  const step = (s: Omit<GettingStartedStep, "target"> & { target: GettingStartedTarget }) =>
    steps.push({ ...s, target: s.done ? null : s.target });

  step({
    key: "job",
    title: "Add your first job",
    detail: first
      ? `${first.name} is set up.`
      : `Enter the subcontract: the GC, the contract sum and the retainage rate.${
          input.hasSample ? " The sample job does not count; it is there to look around." : ""
        }`,
    done: jobs.length > 0,
    optional: false,
    target: { page: "projects" },
  });

  const needsLines = jobs.find((j) => j.sovLineCount === 0);
  step({
    key: "sov",
    title: "Enter the schedule of values",
    detail:
      withLines.length > 0
        ? `${withLines[0]?.name} has ${plural(withLines[0]?.sovLineCount ?? 0, "line")}.`
        : "Import it from your own spreadsheet (.xlsx or CSV), paste rows from Excel, or type the lines in.",
    done: withLines.length > 0,
    optional: false,
    target: needsLines ? { page: "project", projectId: needsLines.id } : { page: "projects" },
  });

  const readyForApp = withLines.find((j) => j.payApps.length === 0) ?? withLines[0];
  step({
    key: "pay-app",
    title: "Start your first pay application",
    detail:
      apps.length > 0
        ? `Application #${apps[0]?.app.number} on ${apps[0]?.job.name} is started.`
        : "Pick the period and enter the work done this month on each line; the totals, retainage and amount due are worked out for you.",
    done: apps.length > 0,
    optional: false,
    target: readyForApp
      ? { page: "project", projectId: readyForApp.id }
      : needsLines
        ? { page: "project", projectId: needsLines.id }
        : { page: "projects" },
  });

  const draft = apps.find(({ app }) => app.status === "draft");
  step({
    key: "send",
    title: "Send it to the GC",
    detail:
      sent.length > 0
        ? `Application #${sent[0]?.app.number} on ${sent[0]?.job.name} is sent.`
        : "Download the summary and continuation sheet PDF (or the CSV), send it, then mark the application submitted so PayApps can track it.",
    done: sent.length > 0,
    optional: false,
    target: draft
      ? { page: "pay-app", projectId: draft.job.id, payAppId: draft.app.id }
      : { page: "projects" },
  });

  const awaiting = sent.find(({ app }) => app.status !== "paid" && app.paymentCount === 0);
  step({
    key: "paid",
    title: "Record the GC's payment",
    detail:
      paid.length > 0
        ? `A payment is recorded on application #${paid[0]?.app.number}; the cash report now ages only what is still owed.`
        : "When the check comes, record it (amount, date, check number). Paid short is fine: the cash report follows the balance.",
    done: paid.length > 0,
    optional: false,
    target: awaiting
      ? { page: "pay-app", projectId: awaiting.job.id, payAppId: awaiting.app.id }
      : { page: "projects" },
  });

  const teamDone = input.memberCount > 1 || input.pendingInvitationCount > 0;
  step({
    key: "team",
    title: "Invite your project manager or bookkeeper",
    detail: teamDone
      ? input.memberCount > 1
        ? `${plural(input.memberCount, "person", "people")} in the company.`
        : `${plural(input.pendingInvitationCount, "invitation")} waiting to be accepted.`
      : "Editors fill in pay applications; viewers can read and download them.",
    done: teamDone,
    optional: true,
    target: { page: "team" },
  });

  step({
    key: "quickbooks",
    title: "Connect QuickBooks Online",
    detail: input.quickbooksConnected
      ? "Connected: sent applications go over as invoices with a retainage line."
      : input.quickbooksOnPlan
        ? "Send each application to QuickBooks as an invoice to the GC, retainage on its own line."
        : "Available on Crew and up: each application goes to QuickBooks as an invoice to the GC.",
    done: input.quickbooksConnected,
    optional: true,
    target: input.quickbooksOnPlan ? { page: "quickbooks" } : { page: "billing" },
  });

  const required = steps.filter((s) => !s.optional);
  const requiredDone = required.filter((s) => s.done).length;
  return {
    steps,
    requiredDone,
    requiredTotal: required.length,
    complete: requiredDone === required.length,
  };
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
