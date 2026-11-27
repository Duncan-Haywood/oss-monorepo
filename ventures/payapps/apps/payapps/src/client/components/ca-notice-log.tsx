// California preliminary notices given (Cal. Civ. Code §§ 8106-8118, 8204), under the notice panel
// when the job's state is CA: the day the company first furnished work (PayApps counts § 8204(a)'s
// 20 calendar days and the cash page reminds until the owner and direct contractor have a notice
// recorded), each notice recorded as given, and the § 8118 proof of notice declaration for each.
// Each record keeps its own files (the mailing receipt or proof of delivery § 8118(b) says goes with
// the proof, the signed proof), and recording, deleting and files land in the job history.
// Crew plan and up, like the notice itself; viewers see the log and print proofs.
import type { CaNoticeLogDto, CaNoticeSendDto } from "@shared/api/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AttachmentsPanel } from "./attachments";
import { ErrorText } from "./error";

const today = () => new Date().toISOString().slice(0, 10);

function timingText(s: CaNoticeSendDto): string {
  const complete = s.completeOn !== s.givenOn ? ` Complete ${s.completeOn} (§ 8116(c)).` : "";
  if (s.onTime === true) return `On time.${complete}`;
  if (s.onTime === false)
    return `After the 20 days: covers work from ${s.coversWorkFrom} on (§ 8204(a)).${complete}`;
  return complete.trim();
}

export function CaNoticeLog(props: { base: string; log: CaNoticeLogDto }) {
  const { base, log } = props;
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["notices"] });
  const label = (id: string, list: { id: string; label: string }[]) =>
    list.find((x) => x.id === id)?.label ?? id;

  const [first, setFirst] = useState(log.firstFurnishedOn ?? "");
  useEffect(() => setFirst(log.firstFurnishedOn ?? ""), [log.firstFurnishedOn]);
  const saveFirst = useMutation({
    mutationFn: (firstFurnishedOn: string | null) =>
      api(`${base}/notices/ca/first-furnished`, { method: "PUT", body: { firstFurnishedOn } }),
    onSuccess: refresh,
  });

  const firstMissing = log.missing[0] ?? "owner";
  const [form, setForm] = useState({
    recipient: firstMissing as string,
    recipientNameAddress: log.recipientPrefill[firstMissing] ?? "",
    method: "certified-mail",
    givenOn: today(),
    place: "",
    tracking: "",
  });
  const pickRecipient = (recipient: string) =>
    setForm((f) => ({
      ...f,
      recipient,
      recipientNameAddress:
        log.recipientPrefill[recipient as keyof CaNoticeLogDto["recipientPrefill"]] ?? "",
    }));
  const record = useMutation({
    mutationFn: () =>
      api(`${base}/notices/ca/sends`, {
        method: "POST",
        body: { ...form, tracking: form.tracking.trim() || null },
      }),
    onSuccess: () => {
      setForm((f) => ({ ...f, tracking: "" }));
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${base}/notices/ca/sends/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const [declarant, setDeclarant] = useState("");
  // The one record whose files are open (the panel loads its list when shown).
  const [filesFor, setFilesFor] = useState<string | null>(null);
  const proofHref = (id: string) =>
    `${base}/notices/ca/sends/${id}/proof.pdf${declarant.trim() ? `?declarant=${encodeURIComponent(declarant.trim())}` : ""}`;
  const mailed = form.method !== "personal";

  return (
    <div className="grid gap-3 border-t pt-3">
      <p className="font-medium">Notices given (California)</p>
      <div className="flex flex-wrap items-end gap-2">
        <label>
          <span className="block text-slate-600">Day you first furnished work on this job</span>
          <input
            className="input"
            type="date"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={saveFirst.isPending || first === (log.firstFurnishedOn ?? "")}
          onClick={() => saveFirst.mutate(first || null)}
        >
          {first ? "Save date" : "Clear date"}
        </button>
      </div>
      {saveFirst.error && <ErrorText error={saveFirst.error} />}
      {log.dueOn ? (
        <p>
          Give the notice by <strong>{log.dueOn}</strong>, 20 calendar days after that day (§
          8204(a)). PayApps does not move the date for a weekend or holiday.
          {log.missing.length > 0
            ? ` The cash page and the weekly email remind you until a notice to the ${log.missing
                .map((m) => label(m, log.recipients).toLowerCase())
                .join(" and the ")} is recorded here.`
            : " The owner and the direct contractor each have a notice recorded."}
        </p>
      ) : (
        <p className="text-slate-600">
          Enter the day to see the 20-day deadline and get a reminder on the cash page and in the
          weekly email.
        </p>
      )}

      {log.sends.length > 0 && (
        <>
          <ul className="grid gap-2">
            {log.sends.map((s) => (
              <li key={s.id} className="rounded border p-2">
                <p className="font-medium">{label(s.recipient, log.recipients)}</p>
                <p className="whitespace-pre-line">{s.recipientNameAddress}</p>
                <p className="text-slate-600">
                  {label(s.method, log.methods)}, {s.givenOn}, {s.place}
                  {s.tracking ? `, ${s.tracking}` : ""}. {timingText(s)}
                </p>
                <div className="mt-1 flex gap-3">
                  <a className="link" href={proofHref(s.id)}>
                    Proof of notice (PDF, § 8118)
                  </a>
                  <button
                    type="button"
                    className="link"
                    aria-expanded={filesFor === s.id}
                    onClick={() => {
                      setFilesFor(filesFor === s.id ? null : s.id);
                      if (filesFor === s.id) refresh();
                    }}
                  >
                    {s.fileCount > 0 ? `Receipts and files (${s.fileCount})` : "Attach receipt"}
                  </button>
                  <button
                    type="button"
                    className="link text-red-700"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          s.fileCount > 0
                            ? `Delete this record of a notice given and its ${s.fileCount} file${s.fileCount === 1 ? "" : "s"}?`
                            : "Delete this record of a notice given?",
                        )
                      )
                        remove.mutate(s.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
                {filesFor === s.id && (
                  <div className="mt-2 rounded bg-slate-50 p-2">
                    <AttachmentsPanel
                      base={`${base}/notices/ca/sends/${encodeURIComponent(s.id)}`}
                      holder="caNotice"
                      embedded
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <label>
            <span className="text-slate-600">
              Declarant on the proof (who gave the notice: name and title)
            </span>
            <input
              className="input"
              value={declarant}
              maxLength={200}
              placeholder="Defaults to the company name"
              onChange={(e) => setDeclarant(e.target.value)}
            />
          </label>
          <p className="text-xs text-slate-600">
            The proof lists § 8118(a)'s three items and, for a mailed notice, the receipt or
            tracking record § 8118(b) says goes with it. Sign it under penalty of perjury as Code
            Civ. Proc. § 2015.5 provides; PayApps does not print that sentence, whose official text
            it has not checked.
          </p>
        </>
      )}
      {remove.error && <ErrorText error={remove.error} />}

      <details>
        <summary className="cursor-pointer">Record a notice given</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label>
            <span className="block text-slate-600">To</span>
            <select
              className="input"
              value={form.recipient}
              onChange={(e) => pickRecipient(e.target.value)}
            >
              {log.recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="block text-slate-600">How (§§ 8106, 8110)</span>
            <select
              className="input"
              value={form.method}
              onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
            >
              {log.methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="block text-slate-600">Name and address it went to</span>
            <textarea
              className="input"
              rows={3}
              value={form.recipientNameAddress}
              onChange={(e) => setForm((f) => ({ ...f, recipientNameAddress: e.target.value }))}
            />
          </label>
          <label>
            <span className="block text-slate-600">
              {form.method === "personal" ? "Day delivered" : "Day mailed or deposited"}
            </span>
            <input
              className="input"
              type="date"
              value={form.givenOn}
              onChange={(e) => setForm((f) => ({ ...f, givenOn: e.target.value }))}
            />
          </label>
          <label>
            <span className="block text-slate-600">
              {form.method === "personal"
                ? "Where delivered"
                : "Where mailed (city or post office)"}
            </span>
            <input
              className="input"
              value={form.place}
              onChange={(e) => setForm((f) => ({ ...f, place: e.target.value }))}
            />
          </label>
          {mailed && (
            <label className="sm:col-span-2">
              <span className="block text-slate-600">Tracking or receipt number (optional)</span>
              <input
                className="input"
                value={form.tracking}
                maxLength={100}
                onChange={(e) => setForm((f) => ({ ...f, tracking: e.target.value }))}
              />
            </label>
          )}
        </div>
        <button
          type="button"
          className="btn mt-2"
          disabled={record.isPending}
          onClick={() => record.mutate()}
        >
          Record notice
        </button>
        {record.error && <ErrorText error={record.error} />}
      </details>
    </div>
  );
}
