// "Email GCs" on an insurance certificate: one draft a GC holding it (or holding the certificate it
// renews), from the certificate as typed (src/shared/insurance-renewal-email.ts). Nothing is sent from
// PayApps: the contractor edits each draft, attaches the certificate PDF, then copies it or opens it in
// their mail program. "Record as sent today" saves this certificate's holders with today's date for
// that GC's jobs (the same list "Sent to…" edits), so the pay application knows the GC has it.
import type { InsuranceCertificateDto, ProjectDto } from "@shared/api/types";
import { mailtoHref } from "@shared/follow-up-email";
import {
  holdersAfterSend,
  type RenewalEmail,
  renewalEmails,
} from "@shared/insurance-renewal-email";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, orgPath } from "../lib/api";
import { ErrorText } from "./error";

export function RenewalEmailsPanel({
  orgId,
  cert,
  all,
  from,
  today,
  canEdit,
  onSaved,
}: {
  orgId: string;
  cert: InsuranceCertificateDto;
  all: InsuranceCertificateDto[];
  from: { name: string; company: string };
  today: string;
  canEdit: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const projects = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => api<{ items: ProjectDto[] }>(orgPath(orgId, "/projects")),
  });
  const save = useMutation({
    mutationFn: (projectIds: string[]) =>
      api(orgPath(orgId, `/insurance/${encodeURIComponent(cert.id)}/holders`), {
        method: "PUT",
        body: { holders: holdersAfterSend(cert.holders, projectIds, today) },
      }),
    onSuccess: onSaved,
  });
  if (projects.isLoading) return <p className="text-sm">Loading jobs…</p>;
  const emails = renewalEmails(cert, all, projects.data?.items ?? [], from, today);
  if (emails.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No GC to email: record the jobs that hold this certificate ("Sent to…") first.
      </p>
    );
  }
  return (
    <div className="space-y-4" data-testid="renewal-emails">
      <p className="text-xs text-slate-500">
        {emails[0]?.kind === "renewal"
          ? "One draft for each GC that held the certificate this renews."
          : "One draft for each GC recorded as holding this certificate."}{" "}
        Edit before sending and attach the certificate PDF (Files on this row): the draft does not
        mention an attachment. It states only what was typed from the certificate.
      </p>
      <ErrorText error={projects.error ?? save.error} />
      {emails.map((e) => (
        <GcDraft
          key={e.gcName}
          email={e}
          canEdit={canEdit}
          pending={save.isPending}
          onMarkSent={() => save.mutate(e.projectIds)}
        />
      ))}
    </div>
  );
}

function GcDraft({
  email,
  canEdit,
  pending,
  onMarkSent,
}: {
  email: RenewalEmail;
  canEdit: boolean;
  pending: boolean;
  onMarkSent: () => void;
}) {
  const [to, setTo] = useState(email.to ?? "");
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [copied, setCopied] = useState(false);
  const [used, setUsed] = useState(false);
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
    <div className="space-y-2 rounded border border-slate-200 p-3" data-testid="renewal-email">
      <h3 className="text-sm font-semibold">{email.gcName}</h3>
      <label className="block text-xs">
        To
        <input
          className="input mt-1 w-full"
          type="email"
          placeholder="the GC's address for insurance certificates"
          value={to}
          onChange={(ev) => setTo(ev.target.value)}
        />
      </label>
      {!email.to && (
        <p className="text-xs text-slate-500">
          {email.addresses.length > 1
            ? `This GC's jobs name different project managers: ${email.addresses.join(", ")}.`
            : "Add the GC project manager on the job page and the draft is addressed to them."}
        </p>
      )}
      <label className="block text-xs">
        Subject
        <input
          className="input mt-1 w-full"
          value={subject}
          onChange={(ev) => setSubject(ev.target.value)}
        />
      </label>
      <label className="block text-xs">
        Message
        <textarea
          className="input mt-1 w-full font-mono text-xs"
          rows={14}
          value={body}
          onChange={(ev) => setBody(ev.target.value)}
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
      {used && canEdit && (
        <p className="text-xs text-slate-600">
          Once you have sent it, record it so {email.gcName}'s pay applications show the certificate
          as on file:{" "}
          <button type="button" className="underline" disabled={pending} onClick={onMarkSent}>
            Record as sent today
          </button>
        </p>
      )}
    </div>
  );
}
