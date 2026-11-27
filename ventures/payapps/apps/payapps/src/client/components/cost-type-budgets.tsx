// The job-cost page's "Budget by cost type" section: each line's budget split into labor, material,
// equipment, subcontract and other (a won estimate fills it in as bid), against the costs entered on
// the line in each type (src/shared/cost-type-budget.ts). A line's split is edited in place; saving
// it sets the line's budget to the split's sum.
import type { JobCostDto } from "@shared/api/types";
import type { CostTypeLine, CostTypeRow, CostTypeSplit } from "@shared/cost-type-budget";
import { COST_CATEGORIES, COST_CATEGORY_LABELS } from "@shared/job-cost";
import { formatBps, formatCents, parseDollarsToCents } from "@shared/money";
import { useMutation } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

const pct = (b: number | null) => (b === null ? "—" : formatBps(b));

/** The form's text per type into a split; blank types are left out. Throws on a bad amount. */
export function parseSplit(text: Partial<Record<string, string>>, item: string): CostTypeSplit {
  const out: CostTypeSplit = {};
  for (const c of COST_CATEGORIES) {
    const raw = (text[c] ?? "").trim();
    if (raw === "") continue;
    const cents = parseDollarsToCents(raw);
    if (cents === null || cents < 0) {
      throw new Error(
        `${item}: ${COST_CATEGORY_LABELS[c].toLowerCase()} "${raw}" is not an amount`,
      );
    }
    out[c] = cents;
  }
  return out;
}

function Row({ r, first, line }: { r: CostTypeRow; first: boolean; line: CostTypeLine | null }) {
  return (
    <tr className={r.overBudget ? "text-red-700" : ""}>
      <td className="td">{first && line ? line.itemNumber : ""}</td>
      <td className="td">{first && line ? line.description : ""}</td>
      <td className="td">{COST_CATEGORY_LABELS[r.category]}</td>
      <td className="td text-right tabular-nums">
        {line && !line.split ? "—" : formatCents(r.budgetCents)}
      </td>
      <td className="td text-right tabular-nums">{formatCents(r.costToDateCents)}</td>
      <td className="td text-right tabular-nums">
        {line && !line.split ? "—" : formatCents(r.remainingCents)}
      </td>
      <td className="td text-right tabular-nums">{pct(r.costPctOfBudgetBps)}</td>
    </tr>
  );
}

export function CostTypeBudgets({
  d,
  base,
  canChange,
  onSaved,
}: {
  d: JobCostDto;
  base: string;
  canChange: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState<Partial<Record<string, string>>>({});
  const save = useMutation({
    mutationFn: ({ sovLineId, clear }: { sovLineId: string; clear: boolean }) => {
      const line = d.costTypes.lines.find((l) => l.sovLineId === sovLineId);
      const split = clear ? null : parseSplit(text, line?.itemNumber ?? "Line");
      if (split && Object.keys(split).length === 0) {
        throw new Error("Enter at least one amount, or use Clear split");
      }
      return api<JobCostDto>(`${base}/cost-type-budgets`, {
        method: "PUT",
        body: { lines: [{ sovLineId, split }] },
      });
    },
    onSuccess: async () => {
      setEditing(null);
      await onSaved();
    },
  });
  const start = (sovLineId: string) => {
    const saved = d.costTypeSplits[sovLineId] ?? {};
    setText(
      Object.fromEntries(
        COST_CATEGORIES.map((c) => [c, saved[c] === undefined ? "" : (saved[c] / 100).toFixed(2)]),
      ),
    );
    save.reset();
    setEditing(sovLineId);
  };
  const ct = d.costTypes;
  const shown = ct.lines.filter((l) => l.split || l.rows.length > 0 || editing === l.sovLineId);
  const unsplit = ct.lines.filter((l) => !l.split);
  return (
    <section className="card overflow-x-auto">
      <h2 className="font-semibold">Budget by cost type</h2>
      <p className="mb-2 text-sm text-slate-600">
        {ct.splitLineCount > 0
          ? `${ct.splitLineCount} of ${ct.lines.length} line${ct.lines.length === 1 ? "" : "s"} split into labor, material, equipment, subcontract and other.`
          : "No line is split by cost type yet."}{" "}
        A job made from a won estimate starts split the way it was bid (material includes its sales
        tax). Costs are matched by the cost type they were entered with.
      </p>
      {shown.length > 0 && (
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Item</th>
              <th className="th">Description</th>
              <th className="th">Cost type</th>
              <th className="th text-right">Budget</th>
              <th className="th text-right">Cost to date</th>
              <th className="th text-right">Remaining</th>
              <th className="th text-right" title="Cost to date / budget">
                Cost %
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <Fragment key={l.sovLineId}>
                {editing === l.sovLineId ? (
                  <tr>
                    <td className="td">{l.itemNumber}</td>
                    <td className="td">{l.description}</td>
                    <td className="td" colSpan={5}>
                      <div className="flex flex-wrap items-end gap-2">
                        {COST_CATEGORIES.map((c) => (
                          <label key={c} className="text-xs">
                            {COST_CATEGORY_LABELS[c]}
                            <input
                              aria-label={`${COST_CATEGORY_LABELS[c]} budget for ${l.itemNumber}`}
                              className="input block w-28 text-right"
                              inputMode="decimal"
                              value={text[c] ?? ""}
                              onChange={(e) => setText((s) => ({ ...s, [c]: e.target.value }))}
                            />
                          </label>
                        ))}
                        <button
                          type="button"
                          className="btn"
                          disabled={save.isPending}
                          onClick={() => save.mutate({ sovLineId: l.sovLineId, clear: false })}
                        >
                          Save
                        </button>
                        {l.split && (
                          <button
                            type="button"
                            className="text-sm underline"
                            disabled={save.isPending}
                            onClick={() => save.mutate({ sovLineId: l.sovLineId, clear: true })}
                          >
                            Clear split
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-sm underline"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Saving sets the line's budget to the total of these amounts. Clearing the
                        split keeps the line's budget.
                      </p>
                      <ErrorText error={save.error} />
                    </td>
                  </tr>
                ) : (
                  <>
                    {l.rows.length === 0 && (
                      <tr>
                        <td className="td">{l.itemNumber}</td>
                        <td className="td">{l.description}</td>
                        <td className="td text-slate-500" colSpan={5}>
                          Split, no amounts and no costs yet
                        </td>
                      </tr>
                    )}
                    {l.rows.map((r, i) => (
                      <Row key={r.category} r={r} first={i === 0} line={l} />
                    ))}
                    <tr>
                      <td className="td" colSpan={7}>
                        <span className="text-xs text-slate-500">
                          {l.split
                            ? `Split total ${formatCents(l.splitCents)}`
                            : "Not split: costs by type shown, no budget by type"}
                          {l.unsplitCents !== null &&
                            ` · the line's budget is ${formatCents(Math.abs(l.unsplitCents))} ${l.unsplitCents > 0 ? "more" : "less"} than the split (changed since); not spread over the types`}
                        </span>
                        {canChange && (
                          <button
                            type="button"
                            className="ml-2 text-xs underline"
                            onClick={() => start(l.sovLineId)}
                          >
                            {l.split ? "Edit split" : "Split by cost type"}
                          </button>
                        )}
                      </td>
                    </tr>
                  </>
                )}
              </Fragment>
            ))}
            {ct.totals.length > 0 && ct.splitLineCount > 0 && (
              <>
                <tr>
                  <td className="td font-semibold" colSpan={7}>
                    Split lines, by cost type
                  </td>
                </tr>
                {ct.totals.map((r) => (
                  <Row key={`t-${r.category}`} r={r} first={false} line={null} />
                ))}
              </>
            )}
          </tbody>
        </table>
      )}
      {canChange && unsplit.length > 0 && editing === null && (
        <div className="mt-2 text-sm">
          <label>
            Split another line:{" "}
            <select
              aria-label="Line to split by cost type"
              className="input inline-block w-auto"
              value=""
              onChange={(e) => e.target.value && start(e.target.value)}
            >
              <option value="">Pick a line…</option>
              {unsplit.map((l) => (
                <option key={l.sovLineId} value={l.sovLineId}>
                  {l.itemNumber} {l.description}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Red: the line has spent more in that cost type than its budget for it. The line's budget,
        not the split, drives the estimate at completion and the WIP schedule.
      </p>
    </section>
  );
}
