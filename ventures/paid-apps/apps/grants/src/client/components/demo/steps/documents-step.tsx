// Step 1: documents become facts. Pick a source document to see the facts extracted from it, with
// each verbatim quote highlighted in the text, then confirm or reject the ones that need review.
import { Badge } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import { FileText, MessagesSquare } from "lucide-react";
import * as React from "react";
import {
  DEMO_DOCUMENTS,
  DEMO_FACTS,
  type DemoDocId,
  type DemoFactStatus,
  documentById,
} from "../data";
import { DemoFactCard } from "../demo-bits";
import { type FactStatuses, quoteSegments } from "../model";

const STATUS_MESSAGE: Record<DemoFactStatus, string> = {
  confirmed: "Fact confirmed. Drafts can now rely on it.",
  rejected: "Fact rejected. No draft will use it.",
  proposed: "Fact restored. It needs review again.",
};

export function DocumentsStep({
  docId,
  onDocChange,
  statuses,
  onStatusChange,
}: {
  docId: DemoDocId;
  onDocChange: (id: DemoDocId) => void;
  statuses: FactStatuses;
  onStatusChange: (factId: string, status: DemoFactStatus) => void;
}) {
  const [activeFact, setActiveFact] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");
  const doc = documentById(docId);
  const facts = DEMO_FACTS.filter((f) => f.documentId === docId);
  const needsReview = DEMO_FACTS.filter((f) => statuses[f.id] === "proposed").length;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-neutral-600">
        Juniper Mesa uploaded three short documents. Each fact keeps the exact words it came from,
        and facts wait as <span className="font-medium text-neutral-800">Needs review</span> until a
        person confirms them. Pick a document to see what was found.
      </p>

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">Documents</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {DEMO_DOCUMENTS.map((d) => {
              const count = DEMO_FACTS.filter((f) => f.documentId === d.id).length;
              const selected = d.id === docId;
              const Icon = d.id === "doc-interview" ? MessagesSquare : FileText;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onDocChange(d.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                      selected
                        ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                        : "border-neutral-200 bg-white hover:border-brand-300 hover:bg-neutral-50",
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 h-5 w-5 shrink-0",
                        selected ? "text-brand-700" : "text-neutral-400",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-neutral-900">{d.title}</span>
                      <span className="block text-xs text-neutral-500">
                        {count} facts · {d.kindLabel}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">
            {DEMO_FACTS.length} facts in total · {needsReview} need review
          </p>
        </div>

        <section
          aria-labelledby="demo-doc-title"
          className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="demo-doc-title" className="font-semibold text-neutral-900">
              {doc.title}
            </h3>
            <Badge tone="neutral">{doc.kindLabel}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">{doc.detail}</p>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-neutral-700">
            {doc.paragraphs.map((p) => (
              <p key={p.text} className={cn(p.speaker === "Interviewer" && "text-neutral-500")}>
                {p.speaker && (
                  <span className="mr-1.5 font-semibold text-neutral-900">{p.speaker}:</span>
                )}
                {quoteSegments(p.text, facts).map((s, i) =>
                  s.factId ? (
                    <mark
                      // biome-ignore lint/suspicious/noArrayIndexKey: static split of a string
                      key={i}
                      data-fact-id={s.factId}
                      className={cn(
                        "rounded px-0.5 text-neutral-900 transition-colors",
                        activeFact === s.factId
                          ? "bg-warning-300 ring-2 ring-warning-400"
                          : statuses[s.factId] === "rejected"
                            ? "bg-neutral-100 line-through decoration-neutral-400"
                            : "bg-warning-100",
                      )}
                    >
                      {s.text}
                    </mark>
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static split of a string
                    <React.Fragment key={i}>{s.text}</React.Fragment>
                  ),
                )}
              </p>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
            <span className="inline-block h-3 w-5 rounded bg-warning-100" aria-hidden />
            Highlighted words became facts, quoted exactly.
          </p>
        </section>

        <section aria-labelledby="demo-facts-title">
          <h3 id="demo-facts-title" className="font-semibold text-neutral-900">
            Facts found in this document ({facts.length})
          </h3>
          <ul className="mt-3 space-y-3">
            {facts.map((f) => (
              <li key={f.id}>
                <DemoFactCard
                  fact={f}
                  status={statuses[f.id] ?? f.initialStatus}
                  active={activeFact === f.id}
                  onFocusFact={setActiveFact}
                  onStatusChange={(s) => {
                    onStatusChange(f.id, s);
                    setMessage(STATUS_MESSAGE[s]);
                  }}
                />
              </li>
            ))}
          </ul>
          <p aria-live="polite" className="sr-only">
            {message}
          </p>
        </section>
      </div>
    </div>
  );
}
