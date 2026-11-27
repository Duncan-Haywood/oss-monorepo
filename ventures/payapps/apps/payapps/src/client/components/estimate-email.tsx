// "Email the GC" on an open estimate: the proposal on bid day, or a follow-up once it is sent, drafted
// from the saved estimate (src/shared/estimate-email.ts). Nothing is sent from PayApps: the contractor
// edits the draft, attaches the proposal PDF, then copies it or opens it in their mail program. After
// the proposal draft is used on a draft estimate, it offers to mark the estimate sent today, so the
// next draft is a follow-up and the PDF keeps the date it went out.

import type { EstimateDetailDto } from "@shared/api/types";
import { estimateEmail } from "@shared/estimate-email";
import { mailtoHref } from "@shared/follow-up-email";
import { useState } from "react";

export function EstimateEmailDraft({
  estimate,
  from,
  today,
  onMarkSent,
}: {
  estimate: EstimateDetailDto;
  from: { name: string; company: string };
  today: string;
  /** Mark the estimate sent today. */
  onMarkSent?: () => void;
}) {
  const initial = estimateEmail(estimate, from, today);
  const [to, setTo] = useState(initial?.to ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [copied, setCopied] = useState(false);
  const [used, setUsed] = useState(false);
  if (!initial) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${to.trim() ? `To: ${to.trim()}\n` : ""}Subject: ${subject}\n\n${body}`,
      );
      setCopied(true);
      setUsed(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-2" data-testid="estimate-email">
      <p className="text-xs text-slate-500">
        {initial.kind === "proposal"
          ? "Proposal: submits the bid with its base price and alternates."
          : "Follow-up: asks where the bid stands and whether anything is needed from you."}{" "}
        Edit before sending, and attach the Proposal PDF from the top of this page: the draft does
        not mention an attachment. It uses the saved lines and details.
      </p>
      <label className="block text-xs">
        To
        <input
          className="input mt-1 w-full"
          type="email"
          placeholder="the GC estimator's address"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
      {!initial.to && (
        <p className="text-xs text-slate-500">
          Add the GC estimator's email in the bid details below and the draft is addressed to them.
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
        <a
          className="underline"
          href={mailtoHref({ to, subject, body })}
          onClick={() => setUsed(true)}
        >
          Open in my email
        </a>
        {copied && <span className="text-xs text-green-700">Copied</span>}
      </div>
      {used && initial.kind === "proposal" && onMarkSent && (
        <p className="text-xs text-slate-600" data-testid="estimate-email-mark-sent">
          Once you have sent it, mark the estimate sent so the next draft is a follow-up and the
          proposal keeps today's date:{" "}
          <button type="button" className="underline" onClick={onMarkSent}>
            Mark sent today
          </button>
        </p>
      )}
    </div>
  );
}
