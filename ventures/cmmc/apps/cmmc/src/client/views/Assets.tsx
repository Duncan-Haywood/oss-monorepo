import {
  type AssetCategory,
  type CategoryInfo,
  type InventoryCheck,
  NETWORK_DIAGRAM_QUOTE,
  type SpecializedType,
} from "@shared/assets";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { OrgInfo } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";
import { AssetImport } from "./AssetImport";
import { type DiagramFile, NetworkDiagramCard } from "./NetworkDiagram";

export interface AssetItem {
  id: string;
  name: string;
  category: AssetCategory;
  specializedType: SpecializedType | null;
  assetType: string;
  location: string;
  provider: string;
  owner: string;
  notes: string;
}

interface AssetsResponse {
  items: AssetItem[];
  networkDiagram: DiagramFile | null;
  check: InventoryCheck;
  categories: CategoryInfo[];
  specializedTypes: { key: SpecializedType; label: string }[];
  verification: { source: string; url: string; readOn: string; note: string };
}

const EMPTY = {
  name: "",
  category: "cui" as AssetCategory,
  specializedType: "" as SpecializedType | "",
  assetType: "",
  location: "",
  provider: "",
  owner: "",
  notes: "",
};

export function AssetsView({
  orgId,
  info,
  onUpgrade,
}: {
  orgId: string;
  info: OrgInfo;
  onUpgrade: () => void;
}) {
  const qc = useQueryClient();
  const canRecord = info.role !== "viewer" && info.plan.level2;
  const isAdmin = info.role === "owner" || info.role === "admin";
  const list = useQuery({
    queryKey: ["assets", orgId],
    queryFn: () => api<AssetsResponse>(`/api/orgs/${orgId}/assets`),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["assets", orgId] });
    qc.invalidateQueries({ queryKey: ["ssp"] });
  };
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const body = () => ({
    ...form,
    specializedType: form.category === "specialized" ? form.specializedType || null : null,
  });
  const save = useMutation({
    mutationFn: () =>
      editing
        ? api(`/api/orgs/${orgId}/assets/${editing}`, { method: "PATCH", json: body() })
        : api(`/api/orgs/${orgId}/assets`, { method: "POST", json: body() }),
    onSuccess: () => {
      setForm({ ...EMPTY, category: form.category });
      setEditing(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/orgs/${orgId}/assets/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const data = list.data;
  const catInfo = (k: AssetCategory) => data?.categories.find((c) => c.key === k);
  const typeLabel = (t: SpecializedType | null) =>
    t ? (data?.specializedTypes.find((x) => x.key === t)?.label ?? t) : "";
  const startEdit = (a: AssetItem) => {
    setEditing(a.id);
    setForm({ ...a, specializedType: a.specializedType ?? "" });
  };
  return (
    <div className="space-y-4">
      {!info.plan.level2 && (
        <div
          role="note"
          className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-100 bg-brand-50 p-3 text-sm text-stone-800"
        >
          <p>
            <strong>The asset inventory is read only on the {info.plan.name} plan.</strong> It
            scopes a Level 2 assessment; recording assets needs the Level 2 plan.
          </p>
          {isAdmin ? (
            <button type="button" className={btnCls} onClick={onUpgrade}>
              See Level 2 plans
            </button>
          ) : (
            <span className="text-xs text-stone-600">
              Ask an admin of this organization to upgrade.
            </span>
          )}
        </div>
      )}
      {importing && <AssetImport orgId={orgId} onClose={() => setImporting(false)} />}
      <Card
        title="Asset inventory"
        actions={
          <div className="flex gap-2">
            {canRecord && !importing && (
              <button type="button" className={btnGhostCls} onClick={() => setImporting(true)}>
                Import spreadsheet
              </button>
            )}
            <a className={btnGhostCls} href={`/api/orgs/${orgId}/assets/export.csv`}>
              Export CSV
            </a>
          </div>
        }
      >
        <ErrorText error={list.error} />
        <p className="mb-3 text-sm text-stone-700">
          Every asset in or near your CUI environment, by the five Level 2 scoping categories. The
          SSP prints this list under the system boundary. Describe assets only; never paste CUI.
        </p>
        {data && (
          <p className="mb-3 rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-700">
            {data.verification.note}{" "}
            <a className="underline" href={data.verification.url} target="_blank" rel="noreferrer">
              Read 32 CFR 170.19
            </a>
          </p>
        )}
        {data && data.check.issues.length > 0 && (
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {data.check.issues.map((i) => (
              <li key={`${i.assetId ?? "all"}-${i.message}`}>{i.message}</li>
            ))}
          </ul>
        )}
        {data?.categories.map((cat) => {
          const rows = data.items.filter((a) => a.category === cat.key);
          return (
            <section key={cat.key} className="mb-4">
              <h3 className="text-sm font-semibold text-stone-900">
                {cat.label} <span className="font-normal text-stone-500">({rows.length})</span>
              </h3>
              <p className="text-xs text-stone-700">
                <q>{cat.rule}</q>
              </p>
              <p className="text-xs text-stone-600">{cat.summary}</p>
              <p className="mb-1 text-xs text-stone-500">{cat.document}</p>
              {rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-stone-500">
                      <tr>
                        <th className="py-1 pr-2">Asset</th>
                        <th className="pr-2">Type</th>
                        <th className="pr-2">Location</th>
                        <th className="pr-2">Provided by</th>
                        <th className="pr-2">Notes</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {rows.map((a) => (
                        <tr key={a.id} className="align-top">
                          <td className="py-2 pr-2">
                            {a.name}
                            {a.owner && <p className="text-xs text-stone-500">{a.owner}</p>}
                          </td>
                          <td className="pr-2">
                            {[typeLabel(a.specializedType), a.assetType].filter(Boolean).join(": ")}
                          </td>
                          <td className="pr-2">{a.location}</td>
                          <td className="pr-2">{a.provider}</td>
                          <td className="pr-2 text-xs">{a.notes}</td>
                          <td className="space-x-2 whitespace-nowrap">
                            {canRecord && (
                              <button
                                type="button"
                                className="text-xs underline"
                                onClick={() => startEdit(a)}
                              >
                                Edit
                              </button>
                            )}
                            {info.role !== "viewer" && (
                              <button
                                type="button"
                                className="text-xs text-red-700 underline"
                                onClick={() => remove.mutate(a.id)}
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </Card>
      {data && (
        <NetworkDiagramCard
          orgId={orgId}
          diagram={data.networkDiagram}
          quote={NETWORK_DIAGRAM_QUOTE}
          canLink={canRecord}
          canUnlink={info.role !== "viewer"}
        />
      )}
      {canRecord && data && (
        <Card title={editing ? "Edit asset" : "Add an asset"}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Asset">
              <input
                className={inputCls}
                value={form.name}
                placeholder="Front office laptop, Haas VF-2 controller…"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Category" hint={catInfo(form.category)?.summary}>
              <select
                className={inputCls}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as AssetCategory })}
              >
                {data.categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            {form.category === "specialized" && (
              <Field label="Kind of specialized asset">
                <select
                  className={inputCls}
                  value={form.specializedType}
                  onChange={(e) =>
                    setForm({ ...form, specializedType: e.target.value as SpecializedType })
                  }
                  required
                >
                  <option value="">Choose…</option>
                  {data.specializedTypes.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Type">
              <input
                className={inputCls}
                value={form.assetType}
                placeholder="Laptop, file server, cloud service…"
                onChange={(e) => setForm({ ...form, assetType: e.target.value })}
              />
            </Field>
            <Field label="Location">
              <input
                className={inputCls}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field
              label="Provided by"
              hint="The external service provider, if someone else runs it."
            >
              <input
                className={inputCls}
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
              />
            </Field>
            <Field label="Owner">
              <input
                className={inputCls}
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
              />
            </Field>
            <Field
              label="Notes"
              hint={
                catInfo(form.category)?.needsManagementNote
                  ? form.category === "out_of_scope"
                    ? "Why it cannot process, store or transmit CUI."
                    : "How your policies and practices manage it. The SSP prints this."
                  : undefined
              }
            >
              <textarea
                className={inputCls}
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2 space-x-2">
              <ErrorText error={save.error} />
              <button type="submit" className={btnCls} disabled={save.isPending}>
                {editing ? "Save" : "Add"}
              </button>
              {editing && (
                <button
                  type="button"
                  className={btnGhostCls}
                  onClick={() => {
                    setEditing(null);
                    setForm(EMPTY);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
