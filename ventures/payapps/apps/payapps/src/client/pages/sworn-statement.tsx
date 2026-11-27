// /orgs/$orgId/projects/$projectId/sworn-statement : the contractor's sworn statement that goes with a
// pay application (src/shared/sworn-statement.ts). Prefilled from the job and its purchase orders and
// subcontracts, typed here, checked live, printed by the Worker; nothing is stored on the server. The
// draft is kept in this browser only, so next month starts from this month's parties.
import type { JobCostDto, ProjectDetailDto } from "@shared/api/types";
import { formatCents } from "@shared/money";
import {
  computeSwornStatement,
  OWN_FORCES_NAME,
  SWORN_STATE_LABELS,
  SWORN_STATEMENT_NOTICE,
  SWORN_STATES,
  type SwornRowInput,
  type SwornStatementInput,
  swornHasErrors,
  swornHeaderFromProject,
  swornRowsFromCommitments,
  swornStatementSchema,
} from "@shared/sworn-statement";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ErrorText } from "../components/error";
import { meQuery } from "../components/layout";
import { MoneyInput } from "../components/money-input";
import { api, downloadPost, projectPath } from "../lib/api";

type DraftRow = SwornRowInput & { uid?: string };
type Draft = Omit<SwornStatementInput, "rows"> & { rows: DraftRow[] };

let uidCounter = 0;
const uid = () => `s${Date.now().toString(36)}${(uidCounter++).toString(36)}`;
const withUid = (rows: SwornRowInput[]): DraftRow[] => rows.map((r) => ({ ...r, uid: uid() }));
const blankRow = (): DraftRow => ({ uid: uid(), name: "", contractCents: 0 });
const today = () => new Date().toLocaleDateString("en-CA");

/**
 * Next month's statement from this one: the same parties, each one's paid carried up by what was
 * owing (it is paid once this application is), owing cleared, invoiced-to-date cleared; header
 * figures re-read from the job's latest pay application.
 */
export function nextMonth(d: Draft, header: Omit<SwornStatementInput, "rows">): Draft {
  return {
    ...d,
    payApp: header.payApp,
    statementDate: header.statementDate,
    contractSumCents: header.contractSumCents,
    requestedCents: header.requestedCents,
    rows: d.rows.map((r) => ({
      ...r,
      paidCents: (r.paidCents ?? 0) + (r.owingCents ?? 0),
      owingCents: 0,
      billedToDateCents: null,
    })),
  };
}

const storageKey = (orgId: string, projectId: string) =>
  `payapps:sworn-statement:${orgId}:${projectId}`;
function loadDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function saveDraft(key: string, d: Draft | null) {
  try {
    if (d) localStorage.setItem(key, JSON.stringify(d));
    else localStorage.removeItem(key);
  } catch {
    // Private windows and blocked storage: the form still works, it just is not remembered.
  }
}

const ISSUE_CLASS = { error: "text-red-700", warning: "text-amber-800", note: "text-slate-600" };

function Field(props: { label: string; children: React.ReactNode; className?: string }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is `children`, inside the label
    <label className={`grid gap-1 text-sm ${props.className ?? ""}`}>
      <span className="text-slate-600">{props.label}</span>
      {props.children}
    </label>
  );
}

export function SwornStatementPage() {
  const { orgId, projectId } = useParams({
    from: "/orgs/$orgId/projects/$projectId/sworn-statement",
  });
  const q = useQuery({
    queryKey: ["project", orgId, projectId],
    queryFn: () => api<ProjectDetailDto>(projectPath(orgId, projectId)),
  });
  const jc = useQuery({
    queryKey: ["job-cost", orgId, projectId],
    queryFn: () => api<JobCostDto>(projectPath(orgId, projectId, "/job-cost")),
  });
  const me = useQuery(meQuery);
  const orgName = me.data?.memberships.find((m) => m.orgId === orgId)?.orgName ?? "";
  const key = storageKey(orgId, projectId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const header = useMemo(
    () => (q.data ? swornHeaderFromProject(q.data, orgName, today()) : null),
    [q.data, orgName],
  );
  const prefill = useMemo(
    () =>
      jc.data && q.data ? swornRowsFromCommitments(jc.data.commitments, q.data.sovTotalCents) : [],
    [jc.data, q.data],
  );

  useEffect(() => {
    if (draft || !header || jc.isLoading) return;
    const saved = loadDraft(key);
    setDraft(
      saved ?? {
        ...header,
        rows: withUid(
          prefill.length
            ? prefill
            : [{ name: OWN_FORCES_NAME, contractCents: header.contractSumCents ?? 0 }],
        ),
      },
    );
  }, [header, prefill, draft, key, jc.isLoading]);

  useEffect(() => {
    if (draft) saveDraft(key, draft);
  }, [draft, key]);

  const parsed = useMemo(() => (draft ? swornStatementSchema.safeParse(draft) : null), [draft]);
  const computed = useMemo(
    () => (parsed?.success ? computeSwornStatement(parsed.data) : null),
    [parsed],
  );

  const print = useMutation({
    mutationFn: () => {
      if (!parsed?.success) throw new Error("Fill in the fields marked below first");
      return downloadPost(
        projectPath(orgId, projectId, "/sworn-statement.pdf"),
        parsed.data,
        "sworn-statement.pdf",
      );
    },
  });

  if (q.error) return <ErrorText error={q.error} />;
  if (!q.data || !draft || !header) return <p className="text-sm text-slate-500">Loading…</p>;
  const p = q.data;
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setRow = (i: number, patch: Partial<DraftRow>) =>
    set({ rows: draft.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const schemaIssues = parsed && !parsed.success ? parsed.error.issues : [];
  const mi = draft.state === "MI";
  const money = (
    i: number,
    r: DraftRow,
    field:
      | "contractCents"
      | "retainageCents"
      | "paidCents"
      | "owingCents"
      | "wagesCents"
      | "fringeCents",
    label: string,
  ) => (
    <td className="p-1">
      <MoneyInput
        label={`${label}, row ${i + 1}`}
        value={r[field] ?? 0}
        min={0}
        onChange={(v) => setRow(i, { [field]: v })}
      />
    </td>
  );

  return (
    <div className="grid gap-4">
      <div>
        <Link
          to="/orgs/$orgId/projects/$projectId"
          params={{ orgId, projectId }}
          className="text-sm text-slate-600 underline"
        >
          ← {p.name}
        </Link>
        <h1 className="text-2xl font-semibold">Contractor's sworn statement</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Every subcontractor, supplier and laborer on your part of the job, what each was
          contracted for, has been paid and is owed now, sent with the pay application. Illinois
          (770 ILCS 60/5) and Michigan (MCL 570.1110) write it into their lien laws; lenders and
          title companies ask for it elsewhere before they release a draw. The parties start from
          this job's purchase orders and subcontracts in Job cost; fill in what you have paid and
          owe from your books. Nothing here is saved on our servers: the draft stays in this browser
          so next month can start from this month's list.
        </p>
      </div>

      <section className="card grid gap-3 md:grid-cols-4">
        <Field label="Statement for">
          <select
            className="input"
            value={draft.state ?? "IL"}
            onChange={(e) => set({ state: e.target.value as Draft["state"] })}
          >
            {SWORN_STATES.map((s) => (
              <option key={s} value={s}>
                {SWORN_STATE_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project name">
          <input
            className="input"
            value={draft.projectName}
            onChange={(e) => set({ projectName: e.target.value })}
          />
        </Field>
        <Field label="Project location" className="md:col-span-2">
          <input
            className="input"
            value={draft.projectLocation ?? ""}
            onChange={(e) => set({ projectLocation: e.target.value })}
          />
        </Field>
        <Field label="Your company">
          <input
            className="input"
            value={draft.contractorName}
            onChange={(e) => set({ contractorName: e.target.value })}
          />
        </Field>
        <Field label="Your address" className="md:col-span-2">
          <input
            className="input"
            value={draft.contractorAddress ?? ""}
            onChange={(e) => set({ contractorAddress: e.target.value })}
          />
        </Field>
        <Field label="Given to (owner, or the GC above you)">
          <input
            className="input"
            value={draft.givenTo ?? ""}
            onChange={(e) => set({ givenTo: e.target.value })}
          />
        </Field>
        <Field label="Owner">
          <input
            className="input"
            value={draft.ownerName ?? ""}
            onChange={(e) => set({ ownerName: e.target.value })}
          />
        </Field>
        <Field label="Pay application">
          <input
            className="input"
            value={draft.payApp ?? ""}
            onChange={(e) => set({ payApp: e.target.value })}
          />
        </Field>
        <Field label="Statement date">
          <input
            type="date"
            className="input"
            value={draft.statementDate}
            onChange={(e) => set({ statementDate: e.target.value })}
          />
        </Field>
        <div className="grid gap-1 text-sm">
          <span className="text-slate-600">Checked against</span>
          <span>
            contract{" "}
            {draft.contractSumCents == null ? "not set" : formatCents(draft.contractSumCents)}
            {" · "}requested{" "}
            {draft.requestedCents == null ? "no pay app yet" : formatCents(draft.requestedCents)}
          </span>
        </div>
      </section>

      <section className="card grid gap-2 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="p-1">Name</th>
              <th className="p-1">Address and phone</th>
              <th className="p-1">Type of work</th>
              <th className="p-1 text-right">Contract</th>
              <th className="p-1 text-right">Change orders</th>
              <th className="p-1 text-right">Retainage held</th>
              <th className="p-1 text-right">Already paid</th>
              <th className="p-1 text-right">Owing now</th>
              {mi && <th className="p-1 text-right">Unpaid wages</th>}
              {mi && <th className="p-1 text-right">Unpaid fringe</th>}
              <th className="p-1 text-right">Balance</th>
              <th className="p-1" />
            </tr>
          </thead>
          <tbody>
            {draft.rows.map((r, i) => {
              const c = computed?.rows[i];
              return (
                <tr key={r.uid ?? i} className="border-t align-top">
                  <td className="p-1">
                    <input
                      aria-label={`Name, row ${i + 1}`}
                      className="input min-w-40"
                      value={r.name}
                      onChange={(e) => setRow(i, { name: e.target.value })}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      aria-label={`Address, row ${i + 1}`}
                      className="input min-w-40"
                      value={r.address ?? ""}
                      onChange={(e) => setRow(i, { address: e.target.value })}
                    />
                    <input
                      aria-label={`Phone, row ${i + 1}`}
                      className="input mt-1"
                      placeholder="Phone"
                      value={r.phone ?? ""}
                      onChange={(e) => setRow(i, { phone: e.target.value })}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      aria-label={`Type of work, row ${i + 1}`}
                      className="input min-w-32"
                      value={r.work ?? ""}
                      onChange={(e) => setRow(i, { work: e.target.value })}
                    />
                  </td>
                  {money(i, r, "contractCents", "Contract")}
                  <td className="p-1">
                    <MoneyInput
                      label={`Change orders, row ${i + 1}`}
                      value={r.changesCents ?? 0}
                      onChange={(v) => setRow(i, { changesCents: v })}
                    />
                  </td>
                  {money(i, r, "retainageCents", "Retainage held")}
                  {money(i, r, "paidCents", "Already paid")}
                  {money(i, r, "owingCents", "Owing now")}
                  {mi && money(i, r, "wagesCents", "Unpaid wages")}
                  {mi && money(i, r, "fringeCents", "Unpaid fringe")}
                  <td className="p-1 text-right">
                    {c ? formatCents(c.balanceCents) : ""}
                    {r.billedToDateCents != null && (
                      <div className="text-xs text-slate-500">
                        invoiced {formatCents(r.billedToDateCents)}
                      </div>
                    )}
                  </td>
                  <td className="p-1">
                    <button
                      type="button"
                      className="text-xs text-slate-500 underline"
                      onClick={() => set({ rows: draft.rows.filter((_, k) => k !== i) })}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {computed && (
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="p-1" colSpan={3}>
                  Totals
                </td>
                <td className="p-1 text-right">{formatCents(computed.totals.contractCents)}</td>
                <td className="p-1 text-right">{formatCents(computed.totals.changesCents)}</td>
                <td className="p-1 text-right">{formatCents(computed.totals.retainageCents)}</td>
                <td className="p-1 text-right">{formatCents(computed.totals.paidCents)}</td>
                <td className="p-1 text-right">{formatCents(computed.totals.owingCents)}</td>
                {mi && (
                  <td className="p-1 text-right">{formatCents(computed.totals.wagesCents)}</td>
                )}
                {mi && (
                  <td className="p-1 text-right">{formatCents(computed.totals.fringeCents)}</td>
                )}
                <td className="p-1 text-right">{formatCents(computed.totals.balanceCents)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => set({ rows: [...draft.rows, blankRow()] })}
          >
            Add a party
          </button>
          {prefill.length > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (
                  window.confirm(
                    "Replace the rows with this job's purchase orders and subcontracts?",
                  )
                ) {
                  set({ ...header, rows: withUid(prefill) });
                }
              }}
            >
              Refill from Job cost
            </button>
          )}
        </div>
        {jc.data && jc.data.commitments.length === 0 && (
          <p className="text-xs text-slate-500">
            No purchase orders or subcontracts on this job yet.{" "}
            <Link
              to="/orgs/$orgId/projects/$projectId/job-cost"
              params={{ orgId, projectId }}
              className="underline"
            >
              Add them in Job cost
            </Link>{" "}
            and the parties fill in here.
          </p>
        )}
      </section>

      <section className="card grid gap-3 md:grid-cols-4">
        <Field label="Signer's name">
          <input
            className="input"
            value={draft.affiantName ?? ""}
            onChange={(e) => set({ affiantName: e.target.value })}
          />
        </Field>
        <Field label="Title">
          <input
            className="input"
            value={draft.affiantTitle ?? ""}
            onChange={(e) => set({ affiantTitle: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={draft.notary ?? true}
            onChange={(e) => set({ notary: e.target.checked })}
          />
          Notary block (jurat and seal box) under the signature
        </label>
      </section>

      <section className="card grid gap-2">
        {schemaIssues.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-red-700">
            {schemaIssues.slice(0, 8).map((i, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list; the position is the identity
              <li key={k}>{i.message}</li>
            ))}
          </ul>
        )}
        {computed && computed.issues.length > 0 && (
          <ul className="list-disc pl-5 text-sm">
            {computed.issues.map((i, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list; the position is the identity
              <li key={k} className={ISSUE_CLASS[i.level]}>
                <strong>{i.where}:</strong> {i.message}
              </li>
            ))}
          </ul>
        )}
        {computed && computed.waivers.length > 0 && (
          <div className="text-sm">
            <p className="font-medium">Lien waivers to collect with this statement</p>
            <ul className="list-disc pl-5">
              {computed.waivers.map((w, k) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list; the position is the identity
                <li key={k}>
                  {w.name}: {w.kind} waiver for {formatCents(w.amountCents)}
                  {w.kind === "conditional"
                    ? " owing now (unconditional once paid)"
                    : " already paid"}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            disabled={!computed || swornHasErrors(computed) || print.isPending}
            onClick={() => print.mutate()}
          >
            {print.isPending ? "Preparing…" : "Download PDF"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setDraft(nextMonth(draft, header))}
          >
            Start next month
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (window.confirm("Clear this statement and the list saved in this browser?")) {
                saveDraft(key, null);
                setDraft(null);
              }
            }}
          >
            Clear
          </button>
        </div>
        <ErrorText error={print.error} />
        <p className="text-xs text-slate-500">{SWORN_STATEMENT_NOTICE}</p>
      </section>
    </div>
  );
}
