// Release retainage on a draft by a percentage of what is held or by a dollar amount, on every line,
// the complete lines or chosen lines. The server plans it from the saved entries
// (`src/shared/retainage-release.ts`); the preview shows each line before anything is written.
import type { PayAppDetailDto, RetainageReleaseDto } from "@shared/api/types";
import { formatCents, parseDollarsToCents, parsePercentToBps } from "@shared/money";
import { heldBeforeRelease } from "@shared/retainage-release";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

type Scope = "all" | "complete" | "selected";

export function RetainageReleasePanel(props: {
  base: string;
  app: PayAppDetailDto;
  dirty: boolean;
  onChanged: (d: PayAppDetailDto) => void;
}) {
  const { base, app, dirty } = props;
  const [scope, setScope] = useState<Scope>("complete");
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("100");
  const [chosen, setChosen] = useState<string[]>([]);
  const [preview, setPreview] = useState<RetainageReleaseDto | null>(null);
  const holding = app.computed.lines.filter((l) => heldBeforeRelease(l) > 0);

  const body = (apply: boolean) => {
    const amount =
      mode === "percent"
        ? { percentBps: parsePercentToBps(value) }
        : { amountCents: parseDollarsToCents(value) };
    const n = amount.percentBps ?? amount.amountCents;
    if (n === null || n === undefined || n <= 0) {
      throw new Error(mode === "percent" ? "Enter a percentage up to 100" : "Enter an amount");
    }
    return { scope, ...(scope === "selected" ? { sovLineIds: chosen } : {}), ...amount, apply };
  };
  const run = useMutation({
    mutationFn: (apply: boolean) =>
      api<RetainageReleaseDto>(`${base}/retainage-release`, { method: "POST", body: body(apply) }),
    onSuccess: (r) => {
      if (r.applied && r.detail) {
        setPreview(null);
        props.onChanged(r.detail);
      } else setPreview(r);
    },
  });
  const changed = () => setPreview(null);

  if (!app.editable || holding.length === 0) return null;
  const plan = preview?.plan;
  return (
    <section className="card max-w-3xl">
      <h2 className="mb-1 font-semibold">Release retainage</h2>
      <p className="mb-3 text-sm text-slate-600">
        For a reduction the GC agreed (say half at substantial completion) or a final retainage
        billing. Splits the release across lines by what each holds, to the cent, and replaces what
        this application already releases on those lines. Check it against your subcontract.
      </p>
      {dirty ? (
        <p className="text-sm text-amber-700">Save the continuation sheet first.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label>
              <span className="text-slate-600">Lines</span>
              <select
                className="input"
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value as Scope);
                  changed();
                }}
              >
                <option value="complete">Complete lines (work to date = scheduled value)</option>
                <option value="all">Every line holding retainage</option>
                <option value="selected">Lines I choose</option>
              </select>
            </label>
            <label>
              <span className="text-slate-600">Release</span>
              <select
                className="input"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as "percent" | "amount");
                  setValue(e.target.value === "percent" ? "100" : "");
                  changed();
                }}
              >
                <option value="percent">% of retainage held</option>
                <option value="amount">Dollar amount</option>
              </select>
            </label>
            <label>
              <span className="text-slate-600">
                {mode === "percent" ? "Percent" : "Amount ($)"}
              </span>
              <input
                aria-label={mode === "percent" ? "Percent to release" : "Amount to release"}
                className="input w-32 text-right"
                inputMode="decimal"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  changed();
                }}
              />
            </label>
            <button
              type="button"
              className="btn-secondary"
              disabled={run.isPending}
              onClick={() => run.mutate(false)}
            >
              Preview
            </button>
          </div>
          {scope === "selected" && (
            <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <legend className="sr-only">Lines to release</legend>
              {holding.map((l) => (
                <label key={l.sovLineId} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={chosen.includes(l.sovLineId)}
                    onChange={(e) => {
                      setChosen(
                        e.target.checked
                          ? [...chosen, l.sovLineId]
                          : chosen.filter((x) => x !== l.sovLineId),
                      );
                      changed();
                    }}
                  />
                  {l.itemNumber} {l.description} ({formatCents(heldBeforeRelease(l))})
                </label>
              ))}
            </fieldset>
          )}
          <ErrorText error={run.error} />
          {plan && (
            <div>
              {plan.issues.length > 0 ? (
                <ul className="list-disc pl-5 text-sm text-red-700">
                  {plan.issues.map((i) => (
                    <li key={i.code}>{i.message}</li>
                  ))}
                </ul>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="th">Item</th>
                        <th className="th text-right">Held</th>
                        <th className="th text-right">Release</th>
                        <th className="th text-right">Still held</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.lines.map((l) => (
                        <tr key={l.sovLineId}>
                          <td className="td">
                            {l.itemNumber} {l.description}
                          </td>
                          <td className="td text-right">{formatCents(l.heldCents)}</td>
                          <td className="td text-right">{formatCents(l.releaseCents)}</td>
                          <td className="td text-right">{formatCents(l.heldAfterCents)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="td">Total</td>
                        <td className="td text-right">{formatCents(plan.heldCents)}</td>
                        <td className="td text-right">{formatCents(plan.releaseCents)}</td>
                        <td className="td text-right">
                          {formatCents(plan.heldCents - plan.releaseCents)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-2 text-sm">
                    Current payment due changes by {formatCents(plan.changeCents)}.{" "}
                    <button
                      type="button"
                      className="btn"
                      disabled={run.isPending}
                      onClick={() => run.mutate(true)}
                    >
                      Apply to this application
                    </button>
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
