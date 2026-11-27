// Purchase orders from QuickBooks, inside "Costs from QuickBooks" on the job-cost page
// (docs/QUICKBOOKS.md, "Purchase orders from QuickBooks"): read the purchase-order lines tagged to
// the job's customer in the same dates and import the ticked ones as commitments. Bills made from
// those orders are put against them, so an order's open amount shrinks as it is billed.
import type { JobCostDto, JobCostQboPoLineDto, JobCostQboPoLinesDto } from "@shared/api/types";
import { COST_CATEGORIES, COST_CATEGORY_LABELS, type CostCategory } from "@shared/job-cost";
import { linkLabel } from "@shared/job-cost-qbo";
import { formatCents } from "@shared/money";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

type Pick = { checked: boolean; sovLineId: string; category: CostCategory };

/** What the row says about an order line: imported, closed, or nothing. */
export function poNote(l: JobCostQboPoLineDto): string | null {
  if (l.imported) {
    if (!l.imported.thisJob) return "Imported into another job";
    if (l.imported.amountCents !== l.amountCents) {
      return `Imported at ${formatCents(l.imported.amountCents)}; changed in QuickBooks since. Edit the commitment below.`;
    }
    return "Imported";
  }
  if (l.status === "Closed") {
    return l.manuallyClosed
      ? "Closed by hand in QuickBooks: what was not billed is no longer to come, so it is not ticked."
      : "Closed in QuickBooks (billed in full), so it is not ticked.";
  }
  return null;
}

/** Open order lines not yet imported start ticked; closed ones do not. */
export const ticksByDefault = (l: JobCostQboPoLineDto) =>
  l.imported === null && l.status !== "Closed";

export function PurchaseOrdersFromQuickBooks({
  d,
  qb,
  win,
  onSaved,
}: {
  d: JobCostDto;
  /** `.../job-cost/quickbooks` */
  qb: string;
  win: { from: string; to: string };
  onSaved: () => Promise<void>;
}) {
  const [list, setList] = useState<JobCostQboPoLinesDto | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [done, setDone] = useState<string | null>(null);

  const read = useMutation({
    mutationFn: () =>
      api<JobCostQboPoLinesDto>(
        `${qb}/purchase-orders?${new URLSearchParams({ from: win.from, to: win.to })}`,
      ),
    onSuccess: (r) => {
      setList(r);
      setPicks(
        Object.fromEntries(
          r.lines.map((l) => [
            l.source,
            { checked: ticksByDefault(l), sovLineId: "", category: l.suggestedCategory },
          ]),
        ),
      );
    },
  });
  const chosen = list
    ? list.lines.filter((l) => l.imported === null && picks[l.source]?.checked)
    : [];
  const importLines = useMutation({
    mutationFn: () =>
      api<{ added: number; skipped: number; linked: number }>(`${qb}/purchase-orders/import`, {
        method: "POST",
        body: {
          from: list?.from,
          to: list?.to,
          lines: chosen.map((l) => ({
            source: l.source,
            sovLineId: picks[l.source]?.sovLineId || null,
            category: picks[l.source]?.category ?? l.suggestedCategory,
          })),
        },
      }),
    onSuccess: async (r) => {
      setDone(
        [
          `Added ${r.added} commitment${r.added === 1 ? "" : "s"}`,
          r.skipped ? `${r.skipped} already imported` : null,
          r.linked
            ? `${r.linked} imported cost${r.linked === 1 ? "" : "s"} from those orders put against them`
            : null,
        ]
          .filter(Boolean)
          .join("; ")
          .concat("."),
      );
      await onSaved();
      read.mutate();
    },
  });

  const set = (source: string, patch: Partial<Pick>) =>
    setPicks((p) => ({ ...p, [source]: { ...(p[source] as Pick), ...patch } }));
  const total = chosen.reduce((a, l) => a + l.amountCents, 0);

  return (
    <div className="space-y-3 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-medium">Purchase orders</h3>
        <button
          type="button"
          className="btn-secondary"
          disabled={read.isPending}
          onClick={() => {
            setDone(null);
            read.mutate();
          }}
        >
          {read.isPending ? "Reading…" : "Read purchase orders"}
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Purchase orders tagged to this job's customer, dated in the range above, imported as
        commitments (cost still to come). A bill made from one of them in QuickBooks is put against
        it, so the order's open amount goes down as it is billed instead of counting twice.
      </p>
      {read.error && <ErrorText error={read.error} />}
      {list && <PoLines d={d} list={list} picks={picks} set={set} />}
      {list && list.lines.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn"
            disabled={chosen.length === 0 || importLines.isPending}
            onClick={() => importLines.mutate()}
          >
            Import {chosen.length} as commitments ({formatCents(total)})
          </button>
          {done && <span className="text-sm text-green-700">{done}</span>}
        </div>
      )}
      {importLines.error && <ErrorText error={importLines.error} />}
    </div>
  );
}

function PoLines({
  d,
  list,
  picks,
  set,
}: {
  d: JobCostDto;
  list: JobCostQboPoLinesDto;
  picks: Record<string, Pick>;
  set: (source: string, patch: Partial<Pick>) => void;
}) {
  if (list.lines.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No purchase orders in QuickBooks tagged to {linkLabel(list.link)} from {list.from} to{" "}
        {list.to}.
      </p>
    );
  }
  return (
    <>
      {list.truncated && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          QuickBooks has more purchase orders in these dates than one read takes; narrow the dates
          to see them all.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="th" />
            <th className="th">Date</th>
            <th className="th">PO</th>
            <th className="th">Vendor / item</th>
            <th className="th">Line</th>
            <th className="th">Category</th>
            <th className="th text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {list.lines.map((l) => {
            const pick = picks[l.source];
            const open = l.imported === null && pick !== undefined;
            const note = poNote(l);
            return (
              <tr key={l.source} className={open ? "" : "text-slate-500"}>
                <td className="td">
                  {open ? (
                    <input
                      type="checkbox"
                      aria-label={`Import PO ${l.docNumber ?? ""} ${l.vendor ?? ""} ${formatCents(l.amountCents)}`
                        .replace(/\s+/g, " ")
                        .trim()}
                      checked={pick.checked}
                      onChange={(e) => set(l.source, { checked: e.target.checked })}
                    />
                  ) : null}
                </td>
                <td className="td">{l.txnDate}</td>
                <td className="td">
                  {l.docNumber ?? "—"}
                  {l.status ? <span className="block text-xs">{l.status}</span> : null}
                </td>
                <td className="td">
                  {[l.vendor, l.account, l.description].filter(Boolean).join(" · ")}
                  {note && <span className="block text-xs">{note}</span>}
                </td>
                <td className="td">
                  {open && (
                    <select
                      className="input"
                      aria-label="Schedule-of-values line for the order"
                      value={pick.sovLineId}
                      onChange={(e) => set(l.source, { sovLineId: e.target.value })}
                    >
                      <option value="">No line</option>
                      {d.report.lines.map((x) => (
                        <option key={x.sovLineId} value={x.sovLineId}>
                          {x.itemNumber} {x.description}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="td">
                  {open && (
                    <select
                      className="input"
                      aria-label="Category for the order"
                      value={pick.category}
                      onChange={(e) => set(l.source, { category: e.target.value as CostCategory })}
                    >
                      {COST_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {COST_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="td text-right tabular-nums">{formatCents(l.amountCents)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
