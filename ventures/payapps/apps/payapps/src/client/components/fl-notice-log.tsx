// Florida Notices to Owner served (Fla. Stat. §§ 713.06(2), 713.18), under the notice panel when the
// job's state is FL: the day the company first furnished work, saved with the job (the 45-day
// serve-by and 40-day mail-by dates follow, and the cash page and weekly email remind until a notice
// to the owner is recorded), and each notice or copy recorded per person with how and when it went.
// A notice mailed after the 40 days, or sent by carrier, counts when delivered, so its delivery date
// can be entered later from the evidence of delivery. Recording and deleting land in the job history.
// Crew plan and up, like the notice itself.
import type { FlNoticeLogDto } from "@shared/api/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

const today = () => new Date().toISOString().slice(0, 10);
const MAIL_ON_MAILING = new Set(["certified-mail", "registered-mail", "global-express-guaranteed"]);

export function FlNoticeLog(props: { base: string; log: FlNoticeLogDto }) {
  const { base, log } = props;
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["notices"] });
  const label = (id: string, list: { id: string; label: string }[]) =>
    list.find((x) => x.id === id)?.label ?? id;

  const [first, setFirst] = useState(log.firstFurnishedOn ?? "");
  useEffect(() => setFirst(log.firstFurnishedOn ?? ""), [log.firstFurnishedOn]);
  const saveFirst = useMutation({
    mutationFn: (firstFurnishedOn: string | null) =>
      api(`${base}/notices/fl/first-furnished`, { method: "PUT", body: { firstFurnishedOn } }),
    onSuccess: refresh,
  });

  const [form, setForm] = useState({
    recipient: "owner",
    recipientNameAddress: log.recipientPrefill.owner ?? "",
    method: "certified-mail",
    sentOn: today(),
    deliveredOn: "",
    tracking: "",
  });
  const pickRecipient = (recipient: string) =>
    setForm((f) => ({
      ...f,
      recipient,
      recipientNameAddress:
        log.recipientPrefill[recipient as keyof FlNoticeLogDto["recipientPrefill"]] ?? "",
    }));
  const record = useMutation({
    mutationFn: () =>
      api(`${base}/notices/fl/sends`, {
        method: "POST",
        body: {
          ...form,
          deliveredOn: form.deliveredOn || null,
          tracking: form.tracking.trim() || null,
        },
      }),
    onSuccess: () => {
      setForm((f) => ({ ...f, tracking: "", deliveredOn: "" }));
      return refresh();
    },
  });
  const delivered = useMutation({
    mutationFn: (v: { id: string; deliveredOn: string | null }) =>
      api(`${base}/notices/fl/sends/${v.id}`, {
        method: "PATCH",
        body: { deliveredOn: v.deliveredOn },
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${base}/notices/fl/sends/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const [deliveredDraft, setDeliveredDraft] = useState<Record<string, string>>({});
  const handOrPost = form.method === "hand-delivery" || form.method === "posting";

  return (
    <div className="grid gap-3 border-t pt-3">
      <p className="font-medium">Notices served (Florida)</p>
      <div className="flex flex-wrap items-end gap-2">
        <label>
          <span className="block text-slate-600">First day you furnished work on this job</span>
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
      {log.serveBy && log.mailBy ? (
        <p>
          Serve the notice by <strong>{log.serveBy}</strong> (45 days, § 713.06(2)(a)). Mailed by
          registered, Global Express Guaranteed or certified mail by <strong>{log.mailBy}</strong>{" "}
          (40 days), it counts as served the day it is mailed, if you keep the mail log or USPS
          tracking records (§ 713.18(2)). Calendar days, not moved for a weekend or holiday.
          {log.missing.length > 0
            ? " The cash page and the weekly email remind you until a notice to the owner is recorded here."
            : " A notice to the owner is recorded."}
        </p>
      ) : (
        <p className="text-slate-600">
          Enter the day to save the 45-day and 40-day dates with the job and get a reminder on the
          cash page and in the weekly email.
        </p>
      )}

      {log.sends.length > 0 && (
        <ul className="grid gap-2">
          {log.sends.map((s) => {
            const needsDelivery = !(
              s.method === "hand-delivery" ||
              s.method === "posting" ||
              (MAIL_ON_MAILING.has(s.method) && log.mailBy && s.sentOn <= log.mailBy)
            );
            const draft = deliveredDraft[s.id] ?? s.deliveredOn ?? "";
            return (
              <li key={s.id} className="rounded border p-2">
                <p className="font-medium">{label(s.recipient, log.recipients)}</p>
                <p className="whitespace-pre-line">{s.recipientNameAddress}</p>
                <p className="text-slate-600">
                  {label(s.method, log.methods)}, {s.sentOn}
                  {s.deliveredOn ? `, delivered ${s.deliveredOn}` : ""}
                  {s.tracking ? `, ${s.tracking}` : ""}.{s.timing ? ` ${s.timing}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap items-end gap-3">
                  {needsDelivery && (
                    <label>
                      <span className="block text-slate-600">Delivered on</span>
                      <input
                        className="input w-44"
                        type="date"
                        value={draft}
                        onChange={(e) =>
                          setDeliveredDraft((d) => ({ ...d, [s.id]: e.target.value }))
                        }
                      />
                    </label>
                  )}
                  {needsDelivery && draft !== (s.deliveredOn ?? "") && (
                    <button
                      type="button"
                      className="link"
                      disabled={delivered.isPending}
                      onClick={() => delivered.mutate({ id: s.id, deliveredOn: draft || null })}
                    >
                      Save delivery date
                    </button>
                  )}
                  <button
                    type="button"
                    className="link text-red-700"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm("Delete this record of a notice served?"))
                        remove.mutate(s.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {delivered.error && <ErrorText error={delivered.error} />}
      {remove.error && <ErrorText error={remove.error} />}

      <details>
        <summary className="cursor-pointer">Record a notice served</summary>
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
            <span className="block text-slate-600">How (§ 713.18(1))</span>
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
            <span className="block text-slate-600">
              Name and address it went to (as the notice of commencement shows it, § 713.18(2)(a),
              (3)(a))
            </span>
            <textarea
              className="input"
              rows={3}
              value={form.recipientNameAddress}
              onChange={(e) => setForm((f) => ({ ...f, recipientNameAddress: e.target.value }))}
            />
          </label>
          <label>
            <span className="block text-slate-600">
              {form.method === "hand-delivery"
                ? "Day delivered"
                : form.method === "posting"
                  ? "Day posted"
                  : "Day mailed or sent"}
            </span>
            <input
              className="input"
              type="date"
              value={form.sentOn}
              onChange={(e) => setForm((f) => ({ ...f, sentOn: e.target.value }))}
            />
          </label>
          {!handOrPost && (
            <label>
              <span className="block text-slate-600">Day delivered (optional, from the proof)</span>
              <input
                className="input"
                type="date"
                value={form.deliveredOn}
                onChange={(e) => setForm((f) => ({ ...f, deliveredOn: e.target.value }))}
              />
            </label>
          )}
          {!handOrPost && (
            <label className="sm:col-span-2">
              <span className="block text-slate-600">
                Registered or certified mail number, or tracking number (optional)
              </span>
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
      <p className="text-xs text-slate-600">
        Keep the mail log (the USPS mail number, the name and address, and the USPS date stamp) or
        the USPS tracking records: service on mailing depends on them (§ 713.18(2)(c)). A notice
        returned refused, unclaimed or not forwardable (§ 713.18(3)) is not worked out here.
      </p>
    </div>
  );
}
