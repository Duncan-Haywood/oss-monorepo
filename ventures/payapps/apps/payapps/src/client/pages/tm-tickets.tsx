// /orgs/$orgId/projects/$projectId/tm-tickets : the job's T&M tickets (src/shared/tm-tickets.ts,
// docs/TM-TICKETS.md). Extra work written up the day it is done (labor, material, equipment), signed
// by the GC's representative on the device or on paper, priced, and billed on a change order. Each
// ticket downloads as a priced PDF or a field copy; a change order's tickets as its backup PDF.
import type { TmRateSheetDto, TmTicketDto, TmTicketLogDto } from "@shared/api/types";
import { centsToDecimal, formatCents, parseDollarsToCents } from "@shared/money";
import {
  bpsText,
  laborManHours,
  parsePercentToBps,
  priceTicket,
  qtyText,
  rateFor,
  rateSheetDifferences,
  STAGE_LABEL,
  startingMarkups,
  TM_TICKETS_NOTE,
  type TmRates,
  tmLabel,
  tmTicketProblem,
} from "@shared/tm-tickets";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Fragment, useEffect, useRef, useState } from "react";
import { AttachmentsPanel } from "../components/attachments";
import { ErrorText } from "../components/error";
import { api, projectPath } from "../lib/api";
import { RateSheetPanel } from "./tm-rate-sheet";

interface LaborForm {
  trade: string;
  workers: string;
  hoursEach: string;
  rate: string;
}
interface MaterialForm {
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
}
interface EquipmentForm {
  description: string;
  hours: string;
  rate: string;
}

export interface TmForm {
  number: string;
  workDate: string;
  description: string;
  location: string;
  directedBy: string;
  reference: string;
  labor: LaborForm[];
  material: MaterialForm[];
  equipment: EquipmentForm[];
  laborMarkup: string;
  materialMarkup: string;
  equipmentMarkup: string;
  notes: string;
}

const emptyLabor = (): LaborForm => ({ trade: "", workers: "", hoursEach: "8", rate: "" });
const emptyMaterial = (): MaterialForm => ({
  description: "",
  quantity: "",
  unit: "",
  unitCost: "",
});
const emptyEquipment = (): EquipmentForm => ({ description: "", hours: "", rate: "" });

/**
 * A new ticket; the markups start from the job's rate sheet or, where it sets none, the latest
 * ticket (`startingMarkups`), since a subcontract fixes them.
 */
export const emptyTmForm = (
  number: number,
  workDate: string,
  prev?: Pick<TmTicketDto, "laborMarkupBps" | "materialMarkupBps" | "equipmentMarkupBps">,
): TmForm => ({
  number: String(number),
  workDate,
  description: "",
  location: "",
  directedBy: "",
  reference: "",
  labor: [emptyLabor()],
  material: [],
  equipment: [],
  laborMarkup: prev ? bpsText(prev.laborMarkupBps) : "",
  materialMarkup: prev ? bpsText(prev.materialMarkupBps) : "",
  equipmentMarkup: prev ? bpsText(prev.equipmentMarkupBps) : "",
  notes: "",
});

const moneyText = (c: number | null) => (c === null ? "" : centsToDecimal(c));

export const tmFormOf = (t: TmTicketDto): TmForm => ({
  number: String(t.number),
  workDate: t.workDate,
  description: t.description,
  location: t.location ?? "",
  directedBy: t.directedBy ?? "",
  reference: t.reference ?? "",
  labor: t.labor.map((l) => ({
    trade: l.trade,
    workers: String(l.workers),
    hoursEach: qtyText(l.hoursEach),
    rate: moneyText(l.rateCents),
  })),
  material: t.material.map((l) => ({
    description: l.description,
    quantity: qtyText(l.quantity),
    unit: l.unit ?? "",
    unitCost: moneyText(l.unitCostCents),
  })),
  equipment: t.equipment.map((l) => ({
    description: l.description,
    hours: qtyText(l.hours),
    rate: moneyText(l.rateCents),
  })),
  laborMarkup: bpsText(t.laborMarkupBps),
  materialMarkup: bpsText(t.materialMarkupBps),
  equipmentMarkup: bpsText(t.equipmentMarkupBps),
  notes: t.notes ?? "",
});

/** Fills blank rates from the ones already used on the job (by trade, material or equipment name). */
export function withJobRates(f: TmForm, rates: TmRates): TmForm {
  const fill = (v: string, c: number | null) => (v.trim() || c === null ? v : centsToDecimal(c));
  return {
    ...f,
    labor: f.labor.map((l) => ({ ...l, rate: fill(l.rate, rateFor(rates.labor, l.trade)) })),
    material: f.material.map((l) => ({
      ...l,
      unitCost: fill(l.unitCost, rateFor(rates.material, l.description)),
    })),
    equipment: f.equipment.map((l) => ({
      ...l,
      rate: fill(l.rate, rateFor(rates.equipment, l.description)),
    })),
  };
}

function num(v: string, label: string, integer = false): number {
  const n = Number(v.trim());
  if (!v.trim() || !Number.isFinite(n) || (integer && !Number.isInteger(n))) {
    throw new Error(`${label}: enter a ${integer ? "whole " : ""}number`);
  }
  return n;
}
function cents(v: string, label: string): number | null {
  if (!v.trim()) return null;
  const c = parseDollarsToCents(v);
  if (c === null || c < 0) throw new Error(`${label}: enter dollars and cents`);
  return c;
}
function pct(v: string, label: string): number {
  const b = parsePercentToBps(v);
  if (b === null) throw new Error(`${label}: enter 0% to 100%, to two decimals`);
  return b;
}

/** The request body for a form; throws with the first problem in words. Blank rows are dropped. */
export function tmTicketBody(f: TmForm, latest: string) {
  const labor = f.labor
    .filter((l) => l.trade.trim() || l.workers.trim() || l.rate.trim())
    .map((l, i) => ({
      trade: l.trade.trim(),
      workers: num(l.workers, `Labor line ${i + 1}, workers`, true),
      hoursEach: num(l.hoursEach, `Labor line ${i + 1}, hours each`),
      rateCents: cents(l.rate, `Labor line ${i + 1}, rate`),
    }));
  const material = f.material
    .filter((l) => l.description.trim() || l.quantity.trim() || l.unitCost.trim())
    .map((l, i) => ({
      description: l.description.trim(),
      quantity: num(l.quantity, `Material line ${i + 1}, quantity`),
      unit: l.unit.trim() || null,
      unitCostCents: cents(l.unitCost, `Material line ${i + 1}, unit cost`),
    }));
  const equipment = f.equipment
    .filter((l) => l.description.trim() || l.hours.trim() || l.rate.trim())
    .map((l, i) => ({
      description: l.description.trim(),
      hours: num(l.hours, `Equipment line ${i + 1}, hours`),
      rateCents: cents(l.rate, `Equipment line ${i + 1}, rate`),
    }));
  const body = {
    number: num(f.number, "Ticket number", true),
    workDate: f.workDate,
    description: f.description.trim(),
    location: f.location.trim() || null,
    directedBy: f.directedBy.trim() || null,
    reference: f.reference.trim() || null,
    labor,
    material,
    equipment,
    laborMarkupBps: pct(f.laborMarkup, "Labor markup"),
    materialMarkupBps: pct(f.materialMarkup, "Material markup"),
    equipmentMarkupBps: pct(f.equipmentMarkup, "Equipment markup"),
    notes: f.notes.trim() || null,
  };
  const problem = tmTicketProblem(body, latest);
  if (problem) throw new Error(problem);
  return body;
}

/** The form's price as typed so far (rows that do not read yet count as unpriced). */
function formPricing(f: TmForm) {
  const n = (v: string) => (Number.isFinite(Number(v)) && v.trim() ? Number(v) : 0);
  const c = (v: string) => (v.trim() ? parseDollarsToCents(v) : null);
  return priceTicket({
    labor: f.labor.map((l) => ({
      trade: l.trade,
      workers: n(l.workers),
      hoursEach: n(l.hoursEach),
      rateCents: c(l.rate),
    })),
    material: f.material.map((l) => ({
      description: l.description,
      quantity: n(l.quantity),
      unit: l.unit,
      unitCostCents: c(l.unitCost),
    })),
    equipment: f.equipment.map((l) => ({
      description: l.description,
      hours: n(l.hours),
      rateCents: c(l.rate),
    })),
    laborMarkupBps: parsePercentToBps(f.laborMarkup) ?? 0,
    materialMarkupBps: parsePercentToBps(f.materialMarkup) ?? 0,
    equipmentMarkupBps: parsePercentToBps(f.equipmentMarkup) ?? 0,
  });
}

function Fields({
  form,
  set,
  rates,
  signed,
  fromSheet = false,
}: {
  form: TmForm;
  set: (f: TmForm) => void;
  rates: TmRates;
  signed: boolean;
  /** The job has a rate sheet (the fill button names it). */
  fromSheet?: boolean;
}) {
  const field = (k: Exclude<keyof TmForm, "labor" | "material" | "equipment">) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => set({ ...form, [k]: e.target.value }),
  });
  const locked = signed
    ? { disabled: true, title: "Signed: take the signature off to change it" }
    : {};
  const setRow = <K extends "labor" | "material" | "equipment">(
    k: K,
    i: number,
    patch: Partial<TmForm[K][number]>,
  ) => set({ ...form, [k]: form[k].map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const drop = (k: "labor" | "material" | "equipment", i: number) =>
    set({ ...form, [k]: form[k].filter((_, j) => j !== i) });
  const p = formPricing(form);
  const fillRates = () => set(withJobRates(form, rates));
  const hasRates =
    Object.keys(rates.labor).length +
      Object.keys(rates.material).length +
      Object.keys(rates.equipment).length >
    0;
  return (
    <div className="space-y-3">
      {signed && (
        <p className="text-sm text-amber-800">
          Signed: the date, the work and the quantities are what the GC signed for. Rates, markups,
          the reference and notes can still change.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Ticket no.
          <input
            inputMode="numeric"
            className="input block w-20"
            required
            {...field("number")}
            {...locked}
          />
        </label>
        <label className="text-sm">
          Date of the work
          <input type="date" className="input block" required {...field("workDate")} {...locked} />
        </label>
        <label className="text-sm">
          Location on site
          <input
            className="input block w-48"
            placeholder="Level 2, grid C-4"
            {...field("location")}
            {...locked}
          />
        </label>
        <label className="text-sm">
          Directed by
          <input
            className="input block w-44"
            placeholder="GC superintendent"
            {...field("directedBy")}
          />
        </label>
        <label className="text-sm">
          Directive / RFI / reference
          <input className="input block w-36" placeholder="FD-07" {...field("reference")} />
        </label>
      </div>
      <label className="block text-sm">
        Extra work performed
        <textarea
          className="input block w-full"
          rows={3}
          required
          placeholder="Relocated two duplex receptacles at the nurse station per the super's direction"
          {...field("description")}
          {...locked}
        />
      </label>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Labor</legend>
        {form.labor.map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id until saved; order is the identity
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Trade
              <input
                className="input block w-40"
                placeholder="Journeyman electrician"
                value={l.trade}
                onChange={(e) => setRow("labor", i, { trade: e.target.value })}
                {...locked}
              />
            </label>
            <label className="text-sm">
              Workers
              <input
                inputMode="numeric"
                className="input block w-16"
                value={l.workers}
                onChange={(e) => setRow("labor", i, { workers: e.target.value })}
                {...locked}
              />
            </label>
            <label className="text-sm">
              Hours each
              <input
                inputMode="decimal"
                className="input block w-16"
                value={l.hoursEach}
                onChange={(e) => setRow("labor", i, { hoursEach: e.target.value })}
                {...locked}
              />
            </label>
            <label className="text-sm">
              Rate $/h
              <input
                inputMode="decimal"
                className="input block w-24"
                placeholder="later"
                value={l.rate}
                onChange={(e) => setRow("labor", i, { rate: e.target.value })}
              />
            </label>
            <span className="pb-2 text-sm tabular-nums text-slate-600">
              {qtyText(
                laborManHours({
                  workers: Number(l.workers) || 0,
                  hoursEach: Number(l.hoursEach) || 0,
                }),
              )}{" "}
              man-h
            </span>
            {!signed && (
              <button
                type="button"
                className="pb-2 text-sm underline"
                aria-label={`Remove labor line ${i + 1}`}
                onClick={() => drop("labor", i)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {!signed && (
          <button
            type="button"
            className="text-sm underline"
            onClick={() => set({ ...form, labor: [...form.labor, emptyLabor()] })}
          >
            Add labor
          </button>
        )}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Material</legend>
        {form.material.map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id until saved; order is the identity
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Description
              <input
                className="input block w-52"
                placeholder="3/4 in EMT"
                value={l.description}
                onChange={(e) => setRow("material", i, { description: e.target.value })}
                {...locked}
              />
            </label>
            <label className="text-sm">
              Quantity
              <input
                inputMode="decimal"
                className="input block w-20"
                value={l.quantity}
                onChange={(e) => setRow("material", i, { quantity: e.target.value })}
                {...locked}
              />
            </label>
            <label className="text-sm">
              Unit
              <input
                className="input block w-16"
                placeholder="ft"
                value={l.unit}
                onChange={(e) => setRow("material", i, { unit: e.target.value })}
                {...locked}
              />
            </label>
            <label className="text-sm">
              Unit cost $
              <input
                inputMode="decimal"
                className="input block w-24"
                placeholder="later"
                value={l.unitCost}
                onChange={(e) => setRow("material", i, { unitCost: e.target.value })}
              />
            </label>
            {!signed && (
              <button
                type="button"
                className="pb-2 text-sm underline"
                aria-label={`Remove material line ${i + 1}`}
                onClick={() => drop("material", i)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {!signed && (
          <button
            type="button"
            className="text-sm underline"
            onClick={() => set({ ...form, material: [...form.material, emptyMaterial()] })}
          >
            Add material
          </button>
        )}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Equipment</legend>
        {form.equipment.map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id until saved; order is the identity
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Description
              <input
                className="input block w-52"
                placeholder="Scissor lift, 19 ft"
                value={l.description}
                onChange={(e) => setRow("equipment", i, { description: e.target.value })}
                {...locked}
              />
            </label>
            <label className="text-sm">
              Hours
              <input
                inputMode="decimal"
                className="input block w-16"
                value={l.hours}
                onChange={(e) => setRow("equipment", i, { hours: e.target.value })}
                {...locked}
              />
            </label>
            <label className="text-sm">
              Rate $/h
              <input
                inputMode="decimal"
                className="input block w-24"
                placeholder="later"
                value={l.rate}
                onChange={(e) => setRow("equipment", i, { rate: e.target.value })}
              />
            </label>
            {!signed && (
              <button
                type="button"
                className="pb-2 text-sm underline"
                aria-label={`Remove equipment line ${i + 1}`}
                onClick={() => drop("equipment", i)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {!signed && (
          <button
            type="button"
            className="text-sm underline"
            onClick={() => set({ ...form, equipment: [...form.equipment, emptyEquipment()] })}
          >
            Add equipment
          </button>
        )}
      </fieldset>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Labor markup %
          <input
            inputMode="decimal"
            className="input block w-20"
            placeholder="0"
            {...field("laborMarkup")}
          />
        </label>
        <label className="text-sm">
          Material markup %
          <input
            inputMode="decimal"
            className="input block w-20"
            placeholder="0"
            {...field("materialMarkup")}
          />
        </label>
        <label className="text-sm">
          Equipment markup %
          <input
            inputMode="decimal"
            className="input block w-20"
            placeholder="0"
            {...field("equipmentMarkup")}
          />
        </label>
        {hasRates && (
          <button type="button" className="pb-2 text-sm underline" onClick={fillRates}>
            {fromSheet
              ? "Fill blank rates from this job's rate sheet and tickets"
              : "Fill blank rates from this job's tickets"}
          </button>
        )}
        <span className="pb-2 text-sm tabular-nums text-slate-700">
          {p.totalCents !== null
            ? `Total ${formatCents(p.totalCents)}`
            : `${formatCents(p.pricedSoFarCents)} so far; ${p.labor.unpriced + p.material.unpriced + p.equipment.unpriced} line(s) not priced`}
        </span>
      </div>
      <label className="block text-sm">
        Notes
        <textarea className="input block w-full" rows={2} {...field("notes")} />
      </label>
    </div>
  );
}

/**
 * A signature pad: pointer strokes on a white canvas, exported as a baseline JPEG (what the PDF
 * writer embeds). `onChange` gets the base64 JPEG, or null once cleared.
 */
function SignaturePad({ onChange }: { onChange: (jpeg: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
  }, []);
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    };
  };
  const done = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const c = ref.current;
    if (c && inked.current) {
      onChange(c.toDataURL("image/jpeg", 0.85).replace(/^data:image\/jpeg;base64,/, ""));
    }
  };
  const clear = () => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    inked.current = false;
    onChange(null);
  };
  return (
    <div className="space-y-1">
      <canvas
        ref={ref}
        width={600}
        height={200}
        aria-label="Signature pad: sign with a finger, stylus or mouse"
        className="block w-full max-w-md touch-none rounded border border-slate-400 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const g = e.currentTarget.getContext("2d");
          const p = at(e);
          g?.beginPath();
          g?.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const g = e.currentTarget.getContext("2d");
          if (!g) return;
          const p = at(e);
          g.lineWidth = 3;
          g.lineCap = "round";
          g.lineJoin = "round";
          g.strokeStyle = "#111";
          g.lineTo(p.x, p.y);
          g.stroke();
          inked.current = true;
        }}
        onPointerUp={done}
        onPointerCancel={done}
        onPointerLeave={done}
      />
      <button type="button" className="text-sm underline" onClick={clear}>
        Clear the signature
      </button>
    </div>
  );
}

function SignForm({
  t,
  today,
  onSign,
  pending,
  onCancel,
}: {
  t: TmTicketDto;
  today: string;
  onSign: (b: {
    signedName: string;
    signedTitle: string | null;
    signedOn: string;
    signatureJpeg: string | null;
  }) => void;
  pending: boolean;
  onCancel: () => void;
}) {
  const [name, setName] = useState(t.directedBy ?? "");
  const [title, setTitle] = useState("");
  const [on, setOn] = useState(today < t.workDate ? t.workDate : today);
  const [paper, setPaper] = useState(false);
  const [jpeg, setJpeg] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSign({
          signedName: name.trim(),
          signedTitle: title.trim() || null,
          signedOn: on,
          signatureJpeg: paper ? null : jpeg,
        });
      }}
    >
      <p className="text-sm">
        Hand the device to the GC's representative: they sign for the work and quantities on{" "}
        {tmLabel(t.number)}, not the prices.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Name
          <input
            className="input block w-48"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Title
          <input
            className="input block w-40"
            placeholder="Superintendent"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Date signed
          <input
            type="date"
            className="input block"
            required
            value={on}
            onChange={(e) => setOn(e.target.value)}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={paper} onChange={(e) => setPaper(e.target.checked)} />
        Signed on paper (keep the signed original); no signature drawn here
      </label>
      {!paper && <SignaturePad onChange={setJpeg} />}
      <div className="flex gap-2">
        <button type="submit" className="btn" disabled={pending || (!paper && !jpeg)}>
          Save the signature
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function TicketBody({
  t,
  base,
  sheet,
}: {
  t: TmTicketDto;
  base: string;
  sheet?: TmRateSheetDto | null;
}) {
  const p = t.pricing;
  // Only before billing: once on a change order the price is what was sent to the GC.
  const differs =
    t.stage === "signed" || t.stage === "unsigned" ? rateSheetDifferences(t, sheet ?? null) : [];
  return (
    <div className="space-y-2 text-sm">
      <p className="whitespace-pre-wrap">{t.description}</p>
      <p className="text-slate-600">
        {[
          t.location && `At ${t.location}`,
          t.directedBy && `directed by ${t.directedBy}`,
          t.reference && `ref. ${t.reference}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <table className="w-full max-w-2xl">
        <thead>
          <tr>
            <th className="th">Line</th>
            <th className="th text-right">Quantity</th>
            <th className="th text-right">Rate</th>
          </tr>
        </thead>
        <tbody>
          {t.labor.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: saved lines are an ordered list
            <tr key={`l${i}`}>
              <td className="td">{l.trade}</td>
              <td className="td text-right tabular-nums">
                {l.workers} × {qtyText(l.hoursEach)} h
              </td>
              <td className="td text-right tabular-nums">
                {l.rateCents === null ? "not priced" : `${formatCents(l.rateCents)}/h`}
              </td>
            </tr>
          ))}
          {t.material.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: saved lines are an ordered list
            <tr key={`m${i}`}>
              <td className="td">{l.description}</td>
              <td className="td text-right tabular-nums">
                {qtyText(l.quantity)} {l.unit ?? ""}
              </td>
              <td className="td text-right tabular-nums">
                {l.unitCostCents === null ? "not priced" : formatCents(l.unitCostCents)}
              </td>
            </tr>
          ))}
          {t.equipment.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: saved lines are an ordered list
            <tr key={`e${i}`}>
              <td className="td">{l.description}</td>
              <td className="td text-right tabular-nums">{qtyText(l.hours)} h</td>
              <td className="td text-right tabular-nums">
                {l.rateCents === null ? "not priced" : `${formatCents(l.rateCents)}/h`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tabular-nums">
        Labor {formatCents(p.labor.subtotalCents)}
        {t.laborMarkupBps > 0 && ` + ${bpsText(t.laborMarkupBps)}%`} · Material{" "}
        {formatCents(p.material.subtotalCents)}
        {t.materialMarkupBps > 0 && ` + ${bpsText(t.materialMarkupBps)}%`} · Equipment{" "}
        {formatCents(p.equipment.subtotalCents)}
        {t.equipmentMarkupBps > 0 && ` + ${bpsText(t.equipmentMarkupBps)}%`}
      </p>
      {differs.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
          <p className="font-medium">Not what the job's rate sheet says:</p>
          <ul className="list-disc pl-5">
            {differs.map((x) => (
              <li key={x.text}>{x.text}</li>
            ))}
          </ul>
          <p className="text-xs">
            GCs check T&amp;M pricing against the subcontract's rates. Edit the ticket if the sheet
            is right, or the sheet if the ticket is.
          </p>
        </div>
      )}
      {t.signedName && (
        <div className="space-y-1">
          <p>
            Signed by {t.signedName}
            {t.signedTitle ? `, ${t.signedTitle}` : ""} on {t.signedOn}
            {t.hasSignatureImage ? "" : " (on paper)"}.
          </p>
          {t.hasSignatureImage && (
            <img
              src={`${base}/${encodeURIComponent(t.id)}/signature.jpg`}
              alt={`Signature of ${t.signedName}`}
              className="h-16 rounded border border-slate-200 bg-white"
            />
          )}
        </div>
      )}
      {t.notes && <p className="whitespace-pre-wrap text-slate-700">{t.notes}</p>}
      <p className="text-xs text-slate-500">
        {t.createdByName ? `Written up by ${t.createdByName}` : "Written up in PayApps"}
        {t.updatedByName && t.updatedAt !== t.createdAt
          ? `; last changed by ${t.updatedByName} on ${t.updatedAt.slice(0, 10)}`
          : ""}
      </p>
    </div>
  );
}

const canBill = (t: TmTicketDto) => t.stage === "signed" && t.pricing.totalCents !== null;

export function TmTicketsPage() {
  const { orgId, projectId } = useParams({ from: "/orgs/$orgId/projects/$projectId/tm-tickets" });
  const base = projectPath(orgId, projectId, "/tm-tickets");
  const key = ["tm-tickets", orgId, projectId];
  const qc = useQueryClient();
  const q = useQuery({ queryKey: key, queryFn: () => api<TmTicketLogDto>(base) });
  const [form, setForm] = useState<TmForm | null>(null);
  const [editing, setEditing] = useState<{ id: string; form: TmForm; signed: boolean } | null>(
    null,
  );
  const [signing, setSigning] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filesOf, setFilesOf] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [co, setCo] = useState({ number: "", target: "new", itemNumber: "", sent: "" });
  const [billed, setBilled] = useState<{ number: string; id: string; amountCents: number } | null>(
    null,
  );
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const today = new Date().toISOString().slice(0, 10);

  const add = useMutation({
    mutationFn: (f: TmForm) =>
      api<TmTicketDto>(base, {
        method: "POST",
        body: tmTicketBody(f, q.data?.latestDate ?? f.workDate),
      }),
    onSuccess: async (t) => {
      setForm(null);
      setOpen(t.id);
      await refresh();
    },
  });
  const save = useMutation({
    mutationFn: (e: { id: string; form: TmForm }) =>
      api(`${base}/${e.id}`, {
        method: "PATCH",
        body: tmTicketBody(e.form, q.data?.latestDate ?? e.form.workDate),
      }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (t: TmTicketDto) => api(`${base}/${t.id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const sign = useMutation({
    mutationFn: (v: { id: string; body: unknown }) =>
      api(`${base}/${v.id}/signature`, { method: "PUT", body: v.body }),
    onSuccess: async () => {
      setSigning(null);
      await refresh();
    },
  });
  const unsign = useMutation({
    mutationFn: (t: TmTicketDto) => api(`${base}/${t.id}/signature`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const bill = useMutation({
    mutationFn: () => {
      const d = q.data;
      if (!d) throw new Error("Loading");
      const number = co.number.trim() || d.suggestedChangeOrderNumber;
      const target =
        co.target === "new"
          ? { newLine: { itemNumber: co.itemNumber.trim() || `CO ${number}` } }
          : { sovLineId: co.target };
      return api<{ changeOrderId: string; number: string; amountCents: number }>(
        `${base}/change-order`,
        {
          method: "POST",
          body: { ticketIds: [...picked], number, target, submittedOn: co.sent || null },
        },
      );
    },
    onSuccess: async (r) => {
      setBilled({ number: r.number, id: r.changeOrderId, amountCents: r.amountCents });
      setPicked(new Set());
      setCo({ number: "", target: "new", itemNumber: "", sent: "" });
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["pay-app-history"] })]);
    },
  });

  if (q.error) return <ErrorText error={q.error} />;
  if (!q.data) return <p className="text-sm text-slate-500">Loading…</p>;
  const d = q.data;
  const s = d.summary;
  const latest = d.items[0];
  const pickedTotal = d.items
    .filter((t) => picked.has(t.id))
    .reduce((sum, t) => sum + (t.pricing.totalCents ?? 0), 0);
  const billable = d.items.filter(canBill);

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/orgs/$orgId/projects/$projectId"
          params={{ orgId, projectId }}
          className="text-sm text-slate-600 underline"
        >
          ← {d.projectName}
        </Link>
        <h1 className="text-2xl font-semibold">T&amp;M tickets</h1>
        <p className="text-sm text-slate-600">
          Extra work {d.gcName} asked for, written up the day it is done, signed on site, then
          priced and billed on a change order.{" "}
          {d.items.length > 0 && (
            <a className="underline" href={`${base}/log.csv`}>
              Download CSV
            </a>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["Tickets", String(s.tickets)],
            ["Not signed yet", String(s.unsigned)],
            [
              "Signed, not on a change order",
              `${s.signedNotOnChangeOrder} · ${formatCents(s.signedNotOnChangeOrderCents)}${s.signedNotOnChangeOrderUnpriced ? ` + ${s.signedNotOnChangeOrderUnpriced} unpriced` : ""}`,
            ],
            ["Man-hours of extra work", qtyText(s.manHours)],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="card">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="text-xl font-semibold tabular-nums">{n}</div>
          </div>
        ))}
      </div>
      {s.oldestSignedNotOnChangeOrder && (
        <p className="text-sm text-amber-800">
          Signed work from {s.oldestSignedNotOnChangeOrder} is not on a change order yet. Most
          subcontracts set a deadline to submit extra work; tick the tickets below to bill them.
        </p>
      )}

      <RateSheetPanel
        base={base}
        sheet={d.rateSheet}
        draft={d.rateSheetDraft}
        canEdit={d.canEdit}
        onSaved={refresh}
      />

      {d.canEdit && !form && (
        <button
          type="button"
          className="btn"
          onClick={() =>
            setForm(
              emptyTmForm(
                d.nextNumber,
                today,
                d.rateSheet || latest ? startingMarkups(d.rateSheet, latest) : undefined,
              ),
            )
          }
        >
          New T&amp;M ticket
        </button>
      )}

      {form && (
        <section className="card space-y-2">
          <h2 className="font-semibold">New T&amp;M ticket</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate(form);
            }}
          >
            <Fields
              form={form}
              set={setForm}
              rates={d.rates}
              signed={false}
              fromSheet={!!d.rateSheet}
            />
            <div className="flex gap-2">
              <button type="submit" className="btn" disabled={add.isPending}>
                Save ticket
              </button>
              <button type="button" className="btn-secondary" onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
            <ErrorText error={add.error} />
          </form>
        </section>
      )}

      {billed && (
        <p className="card text-sm">
          Change order {billed.number} for {formatCents(billed.amountCents)} is saved as pending on
          the{" "}
          <Link
            to="/orgs/$orgId/projects/$projectId"
            params={{ orgId, projectId }}
            className="underline"
          >
            job page
          </Link>
          .{" "}
          <a
            className="underline"
            href={`${base}/change-order/${encodeURIComponent(billed.id)}/backup.pdf`}
          >
            Download the signed tickets as its backup
          </a>
          .
        </p>
      )}

      {d.canEdit && picked.size > 0 && (
        <section className="card space-y-2 text-sm">
          <h2 className="font-semibold">
            Bill {picked.size} ticket{picked.size > 1 ? "s" : ""} on a change order (
            {formatCents(pickedTotal)})
          </h2>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              bill.mutate();
            }}
          >
            <label>
              Change order no.
              <input
                className="input block w-28"
                placeholder={d.suggestedChangeOrderNumber}
                value={co.number}
                onChange={(e) => setCo({ ...co, number: e.target.value })}
              />
            </label>
            <label>
              Schedule-of-values line
              <select
                className="input block w-64"
                value={co.target}
                onChange={(e) => setCo({ ...co, target: e.target.value })}
              >
                <option value="new">A new line for this change order</option>
                {d.sovLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.itemNumber} {l.description}
                  </option>
                ))}
              </select>
            </label>
            {co.target === "new" && (
              <label>
                New line's item no.
                <input
                  className="input block w-28"
                  placeholder={`CO ${co.number.trim() || d.suggestedChangeOrderNumber}`}
                  value={co.itemNumber}
                  onChange={(e) => setCo({ ...co, itemNumber: e.target.value })}
                />
              </label>
            )}
            <label>
              Sent to the GC (optional)
              <input
                type="date"
                className="input block"
                value={co.sent}
                onChange={(e) => setCo({ ...co, sent: e.target.value })}
              />
            </label>
            <button type="submit" className="btn" disabled={bill.isPending}>
              Create the change order
            </button>
          </form>
          <p className="text-xs text-slate-500">
            It is saved as pending, like any change order, and counts in pay applications once the
            GC approves it.
          </p>
          <ErrorText error={bill.error} />
        </section>
      )}

      <section className="card space-y-2 overflow-x-auto">
        <ErrorText error={save.error ?? remove.error ?? sign.error ?? unsign.error} />
        <table className="w-full">
          <thead>
            <tr>
              {d.canEdit && (
                <th className="th">
                  <span className="sr-only">Bill on a change order</span>
                </th>
              )}
              <th className="th">No.</th>
              <th className="th">Date</th>
              <th className="th">Work</th>
              <th className="th text-right">Man-hours</th>
              <th className="th text-right">Total</th>
              <th className="th">Stage</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {d.items.map((t) => {
              const cols = d.canEdit ? 8 : 7;
              return (
                <Fragment key={t.id}>
                  <tr>
                    {d.canEdit && (
                      <td className="td">
                        <input
                          type="checkbox"
                          aria-label={`Bill ${tmLabel(t.number)} on a change order`}
                          disabled={!canBill(t)}
                          title={
                            canBill(t)
                              ? ""
                              : t.stage === "signed"
                                ? "Price every line first"
                                : STAGE_LABEL[t.stage]
                          }
                          checked={picked.has(t.id)}
                          onChange={(e) => {
                            const next = new Set(picked);
                            if (e.target.checked) next.add(t.id);
                            else next.delete(t.id);
                            setPicked(next);
                            setBilled(null);
                          }}
                        />
                      </td>
                    )}
                    <td className="td whitespace-nowrap">
                      <button
                        type="button"
                        className="font-medium underline"
                        aria-expanded={open === t.id}
                        onClick={() => setOpen(open === t.id ? null : t.id)}
                      >
                        {t.number}
                      </button>
                    </td>
                    <td className="td whitespace-nowrap">{t.workDate}</td>
                    <td className="td max-w-xs truncate">{t.description}</td>
                    <td className="td text-right tabular-nums">{qtyText(t.pricing.manHours)}</td>
                    <td className="td text-right tabular-nums">
                      {t.pricing.totalCents === null
                        ? "not priced"
                        : formatCents(t.pricing.totalCents)}
                    </td>
                    <td className="td">
                      {STAGE_LABEL[t.stage]}
                      {t.changeOrderNumber ? ` (CO ${t.changeOrderNumber})` : ""}
                    </td>
                    <td className="td whitespace-nowrap text-right">
                      <a
                        className="underline"
                        href={`${base}/${encodeURIComponent(t.id)}/ticket.pdf`}
                      >
                        PDF
                      </a>
                      {" · "}
                      <a
                        className="underline"
                        href={`${base}/${encodeURIComponent(t.id)}/ticket.pdf?prices=0`}
                      >
                        Field copy
                      </a>
                      {t.fileCount > 0 && (
                        <>
                          {" · "}
                          <a
                            className="underline"
                            href={`${base}/${encodeURIComponent(t.id)}/packet.pdf`}
                            title="The priced ticket, an index, then its photos and files in one PDF"
                          >
                            PDF + photos
                          </a>
                        </>
                      )}
                      {" · "}
                      <button
                        type="button"
                        className="underline"
                        aria-expanded={filesOf === t.id}
                        onClick={() => setFilesOf(filesOf === t.id ? null : t.id)}
                      >
                        {t.fileCount > 0
                          ? `Photos (${t.fileCount})`
                          : d.canEdit
                            ? "Add photos"
                            : "Photos"}
                      </button>
                      {d.canEdit && !t.changeOrderId && (
                        <>
                          {" · "}
                          <button
                            type="button"
                            className="underline"
                            onClick={() =>
                              setEditing({ id: t.id, form: tmFormOf(t), signed: !!t.signedName })
                            }
                          >
                            Edit
                          </button>
                          {" · "}
                          {t.signedName ? (
                            <button
                              type="button"
                              className="underline"
                              disabled={unsign.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Take ${t.signedName}'s signature off ${tmLabel(t.number)}? It has to be signed again.`,
                                  )
                                )
                                  unsign.mutate(t);
                              }}
                            >
                              Unsign
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="underline"
                              onClick={() => setSigning(t.id)}
                            >
                              Sign
                            </button>
                          )}
                          {" · "}
                          <button
                            type="button"
                            className="underline"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (window.confirm(`Delete ${tmLabel(t.number)}?`)) remove.mutate(t);
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {t.changeOrderId && (
                        <>
                          {" · "}
                          <a
                            className="underline"
                            href={`${base}/change-order/${encodeURIComponent(t.changeOrderId)}/backup.pdf`}
                          >
                            CO backup
                          </a>
                          {" · "}
                          <a
                            className="underline"
                            href={`${base}/change-order/${encodeURIComponent(t.changeOrderId)}/backup-with-files.pdf`}
                            title="Every ticket on the change order, then each ticket's photos and files, in one PDF"
                          >
                            CO backup + photos
                          </a>
                        </>
                      )}
                    </td>
                  </tr>
                  {editing?.id === t.id && (
                    <tr>
                      <td className="td" colSpan={cols}>
                        <form
                          className="space-y-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            save.mutate(editing);
                          }}
                        >
                          <Fields
                            form={editing.form}
                            set={(f) => setEditing({ ...editing, form: f })}
                            rates={d.rates}
                            signed={editing.signed}
                            fromSheet={!!d.rateSheet}
                          />
                          <div className="flex gap-2">
                            <button type="submit" className="btn" disabled={save.isPending}>
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                  {signing === t.id && (
                    <tr>
                      <td className="td bg-slate-50" colSpan={cols}>
                        <SignForm
                          t={t}
                          today={today}
                          pending={sign.isPending}
                          onCancel={() => setSigning(null)}
                          onSign={(body) => sign.mutate({ id: t.id, body })}
                        />
                      </td>
                    </tr>
                  )}
                  {open === t.id && editing?.id !== t.id && (
                    <tr>
                      <td className="td bg-slate-50" colSpan={cols}>
                        <TicketBody t={t} base={base} sheet={d.rateSheet} />
                      </td>
                    </tr>
                  )}
                  {filesOf === t.id && editing?.id !== t.id && (
                    <tr>
                      <td className="td bg-slate-50" colSpan={cols}>
                        <AttachmentsPanel
                          base={`${base}/${encodeURIComponent(t.id)}`}
                          holder="tmTicket"
                          embedded
                          onChanged={refresh}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {d.items.length === 0 && (
              <tr>
                <td className="td text-slate-500" colSpan={d.canEdit ? 8 : 7}>
                  No T&amp;M tickets on this job yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {d.canEdit && billable.length > 1 && picked.size === 0 && (
          <button
            type="button"
            className="text-sm underline"
            onClick={() => setPicked(new Set(billable.map((t) => t.id)))}
          >
            Tick every signed, priced ticket ({billable.length})
          </button>
        )}
      </section>
      <p className="text-xs text-slate-500">{TM_TICKETS_NOTE}</p>
    </div>
  );
}
