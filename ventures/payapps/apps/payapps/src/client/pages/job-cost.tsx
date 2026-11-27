// /orgs/$orgId/projects/$projectId/job-cost : the job's cost budget per line, costs entered or pasted,
// and the job-cost report (src/shared/job-cost.ts) worked against the latest sent pay application.
import type { JobCostCommitmentDto, JobCostDto, JobCostEntryDto } from "@shared/api/types";
import {
  COMMITMENT_KIND_LABELS,
  COMMITMENT_KINDS,
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  type CommitmentKind,
  type CostCategory,
  type JobCostLine,
  parseCostPaste,
} from "@shared/job-cost";
import { formatBps, formatCents, parseDollarsToCents } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { CostTypeBudgets } from "../components/cost-type-budgets";
import { ErrorText } from "../components/error";
import { CostsFromQuickBooks } from "../components/job-cost-qbo";
import { meQuery } from "../components/layout";
import { PayrollImport } from "../components/payroll-import";
import { api, projectPath } from "../lib/api";

const money = (c: number | null) => (c === null ? "—" : formatCents(c));
const pct = (b: number | null) => (b === null ? "—" : formatBps(b));

export const JOB_COST_NOTE =
  "A working schedule worked by cost-to-cost percent complete, from the costs and budgets typed here and your sent pay applications. It is not a financial statement or accounting advice: review it with your accountant before it goes to a surety or a bank.";

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {note && <div className="text-xs text-slate-500">{note}</div>}
    </div>
  );
}

export function overUnderText(cents: number | null): string {
  if (cents === null) return "—";
  if (cents === 0) return "Even";
  return cents > 0 ? `${formatCents(cents)} over billed` : `${formatCents(-cents)} under billed`;
}

export function JobCostPage() {
  const { orgId, projectId } = useParams({ from: "/orgs/$orgId/projects/$projectId/job-cost" });
  const key = ["job-cost", orgId, projectId];
  const qc = useQueryClient();
  const base = projectPath(orgId, projectId, "/job-cost");
  const q = useQuery({ queryKey: key, queryFn: () => api<JobCostDto>(base) });
  const me = useQuery(meQuery);
  const role = me.data?.memberships.find((m) => m.orgId === orgId)?.role ?? null;
  const isEditor = role !== null && role !== "viewer";
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  if (q.error) return <ErrorText error={q.error} />;
  if (!q.data) return <p className="text-sm text-slate-500">Loading…</p>;
  const d = q.data;
  const t = d.report.totals;
  const canChange = isEditor && d.canEdit;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/orgs/$orgId/projects/$projectId"
          params={{ orgId, projectId }}
          className="text-sm text-slate-600 underline"
        >
          ← {d.projectName}
        </Link>
        <h1 className="text-2xl font-semibold">Job cost</h1>
        <p className="text-sm text-slate-600">
          {d.billedThrough
            ? `Billing from pay application #${d.billedThrough.number} (period to ${d.billedThrough.periodTo}); costs dated on or before that day. Drafts are left out.`
            : "No pay application sent yet: billing is $0 and every cost counts."}{" "}
          <a className="underline" href={`${base}/job-cost.csv`}>
            Download CSV
          </a>{" "}
          ·{" "}
          <Link to="/orgs/$orgId/wip" params={{ orgId }} className="underline">
            WIP schedule, all jobs
          </Link>
        </p>
        {!d.canEdit && (
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
            Job costing is in the Crew plan and up. What is here stays readable;{" "}
            <Link to="/orgs/$orgId/billing" params={{ orgId }} className="underline">
              upgrade
            </Link>{" "}
            to enter budgets and costs.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Contract to date" value={money(t.contractCents)} />
        <Tile
          label="Cost to date"
          value={money(t.costToDateCents)}
          note={`Estimate at completion ${money(t.estimateAtCompletionCents)}${
            t.costToCompleteLines > 0 && t.estimateVsBudgetCents !== null
              ? ` (${t.estimateVsBudgetCents >= 0 ? `${formatCents(t.estimateVsBudgetCents)} over` : `${formatCents(-t.estimateVsBudgetCents)} under`} budget, ${t.costToCompleteLines} line${t.costToCompleteLines === 1 ? "" : "s"} re-estimated)`
              : ""
          }${t.openCommittedCents > 0 ? ` · ${formatCents(t.openCommittedCents)} open on POs and subcontracts` : ""}`}
        />
        <Tile
          label="Percent complete (by cost)"
          value={pct(t.percentCompleteBps)}
          note={`Earned ${money(t.earnedRevenueCents)} · billed ${money(t.billedToDateCents)}`}
        />
        <Tile
          label="Over / under billing"
          value={overUnderText(t.overUnderBilledCents)}
          note={`Projected gross profit ${money(t.projectedGrossProfitCents)} (${pct(t.projectedMarginBps)})`}
        />
      </div>

      {d.report.issues.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {d.report.issues.map((i) => (
            <li key={`${i.code}-${i.sovLineId ?? ""}`}>{i.message}</li>
          ))}
        </ul>
      )}

      <Budgets d={d} base={base} canChange={canChange} onSaved={refresh} />
      <CostTypeBudgets d={d} base={base} canChange={canChange} onSaved={refresh} />
      <Commitments d={d} base={base} canChange={canChange} canDelete={isEditor} onSaved={refresh} />
      <Costs d={d} base={base} canChange={canChange} canDelete={isEditor} onSaved={refresh} />
      {canChange && <CostsFromQuickBooks d={d} base={base} onSaved={refresh} />}

      <p className="text-xs text-slate-500">{JOB_COST_NOTE}</p>
    </div>
  );
}

function Budgets({
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
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState<Record<string, string>>({});
  const [ctcText, setCtcText] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => {
      const lines = d.report.lines.map((l) => {
        const raw = (text[l.sovLineId] ?? "").trim();
        const budgetCents = raw === "" ? null : parseDollarsToCents(raw);
        if (raw !== "" && (budgetCents === null || budgetCents < 0)) {
          throw new Error(`${l.itemNumber}: "${raw}" is not an amount`);
        }
        const rawCtc = (ctcText[l.sovLineId] ?? "").trim();
        const costToCompleteCents = rawCtc === "" ? null : parseDollarsToCents(rawCtc);
        if (rawCtc !== "" && (costToCompleteCents === null || costToCompleteCents < 0)) {
          throw new Error(`${l.itemNumber}: cost to complete "${rawCtc}" is not an amount`);
        }
        if (costToCompleteCents !== null && budgetCents === null) {
          throw new Error(`${l.itemNumber}: enter the budget before a cost to complete`);
        }
        return { sovLineId: l.sovLineId, budgetCents, costToCompleteCents };
      });
      return api<JobCostDto>(`${base}/budgets`, { method: "PUT", body: { lines } });
    },
    onSuccess: async () => {
      setEditing(false);
      await onSaved();
    },
  });
  const start = () => {
    setText(
      Object.fromEntries(
        d.report.lines.map((l) => [
          l.sovLineId,
          l.budgetCents === null ? "" : (l.budgetCents / 100).toFixed(2),
        ]),
      ),
    );
    setCtcText(
      Object.fromEntries(
        d.report.lines.map((l) => [
          l.sovLineId,
          l.costToCompleteCents === null ? "" : (l.costToCompleteCents / 100).toFixed(2),
        ]),
      ),
    );
    setEditing(true);
  };
  const flag = (l: JobCostLine) =>
    l.overBudget || (l.estimateVsBudgetCents !== null && l.estimateVsBudgetCents > 0)
      ? "text-red-700"
      : l.costPctOfBudgetBps !== null &&
          l.billedPctBps !== null &&
          l.costPctOfBudgetBps - l.billedPctBps > 1000
        ? "text-amber-700"
        : "";
  return (
    <section className="card overflow-x-auto">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold">Budget and cost by line</h2>
        {canChange && !editing && (
          <button type="button" className="text-sm underline" onClick={start}>
            Edit budgets and estimates
          </button>
        )}
      </div>
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">Item</th>
            <th className="th">Description</th>
            <th className="th text-right">Scheduled value</th>
            <th className="th text-right">Budget</th>
            <th className="th text-right">Cost to date</th>
            <th className="th text-right">Remaining</th>
            <th className="th text-right" title="Cost to date / budget">
              Cost %
            </th>
            <th className="th text-right" title="Billed to date / scheduled value">
              Billed %
            </th>
            <th
              className="th text-right"
              title="The project manager's estimate of the cost still to come on the line, as of the day it was typed"
            >
              Cost to complete
            </th>
            <th
              className="th text-right"
              title="Estimated cost at completion (and against the budget)"
            >
              Estimate
            </th>
          </tr>
        </thead>
        <tbody>
          {d.report.lines.map((l) => (
            <tr key={l.sovLineId} className={flag(l)}>
              <td className="td">{l.itemNumber}</td>
              <td className="td">{l.description}</td>
              <td className="td text-right tabular-nums">{money(l.scheduledValueCents)}</td>
              <td className="td text-right tabular-nums">
                {editing ? (
                  <input
                    aria-label={`Budget for ${l.itemNumber}`}
                    className="input w-32 text-right"
                    inputMode="decimal"
                    value={text[l.sovLineId] ?? ""}
                    onChange={(e) => setText((s) => ({ ...s, [l.sovLineId]: e.target.value }))}
                  />
                ) : (
                  money(l.budgetCents)
                )}
              </td>
              <td className="td text-right tabular-nums">{money(l.costToDateCents)}</td>
              <td className="td text-right tabular-nums">{money(l.budgetRemainingCents)}</td>
              <td className="td text-right tabular-nums">{pct(l.costPctOfBudgetBps)}</td>
              <td className="td text-right tabular-nums">{pct(l.billedPctBps)}</td>
              <td className="td text-right tabular-nums">
                {editing ? (
                  <input
                    aria-label={`Cost to complete for ${l.itemNumber}`}
                    className="input w-32 text-right"
                    inputMode="decimal"
                    placeholder="from budget"
                    value={ctcText[l.sovLineId] ?? ""}
                    onChange={(e) => setCtcText((s) => ({ ...s, [l.sovLineId]: e.target.value }))}
                  />
                ) : l.costToCompleteCents === null ? (
                  "—"
                ) : (
                  <span title={`Typed ${l.costToCompleteOn}; costs dated after it use it up`}>
                    {money(l.costToCompleteCents)}
                    <span className="block text-xs text-slate-500">as of {l.costToCompleteOn}</span>
                  </span>
                )}
              </td>
              <td className="td text-right tabular-nums">
                {money(l.estimateAtCompletionCents)}
                {l.openCommittedCents > 0 && (
                  <span
                    className="block text-xs text-slate-500"
                    title="Still to be invoiced on the line's purchase orders and subcontracts"
                  >
                    {l.estimateBasis === "committed" ? "committed: " : ""}
                    {formatCents(l.openCommittedCents)} open
                  </span>
                )}
                {l.estimateVsBudgetCents !== null && l.estimateVsBudgetCents !== 0 && (
                  <span className="block text-xs">
                    {l.estimateVsBudgetCents > 0
                      ? `${formatCents(l.estimateVsBudgetCents)} over budget`
                      : `${formatCents(-l.estimateVsBudgetCents)} under budget`}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">
        Red: cost, or the revised estimate, is over the line's budget. Amber: the line's cost is
        more than ten points ahead of its billing, so it may be under billed. With a cost to
        complete typed, the estimate is the line's cost through that day plus the cost to complete,
        and percent complete follows it; without one, the budget is the estimate. Either way the
        estimate is never less than the cost to date plus what is still to be invoiced on the line's
        purchase orders and subcontracts.
      </p>
      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="btn"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </button>
          <button type="button" className="text-sm underline" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <span className="text-xs text-slate-500">
            Budget: your estimated cost for each line, from the bid (blank clears it; 0 is a line
            with no cost). Cost to complete: what the line still has to cost from today, when the
            budget no longer holds (blank uses the budget).
          </span>
        </div>
      )}
      <ErrorText error={save.error} />
    </section>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

const commitmentLabel = (c: JobCostCommitmentDto) =>
  `${c.kind === "purchase_order" ? "PO" : "Sub"} ${c.reference ? `${c.reference} ` : ""}${c.vendor}`;

function Commitments({
  d,
  base,
  canChange,
  canDelete,
  onSaved,
}: {
  d: JobCostDto;
  base: string;
  canChange: boolean;
  canDelete: boolean;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    kind: "purchase_order" as CommitmentKind,
    committedOn: today(),
    amount: "",
    category: "material" as CostCategory,
    sovLineId: "",
    vendor: "",
    reference: "",
    description: "",
  });
  const [editing, setEditing] = useState<{ id: string; amount: string } | null>(null);
  const lineName = new Map(
    d.report.lines.map((l) => [l.sovLineId, `${l.itemNumber} ${l.description}`]),
  );

  const add = useMutation({
    mutationFn: () => {
      const amountCents = parseDollarsToCents(form.amount);
      if (amountCents === null || amountCents <= 0) throw new Error("Enter the committed amount");
      if (!form.vendor.trim()) throw new Error("Enter the vendor or subcontractor");
      return api(`${base}/commitments`, {
        method: "POST",
        body: {
          kind: form.kind,
          committedOn: form.committedOn,
          amountCents,
          category: form.category,
          sovLineId: form.sovLineId || null,
          vendor: form.vendor.trim(),
          reference: form.reference || null,
          description: form.description || null,
        },
      });
    },
    onSuccess: async () => {
      setForm((f) => ({ ...f, amount: "", vendor: "", reference: "", description: "" }));
      await onSaved();
    },
  });

  const changeAmount = useMutation({
    mutationFn: (e: { id: string; amount: string }) => {
      const amountCents = parseDollarsToCents(e.amount);
      if (amountCents === null || amountCents <= 0) throw new Error("Enter the committed amount");
      return api(`${base}/commitments/${e.id}`, { method: "PATCH", body: { amountCents } });
    },
    onSuccess: async () => {
      setEditing(null);
      await onSaved();
    },
  });

  const remove = useMutation({
    mutationFn: (c: JobCostCommitmentDto) =>
      api(`${base}/commitments/${c.id}`, { method: "DELETE" }),
    onSuccess: onSaved,
  });

  const t = d.report.totals;
  return (
    <section className="card space-y-3 overflow-x-auto">
      <h2 className="font-semibold">Purchase orders and subcontracts</h2>
      <p className="text-sm text-slate-600">
        Money the job is already bound to spend. What is not yet invoiced on each one counts as cost
        still to come, so the estimate at completion never falls below cost to date plus the open
        amount. Put each supplier invoice or sub pay app against its PO or subcontract in Costs
        below.
        {t.committedCents > 0 &&
          ` Committed ${formatCents(t.committedCents)}; open ${formatCents(t.openCommittedCents)}.`}
      </p>
      {canChange && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <label className="text-sm">
            Type
            <select
              className="input block"
              value={form.kind}
              onChange={(e) => {
                const kind = e.target.value as CommitmentKind;
                setForm({
                  ...form,
                  kind,
                  category: kind === "subcontract" ? "subcontract" : "material",
                });
              }}
            >
              {COMMITMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {COMMITMENT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Number
            <input
              className="input block w-24"
              placeholder="PO-1042"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Vendor or subcontractor
            <input
              className="input block w-44"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Date
            <input
              type="date"
              className="input block"
              value={form.committedOn}
              onChange={(e) => setForm({ ...form, committedOn: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Amount
            <input
              className="input block w-28 text-right"
              inputMode="decimal"
              placeholder="18,500.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Category
            <select
              className="input block"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as CostCategory })}
            >
              {COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {COST_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Line
            <select
              className="input block"
              value={form.sovLineId}
              onChange={(e) => setForm({ ...form, sovLineId: e.target.value })}
            >
              <option value="">Not on a line</option>
              {d.report.lines.map((l) => (
                <option key={l.sovLineId} value={l.sovLineId}>
                  {l.itemNumber} {l.description}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Description
            <input
              className="input block w-48"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <button type="submit" className="btn" disabled={add.isPending}>
            Add
          </button>
          <ErrorText error={add.error} />
        </form>
      )}
      {d.commitments.length === 0 ? (
        <p className="text-sm text-slate-500">No purchase orders or subcontracts yet.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Date</th>
              <th className="th">PO / subcontract</th>
              <th className="th">Line</th>
              <th className="th text-right">Committed</th>
              <th className="th text-right">Invoiced</th>
              <th className="th text-right">Open</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {d.commitments.map((c) => (
              <tr key={c.id} className={c.overInvoicedCents > 0 ? "bg-red-50" : undefined}>
                <td className="td">{c.committedOn}</td>
                <td className="td">
                  {commitmentLabel(c)}
                  <span className="block text-xs text-slate-500">
                    {[COST_CATEGORY_LABELS[c.category], c.description].filter(Boolean).join(" · ")}
                    {c.afterAsOf && " · dated after the billing period, not counted yet"}
                  </span>
                </td>
                <td className="td">{c.sovLineId ? (lineName.get(c.sovLineId) ?? "—") : "—"}</td>
                <td className="td text-right tabular-nums">
                  {editing?.id === c.id ? (
                    <input
                      aria-label={`New amount for ${commitmentLabel(c)}`}
                      className="input w-28 text-right"
                      inputMode="decimal"
                      value={editing.amount}
                      onChange={(e) => setEditing({ id: c.id, amount: e.target.value })}
                    />
                  ) : (
                    formatCents(c.amountCents)
                  )}
                </td>
                <td className="td text-right tabular-nums">
                  {formatCents(c.invoicedCents)}
                  {c.overInvoicedCents > 0 && (
                    <span className="block text-xs text-red-700">
                      {formatCents(c.overInvoicedCents)} over
                    </span>
                  )}
                </td>
                <td className="td text-right tabular-nums">{formatCents(c.openCents)}</td>
                <td className="td whitespace-nowrap text-right">
                  {editing?.id === c.id ? (
                    <>
                      <button
                        type="button"
                        className="text-sm underline"
                        disabled={changeAmount.isPending}
                        onClick={() => changeAmount.mutate(editing)}
                      >
                        Save
                      </button>{" "}
                      <button
                        type="button"
                        className="text-sm underline"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {canChange && (
                        <button
                          type="button"
                          className="text-sm underline"
                          title="A change order to the PO or subcontract: enter the new total"
                          onClick={() =>
                            setEditing({ id: c.id, amount: (c.amountCents / 100).toFixed(2) })
                          }
                        >
                          Change amount
                        </button>
                      )}{" "}
                      {canDelete && (
                        <button
                          type="button"
                          className="text-sm underline"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete this PO or subcontract? Costs entered against it stay.",
                              )
                            )
                              remove.mutate(c);
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ErrorText error={changeAmount.error} />
      <ErrorText error={remove.error} />
    </section>
  );
}

function Costs({
  d,
  base,
  canChange,
  canDelete,
  onSaved,
}: {
  d: JobCostDto;
  base: string;
  canChange: boolean;
  canDelete: boolean;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    incurredOn: today(),
    amount: "",
    category: "labor" as CostCategory,
    sovLineId: "",
    vendor: "",
    description: "",
    commitmentId: "",
  });
  const [paste, setPaste] = useState("");
  const commitmentName = new Map(d.commitments.map((c) => [c.id, commitmentLabel(c)]));
  const lineName = new Map(
    d.report.lines.map((l) => [l.sovLineId, `${l.itemNumber} ${l.description}`]),
  );
  const byItem = new Map(
    d.report.lines.map((l) => [l.itemNumber.trim().toLowerCase(), l.sovLineId]),
  );

  const add = useMutation({
    mutationFn: () => {
      const amountCents = parseDollarsToCents(form.amount);
      if (amountCents === null || amountCents === 0)
        throw new Error("Enter an amount other than 0");
      return api(`${base}/entries`, {
        method: "POST",
        body: {
          entries: [
            {
              incurredOn: form.incurredOn,
              amountCents,
              category: form.category,
              sovLineId: form.sovLineId || null,
              vendor: form.vendor || null,
              description: form.description || null,
              commitmentId: form.commitmentId || null,
            },
          ],
        },
      });
    },
    onSuccess: async () => {
      setForm((f) => ({ ...f, amount: "", vendor: "", description: "", commitmentId: "" }));
      await onSaved();
    },
  });

  const parsed = paste.trim() ? parseCostPaste(paste) : null;
  const unknownItems = parsed
    ? parsed.rows.filter((r) => r.itemNumber && !byItem.has(r.itemNumber.toLowerCase())).length
    : 0;
  const importPaste = useMutation({
    mutationFn: () => {
      if (!parsed || parsed.rows.length === 0) throw new Error("Nothing to add");
      if (parsed.errors.length > 0) throw new Error("Fix the rows listed below first");
      if (unknownItems > 0) throw new Error("Some item numbers are not lines on this job");
      return api(`${base}/entries`, {
        method: "POST",
        body: {
          entries: parsed.rows
            .filter((r) => r.amountCents !== 0)
            .map((r) => ({
              incurredOn: r.incurredOn,
              amountCents: r.amountCents,
              category: r.category,
              sovLineId: r.itemNumber ? (byItem.get(r.itemNumber.toLowerCase()) ?? null) : null,
              description: r.description,
            })),
        },
      });
    },
    onSuccess: async () => {
      setPaste("");
      await onSaved();
    },
  });

  const remove = useMutation({
    mutationFn: (e: JobCostEntryDto) => api(`${base}/entries/${e.id}`, { method: "DELETE" }),
    onSuccess: onSaved,
  });

  const byCategory = d.report.byCategory;
  return (
    <section className="card space-y-3 overflow-x-auto">
      <h2 className="font-semibold">Costs</h2>
      <p className="text-sm text-slate-600">
        By category to date:{" "}
        {COST_CATEGORIES.map(
          (c) => `${COST_CATEGORY_LABELS[c]} ${formatCents(byCategory[c])}`,
        ).join(" · ")}
      </p>
      {canChange && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <label className="text-sm">
            Date
            <input
              type="date"
              className="input block"
              value={form.incurredOn}
              onChange={(e) => setForm({ ...form, incurredOn: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Amount
            <input
              className="input block w-28 text-right"
              inputMode="decimal"
              placeholder="1,250.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Category
            <select
              className="input block"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as CostCategory })}
            >
              {COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {COST_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Line
            <select
              className="input block"
              value={form.sovLineId}
              onChange={(e) => setForm({ ...form, sovLineId: e.target.value })}
            >
              <option value="">Not on a line</option>
              {d.report.lines.map((l) => (
                <option key={l.sovLineId} value={l.sovLineId}>
                  {l.itemNumber} {l.description}
                </option>
              ))}
            </select>
          </label>
          {d.commitments.length > 0 && (
            <label className="text-sm">
              Against
              <select
                className="input block"
                value={form.commitmentId}
                onChange={(e) => {
                  const c = d.commitments.find((x) => x.id === e.target.value);
                  // Picking a PO or subcontract fills its line, category and vendor.
                  setForm({
                    ...form,
                    commitmentId: e.target.value,
                    ...(c
                      ? { sovLineId: c.sovLineId ?? "", category: c.category, vendor: c.vendor }
                      : {}),
                  });
                }}
              >
                <option value="">No PO or subcontract</option>
                {d.commitments.map((c) => (
                  <option key={c.id} value={c.id}>
                    {commitmentLabel(c)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            Vendor
            <input
              className="input block w-36"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Description
            <input
              className="input block w-48"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <button type="submit" className="btn" disabled={add.isPending}>
            Add cost
          </button>
          <ErrorText error={add.error} />
        </form>
      )}
      {canChange && (
        <details>
          <summary className="cursor-pointer text-sm underline">Paste many costs</summary>
          <p className="mt-1 text-xs text-slate-500">
            One cost per row, from a spreadsheet or an accounting export: date, amount, category
            (labor, material, equipment, subcontract or other; blank is other), the
            schedule-of-values item number (blank for none) and a description. Tab- or
            comma-separated; a header row is skipped. Weekly payroll and invoice totals are enough.
          </p>
          <textarea
            aria-label="Pasted costs"
            className="input mt-1 h-28 w-full font-mono text-xs"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          {parsed && (
            <div className="text-sm">
              {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} read
              {unknownItems > 0 && `, ${unknownItems} with an item number not on this job`}.
              {parsed.errors.length > 0 && (
                <ul className="list-disc pl-5 text-red-700">
                  {parsed.errors.slice(0, 20).map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="btn mt-1"
                disabled={importPaste.isPending}
                onClick={() => importPaste.mutate()}
              >
                Add {parsed.rows.length} cost{parsed.rows.length === 1 ? "" : "s"}
              </button>
              <ErrorText error={importPaste.error} />
            </div>
          )}
        </details>
      )}
      {canChange && <PayrollImport d={d} base={base} onSaved={onSaved} />}
      {d.entries.length === 0 ? (
        <p className="text-sm text-slate-500">No costs yet.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Date</th>
              <th className="th">Category</th>
              <th className="th">Line</th>
              <th className="th">Vendor / description</th>
              <th className="th text-right">Amount</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {[...d.entries].reverse().map((e) => (
              <tr key={e.id}>
                <td className="td">{e.incurredOn}</td>
                <td className="td">{COST_CATEGORY_LABELS[e.category]}</td>
                <td className="td">{e.sovLineId ? (lineName.get(e.sovLineId) ?? "—") : "—"}</td>
                <td className="td">
                  {[e.vendor, e.description].filter(Boolean).join(" · ")}
                  {e.fromQuickBooks && (
                    <span className="block text-xs text-slate-500">
                      from QuickBooks{e.reference ? ` (${e.reference})` : ""}
                    </span>
                  )}
                  {e.commitmentId && commitmentName.has(e.commitmentId) && (
                    <span className="block text-xs text-slate-500">
                      against {commitmentName.get(e.commitmentId)}
                    </span>
                  )}
                </td>
                <td className="td text-right tabular-nums">{formatCents(e.amountCents)}</td>
                <td className="td text-right">
                  {canDelete && (
                    <button
                      type="button"
                      className="text-sm underline"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm("Delete this cost?")) remove.mutate(e);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ErrorText error={remove.error} />
    </section>
  );
}
