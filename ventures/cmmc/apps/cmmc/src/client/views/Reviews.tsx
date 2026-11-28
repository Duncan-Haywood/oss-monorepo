// ISO 9001 management review (9.3): the list of reviews with when the next one is due, a draft
// editor whose inputs show the figures the workspace worked out from its records beside a note per
// input, the decisions and actions, finalising, and the minutes download. The checks run on the
// server (@shared/management-review); this view shows them. Readable on every plan; recording needs
// Level 2 + Quality.
import type {
  ReviewAction,
  ReviewAttention,
  ReviewInputKey,
  ReviewOutputKey,
  ReviewStatus,
} from "@shared/management-review";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { OrgInfo } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";

export interface ReviewItem {
  id: string;
  status: ReviewStatus;
  heldOn: string;
  periodFrom: string;
  periodTo: string;
  attendees: string;
  inputs: Partial<Record<ReviewInputKey, string>>;
  outputs: Partial<Record<ReviewOutputKey, string>>;
  actions: ReviewAction[];
  nextReviewOn: string | null;
  finalisedOn: string | null;
  facts: Record<ReviewInputKey, string[]>;
  problems: string[];
}

export interface ReviewsResponse {
  today: string;
  items: ReviewItem[];
  attention: ReviewAttention;
  inputs: { key: ReviewInputKey; clause: string; label: string; hint: string }[];
  outputs: { key: ReviewOutputKey; clause: string; label: string }[];
}

type Draft = Pick<
  ReviewItem,
  "heldOn" | "periodFrom" | "periodTo" | "attendees" | "inputs" | "outputs" | "nextReviewOn"
> & { actions: (Omit<ReviewAction, "id"> & { id?: string })[] };

const draftOf = (r: ReviewItem): Draft => ({
  heldOn: r.heldOn,
  periodFrom: r.periodFrom,
  periodTo: r.periodTo,
  attendees: r.attendees,
  inputs: { ...r.inputs },
  outputs: { ...r.outputs },
  actions: r.actions.map((a) => ({ ...a })),
  nextReviewOn: r.nextReviewOn,
});

function attentionText(a: ReviewAttention): { text: string; warn: boolean } {
  if (a.timing === "never")
    return {
      text: "No management review recorded yet. ISO 9001 asks for one at planned intervals; most small shops hold one a year, before their surveillance audit.",
      warn: true,
    };
  if (a.timing === "overdue")
    return {
      text: `The next review was due ${a.nextDueOn} (last held ${a.lastHeldOn}).`,
      warn: true,
    };
  if (a.timing === "due_soon")
    return {
      text: `The next review is due ${a.nextDueOn} (last held ${a.lastHeldOn}).`,
      warn: true,
    };
  return { text: `Last held ${a.lastHeldOn}; the next is due ${a.nextDueOn}.`, warn: false };
}

export function ReviewsView({
  orgId,
  info,
  onUpgrade,
}: {
  orgId: string;
  info: OrgInfo;
  onUpgrade: () => void;
}) {
  const qc = useQueryClient();
  const canRecord = info.plan.quality && info.role !== "viewer";
  const isAdmin = info.role === "owner" || info.role === "admin";
  const key = ["reviews", orgId];
  const list = useQuery({
    queryKey: key,
    queryFn: () => api<ReviewsResponse>(`/api/orgs/${orgId}/reviews`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [open, setOpen] = useState<string | null>(null);
  const [heldOn, setHeldOn] = useState("");
  const start = useMutation({
    mutationFn: () =>
      api<ReviewItem>(`/api/orgs/${orgId}/reviews`, {
        method: "POST",
        json: { heldOn: heldOn || list.data?.today },
      }),
    onSuccess: (r) => {
      setOpen(r.id);
      refresh();
    },
  });
  const data = list.data;
  const att = data ? attentionText(data.attention) : null;
  return (
    <div className="space-y-4">
      {!info.plan.quality && (
        <Card title="Read only on this plan">
          <p className="text-sm text-stone-700">
            Recording management reviews needs the Level 2 + Quality plan. Everything recorded stays
            readable.{" "}
            {isAdmin ? (
              <button type="button" className="underline" onClick={onUpgrade}>
                See plans
              </button>
            ) : (
              "Ask an admin of this organization to upgrade."
            )}
          </p>
        </Card>
      )}
      <Card title="Management review (ISO 9001 9.3)">
        <ErrorText error={list.error} />
        <p className="mb-3 text-sm text-stone-700">
          Once a year or so, the owner and whoever runs quality look at how the system is doing and
          write down what they decided. A review here starts with the figures for its period already
          filled in from your corrective actions, audits, gauges, suppliers and incidents, and with
          the last review's open actions. You add what the records cannot say (objectives, on-time
          delivery, resources), the decisions and who does what by when, then download the minutes.
        </p>
        {att && (
          <p
            className={`mb-3 rounded p-2 text-sm ${att.warn ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-800"}`}
          >
            {att.text}
            {data && data.attention.actionsOpen > 0 && (
              <>
                {" "}
                {data.attention.actionsOpen} action{data.attention.actionsOpen === 1 ? "" : "s"}{" "}
                from past reviews open
                {data.attention.actionsOverdue > 0 && `, ${data.attention.actionsOverdue} past due`}
                .
              </>
            )}
          </p>
        )}
        {canRecord && (
          <form
            className="mb-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start.mutate();
            }}
          >
            <Field label="Meeting date">
              <input
                className={inputCls}
                type="date"
                value={heldOn || data?.today || ""}
                onChange={(e) => setHeldOn(e.target.value)}
              />
            </Field>
            <button type="submit" className={btnCls} disabled={start.isPending || !data}>
              Start a review
            </button>
            <ErrorText error={start.error} />
          </form>
        )}
        {data && data.items.length === 0 && (
          <p className="text-sm text-stone-600">No reviews yet.</p>
        )}
        {data && data.items.length > 0 && (
          <ul className="divide-y divide-stone-100 text-sm">
            {data.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>{r.heldOn}</strong> · period {r.periodFrom} to {r.periodTo} ·{" "}
                  <span
                    className={
                      r.status === "final"
                        ? "rounded bg-green-50 px-1.5 text-green-800"
                        : "rounded bg-stone-100 px-1.5 text-stone-700"
                    }
                  >
                    {r.status === "final" ? `Final ${r.finalisedOn}` : "Draft"}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={btnGhostCls}
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                  >
                    {open === r.id ? "Close" : r.status === "draft" && canRecord ? "Edit" : "Open"}
                  </button>
                  <a className={btnGhostCls} href={`/api/orgs/${orgId}/reviews/${r.id}/minutes.md`}>
                    Minutes
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {data &&
        open &&
        (() => {
          const r = data.items.find((x) => x.id === open);
          if (!r) return null;
          return r.status === "draft" && canRecord ? (
            <DraftEditor
              key={r.id + r.heldOn}
              orgId={orgId}
              review={r}
              meta={data}
              onChanged={refresh}
              onClosed={() => setOpen(null)}
            />
          ) : (
            <FinalView
              key={r.id}
              orgId={orgId}
              review={r}
              meta={data}
              canRecord={canRecord}
              onChanged={refresh}
            />
          );
        })()}
    </div>
  );
}

function Facts({ lines }: { lines: string[] }) {
  if (!lines.length)
    return <p className="text-xs text-stone-500">Nothing in the workspace's records on this.</p>;
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-xs text-stone-700">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

function DraftEditor({
  orgId,
  review,
  meta,
  onChanged,
  onClosed,
}: {
  orgId: string;
  review: ReviewItem;
  meta: ReviewsResponse;
  onChanged: () => void;
  onClosed: () => void;
}) {
  const [d, setD] = useState<Draft>(() => draftOf(review));
  const url = `/api/orgs/${orgId}/reviews/${review.id}`;
  const save = useMutation({
    mutationFn: () => api<ReviewItem>(url, { method: "PATCH", json: d }),
    onSuccess: onChanged,
  });
  const finalise = useMutation({
    mutationFn: async () => {
      await api(url, { method: "PATCH", json: d });
      return api<ReviewItem>(`${url}/finalise`, { method: "POST" });
    },
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => api(url, { method: "DELETE" }),
    onSuccess: () => {
      onClosed();
      onChanged();
    },
  });
  const setAction = (i: number, patch: Partial<Draft["actions"][number]>) =>
    setD({ ...d, actions: d.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <Card
      title={`Review of ${review.heldOn} (draft)`}
      actions={
        <button
          type="button"
          className={btnGhostCls}
          onClick={() => {
            if (window.confirm("Delete this draft review?")) remove.mutate();
          }}
        >
          Delete draft
        </button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Meeting date">
            <input
              className={inputCls}
              type="date"
              required
              value={d.heldOn}
              onChange={(e) => setD({ ...d, heldOn: e.target.value })}
            />
          </Field>
          <Field label="Period from">
            <input
              className={inputCls}
              type="date"
              required
              value={d.periodFrom}
              onChange={(e) => setD({ ...d, periodFrom: e.target.value })}
            />
          </Field>
          <Field label="Period to">
            <input
              className={inputCls}
              type="date"
              required
              value={d.periodTo}
              onChange={(e) => setD({ ...d, periodTo: e.target.value })}
            />
          </Field>
          <Field label="Next review" hint="Blank: twelve months on">
            <input
              className={inputCls}
              type="date"
              value={d.nextReviewOn ?? ""}
              onChange={(e) => setD({ ...d, nextReviewOn: e.target.value || null })}
            />
          </Field>
        </div>
        <Field label="Present" hint="Names and roles, top management included">
          <input
            className={inputCls}
            value={d.attendees}
            onChange={(e) => setD({ ...d, attendees: e.target.value })}
          />
        </Field>
        <p className="text-xs text-stone-500">
          The figures below are worked out from the records for the saved period; save after
          changing the dates to refresh them. Finalising keeps them as they stand that day.
        </p>
        <h3 className="text-sm font-semibold text-stone-900">Inputs</h3>
        {meta.inputs.map((input) => (
          <div key={input.key} className="rounded border border-stone-200 p-3">
            <p className="text-sm font-medium text-stone-900">
              {input.label} <span className="text-xs text-stone-500">({input.clause})</span>
            </p>
            <p className="mb-1 text-xs text-stone-500">{input.hint}</p>
            <Facts lines={review.facts[input.key] ?? []} />
            <textarea
              className={`${inputCls} mt-2`}
              rows={2}
              aria-label={`Notes: ${input.label}`}
              placeholder="What was discussed (or: nothing to report)"
              value={d.inputs[input.key] ?? ""}
              onChange={(e) => setD({ ...d, inputs: { ...d.inputs, [input.key]: e.target.value } })}
            />
          </div>
        ))}
        <h3 className="text-sm font-semibold text-stone-900">Decisions</h3>
        {meta.outputs.map((output) => (
          <Field key={output.key} label={`${output.label} (${output.clause})`}>
            <textarea
              className={inputCls}
              rows={2}
              placeholder="What was decided (or: none)"
              value={d.outputs[output.key] ?? ""}
              onChange={(e) =>
                setD({ ...d, outputs: { ...d.outputs, [output.key]: e.target.value } })
              }
            />
          </Field>
        ))}
        <h3 className="text-sm font-semibold text-stone-900">Actions</h3>
        {d.actions.map((a, i) => (
          <div key={a.id ?? `new-${i}`} className="grid gap-2 sm:grid-cols-[3fr_1fr_1fr_auto]">
            <input
              className={inputCls}
              aria-label={`Action ${i + 1}`}
              placeholder="What"
              value={a.text}
              onChange={(e) => setAction(i, { text: e.target.value })}
            />
            <input
              className={inputCls}
              aria-label={`Owner of action ${i + 1}`}
              placeholder="Who"
              value={a.owner}
              onChange={(e) => setAction(i, { owner: e.target.value })}
            />
            <input
              className={inputCls}
              type="date"
              aria-label={`Due date of action ${i + 1}`}
              value={a.dueOn ?? ""}
              onChange={(e) => setAction(i, { dueOn: e.target.value || null })}
            />
            <button
              type="button"
              className={btnGhostCls}
              onClick={() => setD({ ...d, actions: d.actions.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={btnGhostCls}
          onClick={() =>
            setD({
              ...d,
              actions: [...d.actions, { text: "", owner: "", dueOn: null, doneOn: null }],
            })
          }
        >
          Add an action
        </button>
        {review.problems.length > 0 && (
          <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
            <p className="font-medium">Before finalising (as last saved):</p>
            <ul className="list-disc pl-5">
              {review.problems.slice(0, 10).map((p) => (
                <li key={p}>{p}</li>
              ))}
              {review.problems.length > 10 && <li>and {review.problems.length - 10} more</li>}
            </ul>
          </div>
        )}
        <ErrorText error={save.error ?? finalise.error ?? remove.error} />
        <div className="flex gap-2">
          <button type="submit" className={btnCls} disabled={save.isPending}>
            Save draft
          </button>
          <button
            type="button"
            className={btnGhostCls}
            disabled={finalise.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Finalise these minutes? They are kept as they stand; afterwards only actions can be marked done.",
                )
              )
                finalise.mutate();
            }}
          >
            Save and finalise
          </button>
        </div>
      </form>
    </Card>
  );
}

function FinalView({
  orgId,
  review,
  meta,
  canRecord,
  onChanged,
}: {
  orgId: string;
  review: ReviewItem;
  meta: ReviewsResponse;
  canRecord: boolean;
  onChanged: () => void;
}) {
  const mark = useMutation({
    mutationFn: (v: { id: string; doneOn: string | null }) =>
      api(`/api/orgs/${orgId}/reviews/${review.id}/actions/${v.id}/done`, {
        method: "PUT",
        json: { doneOn: v.doneOn },
      }),
    onSuccess: onChanged,
  });
  return (
    <Card
      title={`Review of ${review.heldOn}${review.status === "final" ? " (final)" : " (draft)"}`}
    >
      <p className="mb-2 text-sm text-stone-700">
        Period {review.periodFrom} to {review.periodTo}. Present:{" "}
        {review.attendees || "not recorded"}.
      </p>
      <dl className="space-y-3 text-sm">
        {meta.inputs.map((input) => (
          <div key={input.key}>
            <dt className="font-medium text-stone-900">
              {input.label} <span className="text-xs text-stone-500">({input.clause})</span>
            </dt>
            <dd>
              <Facts lines={review.facts[input.key] ?? []} />
              {review.inputs[input.key] && (
                <p className="mt-1 whitespace-pre-wrap text-stone-800">
                  {review.inputs[input.key]}
                </p>
              )}
            </dd>
          </div>
        ))}
        {meta.outputs.map((output) => (
          <div key={output.key}>
            <dt className="font-medium text-stone-900">
              {output.label} <span className="text-xs text-stone-500">({output.clause})</span>
            </dt>
            <dd className="whitespace-pre-wrap text-stone-800">
              {review.outputs[output.key] || "Not recorded"}
            </dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-4 mb-1 text-sm font-semibold text-stone-900">Actions</h3>
      {review.actions.length === 0 && <p className="text-sm text-stone-600">No actions set.</p>}
      <ul className="space-y-1 text-sm">
        {review.actions.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2">
            <span className={a.doneOn ? "text-stone-500 line-through" : ""}>
              {a.text} ({a.owner || "no owner"}
              {a.dueOn ? `, due ${a.dueOn}` : ""})
            </span>
            {a.doneOn && <span className="text-xs text-green-800">done {a.doneOn}</span>}
            {canRecord && review.status === "final" && (
              <button
                type="button"
                className="text-xs underline"
                onClick={() => mark.mutate({ id: a.id, doneOn: a.doneOn ? null : meta.today })}
              >
                {a.doneOn ? "Reopen" : "Mark done today"}
              </button>
            )}
          </li>
        ))}
      </ul>
      <ErrorText error={mark.error} />
    </Card>
  );
}
