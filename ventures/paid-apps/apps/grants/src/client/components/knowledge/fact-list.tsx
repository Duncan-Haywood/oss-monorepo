// A list of FactCards wired to the fact mutations, with optional bulk-select confirm.
import { friendlyError } from "@client/components/grants/api-errors";
import { Button, EmptyState, toast } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import type { FactDto } from "@shared/api/types";
import { CheckCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { type FactBusy, FactCard } from "./fact-card";
import { useFactActions } from "./queries";

const errMsg = (e: unknown) =>
  friendlyError(e, { conflict: "This fact was replaced by a newer version. Refresh to see it." });

export function FactList({
  orgId,
  facts,
  documentTitles,
  bulk = true,
  emptyTitle = "No facts yet",
  emptyDescription,
  highlightId,
}: {
  orgId: string;
  facts: FactDto[];
  documentTitles?: Map<string, string>;
  bulk?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Fact to emphasise (deep link via ?factId=); its <li> gets id `fact-<id>` for scrolling. */
  highlightId?: string;
}) {
  const { confirm, reject, update, bulkConfirm, stillTrue } = useFactActions(orgId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectable = useMemo(() => facts.filter((f) => f.status === "proposed"), [facts]);
  const selectedIds = selectable.filter((f) => selected.has(f.id)).map((f) => f.id);
  const allSelected = selectable.length > 0 && selectedIds.length === selectable.length;

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const run = (id: string, fn: () => Promise<unknown>) => {
    setErrors(({ [id]: _, ...rest }) => rest);
    fn().catch((e: unknown) => setErrors((s) => ({ ...s, [id]: errMsg(e) })));
  };

  const busyFor = (id: string): FactBusy =>
    confirm.isPending && confirm.variables === id
      ? "confirm"
      : reject.isPending && reject.variables === id
        ? "reject"
        : update.isPending && update.variables?.id === id
          ? "save"
          : stillTrue.isPending && stillTrue.variables === id
            ? "still_true"
            : bulkConfirm.isPending && bulkConfirm.variables?.includes(id)
              ? "confirm"
              : null;

  if (facts.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="space-y-3">
      {bulk && selectable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(selectable.map((f) => f.id)) : new Set())
              }
              className="h-4 w-4 rounded border-neutral-300"
            />
            Select all needing review ({selectable.length})
          </label>
          <span className="flex-1" />
          {bulkConfirm.isError && (
            <span className="text-danger-600" role="alert">
              {errMsg(bulkConfirm.error)}
            </span>
          )}
          <Button
            size="sm"
            disabled={selectedIds.length === 0}
            loading={bulkConfirm.isPending}
            onClick={() =>
              bulkConfirm.mutate(selectedIds, {
                onSuccess: () => {
                  toast.success(
                    `${selectedIds.length} ${selectedIds.length === 1 ? "fact" : "facts"} confirmed`,
                    "Autopilot can now use them in drafts.",
                  );
                  setSelected(new Set());
                },
              })
            }
          >
            <CheckCheck className="h-4 w-4" aria-hidden /> Confirm selected ({selectedIds.length})
          </Button>
        </div>
      )}
      <ul className="space-y-3">
        {facts.map((f) => (
          <li
            key={f.id}
            id={`fact-${f.id}`}
            data-highlighted={f.id === highlightId || undefined}
            aria-current={f.id === highlightId ? "true" : undefined}
            className={cn(
              "scroll-mt-24 rounded-lg",
              f.id === highlightId && "ring-2 ring-warning-400 ring-offset-2",
            )}
          >
            <FactCard
              fact={f}
              orgId={orgId}
              documentTitle={
                f.sourceDocumentId ? documentTitles?.get(f.sourceDocumentId) : undefined
              }
              selectable={bulk && f.status === "proposed"}
              selected={selected.has(f.id)}
              onSelectedChange={(on) => toggle(f.id, on)}
              onConfirm={() => run(f.id, () => confirm.mutateAsync(f.id))}
              onReject={() => run(f.id, () => reject.mutateAsync(f.id))}
              onSave={(patch) => update.mutateAsync({ id: f.id, patch })}
              onStillTrue={() => run(f.id, () => stillTrue.mutateAsync(f.id))}
              busy={busyFor(f.id)}
              error={errors[f.id] ?? null}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
