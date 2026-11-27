// One pay application: continuation-sheet editor, application summary, workflow and exports.
import type { PayAppDetailDto, ProjectDetailDto } from "@shared/api/types";
import { formatBps, formatCents, parseDollarsToCents } from "@shared/money";
import { lineRatesNote } from "@shared/payapp-math";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AttachmentsPanel } from "../components/attachments";
import { ErrorText } from "../components/error";
import { HistoryPanel } from "../components/history";
import { MoneyInput } from "../components/money-input";
import { OwnerPaymentPanel } from "../components/owner-payment";
import { PaymentsPanel } from "../components/payments";
import { ProcoreInvoicePanel } from "../components/procore-invoice";
import { QuickBooksPanel } from "../components/quickbooks";
import { RetainageReleasePanel } from "../components/retainage-release";
import { TexturaBillingPanel } from "../components/textura-billing";
import { WaiversPanel } from "../components/waivers";
import { api, projectPath } from "../lib/api";

type Entries = PayAppDetailDto["entries"];
const ZERO = { workThisPeriodCents: 0, storedMaterialsCents: 0, retainageReleasedCents: 0 };
const pct = (bps: number | null) => (bps === null ? "" : `${(bps / 100).toFixed(1)}%`);

export function PayAppPage() {
  const { orgId, projectId, payAppId } = useParams({
    from: "/orgs/$orgId/projects/$projectId/pay-apps/$payAppId",
  });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const base = projectPath(orgId, projectId, `/pay-apps/${payAppId}`);
  const key = ["pay-app", orgId, projectId, payAppId];
  const q = useQuery({ queryKey: key, queryFn: () => api<PayAppDetailDto>(base) });
  const project = useQuery({
    queryKey: ["project", orgId, projectId],
    queryFn: () => api<ProjectDetailDto>(projectPath(orgId, projectId)),
  });
  const [entries, setEntries] = useState<Entries>({});
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (q.data && !dirty) setEntries(q.data.entries);
  }, [q.data, dirty]);

  const onSaved = (d: PayAppDetailDto) => {
    qc.setQueryData(key, d);
    setDirty(false);
    setEntries(d.entries);
    void qc.invalidateQueries({ queryKey: ["project", orgId, projectId] });
  };
  const save = useMutation({
    mutationFn: () =>
      api<PayAppDetailDto>(`${base}/lines`, {
        method: "PUT",
        body: { lines: Object.entries(entries).map(([sovLineId, e]) => ({ sovLineId, ...e })) },
      }),
    onSuccess: onSaved,
  });
  const action = useMutation({
    mutationFn: async (name: "submit" | "certify" | "mark-paid") => {
      if (dirty) await save.mutateAsync();
      let body: unknown;
      if (name === "certify") {
        const text = window.prompt("Amount certified by the GC ($). Leave blank to accept line 8.");
        if (text === null) return null;
        const cents = text.trim() ? parseDollarsToCents(text) : undefined;
        if (cents === null) throw new Error("Enter a dollar amount");
        body = cents === undefined ? {} : { certifiedAmountCents: cents };
      }
      if (name === "mark-paid") {
        // The date and check turn the balance into a recorded payment (QuickBooks, waivers).
        const date = window.prompt(
          "Date the payment was received (YYYY-MM-DD). Leave blank if you don't know it.",
          new Date().toISOString().slice(0, 10),
        );
        if (date === null) return null;
        if (date.trim()) {
          const ref = window.prompt("Check number or reference (optional)", "");
          if (ref === null) return null;
          body = { receivedOn: date.trim(), reference: ref.trim() || null };
        }
      }
      return api<PayAppDetailDto>(`${base}/${name}`, { method: "POST", body: body ?? {} });
    },
    onSuccess: (d) => d && onSaved(d),
  });
  const header = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api<PayAppDetailDto>(base, { method: "PATCH", body: patch }),
    onSuccess: onSaved,
  });
  const remove = useMutation({
    mutationFn: () => api(base, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["project", orgId, projectId] });
      await navigate({ to: "/orgs/$orgId/projects/$projectId", params: { orgId, projectId } });
    },
  });

  if (q.isLoading || project.isLoading) return <p>Loading…</p>;
  if (!q.data || !project.data) return <ErrorText error={q.error ?? project.error} />;
  const a = q.data;
  const s = a.computed.summary;
  const computedById = Object.fromEntries(a.computed.lines.map((l) => [l.sovLineId, l]));
  // Every SOV line is editable, including ones the computation hides because they are still empty.
  const rows = project.data.sovLines;
  const edit = (id: string, patch: Partial<typeof ZERO>) => {
    setEntries({ ...entries, [id]: { ...ZERO, ...entries[id], ...patch } });
    setDirty(true);
  };

  const summaryRows: [string, string, number, boolean?][] = [
    ["1", "Original contract sum", s.originalContractSumCents],
    ["2", "Net change by change orders", s.netChangeByChangeOrdersCents],
    ["3", "Contract sum to date", s.contractSumToDateCents, true],
    ["4", "Total completed and stored to date", s.totalCompletedAndStoredCents],
    [
      "5a",
      `Retainage on completed work (${formatBps(s.retainagePctBps)})`,
      s.retainageOnCompletedWorkCents,
    ],
    [
      "5b",
      `Retainage on stored materials (${formatBps(s.storedRetainagePctBps)})`,
      s.retainageOnStoredMaterialsCents,
    ],
    ["5", "Total retainage", s.totalRetainageCents],
    ["6", "Total earned less retainage", s.totalEarnedLessRetainageCents, true],
    ["7", "Less previous certificates for payment", s.lessPreviousCertificatesCents],
    ["8", "Current payment due", s.currentPaymentDueCents, true],
    ["9", "Balance to finish, including retainage", s.balanceToFinishIncludingRetainageCents],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            to="/orgs/$orgId/projects/$projectId"
            params={{ orgId, projectId }}
            className="text-sm text-slate-600 underline"
          >
            ← {project.data.name}
          </Link>
          <h1 className="text-2xl font-semibold">
            Pay application #{a.number}{" "}
            <span className="rounded bg-slate-200 px-2 py-0.5 text-sm font-normal">{a.status}</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary" href={`${base}/application.pdf`}>
            PDF
          </a>
          <a
            className="btn-secondary"
            href={`${base}/packet.pdf`}
            title="The application PDF, an index and the backup files attached below, in one PDF"
          >
            PDF with backup
          </a>
          <a className="btn-secondary" href={`${base}/continuation.csv`}>
            Continuation CSV
          </a>
          <a className="btn-secondary" href={`${base}/summary.csv`}>
            Summary CSV
          </a>
          {a.editable && (
            <>
              <button
                type="button"
                className="btn-secondary"
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate()}
              >
                {dirty ? "Save" : "Saved"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={action.isPending}
                onClick={() => action.mutate("submit")}
              >
                Submit
              </button>
              <button
                type="button"
                className="btn-secondary text-red-700"
                onClick={() => remove.mutate()}
              >
                Delete draft
              </button>
            </>
          )}
          {a.status === "submitted" && (
            <button type="button" className="btn" onClick={() => action.mutate("certify")}>
              Record certification
            </button>
          )}
          {(a.status === "submitted" || a.status === "certified") && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => action.mutate("mark-paid")}
              title="Records the balance as one payment received (date and check number) and the application as paid. To record a partial payment, use Payments received below."
            >
              Mark paid in full
            </button>
          )}
        </div>
      </div>
      <ErrorText error={save.error ?? action.error ?? header.error ?? remove.error} />

      <section className="card grid gap-3 sm:grid-cols-4">
        {(
          [
            ["periodFrom", "Period from"],
            ["periodTo", "Period to"],
            ["applicationDate", "Application date"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="text-sm">
            <span className="text-slate-600">{label}</span>
            <input
              type="date"
              className="input"
              disabled={!a.editable}
              defaultValue={a[k]}
              onBlur={(e) => e.target.value !== a[k] && header.mutate({ [k]: e.target.value })}
            />
          </label>
        ))}
        <label className="text-sm">
          <span className="text-slate-600">Retainage % (work / stored)</span>
          <input
            className="input"
            disabled={!a.editable}
            defaultValue={`${a.retainagePctBps / 100} / ${a.storedRetainagePctBps / 100}`}
            onBlur={(e) => {
              const [w, st] = e.target.value
                .split("/")
                .map((x) => Math.round(Number(x.trim()) * 100));
              if (Number.isFinite(w) && Number.isFinite(st ?? w)) {
                header.mutate({ retainagePctBps: w, storedRetainagePctBps: st ?? w });
              }
            }}
          />
        </label>
      </section>

      {a.computed.warnings.length > 0 && (
        <section className="card border-amber-300 bg-amber-50">
          <h2 className="mb-1 font-semibold">
            Check before submitting{dirty && " (as last saved)"}
          </h2>
          <ul className="list-disc pl-5 text-sm">
            {a.computed.warnings.map((w) => {
              const blocking = a.blockers.some(
                (b) => b.code === w.code && b.sovLineId === w.sovLineId,
              );
              return (
                <li
                  key={`${w.code}-${w.sovLineId ?? ""}`}
                  className={blocking ? "text-red-700" : ""}
                >
                  {w.message}
                  {blocking && " (must fix)"}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">
          Continuation sheet{" "}
          {dirty && (
            <span className="text-sm font-normal text-amber-700">
              unsaved changes; computed columns update on save
            </span>
          )}
        </h2>
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr>
              <th className="th">A Item</th>
              <th className="th">B Description</th>
              <th className="th text-right">C Scheduled value</th>
              <th className="th text-right">D From previous</th>
              <th className="th text-right">E This period</th>
              <th className="th text-right">F Stored materials</th>
              <th className="th text-right">G Completed &amp; stored</th>
              <th className="th text-right">G/C</th>
              <th className="th text-right">H Balance to finish</th>
              <th className="th text-right">I Retainage</th>
              <th className="th text-right">Release retainage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const c = computedById[l.id];
              const e = { ...ZERO, ...entries[l.id] };
              return (
                <tr key={l.id}>
                  <td className="td">{l.itemNumber}</td>
                  <td className="td">{l.description}</td>
                  <td className="td text-right">{c ? formatCents(c.scheduledValueCents) : "—"}</td>
                  <td className="td text-right">{c ? formatCents(c.fromPreviousCents) : "—"}</td>
                  <td className="td w-32">
                    <MoneyInput
                      label={`Work this period, item ${l.itemNumber}`}
                      value={e.workThisPeriodCents}
                      disabled={!a.editable}
                      onChange={(v) => edit(l.id, { workThisPeriodCents: v })}
                    />
                  </td>
                  <td className="td w-32">
                    <MoneyInput
                      label={`Stored materials, item ${l.itemNumber}`}
                      value={e.storedMaterialsCents}
                      min={0}
                      disabled={!a.editable}
                      onChange={(v) => edit(l.id, { storedMaterialsCents: v })}
                    />
                  </td>
                  <td className="td text-right">
                    {c ? formatCents(c.completedAndStoredCents) : "—"}
                  </td>
                  <td className="td text-right">{c ? pct(c.percentCompleteBps) : ""}</td>
                  <td className="td text-right">{c ? formatCents(c.balanceToFinishCents) : "—"}</td>
                  <td className="td text-right">{c ? formatCents(c.retainageCents) : "—"}</td>
                  <td className="td w-32">
                    <MoneyInput
                      label={`Retainage released, item ${l.itemNumber}`}
                      value={e.retainageReleasedCents}
                      min={0}
                      disabled={!a.editable}
                      onChange={(v) => edit(l.id, { retainageReleasedCents: v })}
                    />
                  </td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className="td" colSpan={2}>
                Totals
              </td>
              <td className="td text-right">
                {formatCents(a.computed.totals.scheduledValueCents)}
              </td>
              <td className="td text-right">{formatCents(a.computed.totals.fromPreviousCents)}</td>
              <td className="td text-right">{formatCents(a.computed.totals.thisPeriodCents)}</td>
              <td className="td text-right">
                {formatCents(a.computed.totals.storedMaterialsCents)}
              </td>
              <td className="td text-right">
                {formatCents(a.computed.totals.completedAndStoredCents)}
              </td>
              <td className="td" />
              <td className="td text-right">
                {formatCents(a.computed.totals.balanceToFinishCents)}
              </td>
              <td className="td text-right">{formatCents(a.computed.totals.retainageCents)}</td>
              <td className="td" />
            </tr>
          </tbody>
        </table>
      </section>

      <RetainageReleasePanel base={base} app={a} dirty={dirty} onChanged={onSaved} />

      <section className="card max-w-2xl">
        <h2 className="mb-2 font-semibold">Application summary</h2>
        <table className="w-full">
          <tbody>
            {summaryRows.map(([no, label, cents, bold]) => (
              <tr key={no} className={bold ? "font-semibold" : ""}>
                <td className="td w-10">{no}</td>
                <td className="td">{label}</td>
                <td className="td text-right">{formatCents(cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.lineRates.length > 0 && (
          <p className="mt-2 text-sm text-slate-600">
            Lines 5a and 5b: held at their own retainage rate instead: {lineRatesNote(s.lineRates)}.
          </p>
        )}
        {a.certifiedAmountCents !== null && (
          <p className="mt-2 text-sm">Certified by GC: {formatCents(a.certifiedAmountCents)}</p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Not an AIA document. The PDF carries the standard pay-application fields and math in our
          own layout.
        </p>
      </section>

      <PaymentsPanel base={base} app={a} onChanged={onSaved} />

      {project.data?.payTermsBasis === "owner_paid" && (
        <OwnerPaymentPanel
          base={base}
          app={a}
          payTermsDays={project.data.payTermsDays}
          payTermsOuterDays={project.data.payTermsOuterDays}
          gcName={project.data.gcName}
          onChanged={onSaved}
        />
      )}

      {a.status !== "draft" && <QuickBooksPanel orgId={orgId} base={base} />}

      {project.data && <ProcoreInvoicePanel orgId={orgId} project={project.data} app={a} />}

      {project.data && <TexturaBillingPanel orgId={orgId} project={project.data} app={a} />}

      <AttachmentsPanel base={base} />

      <WaiversPanel orgId={orgId} base={base} />

      <HistoryPanel base={base} title="History" version={q.dataUpdatedAt} csv />
    </div>
  );
}
