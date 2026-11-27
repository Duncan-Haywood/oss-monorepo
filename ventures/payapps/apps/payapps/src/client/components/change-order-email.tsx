// "Email" on a pending change order's row: a draft to the GC's project manager, from the change
// order as entered (src/shared/change-order-email.ts). Nothing is sent from PayApps: the contractor
// edits the draft, attaches the PDF from the same row, then copies it or opens it in their mail program.
// Copying or opening it calls `onUsed` (the page records "last emailed" on the row and in its
// history); after a request on a change order with no date sent, it offers to record it as sent today.

import type { ChangeOrderDto, ProjectDetailDto } from "@shared/api/types";
import { changeOrderEmail } from "@shared/change-order-email";
import { mailtoHref } from "@shared/follow-up-email";
import { useState } from "react";

export function ChangeOrderEmailDraft({
  project,
  changeOrder,
  from,
  today,
  onUsed,
  onMarkSent,
}: {
  project: ProjectDetailDto;
  changeOrder: ChangeOrderDto;
  from: { name: string; company: string };
  today: string;
  /** The draft was copied or opened in the mail program (best effort; may fail for a viewer). */
  onUsed?: (kind: "request" | "follow-up") => void;
  /** Record the change order as sent to the GC today. */
  onMarkSent?: () => void;
}) {
  const initial = changeOrderEmail(project, changeOrder, project.changeOrders, from, today);
  const [to, setTo] = useState(initial?.to ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [copied, setCopied] = useState(false);
  const [used, setUsed] = useState(false);
  if (!initial) return null;
  const markUsed = () => {
    setUsed(true);
    onUsed?.(initial.kind);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${to.trim() ? `To: ${to.trim()}\n` : ""}Subject: ${subject}\n\n${body}`,
      );
      setCopied(true);
      markUsed();
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-2" data-testid="change-order-email">
      <p className="text-xs text-slate-500">
        {initial.kind === "request"
          ? "Request: asks the GC's project manager to review and sign."
          : "Follow-up: asks where the request stands and what is needed."}{" "}
        Edit before sending, and attach the PDF (or PDF + backup) from this row: the draft does not
        mention an attachment.
      </p>
      <label className="block text-xs">
        To
        <input
          className="input mt-1 w-full"
          type="email"
          placeholder="the GC project manager's address"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
      {!initial.to && (
        <p className="text-xs text-slate-500">
          Add the GC project manager at the top of this page and every change order draft on this
          job is addressed to them.
        </p>
      )}
      <label className="block text-xs">
        Subject
        <input
          className="input mt-1 w-full"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>
      <label className="block text-xs">
        Message
        <textarea
          className="input mt-1 w-full font-mono text-xs"
          rows={14}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="btn" onClick={copy}>
          Copy
        </button>
        <a className="underline" href={mailtoHref({ to, subject, body })} onClick={markUsed}>
          Open in my email
        </a>
        {copied && <span className="text-xs text-green-700">Copied</span>}
      </div>
      {used && initial.kind === "request" && !changeOrder.submittedOn && onMarkSent && (
        <p className="text-xs text-slate-600" data-testid="change-order-email-mark-sent">
          Once you have sent it, record the date so the next draft is a follow-up and the cash
          report ages it from today:{" "}
          <button type="button" className="underline" onClick={onMarkSent}>
            Record as sent today
          </button>
        </p>
      )}
    </div>
  );
}
