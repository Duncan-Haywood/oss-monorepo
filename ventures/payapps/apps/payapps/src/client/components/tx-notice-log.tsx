// Texas notices of claim sent (Tex. Prop. Code §§ 53.056, 53.057), under the notice panel when the
// job's state is TX: whether the job is a residential construction project, saved with the job (it
// turns on the reminder), the months the job's pay apps leave unpaid with each month's notice date
// and who still needs one, and each notice recorded per recipient with how it went (§ 53.003(b)).
// The cash page and the weekly email remind before each month's date. Recording and deleting land
// in the job history. Crew plan and up, like the notice itself.
import type { TxNoticeLogDto } from "@shared/api/types";
import { formatCents } from "@shared/money";
import { txMonthName } from "@shared/tx-notices";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

const today = () => new Date().toISOString().slice(0, 10);

export function TxNoticeLog(props: { base: string; log: TxNoticeLogDto }) {
  const { base, log } = props;
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["notices"] });
  const label = (id: string, list: { id: string; label: string }[]) =>
    list.find((x) => x.id === id)?.label ?? id;

  const saveKind = useMutation({
    mutationFn: (projectKind: string | null) =>
      api(`${base}/notices/tx/project-kind`, { method: "PUT", body: { projectKind } }),
    onSuccess: refresh,
  });

  const firstMissing = log.unpaidMonths.find((m) => m.missing.length > 0);
  const [form, setForm] = useState({
    kind: "labor-materials",
    workMonth: firstMissing?.workMonth ?? "",
    recipient: "owner",
    recipientNameAddress: log.recipientPrefill.owner ?? "",
    method: "certified-mail",
    sentOn: today(),
    tracking: "",
    amount: "",
  });
  const pickRecipient = (recipient: string) =>
    setForm((f) => ({
      ...f,
      recipient,
      recipientNameAddress:
        log.recipientPrefill[recipient as keyof TxNoticeLogDto["recipientPrefill"]] ?? "",
    }));
  const record = useMutation({
    mutationFn: () => {
      const dollars = form.amount.replace(/[$,\s]/g, "");
      const amountCents = dollars ? Math.round(Number(dollars) * 100) : null;
      return api(`${base}/notices/tx/sends`, {
        method: "POST",
        body: {
          kind: form.kind,
          workMonth: form.kind === "retainage" ? null : form.workMonth || null,
          recipient: form.recipient,
          recipientNameAddress: form.recipientNameAddress,
          method: form.method,
          sentOn: form.sentOn,
          tracking: form.tracking.trim() || null,
          amountCents: amountCents !== null && Number.isFinite(amountCents) ? amountCents : null,
        },
      });
    },
    onSuccess: () => {
      setForm((f) => ({ ...f, tracking: "" }));
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${base}/notices/tx/sends/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  return (
    <div className="grid gap-3 border-t pt-3">
      <p className="font-medium">Notices of claim sent (Texas)</p>
      <label>
        <span className="block text-slate-600">
          Track this job's notices (one per month of unpaid work, § 53.056)
        </span>
        <select
          className="input w-auto"
          value={log.projectKind ?? ""}
          disabled={saveKind.isPending}
          onChange={(e) => saveKind.mutate(e.target.value || null)}
        >
          <option value="">Not tracked</option>
          <option value="commercial">Yes: not a residential project (third month)</option>
          <option value="residential">
            Yes: residential construction project, § 53.001(10) (second month)
          </option>
        </select>
      </label>
      {saveKind.error && <ErrorText error={saveKind.error} />}

      {log.projectKind === null ? (
        <p className="text-slate-600">
          Choose one to list the months your pay apps leave unpaid, each with its notice date, and
          to get a reminder on the cash page and in the weekly email before each one.
        </p>
      ) : log.unpaidMonths.length === 0 ? (
        <p className="text-slate-600">
          No sent pay app on this job has a balance, so no month needs a notice of claim now.
        </p>
      ) : (
        <ul className="grid gap-1">
          {log.unpaidMonths.map((m) => (
            <li key={m.workMonth}>
              <strong>{txMonthName(m.workMonth)}</strong> (pay app {m.payAppNumbers.join(", ")},{" "}
              {formatCents(m.unpaidCents)} unpaid): notice by <strong>{m.dueOn}</strong>
              {m.holidays.length > 0 ? ` (moved past ${m.holidays.join(" and ")})` : ""}.{" "}
              {m.missing.length === 0
                ? "Recorded for both."
                : `Not recorded for ${m.missing.map((r) => label(r, log.recipients).toLowerCase()).join(" or ")}.`}
            </li>
          ))}
        </ul>
      )}

      {log.sends.length > 0 && (
        <ul className="grid gap-2">
          {log.sends.map((s) => (
            <li key={s.id} className="rounded border p-2">
              <p className="font-medium">
                {s.kind === "retainage"
                  ? "Unpaid retainage"
                  : s.workMonth
                    ? `${txMonthName(s.workMonth)} work`
                    : "Unpaid labor or materials"}
                , to {label(s.recipient, log.recipients).toLowerCase()}
                {s.amountCents !== null ? `, ${formatCents(s.amountCents)}` : ""}
              </p>
              <p className="whitespace-pre-line">{s.recipientNameAddress}</p>
              <p className={s.onTime === false ? "text-red-700" : "text-slate-600"}>
                {label(s.method, log.methods)}
                {s.tracking ? `, ${s.tracking}` : ""}. {s.timing}
              </p>
              <button
                type="button"
                className="link text-red-700"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm("Delete this record of a notice sent?")) remove.mutate(s.id);
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {remove.error && <ErrorText error={remove.error} />}

      <details>
        <summary className="cursor-pointer">Record a notice sent</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label>
            <span className="block text-slate-600">Notice</span>
            <select
              className="input"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            >
              <option value="labor-materials">Unpaid labor or materials (§ 53.056)</option>
              <option value="retainage">Unpaid retainage (§ 53.057)</option>
            </select>
          </label>
          {form.kind !== "retainage" && (
            <label>
              <span className="block text-slate-600">Month of the unpaid work</span>
              <input
                className="input"
                type="month"
                value={form.workMonth}
                onChange={(e) => setForm((f) => ({ ...f, workMonth: e.target.value }))}
              />
            </label>
          )}
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
            <span className="block text-slate-600">How (§ 53.003(b))</span>
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
              {form.method === "in-person" ? "Day delivered" : "Day mailed or sent"}
            </span>
            <input
              className="input"
              type="date"
              value={form.sentOn}
              onChange={(e) => setForm((f) => ({ ...f, sentOn: e.target.value }))}
            />
          </label>
          <label>
            <span className="block text-slate-600">Claim amount on the notice (optional)</span>
            <input
              className="input"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </label>
          {form.method !== "in-person" && (
            <label className="sm:col-span-2">
              <span className="block text-slate-600">
                Certified mail number or tracking number (optional)
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
        Each month's work needs its own notice to both the owner and the original contractor. Unpaid
        months are read from the pay apps' periods: a period that spans two months lists both, and
        the balance is not split between them. Keep the certified mail receipt or the carrier's
        proof of receipt. Not legal advice.
      </p>
    </div>
  );
}
