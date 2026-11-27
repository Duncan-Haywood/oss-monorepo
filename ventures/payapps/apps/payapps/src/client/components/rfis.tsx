// The job's RFI log (requests for information to the GC): add an RFI, record when it went out and
// when the answer came back, and link the change order that prices an answer. Status, days overdue
// and "needs a change order" come from src/shared/rfi.ts through the API. Each RFI downloads as a PDF
// to attach, with an email draft to the GC's project manager; nothing is sent from PayApps.
import type { ChangeOrderDto, RfiDto, RfiLogDto } from "@shared/api/types";
import { mailtoHref } from "@shared/follow-up-email";
import {
  canStartChangeOrder,
  type OverdueRfi,
  overdueRfiText,
  RFI_IMPACT_LABELS,
  RFI_IMPACTS,
  RFI_LOG_ANCHOR,
  RFI_STATUS_LABELS,
  type RfiImpact,
  rfiEmail,
  rfiLabel,
  suggestedDueDate,
} from "@shared/rfi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api, orgPath } from "../lib/api";
import { AttachmentsPanel } from "./attachments";
import { ErrorText } from "./error";

/** What a row has open under it: the editor, the email draft or the RFI's files. */
type RowMode = "edit" | "email" | "files";

interface Job {
  name: string;
  number: string | null;
  gcName: string;
  gcPmName?: string | null;
  gcPmEmail?: string | null;
}

const STATUS_CLASS: Record<RfiDto["status"], string> = {
  draft: "text-slate-500",
  open: "text-slate-700",
  overdue: "font-semibold text-red-700",
  answered: "text-green-700",
};

const impactOrNull = (v: string): RfiImpact | null =>
  (RFI_IMPACTS as readonly string[]).includes(v) ? (v as RfiImpact) : null;

function ImpactSelect(props: {
  label: string;
  value: RfiImpact | null;
  onChange: (v: RfiImpact | null) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-slate-600">{props.label}</span>
      <select
        className="input"
        value={props.value ?? ""}
        onChange={(e) => props.onChange(impactOrNull(e.target.value))}
      >
        <option value="">Not stated</option>
        {RFI_IMPACTS.map((i) => (
          <option key={i} value={i}>
            {RFI_IMPACT_LABELS[i]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RfiLog(props: {
  /** `/api/orgs/:orgId/projects/:projectId` */
  base: string;
  job: Job;
  changeOrders: Pick<ChangeOrderDto, "id" | "number" | "description">[];
  from: { name: string; company: string };
  /** Fills the change order form from an answered RFI; the new change order is linked to it. */
  onStartChangeOrder?: (r: RfiDto) => void;
}) {
  const { base, job, changeOrders, from, onStartChangeOrder } = props;
  const url = `${base}/rfis`;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["rfis", url], queryFn: () => api<RfiLogDto>(url) });
  // The job history panel shows RFI events too (sent, answered, linked), so it refetches as well.
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["rfis", url] }),
      qc.invalidateQueries({ queryKey: ["pay-app-history", base] }),
    ]);
  const [open, setOpen] = useState<string | null>(null);
  // The weekly email and the projects page link here with #rfis: scroll once the log has loaded.
  const section = useRef<HTMLElement>(null);
  const loaded = q.data !== undefined;
  useEffect(() => {
    if (loaded && window.location.hash === `#${RFI_LOG_ANCHOR}`) section.current?.scrollIntoView();
  }, [loaded]);
  const [mode, setMode] = useState<RowMode | null>(null);
  const [draft, setDraft] = useState({
    subject: "",
    question: "",
    reference: "",
    suggestion: "",
    sentOn: "",
    responseDueOn: "",
  });

  const add = useMutation({
    mutationFn: () =>
      api<RfiDto>(url, {
        method: "POST",
        body: {
          subject: draft.subject,
          question: draft.question,
          reference: draft.reference || null,
          suggestion: draft.suggestion || null,
          sentOn: draft.sentOn || null,
          responseDueOn: draft.responseDueOn || null,
        },
      }),
    onSuccess: () => {
      setDraft({
        subject: "",
        question: "",
        reference: "",
        suggestion: "",
        sentOn: "",
        responseDueOn: "",
      });
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${url}/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      setOpen(null);
      return refresh();
    },
  });

  const log = q.data;
  const s = log?.summary;
  const counts = s
    ? [
        s.overdue ? `${s.overdue} overdue` : null,
        s.open ? `${s.open} open` : null,
        s.needChangeOrder ? `${s.needChangeOrder} answered with no change order` : null,
      ].filter(Boolean)
    : [];
  return (
    <section className="card" id={RFI_LOG_ANCHOR} ref={section}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          RFIs{" "}
          <span className="text-sm font-normal text-slate-600">
            (requests for information to {job.gcName})
          </span>
        </h2>
        {log && log.items.length > 0 && (
          <a className="link text-sm" href={`${url}/rfis.csv`}>
            Download the log (CSV)
          </a>
        )}
      </div>
      {q.error && <ErrorText error={q.error} />}
      {s && s.total > 0 && (
        <p className="mb-2 text-sm text-slate-700">
          {counts.length ? counts.join(", ") : "Nothing waiting"}
          {s.averageDaysToAnswer !== null &&
            `. Answers have taken ${s.averageDaysToAnswer} days on average`}
          {s.oldestOpen &&
            `. Oldest unanswered: ${rfiLabel(s.oldestOpen.number)}, ${s.oldestOpen.days} days`}
          .
        </p>
      )}
      {log && log.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="th">No.</th>
                <th className="th">Subject</th>
                <th className="th hidden sm:table-cell">Sent</th>
                <th className="th hidden sm:table-cell">Due</th>
                <th className="th">Status</th>
                <th className="th">Change order</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {log.items.map((r) => (
                <RfiRow
                  key={r.id}
                  r={r}
                  url={url}
                  job={job}
                  from={from}
                  today={log.today}
                  changeOrders={changeOrders}
                  expanded={open === r.id ? mode : null}
                  onToggle={(m) => {
                    setOpen(open === r.id && mode === m ? null : r.id);
                    setMode(m);
                  }}
                  onSaved={refresh}
                  onStartChangeOrder={onStartChangeOrder}
                  onDelete={() => {
                    const files = r.fileCount
                      ? ` Its ${r.fileCount} file${r.fileCount === 1 ? "" : "s"} go with it.`
                      : "";
                    if (
                      window.confirm(
                        `Delete ${rfiLabel(r.number)}? Its number is not reused.${files}`,
                      )
                    ) {
                      remove.mutate(r.id);
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {log && log.items.length === 0 && (
        <p className="text-sm text-slate-600">
          No RFIs on this job yet. Log each question you send the GC here, so the answers, the dates
          and any extra work they lead to stay with the job.
        </p>
      )}
      <ErrorText error={remove.error} />

      <form
        className="mt-3 grid max-w-3xl gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <h3 className="font-semibold">New RFI{log ? ` (${rfiLabel(log.nextNumber)})` : ""}</h3>
        <input
          className="input"
          placeholder="Subject, e.g. Ceiling height at corridor 2"
          value={draft.subject}
          onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          aria-label="RFI subject"
          required
        />
        <textarea
          className="input min-h-20"
          placeholder="The question: what the drawings or specs leave unclear, and what you need to know"
          value={draft.question}
          onChange={(e) => setDraft({ ...draft, question: e.target.value })}
          aria-label="RFI question"
          required
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="input"
            placeholder="Reference: sheet, detail, spec section or grid"
            value={draft.reference}
            onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
            aria-label="RFI reference"
          />
          <input
            className="input"
            placeholder="Your proposed solution (optional)"
            value={draft.suggestion}
            onChange={(e) => setDraft({ ...draft, suggestion: e.target.value })}
            aria-label="Proposed solution"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="text-slate-600">Date sent (blank: not yet)</span>
            <input
              className="input"
              type="date"
              value={draft.sentOn}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  sentOn: e.target.value,
                  responseDueOn:
                    draft.responseDueOn || !e.target.value
                      ? draft.responseDueOn
                      : suggestedDueDate(e.target.value),
                })
              }
            />
          </label>
          <label className="grid gap-1">
            <span className="text-slate-600">Response requested by</span>
            <input
              className="input"
              type="date"
              value={draft.responseDueOn}
              onChange={(e) => setDraft({ ...draft, responseDueOn: e.target.value })}
            />
          </label>
          <button className="btn" type="submit" disabled={add.isPending}>
            Add RFI
          </button>
        </div>
        <p className="text-xs text-slate-500">
          The response date fills in seven days after the date sent; change it to what your
          subcontract allows.
        </p>
        <ErrorText error={add.error} />
      </form>
    </section>
  );
}

function RfiRow(props: {
  r: RfiDto;
  url: string;
  job: Job;
  from: { name: string; company: string };
  today: string;
  changeOrders: Pick<ChangeOrderDto, "id" | "number" | "description">[];
  expanded: RowMode | null;
  onToggle: (mode: RowMode) => void;
  onSaved: () => void;
  onStartChangeOrder?: (r: RfiDto) => void;
  onDelete: () => void;
}) {
  const { r, url, expanded } = props;
  const status =
    r.status === "overdue"
      ? `Overdue ${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"}`
      : r.status === "open" && r.daysOutstanding !== null
        ? `Open ${r.daysOutstanding} day${r.daysOutstanding === 1 ? "" : "s"}`
        : RFI_STATUS_LABELS[r.status];
  const email = rfiEmail(props.job, r, props.from, props.today);
  return (
    <>
      <tr className="border-t align-top">
        <td className="td whitespace-nowrap">{r.number}</td>
        <td className="td">
          {r.subject}
          {r.reference && <div className="text-xs text-slate-500">{r.reference}</div>}
        </td>
        <td className="td hidden whitespace-nowrap sm:table-cell">{r.sentOn ?? "-"}</td>
        <td className="td hidden whitespace-nowrap sm:table-cell">{r.responseDueOn ?? "-"}</td>
        <td className={`td whitespace-nowrap ${STATUS_CLASS[r.status]}`}>
          {status}
          {r.answeredOn && <div className="text-xs">{r.answeredOn}</div>}
        </td>
        <td className="td">
          {r.changeOrderNumber ? (
            `CO ${r.changeOrderNumber}`
          ) : r.needsChangeOrder ? (
            <span className="font-semibold text-amber-700">Needs one</span>
          ) : (
            "-"
          )}
          {props.onStartChangeOrder && canStartChangeOrder(r) && (
            <div>
              <button
                className="link text-xs"
                type="button"
                onClick={() => props.onStartChangeOrder?.(r)}
              >
                Start a change order
              </button>
            </div>
          )}
        </td>
        <td className="td whitespace-nowrap text-right">
          <button className="link" type="button" onClick={() => props.onToggle("edit")}>
            {r.answeredOn ? "Details" : "Answer / edit"}
          </button>{" "}
          {email && (
            <button className="link" type="button" onClick={() => props.onToggle("email")}>
              Email
            </button>
          )}{" "}
          <button className="link" type="button" onClick={() => props.onToggle("files")}>
            {r.fileCount > 0 ? `Files (${r.fileCount})` : "Files"}
          </button>{" "}
          <a className="link" href={`${url}/${encodeURIComponent(r.id)}/rfi.pdf`}>
            PDF
          </a>
          {r.fileCount > 0 && (
            <>
              {" "}
              <a className="link" href={`${url}/${encodeURIComponent(r.id)}/packet.pdf`}>
                PDF + files
              </a>
            </>
          )}
        </td>
      </tr>
      {expanded === "edit" && (
        <tr>
          <td className="td bg-slate-50" colSpan={7}>
            <RfiEditor key={`${r.id}:${r.sentOn}:${r.answeredOn}:${r.changeOrderId}`} {...props} />
          </td>
        </tr>
      )}
      {expanded === "files" && (
        <tr>
          <td className="td bg-slate-50" colSpan={7}>
            <AttachmentsPanel
              base={`${url}/${encodeURIComponent(r.id)}`}
              holder="rfi"
              embedded
              onChanged={props.onSaved}
            />
          </td>
        </tr>
      )}
      {expanded === "email" && email && (
        <tr>
          <td className="td bg-slate-50 text-sm" colSpan={7}>
            <p className="mb-1 text-slate-600">
              {email.kind === "send" ? "Email this RFI" : "Follow up on this RFI"}
              {email.to
                ? ` to ${email.to}`
                : " (add the GC's project manager on the job to fill in the address)"}
              . Attach the {r.fileCount > 0 ? '"PDF + files"' : "PDF"} from this row.
            </p>
            <p className="font-semibold">{email.subject}</p>
            <pre className="mt-1 whitespace-pre-wrap font-sans">{email.body}</pre>
            <a className="btn-secondary mt-2 inline-block" href={mailtoHref(email)}>
              Open in your mail program
            </a>
          </td>
        </tr>
      )}
    </>
  );
}

function RfiEditor(props: {
  r: RfiDto;
  url: string;
  changeOrders: Pick<ChangeOrderDto, "id" | "number" | "description">[];
  today: string;
  onSaved: () => void;
  onStartChangeOrder?: (r: RfiDto) => void;
  onDelete: () => void;
}) {
  const { r } = props;
  const [v, setV] = useState({
    subject: r.subject,
    question: r.question,
    reference: r.reference ?? "",
    suggestion: r.suggestion ?? "",
    sentOn: r.sentOn ?? "",
    responseDueOn: r.responseDueOn ?? "",
    answeredOn: r.answeredOn ?? "",
    answer: r.answer ?? "",
    answeredBy: r.answeredBy ?? "",
    costImpact: r.costImpact,
    timeImpact: r.timeImpact,
    changeOrderId: r.changeOrderId ?? "",
  });
  const save = useMutation({
    mutationFn: () =>
      api<RfiDto>(`${props.url}/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        body: {
          ...v,
          reference: v.reference || null,
          suggestion: v.suggestion || null,
          sentOn: v.sentOn || null,
          responseDueOn: v.responseDueOn || null,
          answeredOn: v.answeredOn || null,
          answer: v.answer || null,
          answeredBy: v.answeredBy || null,
          changeOrderId: v.changeOrderId || null,
        },
      }),
    onSuccess: props.onSaved,
  });
  return (
    <form
      className="grid max-w-3xl gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <input
        className="input"
        value={v.subject}
        onChange={(e) => setV({ ...v, subject: e.target.value })}
        aria-label="Subject"
        required
      />
      <textarea
        className="input min-h-16"
        value={v.question}
        onChange={(e) => setV({ ...v, question: e.target.value })}
        aria-label="Question"
        required
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className="input"
          placeholder="Reference"
          value={v.reference}
          onChange={(e) => setV({ ...v, reference: e.target.value })}
          aria-label="Reference"
        />
        <input
          className="input"
          placeholder="Proposed solution"
          value={v.suggestion}
          onChange={(e) => setV({ ...v, suggestion: e.target.value })}
          aria-label="Proposed solution"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1">
          <span className="text-slate-600">Date sent</span>
          <input
            className="input"
            type="date"
            max={props.today}
            value={v.sentOn}
            onChange={(e) => setV({ ...v, sentOn: e.target.value })}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-slate-600">Response requested by</span>
          <input
            className="input"
            type="date"
            value={v.responseDueOn}
            onChange={(e) => setV({ ...v, responseDueOn: e.target.value })}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-slate-600">Date answered</span>
          <input
            className="input"
            type="date"
            max={props.today}
            value={v.answeredOn}
            onChange={(e) => setV({ ...v, answeredOn: e.target.value })}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-slate-600">Answered by</span>
          <input
            className="input"
            placeholder="Name, company"
            value={v.answeredBy}
            onChange={(e) => setV({ ...v, answeredBy: e.target.value })}
          />
        </label>
      </div>
      <textarea
        className="input min-h-16"
        placeholder="The answer, as given"
        value={v.answer}
        onChange={(e) => setV({ ...v, answer: e.target.value })}
        aria-label="Answer"
      />
      <div className="flex flex-wrap items-end gap-3">
        <ImpactSelect
          label="Cost impact"
          value={v.costImpact}
          onChange={(costImpact) => setV({ ...v, costImpact })}
        />
        <ImpactSelect
          label="Time impact"
          value={v.timeImpact}
          onChange={(timeImpact) => setV({ ...v, timeImpact })}
        />
        <label className="grid gap-1">
          <span className="text-slate-600">Priced by change order</span>
          <select
            className="input"
            value={v.changeOrderId}
            onChange={(e) => setV({ ...v, changeOrderId: e.target.value })}
          >
            <option value="">None</option>
            {props.changeOrders.map((c) => (
              <option key={c.id} value={c.id}>
                CO {c.number}: {c.description.slice(0, 40)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {r.needsChangeOrder && (
        <p className="text-amber-800">
          The answer is marked as changing the price or the time, and no change order is linked.
          {props.onStartChangeOrder
            ? " Start one from this RFI, or enter it under Change orders above and pick it here."
            : " Enter the change order under Change orders above, then pick it here."}
        </p>
      )}
      {props.onStartChangeOrder && canStartChangeOrder(r) && (
        <div>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => props.onStartChangeOrder?.(r)}
          >
            Start a change order from {rfiLabel(r.number)}
          </button>
          <p className="mt-1 text-xs text-slate-500">
            Fills in the change order form above with this RFI&apos;s subject. You pick the line and
            enter the amount; saving it links the change order to this RFI.
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <button className="btn" type="submit" disabled={save.isPending}>
          Save
        </button>
        <button className="btn-secondary" type="button" onClick={props.onDelete}>
          Delete
        </button>
      </div>
      <ErrorText error={save.error} />
    </form>
  );
}

/**
 * On the projects page: RFIs past the response date entered for them, with no answer, across the
 * company's active jobs, each linking to its job's RFI log (where the follow-up email is drafted).
 */
export function OverdueRfisAlert({ orgId }: { orgId: string }) {
  const q = useQuery({
    queryKey: ["rfis-overdue", orgId],
    queryFn: () => api<{ items: OverdueRfi[] }>(orgPath(orgId, "/rfis/overdue")),
  });
  const items = q.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <section role="status" className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
      <h2 className="mb-1 font-semibold">
        {items.length === 1
          ? "1 RFI is past its response date with no answer"
          : `${items.length} RFIs are past their response date with no answer`}
      </h2>
      <ul className="list-disc pl-5">
        {items.map((r) => (
          <li key={r.id}>
            <Link
              to="/orgs/$orgId/projects/$projectId"
              params={{ orgId, projectId: r.projectId }}
              hash={RFI_LOG_ANCHOR}
              className="underline"
            >
              {overdueRfiText(r)}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-slate-600">
        Overdue means the response date you entered has passed. Each job&apos;s RFI log drafts the
        follow-up email to the GC; nothing is sent from PayApps.
      </p>
    </section>
  );
}
