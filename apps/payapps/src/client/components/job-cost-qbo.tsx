// "Costs from QuickBooks" on the job-cost page (docs/QUICKBOOKS.md, "Job costs from QuickBooks"):
// link the job to the QuickBooks customer or job (or, for a company that tracks jobs by class, the
// class) its expenses are tagged to, read the bills, checks,
// card charges, vendor credits and journal entries in a date range, and import the ticked ones,
// each on a line and a category. Amounts are re-read from QuickBooks on import; nothing is written to QuickBooks.
import type {
  JobCostDto,
  JobCostQboClassDto,
  JobCostQboCustomerDto,
  JobCostQboLineDto,
  JobCostQboLinesDto,
  JobCostQuickBooksDto,
} from "@shared/api/types";
import { COST_CATEGORIES, COST_CATEGORY_LABELS, type CostCategory } from "@shared/job-cost";
import { linkLabel } from "@shared/job-cost-qbo";
import { formatCents } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";
import { PurchaseOrdersFromQuickBooks } from "./job-cost-qbo-po";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

type LinkInput = { customerId: string | null } | { classId: string };

/** Default window: the last twelve months to today. */
export function defaultWindow(now = new Date()) {
  const yearBack = new Date(now);
  yearBack.setUTCFullYear(yearBack.getUTCFullYear() - 1);
  return { from: isoDay(yearBack), to: isoDay(now) };
}

type Pick = { checked: boolean; sovLineId: string; category: CostCategory };

export function CostsFromQuickBooks({
  d,
  base,
  onSaved,
}: {
  d: JobCostDto;
  base: string;
  onSaved: () => Promise<void>;
}) {
  const qb = `${base}/quickbooks`;
  const qc = useQueryClient();
  const statusKey = ["job-cost-qbo", qb];
  const status = useQuery({
    queryKey: statusKey,
    queryFn: () => api<JobCostQuickBooksDto>(qb),
  });
  const [picking, setPicking] = useState(false);
  const [by, setBy] = useState<"customer" | "class" | null>(null);
  const [win, setWin] = useState(() => defaultWindow());
  const [list, setList] = useState<JobCostQboLinesDto | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [done, setDone] = useState<string | null>(null);

  const choosing = status.data?.available === true && (picking || !status.data.link);
  const pickBy = by ?? status.data?.link?.by ?? "customer";
  const customers = useQuery({
    queryKey: ["job-cost-qbo-customers", qb],
    queryFn: () => api<{ customers: JobCostQboCustomerDto[] }>(`${qb}/customers`),
    enabled: choosing && pickBy === "customer",
  });
  const classes = useQuery({
    queryKey: ["job-cost-qbo-classes", qb],
    queryFn: () =>
      api<{ classes: JobCostQboClassDto[]; jobClassId: string | null }>(`${qb}/classes`),
    enabled: choosing && pickBy === "class",
  });
  const link = useMutation({
    mutationFn: (body: LinkInput) =>
      api<JobCostQuickBooksDto>(`${qb}/link`, { method: "PUT", body }),
    onSuccess: (s) => {
      qc.setQueryData(statusKey, s);
      setPicking(false);
      setBy(null);
      setList(null);
    },
  });
  const read = useMutation({
    mutationFn: () =>
      api<JobCostQboLinesDto>(`${qb}/lines?${new URLSearchParams({ from: win.from, to: win.to })}`),
    onSuccess: (r) => {
      setList(r);
      setPicks(
        Object.fromEntries(
          r.lines.map((l) => [
            l.source,
            { checked: l.imported === null, sovLineId: "", category: l.suggestedCategory },
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
      api<{ added: number; skipped: number; linked?: number }>(`${qb}/import`, {
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
        `Added ${r.added} cost${r.added === 1 ? "" : "s"}${r.skipped ? `; ${r.skipped} already imported` : ""}${r.linked ? `; ${r.linked} put against ${r.linked === 1 ? "its purchase order" : "their purchase orders"}` : ""}.`,
      );
      await onSaved();
      read.mutate();
    },
  });

  if (status.error) return <ErrorText error={status.error} />;
  const s = status.data;
  if (!s) return null;
  if (!s.available) {
    return (
      <section className="card space-y-1">
        <h2 className="font-semibold">Costs from QuickBooks</h2>
        <p className="text-sm text-slate-600">{s.reason}</p>
      </section>
    );
  }

  const set = (source: string, patch: Partial<Pick>) =>
    setPicks((p) => ({ ...p, [source]: { ...(p[source] as Pick), ...patch } }));
  const total = chosen.reduce((a, l) => a + l.amountCents, 0);

  return (
    <section className="card space-y-3 overflow-x-auto">
      <h2 className="font-semibold">Costs from QuickBooks</h2>
      <p className="text-sm text-slate-600">
        Bills, checks, card charges, vendor credits and journal entries your bookkeeper tagged to
        this job's customer (or, if your company tracks jobs by class, its class) in QuickBooks,
        imported as costs instead of typed. Bill payments are not read, so a paid bill counts once.
        Purchase orders are read below, as commitments. A payroll service that posts each payroll as
        a journal entry split by job shows up here as "Journal entry" lines; import labor from one
        source only, here or the payroll report, not both. Payroll from QuickBooks Payroll is not
        read; import its payroll-by-job report under Costs ("Labor from a payroll report") or paste
        weekly totals there.
      </p>

      {s.link && !picking ? (
        <p className="text-sm">
          Linked to <strong>{linkLabel(s.link)}</strong>.{" "}
          <button type="button" className="underline" onClick={() => setPicking(true)}>
            Change
          </button>
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Costs tagged by
            <select
              className="input block"
              value={pickBy}
              onChange={(e) => setBy(e.target.value === "class" ? "class" : "customer")}
              disabled={link.isPending}
            >
              <option value="customer">Customer or job</option>
              <option value="class">Class</option>
            </select>
          </label>
          {pickBy === "customer" ? (
            <label className="text-sm">
              QuickBooks customer or job
              <select
                className="input block"
                defaultValue={s.link?.by === "customer" ? s.link.id : ""}
                onChange={(e) => link.mutate({ customerId: e.target.value || null })}
                disabled={link.isPending}
              >
                <option value="">{customers.isLoading ? "Loading…" : "Choose…"}</option>
                {customers.data?.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <ClassPicker
              classes={classes.data}
              loading={classes.isLoading}
              current={s.link?.by === "class" ? s.link.id : null}
              pending={link.isPending}
              onPick={(classId) => link.mutate({ classId })}
            />
          )}
          {s.link && (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => link.mutate({ customerId: null })}
            >
              Unlink
            </button>
          )}
        </div>
      )}
      {customers.error && <ErrorText error={customers.error} />}
      {classes.error && <ErrorText error={classes.error} />}
      {link.error && <ErrorText error={link.error} />}

      {s.link && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setDone(null);
            read.mutate();
          }}
        >
          <label className="text-sm">
            From
            <input
              type="date"
              className="input block"
              value={win.from}
              onChange={(e) => setWin((w) => ({ ...w, from: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            To
            <input
              type="date"
              className="input block"
              value={win.to}
              onChange={(e) => setWin((w) => ({ ...w, to: e.target.value }))}
            />
          </label>
          <button type="submit" className="btn-secondary" disabled={read.isPending}>
            {read.isPending ? "Reading…" : "Read from QuickBooks"}
          </button>
        </form>
      )}
      {read.error && <ErrorText error={read.error} />}

      {list && <QboLines d={d} list={list} picks={picks} set={set} />}
      {list && list.lines.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn"
            disabled={chosen.length === 0 || importLines.isPending}
            onClick={() => importLines.mutate()}
          >
            Import {chosen.length} as costs ({formatCents(total)})
          </button>
          {done && <span className="text-sm text-green-700">{done}</span>}
        </div>
      )}
      {importLines.error && <ErrorText error={importLines.error} />}

      {s.link && <PurchaseOrdersFromQuickBooks d={d} qb={qb} win={win} onSaved={onSaved} />}
    </section>
  );
}

/**
 * The class picker. The job's invoice class (QuickBooks page) is offered first, since a company that
 * tracks jobs by class usually puts the same class on the job's invoices.
 */
function ClassPicker({
  classes,
  loading,
  current,
  pending,
  onPick,
}: {
  classes: { classes: JobCostQboClassDto[]; jobClassId: string | null } | undefined;
  loading: boolean;
  current: string | null;
  pending: boolean;
  onPick: (classId: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const value = chosen ?? current ?? classes?.jobClassId ?? "";
  if (classes && classes.classes.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        The connected QuickBooks company has no active classes (class tracking is in QuickBooks
        Online Plus and Advanced).
      </p>
    );
  }
  return (
    <>
      <label className="text-sm">
        QuickBooks class
        <select
          className="input block"
          value={value}
          onChange={(e) => setChosen(e.target.value)}
          disabled={pending || loading}
        >
          <option value="">{loading ? "Loading…" : "Choose…"}</option>
          {classes?.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.id === classes.jobClassId ? " (on this job's invoices)" : ""}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn"
        disabled={!value || pending || value === current}
        onClick={() => onPick(value)}
      >
        Link class
      </button>
    </>
  );
}

function QboLines({
  d,
  list,
  picks,
  set,
}: {
  d: JobCostDto;
  list: JobCostQboLinesDto;
  picks: Record<string, Pick>;
  set: (source: string, patch: Partial<Pick>) => void;
}) {
  if (list.lines.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Nothing in QuickBooks tagged to {linkLabel(list.link)} from {list.from} to {list.to}.
      </p>
    );
  }
  return (
    <>
      {list.truncated && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          QuickBooks has more transactions in these dates than one read takes; narrow the dates to
          see them all.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="th" />
            <th className="th">Date</th>
            <th className="th">Type</th>
            <th className="th">Vendor / account</th>
            <th className="th">Line</th>
            <th className="th">Category</th>
            <th className="th text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {list.lines.map((l) => (
            <QboLineRow key={l.source} d={d} l={l} pick={picks[l.source]} set={set} />
          ))}
        </tbody>
      </table>
    </>
  );
}

export function importedNote(l: JobCostQboLineDto): string | null {
  if (!l.imported) return null;
  if (!l.imported.thisJob) return "Imported into another job";
  if (l.imported.amountCents !== l.amountCents) {
    return `Imported at ${formatCents(l.imported.amountCents)}; changed in QuickBooks since. Edit or delete the cost below.`;
  }
  return "Imported";
}

function QboLineRow({
  d,
  l,
  pick,
  set,
}: {
  d: JobCostDto;
  l: JobCostQboLineDto;
  pick: Pick | undefined;
  set: (source: string, patch: Partial<Pick>) => void;
}) {
  const note = importedNote(l);
  const open = l.imported === null && pick !== undefined;
  return (
    <tr className={open ? "" : "text-slate-500"}>
      <td className="td">
        {open ? (
          <input
            type="checkbox"
            aria-label={`Import ${l.vendor ?? l.label} ${formatCents(l.amountCents)}`}
            checked={pick.checked}
            onChange={(e) => set(l.source, { checked: e.target.checked })}
          />
        ) : null}
      </td>
      <td className="td">{l.txnDate}</td>
      <td className="td">
        {l.label}
        {l.docNumber ? ` ${l.docNumber}` : ""}
      </td>
      <td className="td">
        {[l.vendor, l.account, l.description].filter(Boolean).join(" · ")}
        {note && <span className="block text-xs">{note}</span>}
        {l.fromPurchaseOrder && !l.imported && (
          <span className="block text-xs">
            Made from a purchase order: counted against it once that order is imported below.
          </span>
        )}
      </td>
      <td className="td">
        {open && (
          <select
            className="input"
            aria-label="Schedule-of-values line"
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
            aria-label="Category"
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
}
