// Written security policies, one per NIST SP 800-171 family: write from the starter text, approve
// (admins), mark reviewed, download one or all. Mirrors src/worker/routes/org/index.ts "/policies".
import type { FamilyCode } from "@shared/controls";
import {
  confirmPlaceholders,
  type PolicyStatus,
  REVIEW_MONTHS,
  type ReviewState,
  replaceProcedure,
} from "@shared/security-policies";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Markdown } from "../components/markdown";
import { api } from "../lib/api";
import type { Member, OrgInfo } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";

interface PolicySummary {
  family: FamilyCode;
  name: string;
  requirements: number;
  policy: {
    id: string;
    title: string;
    status: PolicyStatus;
    version: number;
    ownerName: string | null;
    approvedOn: string | null;
    reviewDue: string | null;
  } | null;
  review: ReviewState;
}

interface PolicyList {
  items: PolicySummary[];
  counts: {
    total: number;
    written: number;
    approved: number;
    inForce: number;
    dueSoon: number;
    overdue: number;
  };
}

export interface PolicyDetail {
  family: FamilyCode;
  name: string;
  requirements: { id: string; nistId: string; text: string }[];
  policy: {
    id: string;
    title: string;
    body: string;
    status: PolicyStatus;
    version: number;
    ownerUserId: string | null;
    ownerName: string | null;
    reviewMonths: number;
    approvedOn: string | null;
    approvedByName: string | null;
    reviewDue: string | null;
  } | null;
  review: ReviewState;
  history: {
    id: string;
    kind: "approved" | "reviewed";
    version: number;
    title: string;
    day: string;
    actorName: string | null;
  }[];
  template: string;
  defaultTitle: string;
  /** AI-drafted procedures, unreviewed, kept beside the policy until put in its text. */
  procedureDrafts: ProcedureDraft[];
}

export interface ProcedureDraft {
  controlId: string;
  text: string;
  questions: string[];
  generatedAt: string;
}

const REVIEW_LABEL: Record<ReviewState, { text: string; tone: string }> = {
  none: { text: "Not written", tone: "bg-stone-100 text-stone-700" },
  never_approved: { text: "Draft", tone: "bg-amber-50 text-amber-800" },
  current: { text: "Approved", tone: "bg-emerald-50 text-emerald-800" },
  due_soon: { text: "Review due soon", tone: "bg-amber-50 text-amber-800" },
  overdue: { text: "Review overdue", tone: "bg-red-50 text-red-800" },
};

function ReviewBadge({ state }: { state: ReviewState }) {
  const l = REVIEW_LABEL[state];
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${l.tone}`}>
      {l.text}
    </span>
  );
}

export function PoliciesView({
  orgId,
  info,
  onUpgrade,
}: {
  orgId: string;
  info: OrgInfo;
  onUpgrade: () => void;
}) {
  const isAdmin = info.role === "owner" || info.role === "admin";
  const list = useQuery({
    queryKey: ["policies", orgId],
    queryFn: () => api<PolicyList>(`/api/orgs/${orgId}/policies`),
  });
  const [family, setFamily] = useState<FamilyCode | null>(null);
  const counts = list.data?.counts;
  return (
    <div className="space-y-4">
      {!info.plan.level2 && (
        <div
          role="note"
          className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-100 bg-brand-50 p-3 text-sm text-stone-800"
        >
          <p>
            <strong>Policies are read only on the {info.plan.name} plan.</strong> You can read the
            starter text for every family and download any policy already written; writing,
            approving and tracking reviews needs the Level 2 plan.
          </p>
          {isAdmin ? (
            <button type="button" className={btnCls} onClick={onUpgrade}>
              See Level 2 plans
            </button>
          ) : (
            <span className="text-xs text-stone-600">
              Ask an admin of this organization to upgrade.
            </span>
          )}
        </div>
      )}
      <Card
        title="Security policies"
        actions={
          counts && counts.written > 0 ? (
            <a className={btnGhostCls} href={`/api/orgs/${orgId}/policies/export.md`}>
              Download all (Markdown)
            </a>
          ) : null
        }
      >
        <ErrorText error={list.error} />
        <p className="mb-3 text-sm text-stone-700">
          One written policy per NIST SP 800-171 family, with who owns it, who approved which
          version and when it is next reviewed. Each starts from a template that restates the
          family's requirements in their official wording and copies in your accepted implementation
          statements as procedures. Edit it to match what you actually do before approving it.
        </p>
        {counts && (
          <p className="mb-3 text-sm text-stone-800">
            <strong>{counts.inForce}</strong> of {counts.total} families have an approved policy
            {counts.written > counts.inForce &&
              `; ${counts.written - counts.inForce} more in draft`}
            {counts.overdue > 0 && (
              <span className="text-red-800">; {counts.overdue} review(s) overdue</span>
            )}
            {counts.dueSoon > 0 && (
              <span className="text-amber-800">; {counts.dueSoon} due within 60 days</span>
            )}
            .
          </p>
        )}
        {counts && counts.inForce > 0 && (
          <p className="mb-3 flex flex-wrap items-center gap-3 text-sm text-stone-600">
            <a className={btnGhostCls} href={`/api/orgs/${orgId}/affirmations/calendar.ics`}>
              Add review dates to your calendar (.ics)
            </a>
            <span>
              One event per approved policy on its next review date, with alarms 60 and 7 days
              ahead, in the same file as the SPRS affirmation dates. An admin can make a link your
              calendar subscribes to on the Affirmations tab, so each review moves the date.
            </span>
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-stone-500">
              <tr>
                <th className="py-1 pr-3">Family</th>
                <th className="py-1 pr-3">Policy</th>
                <th className="py-1 pr-3">State</th>
                <th className="py-1 pr-3">Owner</th>
                <th className="py-1 pr-3">Next review</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((i) => (
                <tr key={i.family} className="border-t border-stone-100">
                  <td className="py-1.5 pr-3">
                    <button
                      type="button"
                      className="text-left font-medium text-brand-700 hover:underline"
                      onClick={() => setFamily(i.family)}
                      aria-current={family === i.family ? "true" : undefined}
                    >
                      {i.name} ({i.family})
                    </button>
                    <span className="block text-xs text-stone-500">
                      {i.requirements} requirements
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    {i.policy ? (
                      <>
                        {i.policy.title}{" "}
                        <span className="text-xs text-stone-500">v{i.policy.version}</span>
                        {i.policy.status === "draft" && i.policy.approvedOn && (
                          <span className="block text-xs text-amber-800">revision in draft</span>
                        )}
                      </>
                    ) : (
                      <span className="text-stone-500">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3">
                    <ReviewBadge state={i.review} />
                  </td>
                  <td className="py-1.5 pr-3">{i.policy?.ownerName ?? "—"}</td>
                  <td className="py-1.5 pr-3">{i.policy?.reviewDue ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {family && <PolicyEditor key={family} orgId={orgId} info={info} family={family} />}
    </div>
  );
}

function PolicyEditor({
  orgId,
  info,
  family,
}: {
  orgId: string;
  info: OrgInfo;
  family: FamilyCode;
}) {
  const qc = useQueryClient();
  const canWrite = info.role !== "viewer" && info.plan.level2;
  const isAdmin = info.role === "owner" || info.role === "admin";
  const detail = useQuery({
    queryKey: ["policy", orgId, family],
    queryFn: () => api<PolicyDetail>(`/api/orgs/${orgId}/policies/${family}`),
  });
  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => api<{ items: Member[] }>(`/api/orgs/${orgId}/members`),
  });
  const d = detail.data;
  const p = d?.policy ?? null;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [owner, setOwner] = useState("");
  const [months, setMonths] = useState(12);
  const [preview, setPreview] = useState(false);
  const [drafts, setDrafts] = useState<ProcedureDraft[]>([]);
  useEffect(() => {
    if (!d) return;
    setDrafts(d.procedureDrafts ?? []);
    setTitle(d.policy?.title ?? d.defaultTitle);
    setBody(d.policy?.body ?? d.template);
    setOwner(d.policy?.ownerUserId ?? "");
    setMonths(d.policy?.reviewMonths ?? 12);
  }, [d]);
  const refresh = (next: PolicyDetail) => {
    qc.setQueryData(["policy", orgId, family], next);
    qc.invalidateQueries({ queryKey: ["policies", orgId] });
    qc.invalidateQueries({ queryKey: ["ssp"] });
  };
  // The form values travel as the mutation's variables, never through the closure, so a click
  // right after the form fills cannot send the empty first-render state.
  const save = useMutation({
    mutationFn: (json: {
      title: string;
      body: string;
      ownerUserId: string | null;
      reviewMonths: number;
    }) => api<PolicyDetail>(`/api/orgs/${orgId}/policies/${family}`, { method: "PUT", json }),
    onSuccess: refresh,
  });
  const act = useMutation({
    mutationFn: (what: "approve" | "review") =>
      api<PolicyDetail>(`/api/orgs/${orgId}/policies/${family}/${what}`, { method: "POST" }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/api/orgs/${orgId}/policies/${family}`, { method: "DELETE" }).then(() =>
        detail.refetch(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policies", orgId] }),
  });
  if (!d) return <ErrorText error={detail.error} />;
  const dirty =
    !p ||
    title !== p.title ||
    body !== p.body ||
    (owner || null) !== p.ownerUserId ||
    months !== p.reviewMonths;
  const textDirty = p && (title !== p.title || body !== p.body);
  const base = `/api/orgs/${orgId}/policies/${family}/download`;
  return (
    <Card
      title={`${d.name} (${d.family})`}
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhostCls} onClick={() => setPreview((v) => !v)}>
            {preview ? "Edit" : "Preview"}
          </button>
          {p && (
            <a className={btnGhostCls} href={base}>
              Download v{p.version}
            </a>
          )}
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-stone-700">
        <ReviewBadge state={d.review} />
        {p ? (
          <span>
            Version {p.version}, {p.status === "approved" ? "approved" : "draft"}
            {p.approvedOn &&
              ` · last approved ${p.approvedOn}${p.approvedByName ? ` by ${p.approvedByName}` : ""}`}
            {p.reviewDue && ` · next review ${p.reviewDue}`}
          </span>
        ) : (
          <span>Not written yet. The text below is the starter template; nothing is saved.</span>
        )}
      </div>
      {p?.status === "draft" && p.approvedOn && (
        <p className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
          Version {p.version} is a revision in draft. The last approved version stays in force until
          an admin approves this one.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Title">
          <input
            className={inputCls}
            value={title}
            maxLength={200}
            disabled={!canWrite}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Policy owner">
          <select
            className={inputCls}
            value={owner}
            disabled={!canWrite}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">Unassigned</option>
            {members.data?.items.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Review every"
          hint="NIST SP 800-171 Rev. 2 sets no interval; this is your choice. It applies from the next approval or review."
        >
          <select
            className={inputCls}
            value={months}
            disabled={!canWrite}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            {REVIEW_MONTHS.map((m) => (
              <option key={m} value={m}>
                {m} months
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-3">
        {preview ? (
          <div className="rounded border border-stone-200 p-3">
            <Markdown source={body} headingOffset={1} size="sm" />
          </div>
        ) : (
          <Field label="Policy text (Markdown)">
            <textarea
              className={`${inputCls} min-h-[24rem] font-mono text-xs`}
              value={body}
              disabled={!canWrite}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
        )}
      </div>
      {textDirty && p?.status === "approved" && (
        <p className="mt-2 text-xs text-amber-800">
          Saving a changed title or text starts version {p.version + 1} as a draft.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {canWrite && (
          <button
            type="button"
            className={btnCls}
            disabled={!dirty || save.isPending || !body.trim()}
            onClick={() =>
              save.mutate({ title, body, ownerUserId: owner || null, reviewMonths: months })
            }
          >
            {p ? "Save" : "Save as draft"}
          </button>
        )}
        {canWrite && p && (
          <button
            type="button"
            className={btnGhostCls}
            disabled={save.isPending}
            onClick={() => setBody(d.template)}
            title="Replace the text box with a fresh template (not saved until you click Save)"
          >
            Start over from the template
          </button>
        )}
        {isAdmin && info.plan.level2 && p?.status === "draft" && (
          <button
            type="button"
            className={btnCls}
            disabled={dirty || act.isPending}
            title={dirty ? "Save your changes first" : undefined}
            onClick={() => act.mutate("approve")}
          >
            Approve version {p.version}
          </button>
        )}
        {isAdmin && info.plan.level2 && p?.reviewDue && (
          <button
            type="button"
            className={btnGhostCls}
            disabled={act.isPending}
            onClick={() => act.mutate("review")}
          >
            Reviewed, no changes
          </button>
        )}
        {isAdmin && p && (
          <button
            type="button"
            className={`${btnGhostCls} ml-auto text-red-700`}
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Delete this policy and its approval history? The audit log keeps a record that it was deleted.",
                )
              )
                remove.mutate();
            }}
          >
            Delete
          </button>
        )}
      </div>
      <ErrorText error={save.error ?? act.error ?? remove.error} />
      {isAdmin && p?.status === "draft" && confirmPlaceholders(body).length > 0 && (
        <p className="mt-2 text-xs text-amber-800">
          The text still has {confirmPlaceholders(body).length} [CONFIRM: …] placeholder(s). Replace
          each with what you actually do before approving.
        </p>
      )}
      <ProcedureDrafts
        orgId={orgId}
        family={family}
        requirements={d.requirements}
        drafts={drafts}
        setDrafts={setDrafts}
        canWrite={canWrite}
        policyApproved={p?.status === "approved"}
        onPut={async (nistId, text) => {
          const next = replaceProcedure(body, nistId, text);
          if (next === null) return false;
          await save.mutateAsync({
            title,
            body: next,
            ownerUserId: owner || null,
            reviewMonths: months,
          });
          return true;
        }}
      />
      {d.history.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold text-stone-900">History</h3>
          <ul className="space-y-1 text-sm text-stone-700">
            {d.history.map((h) => (
              <li key={h.id}>
                {h.day}: version {h.version} {h.kind === "approved" ? "approved" : "reviewed"}
                {h.actorName ? ` by ${h.actorName}` : ""}
                {h.kind === "approved" && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      className="text-brand-700 hover:underline"
                      href={`${base}?version=${h.version}`}
                    >
                      download
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="mt-4 text-sm text-stone-700">
        <summary className="cursor-pointer font-medium">
          Requirements this policy covers ({d.requirements.length})
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {d.requirements.map((r) => (
            <li key={r.id}>
              <strong>{r.nistId}</strong> {r.text}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

/**
 * "Draft with AI" for each requirement's procedure (section 5 of the policy). A draft is shown as
 * unreviewed, edited here, and put in the policy text only when a person clicks "Put in the policy
 * and save" with every [CONFIRM: ...] resolved; the policy then still waits for an admin's approval.
 */
function ProcedureDrafts({
  orgId,
  family,
  requirements,
  drafts,
  setDrafts,
  canWrite,
  policyApproved,
  onPut,
}: {
  orgId: string;
  family: FamilyCode;
  requirements: PolicyDetail["requirements"];
  drafts: ProcedureDraft[];
  setDrafts: (f: (prev: ProcedureDraft[]) => ProcedureDraft[]) => void;
  canWrite: boolean;
  policyApproved: boolean;
  onPut: (nistId: string, text: string) => Promise<boolean>;
}) {
  const base = `/api/orgs/${orgId}/policies/${family}/procedures`;
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const qc = useQueryClient();
  const draft = useMutation({
    mutationFn: (controlId: string) =>
      api<ProcedureDraft>(`${base}/${controlId}/draft`, { method: "POST" }),
    onMutate: (controlId) => setBusy(controlId),
    onSettled: () => setBusy(null),
    onSuccess: (next) => {
      setDrafts((prev) => [...prev.filter((x) => x.controlId !== next.controlId), next]);
      setEdits((e) => ({ ...e, [next.controlId]: next.text }));
      qc.invalidateQueries({ queryKey: ["billing", orgId] });
    },
  });
  const discard = useMutation({
    mutationFn: (controlId: string) =>
      api(`${base}/${controlId}/draft`, { method: "DELETE" }).then(() => controlId),
    onSuccess: (controlId) => setDrafts((prev) => prev.filter((x) => x.controlId !== controlId)),
  });
  const put = useMutation({
    mutationFn: async ({
      controlId,
      nistId,
      text,
    }: {
      controlId: string;
      nistId: string;
      text: string;
    }) => {
      setMissing(null);
      if (!(await onPut(nistId, text))) {
        setMissing(nistId);
        return;
      }
      await discard.mutateAsync(controlId);
    },
  });
  const byId = new Map(drafts.map((x) => [x.controlId, x]));
  return (
    <details className="mt-4 text-sm text-stone-700" open={drafts.length > 0 || undefined}>
      <summary className="cursor-pointer font-medium">
        Draft procedures with AI{drafts.length > 0 && ` (${drafts.length} awaiting review)`}
      </summary>
      <p className="mt-2 text-xs text-stone-600">
        For one requirement at a time, the AI writes numbered steps from your notes and accepted
        statement on the Controls page, the evidence titles on file and your service providers, and
        nothing else. Where a fact is missing it leaves [CONFIRM: …] and asks. Each draft counts as
        one of your plan's AI drafts this month. A draft is not part of the policy until you put it
        in and save{policyApproved ? ", which starts a new version as a draft" : ""}.
      </p>
      <ul className="mt-2 space-y-3">
        {requirements.map((r) => {
          const x = byId.get(r.id);
          const text = edits[r.id] ?? x?.text ?? "";
          const open = confirmPlaceholders(text);
          return (
            <li key={r.id} className="border-t border-stone-100 pt-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span>
                  <strong>{r.nistId}</strong> {r.text}
                </span>
                {canWrite && (
                  <button
                    type="button"
                    className={btnGhostCls}
                    disabled={busy !== null}
                    onClick={() => draft.mutate(r.id)}
                  >
                    {busy === r.id ? "Drafting…" : x ? "Draft again" : "Draft with AI"}
                  </button>
                )}
              </div>
              {x && (
                <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
                    AI draft — not reviewed. Edit it, replace every [CONFIRM: …] with facts, then
                    put it in the policy.
                  </p>
                  <textarea
                    aria-label={`Draft procedure for ${r.nistId}`}
                    className={inputCls}
                    rows={6}
                    disabled={!canWrite}
                    value={text}
                    onChange={(e) => setEdits((ed) => ({ ...ed, [r.id]: e.target.value }))}
                  />
                  {x.questions.length > 0 && (
                    <ul className="mt-2 list-disc pl-4 text-sm text-amber-900">
                      {x.questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                  )}
                  {canWrite && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={btnCls}
                        disabled={put.isPending || open.length > 0 || !text.trim()}
                        onClick={() => put.mutate({ controlId: r.id, nistId: r.nistId, text })}
                      >
                        Put in the policy and save
                      </button>
                      <button
                        type="button"
                        className={btnGhostCls}
                        disabled={discard.isPending}
                        onClick={() => discard.mutate(r.id)}
                      >
                        Discard draft
                      </button>
                    </div>
                  )}
                  {open.length > 0 && (
                    <p className="mt-1 text-xs text-amber-800">
                      Resolve the {open.length} [CONFIRM: …] placeholder(s) first.
                    </p>
                  )}
                  {missing === r.nistId && (
                    <p className="mt-1 text-xs text-red-800">
                      The policy text has no "### {r.nistId}" heading to put it under. Add the
                      heading in section 5, or copy the procedure in by hand.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ErrorText error={draft.error ?? discard.error ?? put.error} />
    </details>
  );
}
