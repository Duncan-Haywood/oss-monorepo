// Lien waivers for one pay application: pick the job's state and the kind, check the prefilled
// statutory blanks, save, print, mark sent. States whose statutory text is not encoded yet are
// tracked only and link to the official form. Where a state offers a form for only some jobs
// (Missouri's residential one, Massachusetts' partial waiver), the user chooses between it and the
// usual form. Crew plan and up.
import { amountInWords } from "@lien-waivers/words";
import type { WaiverDto, WaiverFormDto, WaiverOverviewDto } from "@shared/api/types";
import type { WaiverKind } from "@shared/enums";
import { gaClockNeedsAction, gaClockText } from "@shared/ga-waiver-clock";
import { formatCents, parseDollarsToCents } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";
import { GaAffidavitFiling, GaAffidavitForm } from "./ga-affidavit";

const KIND_LABEL: Record<WaiverKind, string> = {
  "conditional-progress": "Conditional, progress",
  "unconditional-progress": "Unconditional, progress",
  "conditional-final": "Conditional, final",
  "unconditional-final": "Unconditional, final",
};

type Values = Record<string, string>;

const toText = (field: WaiverFormDto["fields"][number], v: string | number | undefined) =>
  v === undefined ? "" : field.type === "money" ? (Number(v) / 100).toFixed(2) : String(v);

/** A form's amount spelled out ("... and 00/100 Dollars") for these dollars, or null if not one. */
const wordsFor = (dollars: string | undefined): string | null => {
  const c = dollars ? parseDollarsToCents(dollars) : null;
  return c === null || c < 0 ? null : amountInWords(c);
};

/**
 * One field typed. Massachusetts' form states the payment in words and in figures: when the figures
 * change, the words follow, unless the user has written their own words.
 */
export function typeValue(values: Values, key: string, text: string): Values {
  const next = { ...values, [key]: text };
  if (key === "paymentAmountCents" && "paymentAmountWords" in values) {
    const words = values.paymentAmountWords ?? "";
    if (words === "" || words === wordsFor(values.paymentAmountCents)) {
      next.paymentAmountWords = wordsFor(text) ?? "";
    }
  }
  return next;
}

export function WaiversPanel(props: { orgId: string; base: string }) {
  const { orgId, base } = props;
  const qc = useQueryClient();
  const [state, setState] = useState("");
  const url = `${base}/waivers${state.length === 2 ? `?state=${state}` : ""}`;
  const q = useQuery({
    queryKey: ["waivers", url],
    queryFn: () => api<WaiverOverviewDto>(url),
  });
  const o = q.data;
  useEffect(() => {
    if (o?.state && !state) setState(o.state);
  }, [o?.state, state]);

  const [affidavitFor, setAffidavitFor] = useState<string | null>(null);
  const [kind, setKind] = useState<WaiverKind | null>(null);
  const chosenKind = kind ?? o?.suggestedKind ?? "conditional-progress";
  // The state's usual form of the kind, then any offered for only some jobs (Missouri's residential
  // unconditional final waiver); the user picks, PayApps never decides from the job.
  const choices = useMemo(
    () =>
      o
        ? [...o.forms, ...o.alternatives].filter((f) => f.kind === chosenKind)
        : ([] as WaiverFormDto[]),
    [o, chosenKind],
  );
  const [formChoice, setFormChoice] = useState<string | null>(null);
  const form = choices.find((f) => f.id === formChoice) ?? choices[0];
  const [values, setValues] = useState<Values>({});
  useEffect(() => {
    if (!form || !o) return;
    setValues(Object.fromEntries(form.fields.map((f) => [f.key, toText(f, o.prefill[f.key])])));
  }, [form, o]);

  // Nevada's forms have one "Payment Amount" blank for both kinds; Arizona's and the generic
  // forms name the check (conditional) or the payment received (unconditional).
  const amountKey = form?.fields.some((f) => f.key === "paymentAmountCents")
    ? "paymentAmountCents"
    : chosenKind.startsWith("conditional")
      ? "checkAmountCents"
      : "amountPaidCents";
  const amountCents = useMemo(() => {
    const typed = values[amountKey];
    const parsed = typed ? parseDollarsToCents(typed) : null;
    return parsed ?? Number(o?.prefill[amountKey] ?? o?.prefill.checkAmountCents ?? 0);
  }, [values, amountKey, o]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["waivers"] });
  const create = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("Choose the job's state first");
      const fields: Record<string, string | number> = {};
      for (const f of form.fields) {
        const v = values[f.key]?.trim();
        if (!v) continue;
        if (f.type === "money") {
          const c = parseDollarsToCents(v);
          if (c === null) throw new Error(`${f.label}: enter a dollar amount`);
          fields[f.key] = c;
        } else fields[f.key] = v;
      }
      return api<WaiverDto>(`${base}/waivers`, {
        method: "POST",
        body: {
          state,
          kind: chosenKind,
          formId: form.id,
          amountCents,
          throughDate: values.throughDate || o?.prefill.throughDate || null,
          ...(form.printable ? { fields } : {}),
        },
      });
    },
    onSuccess: refresh,
  });
  const markSent = useMutation({
    mutationFn: (w: WaiverDto) =>
      api<WaiverDto>(`${base}/waivers/${w.id}`, {
        method: "PATCH",
        body: { status: w.status === "sent" ? "draft" : "sent" },
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${base}/waivers/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  return (
    <section className="card max-w-3xl">
      <h2 className="mb-2 font-semibold">Lien waivers</h2>
      {q.error && <ErrorText error={q.error} />}
      {o && o.toSend.length > 0 && (
        <div
          role="status"
          className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900"
        >
          {o.toSend.map((w) => (
            <p key={w.scope}>
              {w.partial && w.remainingCents !== undefined
                ? `This application is paid in part and its conditional progress waiver went out. ${w.reason === "unsent" ? `The unconditional progress waiver saved below is not marked sent yet: check it is for the ${formatCents(w.remainingCents)} received and no more, then send it and mark it sent.` : `If the GC or the subcontract asks, the unconditional progress waiver for the ${formatCents(w.remainingCents)} received is next${o.enabled ? ": it is preselected below for that amount." : "."} Never waive the balance still owed.`}`
                : w.remainingCents !== undefined
                  ? `This application is paid, and the unconditional ${w.scope} waivers sent so far cover ${formatCents(w.remainingCents)} less than it. ${w.reason === "unsent" ? "The waiver saved below is not marked sent yet: send it and mark it sent." : `A waiver for the later payment is next, if the GC or the subcontract asks for one${o.enabled ? ": it is preselected below." : "."}`}`
                  : w.reason === "unsent"
                    ? `This application is paid: the unconditional ${w.scope} waiver below is saved but not marked sent. Send it and mark it sent.`
                    : `This application is paid and its conditional ${w.scope} waiver went out. The unconditional ${w.scope} waiver for this payment is next, if the GC or the subcontract asks for one${o.enabled ? ": it is preselected below." : "."}`}
            </p>
          ))}
        </div>
      )}
      {o && o.items.length > 0 && (
        <table className="mb-4 w-full text-sm">
          <tbody>
            {o.items.map((w) => (
              <tr key={w.id}>
                <td className="td">
                  {w.state} · {KIND_LABEL[w.kind]}
                </td>
                <td className="td text-right">{formatCents(w.amountCents)}</td>
                <td className="td">
                  {w.status === "sent" ? `Sent ${w.sentAt?.slice(0, 10)}` : "Draft"}
                </td>
                <td className="td space-x-2 text-right">
                  {w.printable ? (
                    <a className="link" href={`${base}/waivers/${w.id}/waiver.pdf`}>
                      PDF
                    </a>
                  ) : (
                    <span className="text-slate-500">Tracked only</span>
                  )}
                  {o.enabled && (
                    <button type="button" className="link" onClick={() => markSent.mutate(w)}>
                      {w.status === "sent" ? "Mark draft" : "Mark sent"}
                    </button>
                  )}
                  <button type="button" className="link" onClick={() => remove.mutate(w.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {o?.items
        .filter((w) => w.gaClock)
        .map((w) =>
          w.gaClock ? (
            <div
              key={`ga-${w.id}`}
              role="status"
              className={
                gaClockNeedsAction(w.gaClock) || w.gaClock.stage === "running"
                  ? "mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900"
                  : "mb-3 rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800"
              }
            >
              <p>{gaClockText(w.gaClock)}</p>
              {w.gaClock.stage === "running" && (
                <button
                  type="button"
                  className="link"
                  onClick={() => setAffidavitFor(affidavitFor === w.id ? null : w.id)}
                >
                  {affidavitFor === w.id ? "Hide the affidavit" : "Affidavit of nonpayment"}
                </button>
              )}
              {affidavitFor === w.id && w.gaClock.stage === "running" && (
                <GaAffidavitForm base={base} waiverId={w.id} enabled={o.enabled} />
              )}
              <GaAffidavitFiling base={base} waiver={w} enabled={o.enabled} gaNoc={o.gaNoc} />
            </div>
          ) : null,
        )}
      {o && !o.enabled && (
        <p className="text-sm">
          Lien waivers are part of the Crew plan and up.{" "}
          <Link className="link" to="/orgs/$orgId/billing" params={{ orgId }}>
            See plans
          </Link>
        </p>
      )}
      {o?.enabled && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="text-slate-600">Job's state</span>
              <input
                className="input w-20 uppercase"
                maxLength={2}
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                aria-label="Job's state (two letters)"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-600">Kind</span>
              <select
                className="input"
                value={chosenKind}
                onChange={(e) => setKind(e.target.value as WaiverKind)}
              >
                {Object.entries(KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                    {k === o.suggestedKind ? " (suggested)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {choices.length > 1 && (
            <fieldset className="grid gap-1 text-sm">
              <legend className="text-slate-600">Which form</legend>
              {choices.map((c) => (
                <label key={c.id} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="waiver-form"
                    className="mt-1"
                    checked={form?.id === c.id}
                    onChange={() => setFormChoice(c.id)}
                  />
                  <span>
                    {c.title}
                    {c.citation ? ` · ${c.citation}` : " · general form, not statutory"}
                    {c.appliesTo && (
                      <span className="block text-xs text-slate-600">Only for: {c.appliesTo}</span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {form && (
            <div className="text-sm">
              <p className="font-medium">
                {form.title}
                {form.citation ? ` · ${form.citation}` : " · general form, not statutory"}
              </p>
              {form.notes.map((n) => (
                <p key={n} className="text-xs text-slate-600">
                  {n}
                </p>
              ))}
              {!form.printable && form.officialUrl && (
                <p className="text-xs">
                  <a className="link" href={form.officialUrl} target="_blank" rel="noreferrer">
                    Official form
                  </a>{" "}
                  · PayApps tracks this waiver but does not print it yet.
                </p>
              )}
            </div>
          )}
          {form?.printable && (
            <div className="grid gap-2 sm:grid-cols-2">
              {form.fields.map((f) => (
                <label key={f.key} className="text-sm">
                  <span className="text-slate-600">
                    {f.label}
                    {f.required ? " *" : ""}
                    {f.type === "money" ? " ($)" : ""}
                  </span>
                  <input
                    className="input"
                    type={f.type === "date" ? "date" : "text"}
                    value={values[f.key] ?? ""}
                    title={f.help}
                    onChange={(e) => setValues((v) => typeValue(v, f.key, e.target.value))}
                  />
                </label>
              ))}
            </div>
          )}
          {form && (
            <div>
              <button
                type="button"
                className="btn"
                disabled={create.isPending}
                onClick={() => create.mutate()}
              >
                {form.printable ? "Save waiver" : `Track waiver for ${formatCents(amountCents)}`}
              </button>
            </div>
          )}
          {create.error && <ErrorText error={create.error} />}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Not legal advice. Waiver wording comes from the state statute where PayApps has encoded it
        (Arizona, California, Florida, Georgia, Michigan, Mississippi, Nevada, Texas, Utah and
        Wyoming today, plus Missouri's residential unconditional final waiver and Massachusetts'
        partial waiver and subordination of lien) and is otherwise a general form; lien law varies
        by state, so have counsel review before you rely on a waiver.
      </p>
    </section>
  );
}
