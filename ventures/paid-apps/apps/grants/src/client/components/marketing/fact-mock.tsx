// Static, clearly labeled example of fact-base entries (statement, category, status, verbatim quote and
// source), built from the app's own badges and labels. Decorative: the mock is hidden from assistive
// tech and the visible caption says what it shows. Every number in a statement appears in its quote.
import { FactStatusBadge } from "@client/components/knowledge/badges";
import { factCategoryLabel } from "@client/components/knowledge/labels";
import { Badge, Card } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import type { FactCategory, FactStatus } from "@shared/enums";
import { FileText, Mic } from "lucide-react";

export interface ExampleFact {
  statement: string;
  category: FactCategory;
  status: Extract<FactStatus, "proposed" | "confirmed">;
  quote: string;
  source: string;
  from: "document" | "interview";
}

export function FactBaseMock({
  title,
  facts,
  caption,
  className,
}: {
  title: string;
  facts: readonly ExampleFact[];
  caption: string;
  className?: string;
}) {
  return (
    <figure className={cn("relative isolate", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-100/70 via-white to-accent-100/60 blur-2xl"
      />
      <Card aria-hidden className="select-none overflow-hidden shadow-overlay">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3">
          <p className="truncate text-sm font-medium text-neutral-800">{title}</p>
          <Badge tone="neutral">Example</Badge>
        </div>
        <ul className="divide-y divide-neutral-100">
          {facts.map((f) => {
            const Icon = f.from === "interview" ? Mic : FileText;
            return (
              <li key={f.statement} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand">{factCategoryLabel(f.category)}</Badge>
                  <FactStatusBadge status={f.status} />
                </div>
                <p className="font-medium leading-snug text-neutral-900">{f.statement}</p>
                <blockquote className="border-l-2 border-brand-300 pl-3 text-sm italic leading-relaxed text-neutral-600">
                  “{f.quote}”
                </blockquote>
                <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {f.source}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>
      <figcaption className="mt-4 text-center text-sm text-neutral-500">{caption}</figcaption>
    </figure>
  );
}
