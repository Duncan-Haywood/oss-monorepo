// /orgs/$orgId/estimates and /orgs/$orgId/estimates/$estimateId: the company's bids. Price a job
// from cost lines (labor, material, equipment, subcontract, other) rolled into bid items, with markup
// by category and tax on material; download the proposal for the GC; mark it sent, lost or won. A won
// bid becomes the job, its bid items the schedule of values and (on Crew and up) their cost the job's
// budgets, so billing and job costing start from the numbers it was bid on. A bid item can be an add or
// deduct alternate; the GC's accepted ones are ticked when it is won and decide the job's lines.
import type {
  EstimateDetailDto,
  EstimateListDto,
  EstimateSummaryDto,
  PriceItemDto,
  PriceListDto,
  PriceMergeDto,
  ProjectDto,
} from "@shared/api/types";
import {
  ALTERNATE_KIND_LABELS,
  type AlternateKind,
  type Alternates,
  alternatesFor,
  bidItemKey,
  computeEstimate,
  ESTIMATE_STATUS_LABELS,
  type EstimateLineInput,
  type EstimateRates,
  jobFromEstimate,
  MAX_ESTIMATE_LINES,
  MAX_MARKUP_BPS,
} from "@shared/estimate";
import type { ImportedEstimateLine } from "@shared/estimate-import";
import { COST_CATEGORIES, COST_CATEGORY_LABELS, type CostCategory } from "@shared/job-cost";
import { formatBps, formatCents, parsePercentToBps } from "@shared/money";
import { itemsFromLines, linesOnList, priceKey, searchItems } from "@shared/price-list";
import {
  extendCents,
  formatUnitPrice,
  parseQuantity,
  parseUnitPrice,
  quantityDecimal,
  unitPriceDecimal,
} from "@shared/unit-price";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ErrorText } from "../components/error";
import { EstimateEmailDraft } from "../components/estimate-email";
import { EstimateImport } from "../components/estimate-import";
import { meQuery } from "../components/layout";
import { api, orgPath } from "../lib/api";
import { mergeMessage } from "./price-list";

const STATUS_CLASS: Record<EstimateSummaryDto["status"], string> = {
  draft: "text-slate-500",
  sent: "text-slate-800",
  won: "font-semibold text-green-700",
  lost: "text-slate-400 line-through",
};

const MARKUP_KEYS: Record<CostCategory, keyof NewEstimate> = {
  labor: "laborMarkup",
  material: "materialMarkup",
  equipment: "equipmentMarkup",
  subcontract: "subcontractMarkup",
  other: "otherMarkup",
};

export interface NewEstimate {
  name: string;
  gcName: string;
  gcContactName: string;
  gcContactEmail: string;
  location: string;
  bidDueOn: string;
  validDays: string;
  laborMarkup: string;
  materialMarkup: string;
  equipmentMarkup: string;
  subcontractMarkup: string;
  otherMarkup: string;
  materialTax: string;
  inclusions: string;
  exclusions: string;
  notes: string;
}

export const blank: NewEstimate = {
  name: "",
  gcName: "",
  gcContactName: "",
  gcContactEmail: "",
  location: "",
  bidDueOn: "",
  validDays: "30",
  laborMarkup: "",
  materialMarkup: "",
  equipmentMarkup: "",
  subcontractMarkup: "",
  otherMarkup: "",
  materialTax: "",
  inclusions: "",
  exclusions: "",
  notes: "",
};

const pct = (bps: number) => (bps ? formatBps(bps).replace("%", "") : "");

function formOf(e: EstimateDetailDto): NewEstimate {
  return {
    name: e.name,
    gcName: e.gcName,
    gcContactName: e.gcContactName ?? "",
    gcContactEmail: e.gcContactEmail ?? "",
    location: e.location ?? "",
    bidDueOn: e.bidDueOn ?? "",
    validDays: String(e.validDays),
    laborMarkup: pct(e.markupBps.labor),
    materialMarkup: pct(e.markupBps.material),
    equipmentMarkup: pct(e.markupBps.equipment),
    subcontractMarkup: pct(e.markupBps.subcontract),
    otherMarkup: pct(e.markupBps.other),
    materialTax: pct(e.materialTaxBps),
    inclusions: e.inclusions ?? "",
    exclusions: e.exclusions ?? "",
    notes: e.notes ?? "",
  };
}

/** The form as the API body, or the first problem to show. */
export function bodyOf(f: NewEstimate): { body: Record<string, unknown> } | { problem: string } {
  if (!f.name.trim()) return { problem: "Name the job." };
  if (!f.gcName.trim()) return { problem: "Enter the general contractor." };
  const markups: Record<string, number> = {};
  for (const c of COST_CATEGORIES) {
    const v = f[MARKUP_KEYS[c]].trim();
    // Markup can be over 100% (a small service line often is), up to the API's 500%.
    const bps = v === "" ? 0 : parsePercentToBps(v, MAX_MARKUP_BPS);
    if (bps === null)
      return {
        problem: `${COST_CATEGORY_LABELS[c]} markup: enter a percent from 0 to ${MAX_MARKUP_BPS / 100}.`,
      };
    markups[`${c}MarkupBps`] = bps;
  }
  const tax = f.materialTax.trim() === "" ? 0 : parsePercentToBps(f.materialTax);
  if (tax === null) return { problem: "Tax on material: enter a percent." };
  const days = Number(f.validDays || "30");
  if (!Number.isInteger(days) || days < 1 || days > 365)
    return { problem: "Open for acceptance: 1 to 365 days." };
  return {
    body: {
      name: f.name.trim(),
      gcName: f.gcName.trim(),
      gcContactName: f.gcContactName.trim() || null,
      gcContactEmail: f.gcContactEmail.trim() || null,
      location: f.location.trim() || null,
      bidDueOn: f.bidDueOn || null,
      validDays: days,
      ...markups,
      materialTaxBps: tax,
      inclusions: f.inclusions.trim() || null,
      exclusions: f.exclusions.trim() || null,
      notes: f.notes.trim() || null,
    },
  };
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{props.label}</span>
      <input
        className="input"
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

function HeaderFields(props: { f: NewEstimate; set: (f: NewEstimate) => void; full?: boolean }) {
  const { f, set } = props;
  const bind = (k: keyof NewEstimate) => ({
    value: f[k],
    onChange: (v: string) => set({ ...f, [k]: v }),
  });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Job name" {...bind("name")} placeholder="Riverside Clinic, mechanical" />
      <Field label="General contractor" {...bind("gcName")} />
      <Field label="GC estimator or PM" {...bind("gcContactName")} />
      <Field label="Their email" type="email" {...bind("gcContactEmail")} />
      <Field label="Job location" {...bind("location")} />
      <Field label="Bid due" type="date" {...bind("bidDueOn")} />
      {props.full && (
        <>
          <Field label="Open for acceptance (days)" {...bind("validDays")} />
          <Field label="Sales tax you pay on material (%)" {...bind("materialTax")} />
          <div className="sm:col-span-2">
            <div className="text-sm text-slate-600">Markup by category (%)</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {COST_CATEGORIES.map((c) => (
                <Field key={c} label={COST_CATEGORY_LABELS[c]} {...bind(MARKUP_KEYS[c])} />
              ))}
            </div>
          </div>
          {(["inclusions", "exclusions", "notes"] as const).map((k) => (
            <label key={k} className="block text-sm sm:col-span-2">
              <span className="text-slate-600">
                {k === "inclusions" ? "Includes" : k === "exclusions" ? "Excludes" : "Notes"} (on
                the proposal)
              </span>
              <textarea
                className="input min-h-16"
                value={f[k]}
                onChange={(e) => set({ ...f, [k]: e.target.value })}
              />
            </label>
          ))}
        </>
      )}
    </div>
  );
}

export function EstimatesPage() {
  const { orgId } = useParams({ from: "/orgs/$orgId/estimates" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["estimates", orgId],
    queryFn: () => api<EstimateListDto>(orgPath(orgId, "/estimates")),
  });
  const [f, setF] = useState<NewEstimate>(blank);
  const [problem, setProblem] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<EstimateDetailDto>(orgPath(orgId, "/estimates"), { method: "POST", body }),
    onSuccess: async (e) => {
      await qc.invalidateQueries({ queryKey: ["estimates", orgId] });
      await navigate({
        to: "/orgs/$orgId/estimates/$estimateId",
        params: { orgId, estimateId: e.id },
      });
    },
  });
  const p = q.data?.pipeline;
  return (
    <div className="space-y-4">
      <div>
        <Link to="/orgs/$orgId" params={{ orgId }} className="text-sm text-slate-600 underline">
          ← Projects
        </Link>
        <h1 className="text-2xl font-semibold">Estimates</h1>
        <p className="text-sm text-slate-600">
          Price a bid from your costs, send the GC a proposal, and when you win it the job starts
          with its schedule of values (and, on Crew and up, its cost budgets) already in. Prices and
          rates you reuse live on the{" "}
          <Link to="/orgs/$orgId/price-list" params={{ orgId }} className="underline">
            price list
          </Link>
          .
        </p>
      </div>
      {p && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card">
            <div className="text-xs uppercase tracking-wide text-slate-500">Open bids</div>
            <div className="text-xl font-semibold tabular-nums">
              {p.openCount} · {formatCents(p.openPriceCents)}
            </div>
          </div>
          <div className="card">
            <div className="text-xs uppercase tracking-wide text-slate-500">Won / lost</div>
            <div className="text-xl font-semibold tabular-nums">
              {p.wonCount} / {p.lostCount}
            </div>
          </div>
          <div className="card">
            <div className="text-xs uppercase tracking-wide text-slate-500">Hit rate</div>
            <div className="text-xl font-semibold tabular-nums">
              {p.wonCount + p.lostCount === 0
                ? "—"
                : `${Math.round((100 * p.wonCount) / (p.wonCount + p.lostCount))}%`}
            </div>
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-x-auto lg:col-span-2">
          {q.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          <ErrorText error={q.error} />
          {q.data?.items.length === 0 && (
            <p className="text-sm text-slate-600">No estimates yet. Start one with the form.</p>
          )}
          {q.data && q.data.items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1">No.</th>
                  <th>Job</th>
                  <th>GC</th>
                  <th>Due</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="py-1 tabular-nums">{e.label}</td>
                    <td>
                      <Link
                        to="/orgs/$orgId/estimates/$estimateId"
                        params={{ orgId, estimateId: e.id }}
                        className="underline"
                      >
                        {e.name}
                      </Link>
                    </td>
                    <td>{e.gcName}</td>
                    <td className="tabular-nums">{e.bidDueOn ?? "—"}</td>
                    <td className="text-right tabular-nums">{formatCents(e.totals.priceCents)}</td>
                    <td className={`text-right ${STATUS_CLASS[e.status]}`}>
                      {ESTIMATE_STATUS_LABELS[e.status]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card space-y-3">
          <h2 className="font-semibold">New estimate</h2>
          <HeaderFields f={f} set={setF} />
          <button
            type="button"
            className="btn"
            disabled={create.isPending}
            onClick={() => {
              const r = bodyOf(f);
              if ("problem" in r) return setProblem(r.problem);
              setProblem(null);
              create.mutate(r.body);
            }}
          >
            {create.isPending ? "Adding…" : "Start the estimate"}
          </button>
          {problem && <p className="text-sm text-red-700">{problem}</p>}
          <ErrorText error={create.error} />
        </section>
      </div>
    </div>
  );
}

export interface LineForm {
  key: number;
  bidItem: string;
  category: CostCategory;
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
}

let lineKey = 0;
const lineFormOf = (l: EstimateDetailDto["lines"][number]): LineForm => ({
  key: ++lineKey,
  bidItem: l.bidItem,
  category: l.category,
  description: l.description,
  quantity: quantityDecimal(l.quantityMilli),
  unit: l.unit ?? "",
  unitCost: unitPriceDecimal(l.unitCostMicros),
});

const isBlank = (r: LineForm) =>
  !r.bidItem.trim() && !r.description.trim() && !r.quantity.trim() && !r.unitCost.trim();

/** The editor's rows with imported lines added after the last row that has anything in it. */
export function withImported(rows: LineForm[], lines: ImportedEstimateLine[]): LineForm[] {
  let end = rows.length;
  while (end > 0 && isBlank(rows[end - 1] as LineForm)) end -= 1;
  return [
    ...rows.slice(0, end),
    ...lines.map((l) => ({
      key: ++lineKey,
      bidItem: l.bidItem,
      category: l.category,
      description: l.description,
      quantity: quantityDecimal(l.quantityMilli),
      unit: l.unit ?? "",
      unitCost: unitPriceDecimal(l.unitCostMicros),
    })),
  ].slice(0, MAX_ESTIMATE_LINES);
}

/** A price-list item as a new editor row under the given bid item; the quantity is left to type. */
export function rowFromPrice(item: PriceItemDto, bidItem: string): LineForm {
  return {
    key: ++lineKey,
    bidItem,
    category: item.category,
    description: item.description,
    quantity: "",
    unit: item.unit ?? "",
    unitCost: unitPriceDecimal(item.unitCostMicros),
  };
}

/**
 * The rows with each one that matches a price-list item (category, description and unit) set to the
 * item's cost, and how many changed: "Use list prices" on an older estimate.
 */
export function withListPrices(
  rows: LineForm[],
  items: PriceItemDto[],
): { rows: LineForm[]; changed: number } {
  const byKey = new Map(items.map((i) => [priceKey(i), i]));
  let changed = 0;
  const out = rows.map((r) => {
    if (isBlank(r)) return r;
    const i = byKey.get(priceKey({ ...r, unit: r.unit || null }));
    if (!i || parseUnitPrice(r.unitCost || "0") === i.unitCostMicros) return r;
    changed += 1;
    return { ...r, unitCost: unitPriceDecimal(i.unitCostMicros) };
  });
  return { rows: out, changed };
}

/** Lines as the API takes them, or the first line that does not read. */
export function parseLines(rows: LineForm[]): { lines: EstimateLineInput[] } | { problem: string } {
  const lines: EstimateLineInput[] = [];
  for (const [i, r] of rows.entries()) {
    if (isBlank(r)) continue;
    const q = parseQuantity(r.quantity || "0");
    const u = parseUnitPrice(r.unitCost || "0");
    if (!r.bidItem.trim()) return { problem: `Line ${i + 1}: name its bid item.` };
    if (q === null || q < 0) return { problem: `Line ${i + 1}: the quantity does not read.` };
    if (u === null) return { problem: `Line ${i + 1}: the unit cost does not read.` };
    lines.push({
      bidItem: r.bidItem.trim(),
      category: r.category,
      description: r.description.trim(),
      quantityMilli: q,
      unit: r.unit.trim() || null,
      unitCostMicros: u,
    });
  }
  return { lines };
}

export function EstimatePage() {
  const { orgId, estimateId } = useParams({ from: "/orgs/$orgId/estimates/$estimateId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const path = orgPath(orgId, `/estimates/${estimateId}`);
  const q = useQuery({
    queryKey: ["estimate", orgId, estimateId],
    queryFn: () => api<EstimateDetailDto>(path),
  });
  const [f, setF] = useState<NewEstimate | null>(null);
  const [rows, setRows] = useState<LineForm[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [win, setWin] = useState<{
    contractDate: string;
    retainage: string;
    accepted: string[];
  } | null>(null);
  const [alts, setAlts] = useState<Alternates | null>(null);
  const [pick, setPick] = useState<{ query: string; category: CostCategory | "" } | null>(null);
  const [listNote, setListNote] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const me = useQuery(meQuery);
  const from = {
    name: me.data?.user.name ?? "",
    company: me.data?.memberships.find((m) => m.orgId === orgId)?.orgName ?? "",
  };
  const prices = useQuery({
    queryKey: ["price-list", orgId],
    queryFn: () => api<PriceListDto>(orgPath(orgId, "/price-list")),
  });
  const toList = useMutation({
    mutationFn: (items: Record<string, unknown>[]) =>
      api<PriceMergeDto>(orgPath(orgId, "/price-list/merge"), { method: "POST", body: { items } }),
    onSuccess: (r) => {
      setListNote(mergeMessage(r));
      qc.setQueryData(["price-list", orgId], r.list);
    },
  });
  useEffect(() => {
    if (q.data && f === null) setF(formOf(q.data));
    if (q.data && rows === null) setRows(q.data.lines.map(lineFormOf));
    if (q.data && alts === null) setAlts(q.data.alternates);
  }, [q.data, f, rows, alts]);

  const refresh = async (e: EstimateDetailDto) => {
    qc.setQueryData(["estimate", orgId, estimateId], e);
    await qc.invalidateQueries({ queryKey: ["estimates", orgId] });
  };
  const saveHeader = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<EstimateDetailDto>(path, { method: "PATCH", body }),
    onSuccess: refresh,
  });
  const saveLines = useMutation({
    mutationFn: (body: { lines: EstimateLineInput[]; alternates: Alternates }) =>
      api<EstimateDetailDto>(`${path}/lines`, {
        method: "PUT",
        body: {
          lines: body.lines,
          alternates: Object.entries(body.alternates).map(([bidItem, kind]) => ({ bidItem, kind })),
        },
      }),
    onSuccess: async (e) => {
      setRows(e.lines.map(lineFormOf));
      setAlts(e.alternates);
      await refresh(e);
    },
  });
  const markWon = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ estimate: EstimateDetailDto; project: ProjectDto; budgetsSet: boolean }>(
        `${path}/win`,
        { method: "POST", body },
      ),
    onSuccess: async (r) => {
      await refresh(r.estimate);
      await qc.invalidateQueries({ queryKey: ["projects", orgId] });
      await navigate({
        to: "/orgs/$orgId/projects/$projectId",
        params: { orgId, projectId: r.project.id },
      });
    },
  });
  const remove = useMutation({
    mutationFn: () => api(path, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["estimates", orgId] });
      await navigate({ to: "/orgs/$orgId/estimates", params: { orgId } });
    },
  });

  if (q.error) return <ErrorText error={q.error} />;
  if (!q.data || !f || !rows || !alts) return <p className="text-sm text-slate-500">Loading…</p>;
  const e = q.data;
  const locked = e.status === "won";

  // Live totals from what is typed, with the saved rates (the header form saves them).
  const parsed = parseLines(rows);
  const rates: EstimateRates = { markupBps: e.markupBps, materialTaxBps: e.materialTaxBps };
  const liveAlts = "lines" in parsed ? alternatesFor(parsed.lines, alts) : e.alternates;
  const live = "lines" in parsed ? computeEstimate(parsed.lines, rates, liveAlts) : null;
  const shown = live ?? { bidItems: e.bidItems, totals: e.totals, lineCostCents: [] };
  const sameAlts = (a: Alternates, b: Alternates) =>
    JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  const hasAlternates = shown.bidItems.some((b) => b.alternate);
  const setAlt = (description: string, kind: AlternateKind | "") => {
    const next = { ...alts };
    if (kind) next[bidItemKey(description)] = kind;
    else delete next[bidItemKey(description)];
    setAlts(next);
  };
  const savedAlternates = e.bidItems.filter((b) => b.alternate);
  const job = win
    ? jobFromEstimate({ bidItems: e.bidItems, totals: e.totals, lineCostCents: [] }, win.accepted)
    : null;
  const dirtyLines =
    "lines" in parsed &&
    (!sameAlts(liveAlts, e.alternates) ||
      JSON.stringify(parsed.lines) !==
        JSON.stringify(
          e.lines.map((l) => ({
            bidItem: l.bidItem,
            category: l.category,
            description: l.description,
            quantityMilli: l.quantityMilli,
            unit: l.unit,
            unitCostMicros: l.unitCostMicros,
          })),
        ));
  const setRow = (i: number, patch: Partial<LineForm>) =>
    setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const lastItem = rows.length ? (rows[rows.length - 1]?.bidItem ?? "") : "";
  const listItems = prices.data?.items ?? [];
  const listPrices = withListPrices(rows, listItems);
  const onList = "lines" in parsed ? linesOnList(parsed.lines, listItems) : 0;

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/orgs/$orgId/estimates"
          params={{ orgId }}
          className="text-sm text-slate-600 underline"
        >
          ← Estimates
        </Link>
        <h1 className="text-2xl font-semibold">
          {e.label}: {e.name}
        </h1>
        <p className="text-sm text-slate-600">
          <span className={STATUS_CLASS[e.status]}>{ESTIMATE_STATUS_LABELS[e.status]}</span>
          {e.sentOn && ` · sent ${e.sentOn}`}
          {e.decidedOn && ` · decided ${e.decidedOn}`} ·{" "}
          <a className="underline" href={`${path}/proposal.pdf`}>
            Proposal PDF
          </a>
          {e.projectId && (
            <>
              {" · "}
              <Link
                to="/orgs/$orgId/projects/$projectId"
                params={{ orgId, projectId: e.projectId }}
                className="underline"
              >
                Open the job
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Cost", shown.totals.costCents],
          ["Tax on material", shown.totals.taxCents],
          ["Markup", shown.totals.markupCents],
          [hasAlternates ? "Base bid" : "Bid price", shown.totals.priceCents],
        ].map(([label, cents]) => (
          <div key={label as string} className="card">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="text-xl font-semibold tabular-nums">{formatCents(cents as number)}</div>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-600">
        Margin on the price:{" "}
        {shown.totals.marginBps === null ? "—" : formatBps(shown.totals.marginBps)}
        {dirtyLines && " (unsaved lines)"}
        {hasAlternates &&
          ` · add alternates ${formatCents(shown.totals.addAlternatesCents)}, deduct alternates ${formatCents(shown.totals.deductAlternatesCents)}`}
      </p>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Cost lines</h2>
        <p className="mb-2 text-xs text-slate-500">
          Lines with the same bid item add up to one line on the proposal, and one line of the job's
          schedule of values when you win.
        </p>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th>Bid item</th>
              <th>Category</th>
              <th>Description</th>
              <th className="text-right">Qty</th>
              <th>Unit</th>
              <th className="text-right">Unit cost</th>
              <th className="text-right">Cost</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const qty = parseQuantity(r.quantity || "0");
              const unit = parseUnitPrice(r.unitCost || "0");
              const cost = qty !== null && unit !== null ? extendCents(qty, unit) : null;
              return (
                <tr key={r.key} className="border-t border-slate-100">
                  <td>
                    <input
                      className="input"
                      disabled={locked}
                      value={r.bidItem}
                      onChange={(ev) => setRow(i, { bidItem: ev.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="input"
                      disabled={locked}
                      value={r.category}
                      onChange={(ev) => setRow(i, { category: ev.target.value as CostCategory })}
                    >
                      {COST_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {COST_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      disabled={locked}
                      value={r.description}
                      onChange={(ev) => setRow(i, { description: ev.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input w-24 text-right"
                      disabled={locked}
                      inputMode="decimal"
                      value={r.quantity}
                      onChange={(ev) => setRow(i, { quantity: ev.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input w-16"
                      disabled={locked}
                      value={r.unit}
                      onChange={(ev) => setRow(i, { unit: ev.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input w-28 text-right"
                      disabled={locked}
                      inputMode="decimal"
                      value={r.unitCost}
                      onChange={(ev) => setRow(i, { unitCost: ev.target.value })}
                    />
                  </td>
                  <td className="text-right tabular-nums">
                    {cost === null ? "—" : formatCents(cost)}
                  </td>
                  <td>
                    {!locked && (
                      <button
                        type="button"
                        className="text-xs text-slate-500 underline"
                        onClick={() => setRows(rows.filter((_, k) => k !== i))}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!locked && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setRows([
                  ...rows,
                  {
                    key: ++lineKey,
                    bidItem: lastItem,
                    category: "labor",
                    description: "",
                    quantity: "",
                    unit: "",
                    unitCost: "",
                  },
                ])
              }
            >
              Add a line
            </button>
            <button
              type="button"
              className="btn"
              disabled={saveLines.isPending || !dirtyLines}
              onClick={() => {
                const r = parseLines(rows);
                if ("problem" in r) return setProblem(r.problem);
                setProblem(null);
                saveLines.mutate({ lines: r.lines, alternates: alternatesFor(r.lines, alts) });
              }}
            >
              {saveLines.isPending ? "Saving…" : "Save lines"}
            </button>
            {"problem" in parsed && <span className="text-sm text-red-700">{parsed.problem}</span>}
          </div>
        )}
        {!locked && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPick(pick ? null : { query: "", category: "" })}
            >
              Add from the price list
            </button>
            {listPrices.changed > 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setRows(listPrices.rows);
                  setListNote(
                    `${listPrices.changed} line${listPrices.changed === 1 ? "" : "s"} set to the list's price. Check them, then Save lines.`,
                  );
                }}
              >
                Use list prices ({listPrices.changed} differ)
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              disabled={toList.isPending || !("lines" in parsed) || parsed.lines.length === 0}
              onClick={() => {
                if (!("lines" in parsed)) return;
                toList.mutate(
                  itemsFromLines(parsed.lines).map(({ code: _c, note: _n, ...x }) => x),
                );
              }}
            >
              {toList.isPending ? "Saving…" : "Save lines to the price list"}
            </button>
            {prices.data && "lines" in parsed && parsed.lines.length > 0 && (
              <span className="text-xs text-slate-500">
                {onList} of {parsed.lines.length} lines are on your{" "}
                <Link to="/orgs/$orgId/price-list" params={{ orgId }} className="underline">
                  price list
                </Link>
              </span>
            )}
          </div>
        )}
        {!locked && listNote && <p className="mt-1 text-sm text-emerald-700">{listNote}</p>}
        <ErrorText error={toList.error} />
        {!locked && pick && (
          <div className="mt-2 space-y-2 rounded border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-xs text-slate-500">Search the price list</span>
                <input
                  className="input"
                  // biome-ignore lint/a11y/noAutofocus: the picker was just opened to type in
                  autoFocus
                  value={pick.query}
                  onChange={(ev) => setPick({ ...pick, query: ev.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Category</span>
                <select
                  className="input"
                  value={pick.category}
                  onChange={(ev) =>
                    setPick({ ...pick, category: ev.target.value as CostCategory | "" })
                  }
                >
                  <option value="">All</option>
                  {COST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {COST_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs text-slate-500">
                Added under bid item "{lastItem || "Base bid"}"; type the quantity after.
              </span>
            </div>
            {listItems.length === 0 ? (
              <p className="text-slate-500">
                The price list is empty.{" "}
                <Link to="/orgs/$orgId/price-list" params={{ orgId }} className="underline">
                  Add prices
                </Link>{" "}
                or save this estimate's lines to it.
              </p>
            ) : (
              <ul className="max-h-64 divide-y divide-slate-100 overflow-auto">
                {searchItems(listItems, pick.query, pick.category || null)
                  .slice(0, 50)
                  .map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-1">
                      <span>
                        <span className="text-slate-500">{COST_CATEGORY_LABELS[i.category]}</span>{" "}
                        {i.description}
                        {i.code && <span className="text-slate-500"> ({i.code})</span>}
                      </span>
                      <span className="flex items-center gap-3 tabular-nums">
                        {formatUnitPrice(i.unitCostMicros)}
                        {i.unit ? ` / ${i.unit}` : ""}
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() =>
                            setRows(
                              withImported(rows, []).concat(
                                rowFromPrice(i, lastItem || "Base bid"),
                              ),
                            )
                          }
                        >
                          Add
                        </button>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
        {!locked && (
          <div className="mt-2">
            <EstimateImport
              existingLines={rows.filter((r) => !isBlank(r)).length}
              defaultBidItem={lastItem || "Base bid"}
              onAdd={(lines) => setRows(withImported(rows, lines))}
            />
          </div>
        )}
        <ErrorText error={saveLines.error} />
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Bid items (the proposal)</h2>
        <p className="mb-2 text-xs text-slate-500">
          An add alternate is priced on the proposal but left out of the base bid; a deduct
          alternate is in the base bid and comes out if the GC takes the deduction. For a
          substitution, deduct the base item and add its replacement.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th>Item</th>
              <th>Description</th>
              <th>In the bid</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Tax</th>
              <th className="text-right">Markup</th>
              <th className="text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {shown.bidItems.map((b) => (
              <tr key={b.itemNumber} className="border-t border-slate-100">
                <td className="tabular-nums">{b.itemNumber}</td>
                <td>{b.description}</td>
                <td>
                  <select
                    className="input"
                    aria-label={`${b.description}: base bid or alternate`}
                    disabled={locked}
                    value={b.alternate ?? ""}
                    onChange={(ev) => setAlt(b.description, ev.target.value as AlternateKind | "")}
                  >
                    <option value="">Base bid</option>
                    <option value="add">{ALTERNATE_KIND_LABELS.add}</option>
                    <option value="deduct">{ALTERNATE_KIND_LABELS.deduct}</option>
                  </select>
                  {b.alternateNumber !== null && (
                    <span className="ml-1 text-xs text-slate-500">
                      No. {b.alternateNumber}
                      {locked &&
                        (e.acceptedAlternates.includes(bidItemKey(b.description))
                          ? " · accepted"
                          : " · not taken")}
                    </span>
                  )}
                </td>
                <td className="text-right tabular-nums">{formatCents(b.costCents)}</td>
                <td className="text-right tabular-nums">{formatCents(b.taxCents)}</td>
                <td className="text-right tabular-nums">{formatCents(b.markupCents)}</td>
                <td className="text-right font-medium tabular-nums">{formatCents(b.priceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.bidItems.length === 0 && (
          <p className="text-sm text-slate-500">Add cost lines to see the bid items.</p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Bid details, markup and proposal text</h2>
        <fieldset disabled={locked} className="space-y-3">
          <HeaderFields f={f} set={setF} full />
          <button
            type="button"
            className="btn"
            disabled={saveHeader.isPending}
            onClick={() => {
              const r = bodyOf(f);
              if ("problem" in r) return setProblem(r.problem);
              setProblem(null);
              saveHeader.mutate(r.body);
            }}
          >
            {saveHeader.isPending ? "Saving…" : "Save details"}
          </button>
        </fieldset>
        {problem && <p className="text-sm text-red-700">{problem}</p>}
        <ErrorText error={saveHeader.error} />
      </section>

      {!locked && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Outcome</h2>
          <div className="flex flex-wrap gap-3">
            {e.status === "draft" && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => saveHeader.mutate({ status: "sent" })}
              >
                Mark sent today
              </button>
            )}
            {e.status !== "lost" && (
              <button
                type="button"
                className="btn-secondary"
                aria-expanded={emailOpen}
                onClick={() => setEmailOpen(!emailOpen)}
              >
                {e.status === "draft" ? "Email the proposal" : "Follow up by email"}
              </button>
            )}
            {e.status !== "lost" && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => saveHeader.mutate({ status: "lost" })}
              >
                Mark lost
              </button>
            )}
            {e.status === "lost" && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => saveHeader.mutate({ status: e.sentOn ? "sent" : "draft" })}
              >
                Reopen
              </button>
            )}
            <button
              type="button"
              className="btn"
              disabled={e.winProblems.length > 0 || dirtyLines}
              onClick={() => setWin({ contractDate: "", retainage: "10", accepted: [] })}
            >
              Won: start the job
            </button>
            <button
              type="button"
              className="text-sm text-red-700 underline"
              onClick={() => {
                if (window.confirm(`Delete ${e.label}? Its lines go with it.`)) remove.mutate();
              }}
            >
              Delete
            </button>
          </div>
          {emailOpen && e.status !== "lost" && (
            <div className="rounded border border-slate-200 p-3">
              {dirtyLines && (
                <p className="mb-2 text-xs text-amber-800">
                  The draft and the PDF use the saved lines: save the lines first.
                </p>
              )}
              <EstimateEmailDraft
                key={[
                  e.status,
                  e.sentOn,
                  e.gcContactName,
                  e.gcContactEmail,
                  e.totals.priceCents,
                  e.totals.addAlternatesCents,
                  e.validDays,
                ].join("|")}
                estimate={e}
                from={from}
                today={new Date().toISOString().slice(0, 10)}
                onMarkSent={() => saveHeader.mutate({ status: "sent" })}
              />
            </div>
          )}
          {dirtyLines && (
            <p className="text-sm text-amber-800">Save the lines before marking it won.</p>
          )}
          {e.winProblems.map((p) => (
            <p key={p} className="text-sm text-slate-600">
              {p}
            </p>
          ))}
          {win && (
            <div className="space-y-2 rounded border border-slate-200 p-3">
              {savedAlternates.length > 0 && (
                <fieldset className="space-y-1">
                  <legend className="text-sm font-medium">Alternates the GC accepted</legend>
                  {savedAlternates.map((b) => {
                    const key = bidItemKey(b.description);
                    return (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={win.accepted.includes(key)}
                          onChange={(ev) =>
                            setWin({
                              ...win,
                              accepted: ev.target.checked
                                ? [...win.accepted, key]
                                : win.accepted.filter((k) => k !== key),
                            })
                          }
                        />
                        No. {b.alternateNumber} ({b.alternate}): {b.description},{" "}
                        {b.alternate === "add" ? "add" : "deduct"} {formatCents(b.priceCents)}
                      </label>
                    );
                  })}
                </fieldset>
              )}
              <p className="text-sm text-slate-700">
                Starts the job "{e.name}" with {job?.lines.length ?? 0} schedule-of-values{" "}
                {job?.lines.length === 1 ? "line" : "lines"} totalling{" "}
                {formatCents(job?.contractSumCents ?? 0)}.{" "}
                {e.budgetsOnWin
                  ? "Each line's cost budget is set to the bid item's cost with tax."
                  : "Cost budgets come with job costing on Crew and up; the schedule of values is set either way."}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Contract date"
                  type="date"
                  value={win.contractDate}
                  onChange={(v) => setWin({ ...win, contractDate: v })}
                />
                <Field
                  label="Retainage (%)"
                  value={win.retainage}
                  onChange={(v) => setWin({ ...win, retainage: v })}
                />
              </div>
              <button
                type="button"
                className="btn"
                disabled={markWon.isPending}
                onClick={() => {
                  const bps = parsePercentToBps(win.retainage || "0");
                  if (bps === null) return setProblem("Retainage: enter a percent.");
                  markWon.mutate({
                    contractDate: win.contractDate || null,
                    retainagePctBps: bps,
                    acceptedAlternates: win.accepted,
                  });
                }}
              >
                {markWon.isPending ? "Starting the job…" : "Start the job"}
              </button>
              <ErrorText error={markWon.error} />
            </div>
          )}
        </section>
      )}
      {locked && (
        <p className="text-sm text-slate-600">
          Won: the {e.lineCount} cost lines are kept as the record of what was bid. Changes to the
          contract go through the job's change orders.
        </p>
      )}
    </div>
  );
}
