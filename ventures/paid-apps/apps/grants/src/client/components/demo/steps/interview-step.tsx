// Step 2: the interview. A short scripted Q&A fills gaps the documents leave, and a "type your own
// answer" box shows how a new fact would be proposed. Purely local: proposeFactFromAnswer() is a
// handful of string heuristics, there is no AI and nothing leaves the browser.
import { factCategoryLabel } from "@client/components/knowledge/labels";
import { Badge, Button, Label, Textarea } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import { Bot, ChevronRight, Lightbulb, Plus, Sparkles, UserRound } from "lucide-react";
import * as React from "react";
import { DEMO_INTERVIEW, type DemoFactStatus, factById, YOUR_TURN_QUESTION } from "../data";
import { DemoFactCard } from "../demo-bits";
import { type FactStatuses, type ProposedFact, proposeFactFromAnswer } from "../model";

export interface OwnFact {
  id: string;
  fact: ProposedFact;
  status: DemoFactStatus;
}

function Bubble({
  who,
  children,
  side,
}: {
  who: string;
  children: React.ReactNode;
  side: "left" | "right";
}) {
  const Icon = side === "left" ? Bot : UserRound;
  return (
    <div className={cn("flex gap-2.5", side === "right" && "flex-row-reverse")}>
      <span
        aria-hidden
        className={cn(
          "mt-5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          side === "left" ? "bg-brand-100 text-brand-700" : "bg-neutral-200 text-neutral-600",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className={cn("max-w-[85%] min-w-0", side === "right" && "text-right")}>
        <p className="text-xs font-medium text-neutral-500">{who}</p>
        <div
          className={cn(
            "mt-1 rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed",
            side === "left"
              ? "rounded-tl-sm bg-brand-50 text-neutral-900 ring-1 ring-brand-100"
              : "rounded-tr-sm bg-white text-neutral-800 ring-1 ring-neutral-200",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function ProposalPreview({ fact }: { fact: ProposedFact }) {
  return (
    <div
      data-testid="fact-proposal"
      className="space-y-3 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">{factCategoryLabel(fact.category)}</Badge>
        <Badge tone="warning">Needs review</Badge>
        {fact.asOf && <span className="text-xs text-neutral-500">As of {fact.asOf}</span>}
      </div>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Proposed fact
          </dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{fact.statement}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Source quote (your exact words)
          </dt>
          <dd className="mt-0.5 italic text-neutral-600">“{fact.quote}”</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Numbers drafts will be checked against
          </dt>
          <dd className="mt-0.5 text-neutral-700">
            {fact.numbers.length ? fact.numbers.join(", ") : "None"}
          </dd>
        </div>
      </dl>
      {fact.notes.length > 0 && (
        <ul className="space-y-1.5 text-xs text-neutral-600">
          {fact.notes.map((n) => (
            <li key={n} className="flex gap-1.5">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-600" aria-hidden />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function InterviewStep({
  shown,
  onShowNext,
  statuses,
  onStatusChange,
  ownFacts,
  onOwnFactsChange,
}: {
  /** How many scripted questions have been asked so far (1..DEMO_INTERVIEW.length). */
  shown: number;
  onShowNext: () => void;
  statuses: FactStatuses;
  onStatusChange: (factId: string, status: DemoFactStatus) => void;
  ownFacts: OwnFact[];
  onOwnFactsChange: (facts: OwnFact[]) => void;
}) {
  const [answer, setAnswer] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const answerId = React.useId();
  const result = proposeFactFromAnswer(answer);
  const turns = DEMO_INTERVIEW.slice(0, shown);
  const done = shown >= DEMO_INTERVIEW.length;

  const add = () => {
    setTouched(true);
    if (!result.ok) return;
    onOwnFactsChange([
      ...ownFacts,
      { id: `own-${ownFacts.length + 1}`, fact: result.fact, status: "proposed" },
    ]);
    setAnswer("");
    setTouched(false);
  };

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-neutral-600">
        Documents rarely say everything a funder asks. A short interview, typed or spoken, fills the
        gaps. Every answer becomes a proposed fact that quotes the answer word for word.
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="demo-interview-title"
          className="rounded-xl border border-neutral-200 bg-neutral-50 p-5"
        >
          <h3 id="demo-interview-title" className="font-semibold text-neutral-900">
            Interview with the executive director
          </h3>
          <ol className="mt-4 space-y-5" aria-live="polite">
            {turns.map((t) => (
              <li key={t.id} className="space-y-3">
                <Bubble who="Grant Autopilot" side="left">
                  <p className="font-medium">{t.question}</p>
                  <p className="mt-1 text-xs text-neutral-500">{t.why}</p>
                </Bubble>
                <Bubble who="Executive director" side="right">
                  {t.answer}
                </Bubble>
              </li>
            ))}
          </ol>
          {!done ? (
            <Button variant="secondary" className="mt-5" onClick={onShowNext}>
              Next question <ChevronRight aria-hidden />
            </Button>
          ) : (
            <div className="mt-6 space-y-3 rounded-lg border border-brand-200 bg-white p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Your turn
              </p>
              <p className="font-medium text-neutral-900">{YOUR_TURN_QUESTION.question}</p>
              <p className="text-sm text-neutral-500">{YOUR_TURN_QUESTION.why}</p>
              <div className="space-y-1.5">
                <Label htmlFor={answerId}>Type your own answer</Label>
                <Textarea
                  id={answerId}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={`For example: ${YOUR_TURN_QUESTION.sample}`}
                  aria-invalid={touched && !result.ok ? true : undefined}
                  aria-describedby={touched && !result.ok ? `${answerId}-error` : undefined}
                  className="min-h-20"
                />
                {touched && !result.ok && (
                  <p id={`${answerId}-error`} role="alert" className="text-sm text-danger-700">
                    {result.reason}
                  </p>
                )}
              </div>
              {result.ok && <ProposalPreview fact={result.fact} />}
              <div className="flex flex-wrap gap-2">
                <Button onClick={add}>
                  <Plus aria-hidden /> Propose this fact
                </Button>
                {!answer && (
                  <Button variant="ghost" onClick={() => setAnswer(YOUR_TURN_QUESTION.sample)}>
                    Use a sample answer
                  </Button>
                )}
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="demo-interview-facts-title">
          <h3 id="demo-interview-facts-title" className="font-semibold text-neutral-900">
            Facts proposed from this interview
          </h3>
          <ul className="mt-3 space-y-3">
            {turns.flatMap((t) =>
              t.factIds.map((id) => {
                const f = factById(id);
                if (!f) return null;
                return (
                  <li key={id}>
                    <DemoFactCard
                      fact={f}
                      status={statuses[id] ?? f.initialStatus}
                      onStatusChange={(s) => onStatusChange(id, s)}
                    />
                  </li>
                );
              }),
            )}
            {ownFacts.map((o) => (
              <li key={o.id}>
                <DemoFactCard
                  fact={{ id: o.id, ...o.fact }}
                  status={o.status}
                  onStatusChange={(s) =>
                    onOwnFactsChange(ownFacts.map((x) => (x.id === o.id ? { ...x, status: s } : x)))
                  }
                  extra={
                    <p className="mt-2 text-xs text-neutral-500">
                      Source: your answer in this demo
                    </p>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
