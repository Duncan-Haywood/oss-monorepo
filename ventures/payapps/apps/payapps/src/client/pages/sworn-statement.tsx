// /orgs/$orgId/projects/$projectId/sworn-statement : the contractor's sworn statement that goes with a
// pay application (src/shared/sworn-statement.ts). Prefilled from the job and its purchase orders and
// subcontracts, typed here, checked live, printed by the Worker. The draft is saved with the job
// (GET/PUT .../sworn-statement/draft) as an editor types, so next month starts from this month's
// parties and paid column on any computer; a viewer's changes stay in their browser. A draft kept in
// this browser before drafts were saved with the job is picked up once and saved. Each PDF an editor
// downloads is kept as given with its pay application (.../sworn-statements), listed at the foot of
// the page to print again, and the statement being typed is checked against the last one given.
import type { JobCostDto, ProjectDetailDto } from "@shared/api/types";
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import { formatCents } from "@shared/money";
import {
  compareWithPrevious,
  computeSwornStatement,
  OWN_FORCES_NAME,
  SWORN_STATE_LABELS,
  SWORN_STATEMENT_NOTICE,
  SWORN_STATES,
  type SwornDraftDto,
  type SwornGivenDto,
  type SwornGivenSummaryDto,
  type SwornRowInput,
  type SwornStatementInput,
  swornHasErrors,
  swornHeaderFromProject,
  swornRowsFromCommitments,
  swornStatementSchema,
} from "@shared/sworn-statement";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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

/** The draft as sent to the server: the row keys are this page's own. */
const forServer = (d: Draft) => ({ ...d, rows: d.rows.map(({ uid: _uid, ...r }) => r) });
const SAVE_DELAY_MS = 800;

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
  const queryClient = useQueryClient();
  const membership = me.data?.memberships.find((m) => m.orgId === orgId);
  const orgName = membership?.orgName ?? "";
  const role: MemberRole | null = membership?.role ?? null;
  const canSave = role !== null && ROLE_RANK[role] >= ROLE_RANK.editor;
  const saved = useQuery({
    queryKey: ["sworn-draft", orgId, projectId],
    queryFn: () => api<SwornDraftDto>(projectPath(orgId, projectId, "/sworn-statement/draft")),
    // Loaded once per visit: the page's own state is the draft from then on.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  const given = useQuery({
    queryKey: ["sworn-given", orgId, projectId],
    queryFn: () => api<SwornGivenSummaryDto[]>(projectPath(orgId, projectId, "/sworn-statements")),
  });
  const key = storageKey(orgId, projectId);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** The last draft the server holds, as JSON, so an unchanged draft is not saved again. */
  const lastSaved = useRef<string | null>(null);
  const [savedInfo, setSavedInfo] = useState<{ at: string | null; by: string | null }>({
    at: null,
    by: null,
  });
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
    if (draft || !header || jc.isLoading || saved.isLoading || !me.data) return;
    const server = saved.data?.draft ?? null;
    if (server) {
      lastSaved.current = JSON.stringify(server);
      setSavedInfo({ at: saved.data?.updatedAt ?? null, by: saved.data?.updatedByName ?? null });
    }
    const kept = server ? { ...server, rows: withUid(server.rows) } : loadDraft(key);
    setDraft(
      kept ?? {
        ...header,
        rows: withUid(
          prefill.length
            ? prefill
            : [{ name: OWN_FORCES_NAME, contractCents: header.contractSumCents ?? 0 }],
        ),
      },
    );
  }, [header, prefill, draft, key, jc.isLoading, saved.isLoading, saved.data, me.data]);

  const save = useMutation({
    mutationFn: (body: ReturnType<typeof forServer>) =>
      api<SwornDraftDto>(projectPath(orgId, projectId, "/sworn-statement/draft"), {
        method: "PUT",
        body,
      }),
    onSuccess: (res, body) => {
      lastSaved.current = JSON.stringify(res.draft ?? body);
      setSavedInfo({ at: res.updatedAt, by: res.updatedByName });
      // Saved with the job: the browser copy is no longer needed.
      saveDraft(key, null);
    },
  });
  const saveMutate = save.mutate;

  useEffect(() => {
    if (!draft) return;
    if (!canSave) {
      saveDraft(key, draft);
      return;
    }
    const body = forServer(draft);
    if (JSON.stringify(body) === lastSaved.current) return;
    const t = setTimeout(() => saveMutate(body), SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [draft, key, canSave, saveMutate]);

  const clear = useMutation({
    mutationFn: () =>
      api(projectPath(orgId, projectId, "/sworn-statement/draft"), { method: "DELETE" }),
    onSuccess: () => {
      lastSaved.current = null;
      setSavedInfo({ at: null, by: null });
      const none: SwornDraftDto = { draft: null, updatedAt: null, updatedByName: null };
      queryClient.setQueryData(["sworn-draft", orgId, projectId], none);
      saveDraft(key, null);
      setDraft(null);
    },
  });

  const parsed = useMemo(() => (draft ? swornStatementSchema.safeParse(draft) : null), [draft]);
  const computed = useMemo(
    () => (parsed?.success ? computeSwornStatement(parsed.data) : null),
    [parsed],
  );

  // The last statement given before this one: a reprint of the same pay application and date is
  // this statement, not the one before it.
  const previousId = useMemo(() => {
    if (!draft || !given.data) return null;
    const same = (g: SwornGivenSummaryDto) =>
      g.payApp === (draft.payApp ?? "").trim() && g.statementDate === draft.statementDate;
    return given.data.find((g) => !same(g))?.id ?? null;
  }, [draft, given.data]);
  const previous = useQuery({
    queryKey: ["sworn-given", orgId, projectId, previousId],
    queryFn: () =>
      api<SwornGivenDto>(
        projectPath(orgId, projectId, `/sworn-statements/${encodeURIComponent(previousId ?? "")}`),
      ),
    enabled: previousId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const againstPrevious = useMemo(
    () =>
      parsed?.success && previous.data && previousId === previous.data.id
        ? compareWithPrevious(parsed.data, previous.data.statement)
        : [],
    [parsed, previous.data, previousId],
  );

  const print = useMutation({
    mutationFn: async () => {
      if (!parsed?.success) throw new Error("Fill in the fields marked below first");
      await downloadPost(
        projectPath(orgId, projectId, "/sworn-statement.pdf"),
        parsed.data,
        "sworn-statement.pdf",
      );
      // Kept as given with its pay application (a viewer's print is not kept).
      if (canSave) {
        await api(projectPath(orgId, projectId, "/sworn-statements"), {
          method: "POST",
          body: parsed.data,
        });
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["sworn-given", orgId, projectId] }),
  });
  const removeGiven = useMutation({
    mutationFn: (id: string) =>
      api(projectPath(orgId, projectId, `/sworn-statements/${encodeURIComponent(id)}`), {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sworn-given", orgId, projectId] }),
  });

  if (q.error) return <ErrorText error={q.error} />;
  if (saved.error) return <ErrorText error={saved.error} />;
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
          owe from your books. The list is saved with the job as you type, so next month can start
          from this month's parties on any computer (a viewer's changes stay in their own browser).
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
        {againstPrevious.length > 0 && previous.data && (
          <div className="text-sm">
            <p className="font-medium">
              Against the statement given {previous.data.statementDate}
              {previous.data.payApp ? ` (${previous.data.payApp})` : ""}
            </p>
            <ul className="list-disc pl-5">
              {againstPrevious.map((i, k) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list; the position is the identity
                <li key={k} className={ISSUE_CLASS[i.level]}>
                  <strong>{i.where}:</strong> {i.message}
                </li>
              ))}
            </ul>
          </div>
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
              if (!window.confirm("Clear this statement and the list saved with this job?")) return;
              if (canSave) clear.mutate();
              else {
                saveDraft(key, null);
                setDraft(null);
              }
            }}
          >
            Clear
          </button>
        </div>
        <ErrorText error={print.error} />
        <ErrorText error={clear.error} />
        <p className="text-xs text-slate-500" aria-live="polite">
          {!canSave
            ? "You can view this company's jobs, so your changes are kept in this browser only."
            : save.isPending
              ? "Saving…"
              : save.isError
                ? `Not saved: ${save.error.message}. Your next change tries again.`
                : savedInfo.at
                  ? `Saved with the job${savedInfo.by ? ` by ${savedInfo.by}` : ""}, ${new Date(
                      savedInfo.at,
                    ).toLocaleString()}.`
                  : "Not saved with the job yet."}
        </p>
        <p className="text-xs text-slate-500">
          {canSave
            ? "Each PDF you download is kept below as given with its pay application; downloading again for the same pay application and date replaces that copy."
            : "Your downloads are not kept with the job; an editor's are."}
        </p>
        <p className="text-xs text-slate-500">{SWORN_STATEMENT_NOTICE}</p>
      </section>

      <section className="card grid gap-2">
        <h2 className="font-semibold">Statements given on this job</h2>
        {given.error ? (
          <ErrorText error={given.error} />
        ) : !given.data ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : given.data.length === 0 ? (
          <p className="text-sm text-slate-500">
            None yet. The first PDF an editor downloads is kept here, and next month's statement is
            checked against it: a party dropped from the list, or paid to date going down.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="p-1">Pay application</th>
                  <th className="p-1">Statement date</th>
                  <th className="p-1">Given to</th>
                  <th className="p-1 text-right">Parties</th>
                  <th className="p-1 text-right">Paid to date</th>
                  <th className="p-1 text-right">Owing</th>
                  <th className="p-1">Kept</th>
                  <th className="p-1" />
                </tr>
              </thead>
              <tbody>
                {given.data.map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="p-1">{g.payApp || "—"}</td>
                    <td className="p-1">{g.statementDate}</td>
                    <td className="p-1">{g.givenTo || "—"}</td>
                    <td className="p-1 text-right">{g.parties}</td>
                    <td className="p-1 text-right">{formatCents(g.paidCents)}</td>
                    <td className="p-1 text-right">{formatCents(g.owingCents)}</td>
                    <td className="p-1 text-xs text-slate-500">
                      {new Date(g.createdAt).toLocaleDateString()}
                      {g.createdByName ? ` by ${g.createdByName}` : ""}
                    </td>
                    <td className="p-1 whitespace-nowrap">
                      <a
                        className="text-xs underline"
                        href={projectPath(
                          orgId,
                          projectId,
                          `/sworn-statements/${encodeURIComponent(g.id)}/statement.pdf`,
                        )}
                      >
                        PDF
                      </a>
                      {canSave && (
                        <button
                          type="button"
                          className="ml-2 text-xs text-slate-500 underline"
                          disabled={removeGiven.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete the statement kept for ${g.payApp || "this job"}, ${g.statementDate}?`,
                              )
                            ) {
                              removeGiven.mutate(g.id);
                            }
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
          </div>
        )}
        <ErrorText error={removeGiven.error} />
      </section>
    </div>
  );
}
