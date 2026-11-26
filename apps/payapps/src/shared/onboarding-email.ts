// The two getting-started emails, as words and links (the worker renders and sends them:
// services/payapps/onboarding.ts). Both are built from the same checklist the Projects page shows
// (getting-started.ts), so an email never says a step is done when the page says it is not.
//
// - Welcome: once, to whoever creates their first company, with the five steps to a paid
//   application and the sample job.
// - No job yet: once per company, from the weekly cron, 3 to 30 days after the company was created,
//   while it has no real job (a sample job alone does not count). The ways in: a new job, a job
//   already billed elsewhere, the sample.
// - First send: once per company, from the weekly cron, when a real job exists but no application
//   is marked sent 5 to 60 days after the company was created. It names the next open step.
// Both reminders carry a signed one-click stop for that member and company (services/payapps/
// onboarding.ts); the welcome email is a one-off reply to creating the company and needs none.
import {
  type GettingStarted,
  type GettingStartedStep,
  type GettingStartedTarget,
  gettingStarted,
} from "./getting-started";

/** Days after the company was created before the reminder, and after which it is never sent. */
export const FIRST_SEND_AFTER_DAYS = 5;
export const FIRST_SEND_UNTIL_DAYS = 60;
/** The same window for the no-job reminder: shorter, since a company with no job has less to lose. */
export const NO_JOB_AFTER_DAYS = 3;
export const NO_JOB_UNTIL_DAYS = 30;

export interface OnboardingEmailContent {
  /** Fixed text: customer-typed names never reach a mail header. */
  subject: string;
  paragraphs: string[];
  action: { label: string; path: string };
  footer: string;
}

/** The app path for a checklist target (the same pages the Projects page links to). */
export function targetPath(orgId: string, target: GettingStartedTarget | null): string {
  const org = `/orgs/${encodeURIComponent(orgId)}`;
  if (!target) return org;
  switch (target.page) {
    case "projects":
      return org;
    case "project":
      return `${org}/projects/${encodeURIComponent(target.projectId)}`;
    case "pay-app":
      return `${org}/projects/${encodeURIComponent(target.projectId)}/pay-apps/${encodeURIComponent(target.payAppId)}`;
    case "team":
      return `${org}/team`;
    case "quickbooks":
      return `${org}/quickbooks`;
    case "billing":
      return `${org}/billing`;
  }
}

/** The required steps of an empty company, in order: the welcome email's list. */
function emptyCompanySteps(): GettingStartedStep[] {
  return gettingStarted({
    jobs: [],
    hasSample: false,
    memberCount: 1,
    pendingInvitationCount: 0,
    quickbooksConnected: false,
    quickbooksOnPlan: false,
  }).steps.filter((s) => !s.optional);
}

export function welcomeEmailContent(opts: {
  orgId: string;
  orgName: string;
}): OnboardingEmailContent {
  const steps = emptyCompanySteps();
  return {
    subject: "Welcome to PayApps: five steps to your first paid application",
    paragraphs: [
      `${opts.orgName} is set up on PayApps. These ${steps.length} steps take you from here to a paid pay application, and the checklist on your Projects page ticks each one off as you do it:`,
      ...steps.map((s, i) => `${i + 1}. ${s.title}. ${s.detail}`),
      'Want to look around first? "Try a sample job" on the Projects page adds an electrical subcontract three months in, with a late application, a short payment and a change order waiting. Its numbers are invented and marked as sample everywhere.',
      "Already billing this job in a spreadsheet or other software? Enter it as a mid-job start: your last application's totals carry over and the next number continues from there.",
    ],
    action: { label: "Open your checklist", path: targetPath(opts.orgId, { page: "projects" }) },
    footer:
      "You get this email once, because you created this company on PayApps. Every figure PayApps prints comes from what you enter: check each application before you send it.",
  };
}

/**
 * The one reminder, or null when it should not go: no real job yet (nothing to remind about), an
 * application already marked sent, or the checklist complete.
 */
export function firstSendEmailContent(
  gs: GettingStarted,
  opts: { orgId: string; orgName: string; daysSinceCreated: number },
): OnboardingEmailContent | null {
  const byKey = new Map(gs.steps.map((s) => [s.key, s]));
  if (gs.complete || !byKey.get("job")?.done || byKey.get("send")?.done) return null;
  const required = gs.steps.filter((s) => !s.optional);
  const next = required.find((s) => !s.done);
  if (!next) return null;
  const done = required.filter((s) => s.done);
  const days = Math.max(0, Math.floor(opts.daysSinceCreated));
  return {
    subject: "Your first pay application on PayApps",
    paragraphs: [
      `You set up ${opts.orgName} on PayApps ${days === 1 ? "a day" : `${days} days`} ago. No pay application there is marked sent yet.`,
      `Done so far: ${done.map((s) => s.detail).join(" ")}`,
      `Next: ${next.title}. ${next.detail}`,
      ...(next.key === "send"
        ? [
            "Sent it already? Mark the application submitted so the cash report can age it and tell you when the GC owes you.",
          ]
        : []),
    ],
    action: { label: next.title, path: targetPath(opts.orgId, next.target) },
    footer:
      "This is the last getting-started reminder we send for this company. You get it because you created the company on PayApps.",
  };
}

const daysAgo = (d: number) => {
  const days = Math.max(0, Math.floor(d));
  return days === 1 ? "a day" : `${days} days`;
};

/**
 * The no-job reminder, or null when the company already has a real job (then the first-send
 * reminder takes over). A sample job alone does not stop it: looking around is not billing.
 */
export function noJobEmailContent(
  gs: GettingStarted,
  opts: { orgId: string; orgName: string; daysSinceCreated: number; hasSample: boolean },
): OnboardingEmailContent | null {
  const job = gs.steps.find((s) => s.key === "job");
  if (!job || job.done) return null;
  return {
    subject: "Add your first job to PayApps",
    paragraphs: [
      `You set up ${opts.orgName} on PayApps ${daysAgo(opts.daysSinceCreated)} ago. There is no job in it yet, so there is nothing to bill.`,
      "Pick the job you bill next. Enter the GC, the contract sum and the retainage rate, then bring in the schedule of values from your own spreadsheet (.xlsx or CSV) or paste the rows from Excel.",
      "Already billing it somewhere else? Enter it as a mid-job start: fill it from your last continuation sheet, and the next application number and the work to date carry over.",
      opts.hasSample
        ? "Your sample job is still there to look around. It never counts as a job and its numbers are invented."
        : 'Want to see a job three months in first? "Try a sample job" on the Projects page adds one, with a late application, a short payment and a change order waiting. Its numbers are invented.',
    ],
    action: { label: job.title, path: targetPath(opts.orgId, job.target) },
    footer:
      "We send at most one more getting-started reminder for this company, once it has a job. You get this because you created the company on PayApps.",
  };
}
