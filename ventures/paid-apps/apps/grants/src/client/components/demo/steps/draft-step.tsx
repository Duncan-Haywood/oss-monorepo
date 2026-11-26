// Step 4: the draft review screen. Claim-by-claim text with citation popovers (the verbatim source
// quote), one sentence the checker flagged ("500 families" where the fact says 320), and a gap
// question instead of a guessed number. "Fix it" swaps in the supported sentence and clears the flag.
import { FLAG_KIND_LABEL } from "@client/components/application/model";
import { Badge, Button, Input, Label, Tooltip } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  ShieldAlert,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import * as React from "react";
import { DEMO_DRAFT, DEMO_OPPORTUNITIES, GAP, MISMATCH } from "../data";
import { DemoCitation } from "../demo-bits";
import {
  type DemoFlag,
  type DraftState,
  draftFlags,
  type FactStatuses,
  factCheck,
  type ResolvedClaim,
  resolveDraft,
} from "../model";

/** factId → citation number, in order of first appearance (stable while the draft changes). */
function citationNumbers(claims: ResolvedClaim[]) {
  const numbers = new Map<string, number>();
  for (const id of DEMO_DRAFT.paragraphs.flat().flatMap((c) => c.factIds)) {
    if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
  }
  for (const id of claims.flatMap((c) => c.factIds)) {
    if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
  }
  return numbers;
}

const claimDomId = (id: string) => `demo-claim-${id}`;

function focusClaim(id: string) {
  const el = document.getElementById(claimDomId(id));
  if (!el) return;
  el.scrollIntoView?.({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

function ClaimText({
  claim,
  n,
  statuses,
  gapAnswer,
}: {
  claim: ResolvedClaim;
  n: Map<string, number>;
  statuses: FactStatuses;
  gapAnswer: number | null;
}) {
  if (claim.gap) {
    return (
      <span
        id={claimDomId(claim.id)}
        tabIndex={-1}
        data-claim-id={claim.id}
        data-gap="true"
        className="rounded border border-dashed border-warning-400 bg-warning-50 px-1.5 py-0.5 text-warning-900 outline-none focus-visible:ring-2 focus-visible:ring-warning-300"
      >
        <HelpCircle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
        <span className="font-medium">Needs your answer:</span> {claim.text}
      </span>
    );
  }
  const issue = claim.issue;
  return (
    <span
      id={claimDomId(claim.id)}
      tabIndex={-1}
      data-claim-id={claim.id}
      data-issue={issue?.level}
      className={cn(
        "rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-300",
        issue?.level === "danger" &&
          "bg-danger-50 text-danger-900 underline decoration-danger-400 decoration-wavy underline-offset-4",
        issue?.level === "warning" &&
          "bg-warning-50/70 underline decoration-warning-400 decoration-dotted underline-offset-4",
      )}
    >
      {claim.text}
      {issue && (
        <Tooltip content={issue.reason}>
          <button
            type="button"
            aria-label={`${issue.level === "danger" ? "Not supported" : "Partly supported"}: ${issue.reason}`}
            className={cn(
              "ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded align-super focus-visible:outline-2 focus-visible:outline-focus",
              issue.level === "danger" ? "text-danger-600" : "text-warning-600",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          </button>
        </Tooltip>
      )}
      {claim.factIds.map((id) => (
        <DemoCitation
          key={id}
          n={n.get(id) ?? 0}
          factId={id}
          statuses={statuses}
          gapAnswer={gapAnswer}
        />
      ))}
    </span>
  );
}

const SEVERITY = {
  blocker: {
    icon: AlertOctagon,
    iconClass: "text-danger-600",
    box: "border-danger-200 bg-danger-50/70",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-warning-600",
    box: "border-warning-200 bg-warning-50/70",
  },
};

function GapAnswerForm({ onAnswer }: { onAnswer: (n: number) => void }) {
  const id = React.useId();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number.parseInt(value, 10);
        if (!Number.isFinite(n) || n < 1 || n > 1000) {
          setError("Enter a whole number from 1 to 1,000.");
          return;
        }
        onAnswer(n);
      }}
    >
      <Label htmlFor={id}>Trainees in the first year</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-28"
        />
        <Button type="submit" variant="secondary">
          Answer
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger-700">
          {error}
        </p>
      )}
    </form>
  );
}

function FlagItem({
  flag,
  onFix,
  onAnswer,
  onReviewFacts,
}: {
  flag: DemoFlag;
  onFix: () => void;
  onAnswer: (n: number) => void;
  onReviewFacts: () => void;
}) {
  const s = SEVERITY[flag.severity];
  const Icon = s.icon;
  return (
    <li
      data-flag-id={flag.id}
      data-severity={flag.severity}
      className={cn("rounded-lg border p-4", s.box)}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", s.iconClass)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={flag.severity === "blocker" ? "danger" : "warning"}>
              {flag.severity === "blocker" ? "Blocker" : "Warning"}
            </Badge>
            <span className="text-sm font-medium text-neutral-900">
              {FLAG_KIND_LABEL[flag.kind]}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-neutral-700">{flag.message}</p>
          {flag.action === "fix" && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Supported version
              </p>
              <p className="rounded-md bg-white px-3 py-2 text-sm text-neutral-800 ring-1 ring-neutral-200">
                {MISMATCH.supportedText}
              </p>
              <Button size="sm" onClick={onFix}>
                <Wand2 aria-hidden /> Fix it
              </Button>
            </div>
          )}
          {flag.action === "answer" && (
            <>
              <p className="mt-2 text-sm font-medium text-neutral-900">{GAP.question}</p>
              <GapAnswerForm onAnswer={onAnswer} />
            </>
          )}
          {flag.action === "facts" && (
            <Button size="sm" variant="secondary" className="mt-3" onClick={onReviewFacts}>
              Review facts in step 1
            </Button>
          )}
          <button
            type="button"
            onClick={() => focusClaim(flag.claimId)}
            className="mt-3 block text-xs font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            Show in the draft
          </button>
        </div>
      </div>
    </li>
  );
}

export function DraftStep({
  draft,
  onDraftChange,
  statuses,
  onReviewFacts,
}: {
  draft: DraftState;
  onDraftChange: (d: DraftState) => void;
  statuses: FactStatuses;
  onReviewFacts: () => void;
}) {
  const [message, setMessage] = React.useState("");
  const paragraphs = resolveDraft(draft, statuses);
  const numbers = citationNumbers(paragraphs.flat());
  const flags = draftFlags(draft, statuses);
  const check = factCheck(draft, statuses);
  const blockers = flags.filter((f) => f.severity === "blocker").length;
  const opp = DEMO_OPPORTUNITIES.find((o) => o.id === "opp-trades");

  const fix = () => {
    onDraftChange({ ...draft, fixed: true });
    setMessage("Sentence replaced with the supported version. The number mismatch is resolved.");
    requestAnimationFrame(() => focusClaim("c-families"));
  };
  const answer = (n: number) => {
    onDraftChange({ ...draft, gapAnswer: n });
    setMessage(`Answer saved as a new fact: ${n} trainees. The gap is resolved.`);
    requestAnimationFrame(() => focusClaim("c-gap"));
  };

  const rows: { label: string; value: number; tone: "bad" | "warn" | null }[] = [
    { label: "Supported", value: check.supported, tone: null },
    {
      label: "Number mismatches",
      value: check.numericMismatches,
      tone: check.numericMismatches ? "bad" : null,
    },
    { label: "Unsupported", value: check.unsupported, tone: check.unsupported ? "bad" : null },
    { label: "Gaps", value: check.gaps, tone: check.gaps ? "warn" : null },
    {
      label: "Unconfirmed facts",
      value: check.unconfirmed,
      tone: check.unconfirmed ? "warn" : null,
    },
  ];

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-neutral-600">
        Every factual sentence cites a fact. Open a citation to see the exact words it came from. A
        separate checker compares each sentence with its facts and flags anything that doesn't
        match.
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <article
          aria-labelledby="demo-draft-title"
          className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card sm:p-6"
        >
          <p className="text-xs font-medium text-neutral-500">
            {opp?.title} · {opp?.funder}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <h3 id="demo-draft-title" className="text-lg font-semibold text-neutral-900">
              {DEMO_DRAFT.title}
            </h3>
            {blockers > 0 ? (
              <Badge tone="warning" dot>
                Full review · {blockers} {blockers === 1 ? "blocker" : "blockers"}
              </Badge>
            ) : (
              <Badge tone="success" dot>
                Ready to approve
              </Badge>
            )}
          </div>
          <p className="mt-2 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            <span className="font-medium text-neutral-700">The funder asks: </span>
            {DEMO_DRAFT.prompt}
          </p>
          <div className="mt-5 space-y-4" data-testid="demo-draft">
            {paragraphs.map((p) => (
              <p key={p[0]?.id} className="leading-7 text-neutral-800">
                {p.map((c, i) => (
                  <React.Fragment key={c.id}>
                    {i > 0 && " "}
                    <ClaimText
                      claim={c}
                      n={numbers}
                      statuses={statuses}
                      gapAnswer={draft.gapAnswer}
                    />
                  </React.Fragment>
                ))}
              </p>
            ))}
          </div>
          <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-brand-100 ring-1 ring-brand-300" />
              Confirmed fact
            </span>
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-warning-100 ring-1 ring-warning-300" />
              Not confirmed yet
            </span>
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-danger-100 ring-1 ring-danger-300" />
              Not supported
            </span>
          </p>
        </article>

        <div className="space-y-4">
          <section
            aria-labelledby="demo-flags-title"
            className="rounded-xl border border-neutral-200 bg-white shadow-card"
          >
            <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-5 py-3">
              <h3 id="demo-flags-title" className="font-semibold text-neutral-900">
                Flags
              </h3>
              <Badge tone={flags.length ? "danger" : "success"}>{flags.length} open</Badge>
            </div>
            <div className="p-4">
              {flags.length > 0 ? (
                <ul className="space-y-3">
                  {flags.map((f) => (
                    <FlagItem
                      key={f.id}
                      flag={f}
                      onFix={fix}
                      onAnswer={answer}
                      onReviewFacts={onReviewFacts}
                    />
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-success-800">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  No open flags. Every sentence matches a fact.
                </p>
              )}
              <p aria-live="polite" className="sr-only">
                {message}
              </p>
            </div>
          </section>

          <section
            aria-labelledby="demo-check-title"
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card"
          >
            <div className="flex items-center justify-between gap-2">
              <h3
                id="demo-check-title"
                className="flex items-center gap-2 font-semibold text-neutral-900"
              >
                {check.passed ? (
                  <ShieldCheck className="h-4 w-4 text-success-600" aria-hidden />
                ) : (
                  <ShieldAlert className="h-4 w-4 text-danger-600" aria-hidden />
                )}
                Fact-check
              </h3>
              <Badge tone={check.passed ? "success" : "danger"} dot data-testid="fact-check-status">
                {check.passed ? "Passed" : "Failed"}
              </Badge>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {rows.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-2">
                  <dt className="text-neutral-600">{r.label}</dt>
                  <dd
                    className={cn(
                      "font-semibold tabular-nums",
                      r.tone === "bad" && "text-danger-700",
                      r.tone === "warn" && "text-warning-700",
                      !r.tone && "text-neutral-900",
                    )}
                  >
                    {r.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-neutral-500">
              {check.factualClaims} factual sentences checked. The check passes only when nothing is
              unsupported or missing.
            </p>
          </section>
          {blockers === 0 && (
            <p className="flex items-center gap-1.5 text-sm text-neutral-600">
              <ArrowRight className="h-4 w-4 text-brand-600" aria-hidden />
              Ready for a person to approve. Next, see who does what at each automation level.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
