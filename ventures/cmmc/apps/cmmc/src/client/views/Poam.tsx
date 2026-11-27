import { CONTROLS } from "@shared/controls";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { OrgInfo, PoamItem } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";
import { PoamImport } from "./PoamImport";

export function PoamView({ orgId, info }: { orgId: string; info: OrgInfo }) {
  const qc = useQueryClient();
  const canEdit = info.role !== "viewer";
  const list = useQuery({
    queryKey: ["poam", orgId],
    queryFn: () => api<{ items: PoamItem[] }>(`/api/orgs/${orgId}/poam`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["poam", orgId] });
  const [form, setForm] = useState({
    controlId: "",
    weakness: "",
    remediation: "",
    milestones: "",
    responsible: "",
    scheduledCompletion: "",
  });
  const create = useMutation({
    mutationFn: () => api<PoamItem>(`/api/orgs/${orgId}/poam`, { method: "POST", json: form }),
    onSuccess: () => {
      setForm({ ...form, weakness: "", remediation: "", milestones: "" });
      refresh();
    },
  });
  const setStatus = useMutation({
    mutationFn: (p: { id: string; status: "open" | "closed" }) =>
      api(`/api/orgs/${orgId}/poam/${p.id}`, { method: "PATCH", json: { status: p.status } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/orgs/${orgId}/poam/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const level = info.profile.targetLevel === 1 ? 1 : 2;
  const [importing, setImporting] = useState(false);
  return (
    <div className="space-y-4">
      {level === 1 && (
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Level 1 does not allow a POA&M (32 CFR 170.21): every requirement must be met. You can
          still track internal remediation here.
        </p>
      )}
      {importing && <PoamImport orgId={orgId} level={level} onClose={() => setImporting(false)} />}
      <Card
        title="Plan of action and milestones"
        actions={
          <div className="flex gap-2">
            {canEdit && !importing && (
              <button type="button" className={btnGhostCls} onClick={() => setImporting(true)}>
                Import spreadsheet
              </button>
            )}
            <a className={btnGhostCls} href={`/api/orgs/${orgId}/poam/export.csv`}>
              Export CSV
            </a>
          </div>
        }
      >
        <ErrorText error={list.error} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-stone-500">
              <tr>
                <th className="py-1 pr-2">Requirement</th>
                <th className="pr-2">Weakness</th>
                <th className="pr-2">Due</th>
                <th className="pr-2">Allowed on POA&M?</th>
                <th className="pr-2">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {list.data?.items.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="py-2 pr-2 font-mono text-xs">{i.controlId}</td>
                  <td className="pr-2">
                    {i.weakness}
                    {i.remediation && <p className="text-xs text-stone-500">{i.remediation}</p>}
                  </td>
                  <td className={`pr-2 ${i.overdue ? "font-semibold text-red-700" : ""}`}>
                    {i.scheduledCompletion}
                    {i.overdue ? " (overdue)" : ""}
                  </td>
                  <td className="pr-2 text-xs">
                    {i.eligible ? "Yes" : "No"}
                    <p className="text-stone-500">{i.eligibilityReason}</p>
                  </td>
                  <td className="pr-2">{i.status}</td>
                  <td className="space-x-2 whitespace-nowrap">
                    {canEdit && (
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() =>
                          setStatus.mutate({
                            id: i.id,
                            status: i.status === "open" ? "closed" : "open",
                          })
                        }
                      >
                        {i.status === "open" ? "Close" : "Reopen"}
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        className="text-xs text-red-700 underline"
                        onClick={() => remove.mutate(i.id)}
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
      </Card>
      {canEdit && (
        <Card title="Add an item">
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Field label="Requirement">
              <select
                className={inputCls}
                value={form.controlId}
                onChange={(e) => setForm({ ...form, controlId: e.target.value })}
                required
              >
                <option value="">Choose…</option>
                {CONTROLS[level].map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Scheduled completion">
              <input
                className={inputCls}
                type="date"
                value={form.scheduledCompletion}
                onChange={(e) => setForm({ ...form, scheduledCompletion: e.target.value })}
                required
              />
            </Field>
            <Field label="Weakness">
              <textarea
                className={inputCls}
                rows={2}
                value={form.weakness}
                onChange={(e) => setForm({ ...form, weakness: e.target.value })}
                required
              />
            </Field>
            <Field label="Remediation plan">
              <textarea
                className={inputCls}
                rows={2}
                value={form.remediation}
                onChange={(e) => setForm({ ...form, remediation: e.target.value })}
              />
            </Field>
            <Field label="Milestones">
              <textarea
                className={inputCls}
                rows={2}
                value={form.milestones}
                onChange={(e) => setForm({ ...form, milestones: e.target.value })}
              />
            </Field>
            <Field label="Responsible">
              <input
                className={inputCls}
                value={form.responsible}
                onChange={(e) => setForm({ ...form, responsible: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <ErrorText error={create.error} />
              <button type="submit" className={btnCls} disabled={create.isPending}>
                Add
              </button>
            </div>
          </form>
          <p className="mt-3 text-xs text-stone-500">
            32 CFR 170.21: a Conditional Level 2 (Self) status needs a score of at least 88, POA&M
            items only for 1-point requirements (plus 3.13.11 when encryption is used but not
            FIPS-validated), never 3.1.20, 3.1.22, 3.12.4, 3.10.3, 3.10.4 or 3.10.5, and closeout
            within 180 days.
          </p>
        </Card>
      )}
    </div>
  );
}
