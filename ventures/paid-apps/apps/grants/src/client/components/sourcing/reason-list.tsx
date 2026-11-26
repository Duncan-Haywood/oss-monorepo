// Fit reasons with links to the cited facts (same look as the opportunity detail "Why" list).
import { KbLink } from "@client/components/knowledge/link";
import { cn } from "@client/lib/cn";
import type { MatchReason } from "@shared/content";
import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";

const POLARITY: Record<
  MatchReason["polarity"],
  { icon: typeof CheckCircle2; cls: string; label: string }
> = {
  positive: { icon: CheckCircle2, cls: "text-success-600", label: "Strength" },
  negative: { icon: XCircle, cls: "text-danger-600", label: "Concern" },
  neutral: { icon: MinusCircle, cls: "text-neutral-400", label: "Note" },
};

export const factHref = (orgId: string, factId: string) =>
  `/orgs/${encodeURIComponent(orgId)}/knowledge/facts?factId=${encodeURIComponent(factId)}`;

export function ReasonList({
  orgId,
  reasons,
  className,
}: {
  orgId: string;
  reasons: readonly MatchReason[];
  className?: string;
}) {
  if (reasons.length === 0) {
    return (
      <p className="text-sm text-neutral-500">No fit reasons were recorded for this prospect.</p>
    );
  }
  return (
    <ul className={cn("space-y-2", className)}>
      {reasons.map((r, i) => {
        const p = POLARITY[r.polarity] ?? POLARITY.neutral;
        const Icon = p.icon;
        const factIds = r.factIds ?? [];
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: reasons have no id and never reorder
          <li key={i} className="flex gap-2 text-sm text-neutral-700">
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", p.cls)} aria-hidden />
            <span>
              <span className="sr-only">{p.label}: </span>
              {r.text}
              {factIds.length > 0 && (
                <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                  {factIds.map((fid, n) => (
                    <KbLink
                      key={fid}
                      href={factHref(orgId, fid)}
                      className="rounded bg-neutral-100 px-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 hover:underline"
                      title={`Cited fact ${fid}`}
                    >
                      [{n + 1}]<span className="sr-only"> view cited fact {fid}</span>
                    </KbLink>
                  ))}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
