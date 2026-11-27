// Georgia's affidavit of nonpayment for one sent Georgia waiver (O.C.G.A. § 44-14-366(g)(2)): the
// statute's form filled from the waiver (its date and amount, and the amount the payments recorded
// leave unpaid). The user checks the blanks and prints it to swear before a notary and file in the
// property's county before the 90 days end. Printing saves nothing.
//
// Mississippi (2026-11-26): the same components serve a sent Mississippi waiver, with Mississippi's
// affidavit (Miss. Code Ann. § 85-7-433(3)), its 60 days and its 2-day copy to the owner. Its
// affidavit names no copy to a contractor, so that question is not shown there.
import type {
  GaAffidavitDto,
  ProjectDetailDto,
  WaiverDto,
  WaiverOverviewDto,
} from "@shared/api/types";
import {
  GA_CONTRACTOR_COPY_METHODS,
  GA_COPY_METHODS,
  type GaContractorCopyMethod,
  type GaCopyMethod,
} from "@shared/enums";
import { NONPAYMENT_RULES } from "@shared/ga-waiver-clock";
import { formatCents, parseDollarsToCents } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, downloadPost } from "../lib/api";
import { ErrorText } from "./error";

const toText = (type: string, v: string | number | undefined) =>
  v === undefined ? "" : type === "money" ? (Number(v) / 100).toFixed(2) : String(v);

export function GaAffidavitForm(props: { base: string; waiverId: string; enabled: boolean }) {
  const { base, waiverId, enabled } = props;
  const url = `${base}/waivers/${waiverId}/ga-affidavit`;
  const q = useQuery({ queryKey: ["ga-affidavit", url], queryFn: () => api<GaAffidavitDto>(url) });
  const o = q.data;
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!o) return;
    setValues(
      Object.fromEntries(o.form.fields.map((f) => [f.key, toText(f.type, o.prefill[f.key])])),
    );
  }, [o]);

  const print = useMutation({
    mutationFn: () => {
      if (!o) throw new Error("Still loading");
      const fields: Record<string, string | number> = {};
      for (const f of o.form.fields) {
        const v = values[f.key]?.trim();
        if (!v) continue;
        if (f.type === "money") {
          const c = parseDollarsToCents(v);
          if (c === null) throw new Error(`${f.label}: enter a dollar amount`);
          fields[f.key] = c;
        } else fields[f.key] = v;
      }
      const state = o.clock?.state ?? (o.form.id.startsWith("MS/") ? "MS" : "GA");
      return downloadPost(`${url}.pdf`, { fields }, `affidavit-of-nonpayment-${state}.pdf`);
    },
  });

  return (
    <div className="mt-2 grid gap-2 rounded border border-slate-200 p-3 text-sm">
      {q.error && <ErrorText error={q.error} />}
      {o && (
        <>
          <p className="font-medium">
            {o.form.title} · {o.form.citation}
          </p>
          {o.clock && (
            <p>
              The {NONPAYMENT_RULES[o.clock.state].days} days after this waiver end on{" "}
              <strong>{o.clock.endsOn}</strong>
              {o.clock.daysLeft >= 0
                ? ` (${o.clock.daysLeft} day${o.clock.daysLeft === 1 ? "" : "s"} left)`
                : " (passed)"}
              ; {formatCents(o.clock.unpaidCents)} is not recorded as received.
            </p>
          )}
          {o.form.notes.map((n) => (
            <p key={n} className="text-xs text-slate-600">
              {n}
            </p>
          ))}
          <div className="grid gap-2 sm:grid-cols-2">
            {o.form.fields.map((f) => (
              <label
                key={f.key}
                className={f.type === "multiline" ? "sm:col-span-2" : ""}
                htmlFor={`ga-aff-${f.key}`}
              >
                <span className="text-slate-600">
                  {f.label}
                  {f.required ? " *" : ""}
                  {f.type === "money" ? " ($)" : ""}
                </span>
                {f.type === "multiline" ? (
                  <textarea
                    id={`ga-aff-${f.key}`}
                    className="input"
                    rows={2}
                    value={values[f.key] ?? ""}
                    placeholder={f.help}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    id={`ga-aff-${f.key}`}
                    className="input"
                    type={f.type === "date" ? "date" : "text"}
                    value={values[f.key] ?? ""}
                    title={f.help}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                )}
              </label>
            ))}
          </div>
          {enabled ? (
            <div>
              <button
                type="button"
                className="btn"
                disabled={print.isPending}
                onClick={() => print.mutate()}
              >
                Print affidavit (PDF)
              </button>
            </div>
          ) : (
            <p>Printing the affidavit comes with lien waivers in the Crew plan and up.</p>
          )}
          {print.error && <ErrorText error={print.error} />}
          <p className="text-xs text-slate-500">
            Not legal advice. The wording is the statute's, word for word; whether to file, and
            where, is your call with counsel.
          </p>
        </>
      )}
    </div>
  );
}

const COPY_METHOD_LABEL: Record<GaCopyMethod, string> = {
  "registered-mail": "Registered mail",
  "certified-mail": "Certified mail",
  "statutory-overnight": "Statutory overnight delivery",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Record the affidavit as filed (day, county, the clerk's book/page or instrument number), then the
 * copy to the owner the affidavit requires within seven days (Mississippi: two). Recording it stops
 * the 90-day (60-day) reminder.
 */
type GaNoc = WaiverOverviewDto["gaNoc"];

export function GaAffidavitFiling(props: {
  base: string;
  waiver: WaiverDto;
  enabled: boolean;
  /** The job's Georgia notice of commencement, preselecting the contractor's copy. */
  gaNoc: GaNoc;
}) {
  const { base, waiver, enabled, gaNoc } = props;
  const f = waiver.gaAffidavitFiling;
  const url = `${base}/waivers/${waiver.id}/ga-affidavit/filing`;
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState({
    filedOn: f?.filedOn ?? todayIso(),
    county: f?.county ?? "",
    recording: f?.recording ?? "",
    copySentOn: f?.copySentOn ?? "",
    copyMethod: (f?.copyMethod ?? "") as GaCopyMethod | "",
    copyTracking: f?.copyTracking ?? "",
  });
  useEffect(() => {
    setV({
      filedOn: f?.filedOn ?? todayIso(),
      county: f?.county ?? "",
      recording: f?.recording ?? "",
      copySentOn: f?.copySentOn ?? "",
      copyMethod: f?.copyMethod ?? "",
      copyTracking: f?.copyTracking ?? "",
    });
  }, [f]);
  const done = () => {
    setEditing(false);
    return qc.invalidateQueries({ queryKey: ["waivers"] });
  };
  const save = useMutation({
    mutationFn: (copy: boolean) =>
      api<WaiverDto>(url, {
        method: "PUT",
        body: {
          filedOn: v.filedOn,
          county: v.county,
          recording: v.recording || null,
          ...(copy
            ? {
                copySentOn: v.copySentOn || null,
                copyMethod: v.copyMethod || null,
                copyTracking: v.copyTracking || null,
              }
            : {
                copySentOn: f?.copySentOn ?? null,
                copyMethod: f?.copyMethod ?? null,
                copyTracking: f?.copyTracking ?? null,
              }),
        },
      }),
    onSuccess: done,
  });
  const clear = useMutation({
    mutationFn: () => api<WaiverDto>(url, { method: "DELETE" }),
    onSuccess: done,
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const id = (k: string) => `ga-filing-${waiver.id}-${k}`;

  if (!enabled && !f) return null;
  if (!f || editing) {
    return (
      <div className="mt-2 grid gap-2 rounded border border-slate-200 p-3 text-sm">
        <p className="font-medium">Record the affidavit as filed</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <label htmlFor={id("filedOn")}>
            <span className="text-slate-600">Filed on *</span>
            <input
              id={id("filedOn")}
              className="input"
              type="date"
              max={todayIso()}
              value={v.filedOn}
              onChange={set("filedOn")}
            />
          </label>
          <label htmlFor={id("county")}>
            <span className="text-slate-600">County *</span>
            <input id={id("county")} className="input" value={v.county} onChange={set("county")} />
          </label>
          <label htmlFor={id("recording")}>
            <span className="text-slate-600">Book and page or instrument no.</span>
            <input
              id={id("recording")}
              className="input"
              value={v.recording}
              onChange={set("recording")}
            />
          </label>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="btn"
            disabled={save.isPending || !v.filedOn || !v.county.trim()}
            onClick={() => save.mutate(false)}
          >
            Save filing
          </button>
          {editing && (
            <button type="button" className="link" onClick={() => setEditing(false)}>
              Cancel
            </button>
          )}
        </div>
        {save.error && <ErrorText error={save.error} />}
      </div>
    );
  }
  return (
    <div className="mt-2 grid gap-2 rounded border border-slate-200 p-3 text-sm">
      <p>
        Affidavit filed <strong>{f.filedOn}</strong> in {f.county} County
        {f.recording ? ` (${f.recording})` : ""}.
        {f.copySentOn && f.copyMethod
          ? ` Copy to the owner sent ${f.copySentOn} by ${COPY_METHOD_LABEL[f.copyMethod].toLowerCase()}${f.copyTracking ? `, ${f.copyTracking}` : ""}.`
          : ""}
      </p>
      {enabled && !f.copySentOn && (
        <div className="grid gap-2 sm:grid-cols-3">
          <label htmlFor={id("copySentOn")}>
            <span className="text-slate-600">Copy to the owner sent on</span>
            <input
              id={id("copySentOn")}
              className="input"
              type="date"
              min={f.filedOn}
              max={todayIso()}
              value={v.copySentOn}
              onChange={set("copySentOn")}
            />
          </label>
          <label htmlFor={id("copyMethod")}>
            <span className="text-slate-600">How</span>
            <select
              id={id("copyMethod")}
              className="input"
              value={v.copyMethod}
              onChange={set("copyMethod")}
            >
              <option value="">Choose</option>
              {GA_COPY_METHODS.map((m) => (
                <option key={m} value={m}>
                  {COPY_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={id("copyTracking")}>
            <span className="text-slate-600">Tracking or receipt no.</span>
            <input
              id={id("copyTracking")}
              className="input"
              value={v.copyTracking}
              onChange={set("copyTracking")}
            />
          </label>
          <div className="sm:col-span-3">
            <button
              type="button"
              className="btn"
              disabled={save.isPending || !v.copySentOn || !v.copyMethod}
              onClick={() => save.mutate(true)}
            >
              Record the copy as sent
            </button>
          </div>
        </div>
      )}
      {waiver.state === "GA" && (
        <GaContractorCopy base={base} waiver={waiver} enabled={enabled} gaNoc={gaNoc} />
      )}
      {(waiver.gaClock?.stage === "paid-after-filing" || waiver.gaClock?.stage === "released") && (
        <GaPaidAffidavit base={base} waiver={waiver} enabled={enabled} />
      )}
      {enabled && (
        <div className="flex gap-3">
          <button type="button" className="link" onClick={() => setEditing(true)}>
            Change the filing
          </button>
          <button
            type="button"
            className="link"
            disabled={clear.isPending}
            onClick={() => clear.mutate()}
          >
            Clear the filing
          </button>
        </div>
      )}
      {(save.error || clear.error) && <ErrorText error={save.error ?? clear.error} />}
    </div>
  );
}

const CONTRACTOR_METHOD_LABEL: Record<GaContractorCopyMethod, string> = {
  ...COPY_METHOD_LABEL,
  other: "Another way",
};

/** The job's API path from a pay application's (`.../projects/:id/pay-apps/:id`). */
const jobPathOf = (payAppBase: string) => payAppBase.replace(/\/pay-apps\/[^/]+$/, "");

/**
 * The affidavit's copy to the contractor at the address on the notice of commencement, owed when the
 * filer has no contract with the owner and such a notice was filed. PayApps cannot know privity: the
 * user answers once, then records the copy apart from the owner's. The job's notice of commencement
 * (recorded on the job, here or once for every affidavit on it) preselects the answer and gives the
 * address the copy goes to.
 */
function GaContractorCopy(props: {
  base: string;
  waiver: WaiverDto;
  enabled: boolean;
  gaNoc: GaNoc;
}) {
  const { base, waiver, enabled, gaNoc } = props;
  const f = waiver.gaAffidavitFiling;
  const url = `${base}/waivers/${waiver.id}/ga-affidavit/contractor-copy`;
  const qc = useQueryClient();
  const [v, setV] = useState({
    sentOn: "",
    method: "" as GaContractorCopyMethod | "",
    tracking: "",
  });
  const [nocEdit, setNocEdit] = useState(false);
  const done = () => qc.invalidateQueries({ queryKey: ["waivers"] });
  const save = useMutation({
    mutationFn: (body: Record<string, string | null>) =>
      api<WaiverDto>(url, { method: "PUT", body }),
    onSuccess: done,
  });
  const clear = useMutation({
    mutationFn: () => api<WaiverDto>(url, { method: "DELETE" }),
    onSuccess: done,
  });
  const saveNoc = useMutation({
    mutationFn: (body: { gaNocFiled: boolean | null; gaNocContractor?: string | null }) =>
      api<ProjectDetailDto>(jobPathOf(base), { method: "PATCH", body }),
    onSuccess: async () => {
      setNocEdit(false);
      await done();
      await qc.invalidateQueries({ queryKey: ["project"] });
    },
  });
  if (!f) return null;
  const id = (k: string) => `ga-contractor-${waiver.id}-${k}`;
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const error = save.error ?? clear.error ?? saveNoc.error;
  const change = enabled && (
    <button
      type="button"
      className="link"
      disabled={clear.isPending}
      onClick={() => clear.mutate()}
    >
      Change
    </button>
  );
  const sendTo = gaNoc.contractor && (
    <span className="block text-xs text-slate-600">
      Address on the notice of commencement: {gaNoc.contractor}
    </span>
  );

  if (f.contractorCopy === "not-owed") {
    return (
      <p>
        No copy owed to the contractor (you have a contract with the owner, or no notice of
        commencement was filed). {change}
      </p>
    );
  }
  if (f.contractorCopy === "owed" && f.contractorCopySentOn && f.contractorCopyMethod) {
    return (
      <p>
        Copy to the contractor sent {f.contractorCopySentOn} by{" "}
        {CONTRACTOR_METHOD_LABEL[f.contractorCopyMethod].toLowerCase()}
        {f.contractorCopyTracking ? `, ${f.contractorCopyTracking}` : ""}. {change}
      </p>
    );
  }
  if (!enabled) return null;
  if (f.contractorCopy !== "owed") {
    // The job's answer picks the suggested button; the user still decides (privity is theirs to know).
    const suggest = gaNoc.filed === true ? "owed" : gaNoc.filed === false ? "not-owed" : null;
    const cls = (k: "owed" | "not-owed") =>
      suggest === null || suggest === k ? "btn" : "btn-secondary";
    return (
      <div className="grid gap-2">
        <p>
          Copy to the contractor: owed if you have no contract with the owner and a notice of
          commencement was filed for the job; it goes to the contractor at the address on that
          notice.
        </p>
        {gaNoc.filed === null || nocEdit ? (
          <GaNocQuestion
            idPrefix={id("noc")}
            gaNoc={gaNoc}
            pending={saveNoc.isPending}
            onSave={(filed, contractor) =>
              saveNoc.mutate({ gaNocFiled: filed, gaNocContractor: contractor })
            }
            onCancel={nocEdit ? () => setNocEdit(false) : undefined}
          />
        ) : (
          <p className="text-slate-600">
            {gaNoc.filed
              ? "This job's notice of commencement is recorded as filed. A sub billing the GC usually has no contract with the owner, so the copy is usually owed."
              : "This job is recorded as having no notice of commencement filed, so no copy is owed."}{" "}
            <button type="button" className="link" onClick={() => setNocEdit(true)}>
              Change the job's answer
            </button>
            {gaNoc.filed && sendTo}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={cls("owed")}
            disabled={save.isPending}
            onClick={() => save.mutate({ copy: "owed" })}
          >
            A copy is owed
          </button>
          <button
            type="button"
            className={cls("not-owed")}
            disabled={save.isPending}
            onClick={() => save.mutate({ copy: "not-owed" })}
          >
            Not owed
          </button>
        </div>
        {error && <ErrorText error={error} />}
      </div>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <p className="sm:col-span-3">
        A copy is owed to the contractor at the address on the notice of commencement. {change}
        {sendTo}
      </p>
      <label htmlFor={id("sentOn")}>
        <span className="text-slate-600">Copy to the contractor sent on</span>
        <input
          id={id("sentOn")}
          className="input"
          type="date"
          min={f.filedOn}
          max={todayIso()}
          value={v.sentOn}
          onChange={set("sentOn")}
        />
      </label>
      <label htmlFor={id("method")}>
        <span className="text-slate-600">How</span>
        <select id={id("method")} className="input" value={v.method} onChange={set("method")}>
          <option value="">Choose</option>
          {GA_CONTRACTOR_COPY_METHODS.map((m) => (
            <option key={m} value={m}>
              {CONTRACTOR_METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={id("tracking")}>
        <span className="text-slate-600">Tracking or receipt no.</span>
        <input
          id={id("tracking")}
          className="input"
          value={v.tracking}
          onChange={set("tracking")}
        />
      </label>
      <div className="sm:col-span-3">
        <button
          type="button"
          className="btn"
          disabled={save.isPending || !v.sentOn || !v.method}
          onClick={() =>
            save.mutate({
              copy: "owed",
              sentOn: v.sentOn,
              method: v.method || null,
              tracking: v.tracking || null,
            })
          }
        >
          Record the contractor's copy as sent
        </button>
      </div>
      {error && <ErrorText error={error} />}
    </div>
  );
}

/**
 * Was a notice of commencement (O.C.G.A. § 44-14-361.5) filed for this job? Saved on the job, so
 * every affidavit on it starts from the answer. The notice is filed with the clerk of superior court
 * in the county and posted on the site; the GC usually has a copy.
 */
function GaNocQuestion(props: {
  idPrefix: string;
  gaNoc: GaNoc;
  pending: boolean;
  onSave: (filed: boolean | null, contractor: string | null) => void;
  onCancel?: () => void;
}) {
  const { idPrefix, gaNoc, pending, onSave, onCancel } = props;
  const [contractor, setContractor] = useState(gaNoc.contractor ?? "");
  const text = contractor.trim() || null;
  return (
    <div className="grid gap-2 rounded border border-slate-200 p-2">
      <p>
        Was a notice of commencement filed for this job? The owner or contractor files it with the
        clerk of superior court in the property's county and posts a copy on the site; the GC
        usually has one. PayApps saves the answer on the job.
      </p>
      <label htmlFor={`${idPrefix}-contractor`}>
        <span className="text-slate-600">
          Contractor's name and address on the notice (optional)
        </span>
        <input
          id={`${idPrefix}-contractor`}
          className="input"
          maxLength={300}
          value={contractor}
          onChange={(e) => setContractor(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() => onSave(true, text)}
        >
          Yes, one was filed
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() => onSave(false, null)}
        >
          No notice was filed
        </button>
        {gaNoc.filed !== null && (
          <button
            type="button"
            className="link"
            disabled={pending}
            onClick={() => onSave(null, null)}
          >
            Not known
          </button>
        )}
        {onCancel && (
          <button type="button" className="link" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * O.C.G.A. § 44-14-366(g)(3): once paid in full after the filing, the claimant, on request, swears
 * in recordable form that payment in full was received; recorded in the county where the affidavit
 * of nonpayment was, it voids that affidavit. No statutory form, so nothing is printed.
 */
function GaPaidAffidavit(props: { base: string; waiver: WaiverDto; enabled: boolean }) {
  const { base, waiver, enabled } = props;
  const f = waiver.gaAffidavitFiling;
  const url = `${base}/waivers/${waiver.id}/ga-affidavit/paid-affidavit`;
  const qc = useQueryClient();
  const [v, setV] = useState({
    signedOn: f?.paidAffidavitSignedOn ?? todayIso(),
    recordedOn: f?.paidAffidavitRecordedOn ?? "",
    recording: f?.paidAffidavitRecording ?? "",
  });
  const done = () => qc.invalidateQueries({ queryKey: ["waivers"] });
  const save = useMutation({
    mutationFn: (recorded: boolean) =>
      api<WaiverDto>(url, {
        method: "PUT",
        body: {
          signedOn: v.signedOn,
          recordedOn: recorded ? v.recordedOn || null : null,
          recording: recorded ? v.recording || null : null,
        },
      }),
    onSuccess: done,
  });
  const clear = useMutation({
    mutationFn: () => api<WaiverDto>(url, { method: "DELETE" }),
    onSuccess: done,
  });
  if (!f) return null;
  const id = (k: string) => `ga-paid-${waiver.id}-${k}`;
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const error = save.error ?? clear.error;
  const clearButton = enabled && (
    <button
      type="button"
      className="link"
      disabled={clear.isPending}
      onClick={() => clear.mutate()}
    >
      Clear
    </button>
  );

  if (f.paidAffidavitRecordedOn) {
    return (
      <p>
        Affidavit of payment in full signed {f.paidAffidavitSignedOn} and recorded{" "}
        {f.paidAffidavitRecordedOn}
        {f.paidAffidavitRecording ? ` (${f.paidAffidavitRecording})` : ""}: the affidavit of
        nonpayment is void. {clearButton}
      </p>
    );
  }
  if (!enabled) {
    return f.paidAffidavitSignedOn ? (
      <p>Affidavit of payment in full signed {f.paidAffidavitSignedOn}, not yet recorded.</p>
    ) : null;
  }
  if (!f.paidAffidavitSignedOn) {
    return (
      <div className="grid gap-2 sm:grid-cols-3">
        <label htmlFor={id("signedOn")}>
          <span className="text-slate-600">Affidavit of payment in full signed on</span>
          <input
            id={id("signedOn")}
            className="input"
            type="date"
            min={f.filedOn}
            max={todayIso()}
            value={v.signedOn}
            onChange={set("signedOn")}
          />
        </label>
        <div className="flex items-end sm:col-span-2">
          <button
            type="button"
            className="btn"
            disabled={save.isPending || !v.signedOn}
            onClick={() => save.mutate(false)}
          >
            Record it as signed
          </button>
        </div>
        {error && <ErrorText error={error} />}
      </div>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <p className="sm:col-span-3">
        Affidavit of payment in full signed {f.paidAffidavitSignedOn}; record it in {f.county}{" "}
        County. {clearButton}
      </p>
      <label htmlFor={id("recordedOn")}>
        <span className="text-slate-600">Recorded on</span>
        <input
          id={id("recordedOn")}
          className="input"
          type="date"
          min={f.paidAffidavitSignedOn}
          max={todayIso()}
          value={v.recordedOn}
          onChange={set("recordedOn")}
        />
      </label>
      <label htmlFor={id("recording")}>
        <span className="text-slate-600">Book and page or instrument no.</span>
        <input
          id={id("recording")}
          className="input"
          value={v.recording}
          onChange={set("recording")}
        />
      </label>
      <div className="flex items-end">
        <button
          type="button"
          className="btn"
          disabled={save.isPending || !v.recordedOn}
          onClick={() => save.mutate(true)}
        >
          Record it as recorded
        </button>
      </div>
      {error && <ErrorText error={error} />}
    </div>
  );
}
