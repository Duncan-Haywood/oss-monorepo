// The guided, six-step walkthrough of the product with the imagined charity Juniper Mesa. All state is
// local (React state, never persisted or sent): fact statuses, interview answers, the draft fix, the
// automation level and the simulated submission carry across steps, so going back keeps your changes.
import { Button } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import * as React from "react";
import { DEMO_OPPORTUNITIES, type DemoDocId, type DemoFactStatus } from "./data";
import { DemoNotice } from "./demo-bits";
import {
  type AutomationLevelId,
  type DraftState,
  type FactStatuses,
  initialFactStatuses,
  rankOpportunities,
} from "./model";
import { AutomationStep } from "./steps/automation-step";
import { DocumentsStep } from "./steps/documents-step";
import { DraftStep } from "./steps/draft-step";
import { InterviewStep, type OwnFact } from "./steps/interview-step";
import { MatchesStep } from "./steps/matches-step";
import { SubmitStep } from "./steps/submit-step";

export const DEMO_STEPS = [
  { id: "documents", label: "Documents", title: "Documents become facts" },
  { id: "interview", label: "Interview", title: "An interview fills the gaps" },
  { id: "matches", label: "Grant matches", title: "Grants ranked by fit and value" },
  { id: "draft", label: "Draft review", title: "Review a draft, claim by claim" },
  { id: "automation", label: "Automation", title: "Choose how much runs on its own" },
  { id: "submit", label: "Submit", title: "Submit and follow up" },
] as const;

const LAST = DEMO_STEPS.length - 1;

export function DemoTour({ initialStep = 0 }: { initialStep?: number }) {
  const [step, setStep] = React.useState(() => Math.max(0, Math.min(LAST, initialStep)));
  const [visited, setVisited] = React.useState<ReadonlySet<number>>(() => new Set([step]));
  const [statuses, setStatuses] = React.useState<FactStatuses>(initialFactStatuses);
  const [docId, setDocId] = React.useState<DemoDocId>("doc-annual");
  const [interviewShown, setInterviewShown] = React.useState(1);
  const [ownFacts, setOwnFacts] = React.useState<OwnFact[]>([]);
  const [matchId, setMatchId] = React.useState(
    () => rankOpportunities()[0]?.id ?? DEMO_OPPORTUNITIES[0]?.id ?? "",
  );
  const [draft, setDraft] = React.useState<DraftState>({ fixed: false, gapAnswer: null });
  const [level, setLevel] = React.useState<AutomationLevelId>("assisted");
  const [submitted, setSubmitted] = React.useState(false);

  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const moved = React.useRef(false);
  const stepButtons = React.useRef<(HTMLButtonElement | null)[]>([]);

  const goTo = (next: number, { focusHeading = true } = {}) => {
    const n = Math.max(0, Math.min(LAST, next));
    setStep(n);
    setVisited((v) => new Set(v).add(n));
    moved.current = focusHeading;
  };

  // After a user-initiated step change, move focus to the new step's heading (screen readers then
  // read it) and bring it into view. Not on first render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the step changes
  React.useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const h = headingRef.current;
    if (!h) return;
    h.focus({ preventScroll: true });
    h.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [step]);

  const setFactStatus = (id: string, s: DemoFactStatus) =>
    setStatuses((prev) => ({ ...prev, [id]: s }));

  const onStepperKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(LAST, i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, i - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = LAST;
    if (next === -1) return;
    e.preventDefault();
    stepButtons.current[next]?.focus();
  };

  const current = DEMO_STEPS[step] ?? DEMO_STEPS[0];
  const nextStep = DEMO_STEPS[step + 1];

  return (
    <div className="space-y-6">
      <nav aria-label="Demo steps">
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {DEMO_STEPS.map((s, i) => {
            const active = i === step;
            const done = visited.has(i) && !active;
            return (
              <li key={s.id}>
                <button
                  ref={(el) => {
                    stepButtons.current[i] = el;
                  }}
                  type="button"
                  aria-current={active ? "step" : undefined}
                  onClick={() => goTo(i)}
                  onKeyDown={(e) => onStepperKey(e, i)}
                  className={cn(
                    "group flex w-full flex-col gap-1.5 rounded-lg border-t-4 px-1 pt-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    active
                      ? "border-brand-600"
                      : done
                        ? "border-brand-200 hover:border-brand-400"
                        : "border-neutral-200 hover:border-neutral-300",
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-semibold",
                      active ? "text-brand-700" : "text-neutral-500",
                    )}
                  >
                    {done ? (
                      <Check className="h-3.5 w-3.5 text-brand-600" aria-hidden />
                    ) : (
                      <span aria-hidden>{i + 1}</span>
                    )}
                    <span className="sr-only">Step {i + 1}: </span>
                    <span className={cn(!active && "group-hover:text-neutral-700")}>{s.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section
        aria-labelledby="demo-step-title"
        data-step={current.id}
        className="scroll-mt-24 rounded-2xl border border-neutral-200 bg-white/70 p-4 shadow-card sm:p-6 lg:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-brand-700">
              Step {step + 1} of {DEMO_STEPS.length}
            </p>
            <h2
              id="demo-step-title"
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 outline-none sm:text-3xl"
            >
              {current.title}
            </h2>
          </div>
          <DemoNotice />
        </div>

        <div className="mt-6">
          {current.id === "documents" && (
            <DocumentsStep
              docId={docId}
              onDocChange={setDocId}
              statuses={statuses}
              onStatusChange={setFactStatus}
            />
          )}
          {current.id === "interview" && (
            <InterviewStep
              shown={interviewShown}
              onShowNext={() => setInterviewShown((n) => n + 1)}
              statuses={statuses}
              onStatusChange={setFactStatus}
              ownFacts={ownFacts}
              onOwnFactsChange={setOwnFacts}
            />
          )}
          {current.id === "matches" && (
            <MatchesStep selectedId={matchId} onSelect={setMatchId} statuses={statuses} />
          )}
          {current.id === "draft" && (
            <DraftStep
              draft={draft}
              onDraftChange={(d) => {
                setDraft(d);
                setSubmitted(false);
              }}
              statuses={statuses}
              onReviewFacts={() => goTo(0)}
            />
          )}
          {current.id === "automation" && (
            <AutomationStep
              level={level}
              onLevelChange={setLevel}
              draft={draft}
              statuses={statuses}
            />
          )}
          {current.id === "submit" && (
            <SubmitStep
              draft={draft}
              statuses={statuses}
              submitted={submitted}
              onSubmit={() => setSubmitted(true)}
              onBackToDraft={() => goTo(3)}
            />
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-5">
          <Button variant="secondary" onClick={() => goTo(step - 1)} disabled={step === 0}>
            <ArrowLeft aria-hidden /> Back
          </Button>
          {nextStep ? (
            <Button onClick={() => goTo(step + 1)}>
              Next: {nextStep.label} <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => goTo(0)}>
              Back to step 1
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
