// The job's T&M rate sheet, on the T&M tickets page (src/shared/tm-tickets.ts, TmRateSheet;
// docs/TM-TICKETS.md). The labor, equipment and material rates and the markups the subcontract
// fixes: new tickets start from its markups and "Fill blank rates" takes its rates first. Saved
// whole; saving it never reprices a ticket already written.
import type { TmRateSheetDto } from "@shared/api/types";
import { centsToDecimal, formatCents, parseDollarsToCents } from "@shared/money";
import {
  bpsText,
  MAX_RATE_SHEET_LINES,
  parsePercentToBps,
  rateSheetProblem,
  type TmRateSheet,
} from "@shared/tm-tickets";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorText } from "../components/error";
import { api } from "../lib/api";

interface RateRow {
  name: string;
  rate: string;
  unit: string;
}

type Kind = "labor" | "equipment" | "material";

export interface RateSheetForm {
  labor: RateRow[];
  equipment: RateRow[];
  material: RateRow[];
  laborMarkup: string;
  materialMarkup: string;
  equipmentMarkup: string;
  source: string;
}

const KINDS: { kind: Kind; title: string; name: string; per: string }[] = [
  { kind: "labor", title: "Labor", name: "Trade", per: "per man-hour" },
  { kind: "equipment", title: "Equipment", name: "Equipment", per: "per hour" },
  { kind: "material", title: "Material", name: "Material", per: "per unit" },
];

const emptyRow = (): RateRow => ({ name: "", rate: "", unit: "" });

/** The form for a saved sheet (or a draft from the tickets), or a blank one. */
export function rateSheetFormOf(s: TmRateSheet | null): RateSheetForm {
  const rows = (list: TmRateSheet["labor"] | undefined) =>
    (list ?? []).map((l) => ({
      name: l.name,
      rate: centsToDecimal(l.rateCents),
      unit: l.unit ?? "",
    }));
  const pct = (b: number | null | undefined) => (b === null || b === undefined ? "" : bpsText(b));
  const f: RateSheetForm = {
    labor: rows(s?.labor),
    equipment: rows(s?.equipment),
    material: rows(s?.material),
    laborMarkup: pct(s?.laborMarkupBps),
    materialMarkup: pct(s?.materialMarkupBps),
    equipmentMarkup: pct(s?.equipmentMarkupBps),
    source: s?.source ?? "",
  };
  if (f.labor.length === 0) f.labor = [emptyRow()];
  return f;
}

/** The PUT body for the form; throws with the first problem in words. Blank rows are dropped. */
export function rateSheetBody(f: RateSheetForm): TmRateSheet {
  const list = (kind: Kind, label: string) =>
    f[kind]
      .filter((r) => r.name.trim() || r.rate.trim())
      .map((r, i) => {
        const c = parseDollarsToCents(r.rate);
        if (!r.rate.trim() || c === null || c < 0) {
          throw new Error(`${label} rate ${i + 1}: enter the rate in dollars and cents`);
        }
        return {
          name: r.name.trim(),
          rateCents: c,
          unit: kind === "material" ? r.unit.trim() || null : null,
        };
      });
  const pct = (v: string, label: string) => {
    if (!v.trim()) return null;
    const b = parsePercentToBps(v);
    if (b === null) throw new Error(`${label}: enter 0% to 100%, to two decimals`);
    return b;
  };
  const sheet: TmRateSheet = {
    labor: list("labor", "Labor"),
    material: list("material", "Material"),
    equipment: list("equipment", "Equipment"),
    laborMarkupBps: pct(f.laborMarkup, "Labor markup"),
    materialMarkupBps: pct(f.materialMarkup, "Material markup"),
    equipmentMarkupBps: pct(f.equipmentMarkup, "Equipment markup"),
    source: f.source.trim() || null,
  };
  const problem = rateSheetProblem(sheet);
  if (problem) throw new Error(problem);
  return sheet;
}

const count = (s: TmRateSheet) => s.labor.length + s.equipment.length + s.material.length;

export function RateSheetPanel({
  base,
  sheet,
  draft,
  canEdit,
  onSaved,
}: {
  /** The job's T&M tickets API path. */
  base: string;
  sheet: TmRateSheetDto | null;
  /** A first sheet from the rates already on the job's tickets. */
  draft: TmRateSheet | null;
  canEdit: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [form, setForm] = useState<RateSheetForm | null>(null);
  const save = useMutation({
    mutationFn: (f: RateSheetForm) =>
      api(`${base}/rate-sheet`, { method: "PUT", body: rateSheetBody(f) }),
    onSuccess: async () => {
      setForm(null);
      await onSaved();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`${base}/rate-sheet`, { method: "DELETE" }),
    onSuccess: onSaved,
  });

  const setRow = (kind: Kind, i: number, patch: Partial<RateRow>) =>
    form &&
    setForm({ ...form, [kind]: form[kind].map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <section className="card space-y-2 text-sm" aria-label="Rate sheet">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Rate sheet</h2>
        {canEdit && !form && (
          <span className="space-x-3">
            <button
              type="button"
              className="underline"
              onClick={() => setForm(rateSheetFormOf(sheet))}
            >
              {sheet ? "Edit the rate sheet" : "Set up a rate sheet"}
            </button>
            {!sheet && draft && (
              <button
                type="button"
                className="underline"
                onClick={() => setForm(rateSheetFormOf(draft))}
              >
                Start from the rates on this job's tickets
              </button>
            )}
            {sheet && (
              <button
                type="button"
                className="underline"
                disabled={remove.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Remove this job's rate sheet? Tickets already written keep their rates.",
                    )
                  ) {
                    remove.mutate();
                  }
                }}
              >
                Remove
              </button>
            )}
          </span>
        )}
      </div>

      {!form && !sheet && (
        <p className="text-slate-600">
          No rate sheet for this job. Enter the labor, equipment and material rates and the markups
          from the subcontract's T&amp;M terms once, and every new ticket starts from them.
          {!canEdit && " An editor sets it up."}
        </p>
      )}

      {!form && sheet && (
        <div className="space-y-2">
          {sheet.source && <p className="text-slate-600">From: {sheet.source}</p>}
          <div className="grid gap-3 md:grid-cols-3">
            {KINDS.map(({ kind, title, per }) => (
              <div key={kind}>
                <h3 className="text-xs uppercase tracking-wide text-slate-500">
                  {title} ({per})
                </h3>
                {sheet[kind].length === 0 ? (
                  <p className="text-slate-500">None on the sheet</p>
                ) : (
                  <ul>
                    {sheet[kind].map((l) => (
                      <li key={l.name} className="flex justify-between gap-2 tabular-nums">
                        <span>{l.name}</span>
                        <span>
                          {formatCents(l.rateCents)}
                          {l.unit ? ` / ${l.unit}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p className="text-slate-600">
            Markups: labor{" "}
            {sheet.laborMarkupBps === null ? "not set" : `${bpsText(sheet.laborMarkupBps)}%`} ·
            material{" "}
            {sheet.materialMarkupBps === null ? "not set" : `${bpsText(sheet.materialMarkupBps)}%`}{" "}
            · equipment{" "}
            {sheet.equipmentMarkupBps === null
              ? "not set"
              : `${bpsText(sheet.equipmentMarkupBps)}%`}
            . {count(sheet)} rate{count(sheet) === 1 ? "" : "s"}
            {sheet.updatedByName ? `, last changed by ${sheet.updatedByName}` : ""} on{" "}
            {sheet.updatedAt.slice(0, 10)}.
          </p>
          <p className="text-xs text-slate-500">
            New tickets start with these markups, and "Fill blank rates" uses these rates before any
            rate from an earlier ticket. Changing the sheet does not reprice tickets already
            written; a ticket whose rate differs from the sheet says so.
          </p>
        </div>
      )}

      {form && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form);
          }}
        >
          <label className="block">
            Where the rates come from (optional)
            <input
              className="input block w-full"
              maxLength={300}
              placeholder="Subcontract Exhibit D, rates through 2027-06-30"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
          </label>
          {KINDS.map(({ kind, title, name, per }) => (
            <fieldset key={kind} className="space-y-1">
              <legend className="font-medium">
                {title} rates ({per})
              </legend>
              {form[kind].map((r, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows being typed have no id
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <label>
                    {name}
                    <input
                      className="input block w-56"
                      maxLength={300}
                      value={r.name}
                      onChange={(e) => setRow(kind, i, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    Rate $
                    <input
                      inputMode="decimal"
                      className="input block w-28"
                      value={r.rate}
                      onChange={(e) => setRow(kind, i, { rate: e.target.value })}
                    />
                  </label>
                  {kind === "material" && (
                    <label>
                      Unit
                      <input
                        className="input block w-20"
                        maxLength={30}
                        value={r.unit}
                        onChange={(e) => setRow(kind, i, { unit: e.target.value })}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className="pb-2 underline"
                    onClick={() =>
                      setForm({ ...form, [kind]: form[kind].filter((_, j) => j !== i) })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              {form[kind].length < MAX_RATE_SHEET_LINES && (
                <button
                  type="button"
                  className="underline"
                  onClick={() => setForm({ ...form, [kind]: [...form[kind], emptyRow()] })}
                >
                  Add {title.toLowerCase()} rate
                </button>
              )}
            </fieldset>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            {(
              [
                ["laborMarkup", "Labor markup %"],
                ["materialMarkup", "Material markup %"],
                ["equipmentMarkup", "Equipment markup %"],
              ] as const
            ).map(([k, label]) => (
              <label key={k}>
                {label}
                <input
                  inputMode="decimal"
                  className="input block w-24"
                  placeholder="not set"
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn" disabled={save.isPending}>
              Save rate sheet
            </button>
            <button type="button" className="btn-secondary" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
          <ErrorText error={save.error} />
        </form>
      )}
      <ErrorText error={remove.error} />
    </section>
  );
}
