// /orgs/$orgId/price-list: the company's price list. Material prices, labor and equipment rates and
// sub quotes typed once (or read from a supplier's price sheet) and picked into estimates, instead of
// retyped or copied from the last bid. An estimate line copies the cost, so a price changed here
// changes only the estimates it is picked into next (or brought up to date with "Use list prices").
import type { PriceListDto, PriceMergeDto } from "@shared/api/types";
import { COST_CATEGORIES, COST_CATEGORY_LABELS, type CostCategory } from "@shared/job-cost";
import { searchItems } from "@shared/price-list";
import { formatUnitPrice, parseUnitPrice, unitPriceDecimal } from "@shared/unit-price";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorText } from "../components/error";
import { EstimateImport } from "../components/estimate-import";
import { api, orgPath } from "../lib/api";

export interface PriceForm {
  category: CostCategory;
  code: string;
  description: string;
  unit: string;
  unitCost: string;
  note: string;
}

export const blankPrice: PriceForm = {
  category: "material",
  code: "",
  description: "",
  unit: "",
  unitCost: "",
  note: "",
};

/** The form as the API body, or the first problem to show. */
export function readPriceForm(
  f: PriceForm,
): { body: Record<string, unknown> } | { problem: string } {
  if (!f.description.trim()) return { problem: "Name the item." };
  const u = parseUnitPrice(f.unitCost.trim() || "");
  if (u === null || u < 0) return { problem: "The unit cost does not read." };
  return {
    body: {
      category: f.category,
      code: f.code.trim() || null,
      description: f.description.trim(),
      unit: f.unit.trim() || null,
      unitCostMicros: u,
      note: f.note.trim() || null,
    },
  };
}

/** What a merge did, in one sentence. */
export function mergeMessage(
  r: Pick<PriceMergeDto, "added" | "updated" | "unchanged" | "conflicts">,
) {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
  let out = `${n(r.added, "price")} added, ${r.updated} updated, ${r.unchanged} already on the list at that cost.`;
  if (r.conflicts.length)
    out += ` Given twice at different costs, the last one kept: ${r.conflicts.slice(0, 5).join(", ")}${r.conflicts.length > 5 ? ", …" : ""}.`;
  return out;
}

function PriceFields(props: { f: PriceForm; set: (f: PriceForm) => void }) {
  const { f, set } = props;
  return (
    <>
      <label className="block">
        <span className="text-xs text-slate-500">Category</span>
        <select
          className="input"
          value={f.category}
          onChange={(e) => set({ ...f, category: e.target.value as CostCategory })}
        >
          {COST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {COST_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Description</span>
        <input
          className="input"
          value={f.description}
          onChange={(e) => set({ ...f, description: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Unit</span>
        <input
          className="input w-20"
          value={f.unit}
          onChange={(e) => set({ ...f, unit: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Unit cost</span>
        <input
          className="input w-28 text-right"
          inputMode="decimal"
          value={f.unitCost}
          onChange={(e) => set({ ...f, unitCost: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Code (optional)</span>
        <input
          className="input w-28"
          value={f.code}
          onChange={(e) => set({ ...f, code: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Source or note (optional)</span>
        <input
          className="input"
          placeholder="Supplier quote 11/20"
          value={f.note}
          onChange={(e) => set({ ...f, note: e.target.value })}
        />
      </label>
    </>
  );
}

export function PriceListPage() {
  const { orgId } = useParams({ from: "/orgs/$orgId/price-list" });
  const qc = useQueryClient();
  const path = orgPath(orgId, "/price-list");
  const q = useQuery({ queryKey: ["price-list", orgId], queryFn: () => api<PriceListDto>(path) });
  const [f, setF] = useState<PriceForm>(blankPrice);
  const [problem, setProblem] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CostCategory | "">("");
  const [editing, setEditing] = useState<{ id: string; f: PriceForm } | null>(null);
  const [merged, setMerged] = useState<string | null>(null);

  const reload = () => qc.invalidateQueries({ queryKey: ["price-list", orgId] });
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(path, { method: "POST", body }),
    onSuccess: async () => {
      setF({ ...blankPrice, category: f.category });
      await reload();
    },
  });
  const save = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
      api(`${path}/${v.id}`, { method: "PATCH", body: v.body }),
    onSuccess: async () => {
      setEditing(null);
      await reload();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${path}/${id}`, { method: "DELETE" }),
    onSuccess: reload,
  });
  const merge = useMutation({
    mutationFn: (items: Record<string, unknown>[]) =>
      api<PriceMergeDto>(`${path}/merge`, { method: "POST", body: { items } }),
    onSuccess: async (r) => {
      setMerged(mergeMessage(r));
      qc.setQueryData(["price-list", orgId], r.list);
    },
  });

  if (q.error) return <ErrorText error={q.error} />;
  if (!q.data) return <p className="text-sm text-slate-500">Loading…</p>;
  const shown = searchItems(q.data.items, query, category || null);

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
        <h1 className="text-2xl font-semibold">Price list</h1>
        <p className="text-sm text-slate-600">
          Your material prices, labor and equipment rates and sub quotes, kept once and picked into
          any estimate. An estimate keeps the cost it was priced at; changing a price here changes
          the next estimates, and an open one when you choose "Use list prices" on it.{" "}
          {q.data.items.length} of {q.data.limit} items.
        </p>
      </div>

      <section className="card space-y-2">
        <h2 className="font-semibold">Add a price</h2>
        <form
          className="flex flex-wrap items-end gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const r = readPriceForm(f);
            if ("problem" in r) return setProblem(r.problem);
            setProblem(null);
            add.mutate(r.body);
          }}
        >
          <PriceFields f={f} set={setF} />
          <button type="submit" className="btn" disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add"}
          </button>
        </form>
        {problem && <p className="text-sm text-red-700">{problem}</p>}
        <ErrorText error={add.error} />
        <EstimateImport
          target="price-list"
          existingLines={0}
          defaultBidItem="Price list"
          onAdd={(lines) =>
            merge.mutate(
              lines.map((l) => ({
                category: l.category,
                description: l.description,
                unit: l.unit,
                unitCostMicros: l.unitCostMicros,
              })),
            )
          }
        />
        {merged && <p className="text-sm text-emerald-700">{merged}</p>}
        <ErrorText error={merge.error} />
      </section>

      <section className="card overflow-x-auto">
        <div className="mb-2 flex flex-wrap items-end gap-3 text-sm">
          <label className="block">
            <span className="text-xs text-slate-500">Search</span>
            <input
              className="input"
              placeholder="duct 26 ga"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Category</span>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value as CostCategory | "")}
            >
              <option value="">All</option>
              {COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {COST_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <span className="text-slate-500">{shown.length} shown</span>
        </div>
        {q.data.items.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing on the list yet. Add prices above, import a supplier's price sheet, or open an
            estimate and choose "Save lines to the price list".
          </p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th>Category</th>
                <th>Description</th>
                <th>Unit</th>
                <th className="text-right">Unit cost</th>
                <th>Code</th>
                <th>Source or note</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((i) =>
                editing?.id === i.id ? (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td colSpan={8}>
                      <div className="flex flex-wrap items-end gap-3 py-2">
                        <PriceFields f={editing.f} set={(nf) => setEditing({ id: i.id, f: nf })} />
                        <button
                          type="button"
                          className="btn"
                          disabled={save.isPending}
                          onClick={() => {
                            const r = readPriceForm(editing.f);
                            if ("problem" in r) return setProblem(r.problem);
                            setProblem(null);
                            save.mutate({ id: i.id, body: r.body });
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="text-xs text-slate-500 underline"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </div>
                      <ErrorText error={save.error} />
                    </td>
                  </tr>
                ) : (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td>{COST_CATEGORY_LABELS[i.category]}</td>
                    <td>{i.description}</td>
                    <td>{i.unit ?? ""}</td>
                    <td className="text-right tabular-nums">{formatUnitPrice(i.unitCostMicros)}</td>
                    <td>{i.code ?? ""}</td>
                    <td className="text-slate-600">{i.note ?? ""}</td>
                    <td className="text-slate-500">{i.updatedAt.slice(0, 10)}</td>
                    <td className="whitespace-nowrap">
                      <button
                        type="button"
                        className="mr-2 text-xs text-slate-600 underline"
                        onClick={() =>
                          setEditing({
                            id: i.id,
                            f: {
                              category: i.category,
                              code: i.code ?? "",
                              description: i.description,
                              unit: i.unit ?? "",
                              unitCost: unitPriceDecimal(i.unitCostMicros),
                              note: i.note ?? "",
                            },
                          })
                        }
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-xs text-slate-500 underline"
                        onClick={() => {
                          if (window.confirm(`Delete "${i.description}" from the price list?`))
                            remove.mutate(i.id);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
        <ErrorText error={remove.error} />
      </section>
    </div>
  );
}
