// Illustrated walkthrough of the application review screen, for /how-it-works. The mock is a static
// picture assembled from the same components the app uses (Card, Badge, StatusBadge, FactStatusBadge,
// GroundingCard, flag labels), for a clearly fictional food pantry. It is hidden from assistive tech
// and inert; the numbered list beside it carries the same information as text.
//
// The mock follows the real rules: every number in a cited sentence appears in its source quote, the
// unsupported sentence and the missing answer are blockers, open blockers route the application to
// full review, and "Approve & submit" stays disabled until they are resolved.
import { FLAG_KIND_LABEL } from "@client/components/application/model";
import { GroundingCard } from "@client/components/application/summary-cards";
import { FactStatusBadge } from "@client/components/knowledge/badges";
import { Badge, buttonClass, Card, CardBody, CardHeader, StatusBadge } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import type { GroundingReport } from "@shared/content";
import type { FlagKind } from "@shared/enums";
import { AlertOctagon, AlertTriangle, FileText, HelpCircle, Send } from "lucide-react";
import type * as React from "react";

export const REVIEW_CALLOUTS: { n: number; title: string; body: string }[] = [
  {
    n: 1,
    title: "A citation on every factual sentence",
    body: "Each small number points to a fact in your fact base. Open it to see the fact, whether your team has confirmed it, and the exact words from the document it came from.",
  },
  {
    n: 2,
    title: "Unconfirmed facts show in amber",
    body: "This fact was found in one of your documents, but nobody on your team has confirmed it yet. The sentence can stay, but it's flagged, and autopilot can never rely on it.",
  },
  {
    n: 3,
    title: "Unsupported sentences are flagged",
    body: "The independent checker found nothing in your records behind this sentence, so it's underlined in red and listed as a blocker until someone edits or removes it.",
  },
  {
    n: 4,
    title: "Gaps become questions, not guesses",
    body: "The funder asked something your records don't answer. Instead of inventing a number, the draft asks your team. You can answer in a short typed or spoken interview.",
  },
  {
    n: 5,
    title: "A fact-check you can read",
    body: "A count of what the checker looked at: supported claims, number mismatches, gaps and citations to unconfirmed facts. It only passes when nothing is unsupported or missing.",
  },
  {
    n: 6,
    title: "The right level of review, and your approval",
    body: "Open blockers send this application to full review. “Approve & submit” stays disabled until they're resolved, and nothing is sent until a reviewer approves it.",
  },
];

/** Numbered marker matching an entry in REVIEW_CALLOUTS. */
function Marker({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-600 text-xs font-bold text-white shadow-sm ring-2 ring-white",
        className,
      )}
    >
      {n}
    </span>
  );
}

function Cite({ n, tone = "confirmed" }: { n: number; tone?: "confirmed" | "unconfirmed" }) {
  return (
    <span
      className={cn(
        "ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 align-super text-[0.65rem] font-semibold leading-none ring-1 ring-inset",
        tone === "confirmed"
          ? "bg-brand-50 text-brand-800 ring-brand-200"
          : "bg-warning-100 text-warning-900 ring-warning-300",
      )}
    >
      {n}
    </span>
  );
}

const FLAGS: { severity: "blocker" | "warning"; kind: FlagKind; message: string }[] = [
  {
    severity: "blocker",
    kind: "unsupported_claim",
    message:
      "“We expect to double the number of families we serve next year.” No cited fact supports this.",
  },
  {
    severity: "blocker",
    kind: "missing_info",
    message: "The funder asks how many seniors you serve. Your fact base doesn't say.",
  },
  {
    severity: "warning",
    kind: "unconfirmed_fact",
    message: "A claim cites a fact nobody has confirmed yet (source 3).",
  },
];

/** Matches the draft below: 4 factual claims (3 supported, 1 unsupported), 1 gap, 1 unconfirmed. */
const REPORT: GroundingReport = {
  totalClaims: 5,
  factualClaims: 4,
  supported: 3,
  partiallySupported: 0,
  unsupported: 1,
  numericMismatches: 0,
  unconfirmedFactCitations: 1,
  gaps: 1,
  passed: false,
  verdicts: [],
  checkedAt: 0, // 0 hides the "checked … ago" timestamp in GroundingCard
  model: "example",
};

function DraftSectionMock() {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-base font-semibold tracking-tight text-neutral-900">
          Organizational capacity
        </p>
        <span className="text-xs tabular-nums text-neutral-500">54 / 250 words</span>
      </div>
      <p className="mt-2 text-sm text-neutral-500">
        <span className="font-medium text-neutral-600">Funder asks: </span>
        Describe your experience serving your community, including the seniors you serve.
      </p>

      <div className="mt-4 space-y-3 leading-7 text-neutral-800">
        <p>
          Neighbors have been at the center of our work from the start. Last year our pantry
          provided groceries to 1,240 households across two counties.
          <Cite n={1} />
          <Marker n={1} className="ml-1 align-middle" /> Volunteers gave 6,112 hours of their time.
          <Cite n={2} /> Our walk-in cooler holds up to 900 pounds of fresh produce.
          <Cite n={3} tone="unconfirmed" />
          <Marker n={2} className="ml-1 align-middle" />
        </p>
        <p>
          <span className="rounded-sm bg-danger-50 text-danger-900 underline decoration-danger-400 decoration-wavy underline-offset-4">
            We expect to double the number of families we serve next year.
          </span>
          <AlertTriangle className="ml-0.5 inline h-3.5 w-3.5 align-super text-danger-600" />
          <Marker n={3} className="ml-1 align-middle" />
        </p>
      </div>

      <div className="mt-4 flex items-start gap-2">
        <div className="flex flex-1 gap-2 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-950 ring-1 ring-inset ring-warning-200">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" />
          <p>
            <span className="font-semibold">Needs your input: </span>
            How many of the households you served last year included someone aged 60 or older?
          </p>
        </div>
        <Marker n={4} className="mt-1.5" />
      </div>

      <div className="mt-5 space-y-2.5 rounded-xl border border-neutral-200 bg-white p-4 shadow-overlay sm:ml-8">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Source 1</p>
          <FactStatusBadge status="confirmed" />
        </div>
        <p className="font-medium leading-snug text-neutral-900">
          Served 1,240 households across two counties in 2025.
        </p>
        <blockquote className="border-l-2 border-brand-300 pl-3 text-sm italic leading-relaxed text-neutral-600">
          “In 2025 the pantry provided groceries to 1,240 households across two counties.”
        </blockquote>
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <FileText className="h-3.5 w-3.5" />
          From a document · 2025 Annual Report, page 4
        </p>
      </div>
    </Card>
  );
}

function FlagsMock() {
  return (
    <Card>
      <CardHeader>
        <p className="text-base font-semibold tracking-tight text-neutral-900">Flags</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="danger">2 blockers</Badge>
          <Badge tone="warning">1 warning</Badge>
        </div>
      </CardHeader>
      <CardBody>
        <ul className="space-y-2.5">
          {FLAGS.map((f) => {
            const blocker = f.severity === "blocker";
            const Icon = blocker ? AlertOctagon : AlertTriangle;
            return (
              <li
                key={f.kind}
                className={cn(
                  "flex gap-2.5 rounded-lg border p-3 text-sm",
                  blocker
                    ? "border-danger-200 bg-danger-50/70"
                    : "border-warning-200 bg-warning-50/70",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    blocker ? "text-danger-600" : "text-warning-600",
                  )}
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={blocker ? "danger" : "warning"}>
                      {blocker ? "Blocker" : "Warning"}
                    </Badge>
                    <span className="text-xs font-medium text-neutral-600">
                      {FLAG_KIND_LABEL[f.kind]}
                    </span>
                  </div>
                  <p className="text-neutral-900">{f.message}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

function ReviewMock() {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-semibold tracking-tight text-neutral-900">Review</p>
          <Marker n={6} />
        </div>
        <div className="flex flex-wrap gap-2">
          <span aria-disabled className={buttonClass({ size: "sm" })}>
            <Send /> Approve &amp; submit
          </span>
          <span className={buttonClass({ size: "sm", variant: "secondary" })}>Request changes</span>
        </div>
        <p className="text-sm text-neutral-600">Resolve 2 blocking flags before approving.</p>
      </CardBody>
    </Card>
  );
}

/** The static screen itself (decorative; see ReviewWalkthrough for the accessible version). */
export function ReviewScreenMock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "select-none overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 shadow-overlay",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">
            Community Nutrition Grant
          </p>
          <p className="truncate text-xs text-neutral-500">Example Valley Community Foundation</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">Example</Badge>
          <StatusBadge status="needs_info" kind="application" />
          <StatusBadge status="full_review" kind="reviewTier" />
        </div>
      </div>
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.5fr_1fr]">
        <DraftSectionMock />
        <div className="space-y-4">
          <FlagsMock />
          <div className="relative">
            <Marker n={5} className="absolute -left-2 -top-2 z-10" />
            <GroundingCard report={REPORT} />
          </div>
          <ReviewMock />
        </div>
      </div>
    </div>
  );
}

/** Mock review screen plus the numbered explanations that make it accessible. */
export function ReviewWalkthrough({ headingLevel = "h3" }: { headingLevel?: "h3" | "h4" }) {
  const Heading = headingLevel as React.ElementType;
  return (
    <figure aria-labelledby="review-walkthrough-caption" className="space-y-8">
      <div aria-hidden inert>
        <ReviewScreenMock />
      </div>
      <figcaption>
        <p id="review-walkthrough-caption" className="text-sm text-neutral-500">
          An example review screen for a fictional food pantry, after the checker has run. The
          numbers match the notes below.
        </p>
        <ol className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {REVIEW_CALLOUTS.map((c) => (
            <li key={c.n} className="flex gap-3">
              <span aria-hidden>
                <Marker n={c.n} className="mt-0.5 ring-0" />
              </span>
              <div>
                <Heading className="font-semibold text-neutral-900">{c.title}</Heading>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{c.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
