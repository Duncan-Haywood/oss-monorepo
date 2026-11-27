import { CONTROLS, FAMILIES } from "@shared/controls";
import type {
  ControlShare,
  EspData,
  EspScope,
  ProviderCheck,
  Responsibility,
} from "@shared/service-providers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { Evidence, OrgInfo } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";
import { CrmImport } from "./CrmImport";
import { EvidenceUpload } from "./EvidenceUpload";

export interface ProviderItem {
  id: string;
  name: string;
  data: EspData;
  isCsp: boolean;
  services: string;
  fedrampBasis: string;
  serviceDescriptionRef: string;
  crmRef: string;
  serviceDescriptionEvidenceId: string | null;
  crmEvidenceId: string | null;
  notes: string;
  controls: ControlShare[];
  scope: EspScope;
  serviceDescriptionFile: LinkedFile | null;
  crmFile: LinkedFile | null;
}

interface LinkedFile {
  id: string;
  title: string;
  fileName: string;
  sha256: string;
}

interface ProvidersResponse {
  items: ProviderItem[];
  check: ProviderCheck;
  options: { key: EspData; label: string; csp: EspScope; notCsp: EspScope }[];
  quotes: { intro: string; document: string };
  verification: { source: string; url: string; readOn: string; note: string };
}

const EMPTY = {
  name: "",
  data: "cui" as EspData,
  isCsp: false,
  services: "",
  fedrampBasis: "",
  serviceDescriptionRef: "",
  crmRef: "",
  serviceDescriptionEvidenceId: null as string | null,
  crmEvidenceId: null as string | null,
  notes: "",
  controls: [] as ControlShare[],
};

const LEVEL2 = CONTROLS[2];

export function ProvidersView({
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
    queryKey: ["service-providers", orgId],
    queryFn: () => api<ProvidersResponse>(`/api/orgs/${orgId}/service-providers`),
  });
  // The org's evidence files, to pick the service description and CRM from.
  const files = useQuery({
    queryKey: ["evidence", orgId],
    queryFn: () => api<{ items: Evidence[] }>(`/api/orgs/${orgId}/evidence`),
    enabled: canRecord,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["service-providers", orgId] });
    qc.invalidateQueries({ queryKey: ["ssp"] });
  };
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  // The CRM file read by "Fill from the matrix", offered as the CRM evidence upload.
  const [matrixFile, setMatrixFile] = useState<File | null>(null);
  const reset = () => {
    setForm(EMPTY);
    setEditing(null);
    setMatrixFile(null);
  };
  const save = useMutation({
    mutationFn: () =>
      editing
        ? api(`/api/orgs/${orgId}/service-providers/${editing}`, { method: "PATCH", json: form })
        : api(`/api/orgs/${orgId}/service-providers`, { method: "POST", json: form }),
    onSuccess: () => {
      reset();
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/api/orgs/${orgId}/service-providers/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const data = list.data;
  const option = data?.options.find((o) => o.key === form.data);
  const preview = option ? (form.isCsp ? option.csp : option.notCsp) : null;
  const shareOf = (id: string) => form.controls.find((x) => x.controlId === id)?.responsibility;
  const setShare = (id: string, r: Responsibility | "") =>
    setForm({
      ...form,
      controls: [
        ...form.controls.filter((x) => x.controlId !== id),
        ...(r ? [{ controlId: id, responsibility: r }] : []),
      ],
    });
  const startEdit = (p: ProviderItem) => {
    setEditing(p.id);
    setMatrixFile(null);
    const { id: _id, scope: _scope, serviceDescriptionFile: _sd, crmFile: _crm, ...rest } = p;
    setForm({ ...EMPTY, ...rest });
  };
  return (
    <div className="space-y-4">
      {!info.plan.level2 && (
        <div
          role="note"
          className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-100 bg-brand-50 p-3 text-sm text-stone-800"
        >
          <p>
            <strong>Service providers are read only on the {info.plan.name} plan.</strong> They
            scope a Level 2 assessment; recording them needs the Level 2 plan.
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
      <Card title="External service providers">
        <ErrorText error={list.error} />
        <p className="mb-3 text-sm text-stone-700">
          Cloud services, MSPs and anyone else who runs part of your systems: what each one holds,
          where its customer responsibility matrix is, and which requirements it carries. The SSP
          prints this list under the system boundary and names the providers on each requirement
          they carry.
        </p>
        {data && (
          <div className="mb-3 space-y-1 rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-700">
            <p>
              <q>{data.quotes.intro}</q>
            </p>
            <p>
              <q>{data.quotes.document}</q>
            </p>
            <p>
              {data.verification.note}{" "}
              <a
                className="underline"
                href={data.verification.url}
                target="_blank"
                rel="noreferrer"
              >
                Read 32 CFR 170.19
              </a>
            </p>
          </div>
        )}
        {data && data.check.issues.length > 0 && (
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {data.check.issues.map((i) => (
              <li key={`${i.providerId ?? "all"}-${i.message}`}>{i.message}</li>
            ))}
          </ul>
        )}
        {data && data.items.length === 0 && (
          <p className="text-sm text-stone-600">No service providers recorded yet.</p>
        )}
        {data && data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-stone-500">
                <tr>
                  <th className="py-1 pr-2">Provider</th>
                  <th className="pr-2">Scope (table 4)</th>
                  <th className="pr-2">CRM</th>
                  <th className="pr-2">Requirements</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.items.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="py-2 pr-2">
                      {p.name}
                      {p.services && <p className="text-xs text-stone-500">{p.services}</p>}
                    </td>
                    <td className="pr-2">
                      {p.scope.label}
                      <p className="text-xs text-stone-600">
                        <q>{p.scope.rule}</q>
                      </p>
                    </td>
                    <td className="pr-2 text-xs">
                      {p.crmFile && (
                        <a
                          className="block text-brand-600 underline"
                          href={`/api/orgs/${orgId}/evidence/${p.crmFile.id}/download`}
                        >
                          {p.crmFile.title}
                        </a>
                      )}
                      {p.crmRef}
                    </td>
                    <td className="pr-2 text-xs">
                      {p.controls.length > 0 &&
                        `${p.controls.filter((x) => x.responsibility === "provider").length} provider, ${p.controls.filter((x) => x.responsibility === "shared").length} shared`}
                    </td>
                    <td className="space-x-2 whitespace-nowrap">
                      {canRecord && (
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() => startEdit(p)}
                        >
                          Edit
                        </button>
                      )}
                      {info.role !== "viewer" && (
                        <button
                          type="button"
                          className="text-xs text-red-700 underline"
                          onClick={() => remove.mutate(p.id)}
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
      </Card>
      {canRecord && data && (
        <Card title={editing ? "Edit service provider" : "Add a service provider"}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Provider">
              <input
                className={inputCls}
                value={form.name}
                placeholder="Microsoft 365 GCC High, your MSP…"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Services it provides">
              <input
                className={inputCls}
                value={form.services}
                placeholder="Email and file storage, managed EDR…"
                onChange={(e) => setForm({ ...form, services: e.target.value })}
              />
            </Field>
            <Field label="What it processes, stores or transmits">
              <select
                className={inputCls}
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value as EspData })}
              >
                {data.options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cloud service provider (CSP)?">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isCsp}
                  onChange={(e) => setForm({ ...form, isCsp: e.target.checked })}
                />
                Yes, it is a cloud service
              </label>
            </Field>
            {preview && (
              <div className="sm:col-span-2 rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-700">
                <p className="font-semibold">{preview.label}</p>
                <p>
                  <q>{preview.rule}</q>
                </p>
                <p>{preview.summary}</p>
                {preview.needs.length > 0 && (
                  <ul className="list-disc pl-5">
                    {preview.needs.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {form.data === "cui" && form.isCsp && (
              <Field
                label="FedRAMP basis"
                hint="The FedRAMP Moderate authorization, or the provider's equivalency evidence."
              >
                <input
                  className={inputCls}
                  value={form.fedrampBasis}
                  onChange={(e) => setForm({ ...form, fedrampBasis: e.target.value })}
                />
              </Field>
            )}
            {form.data !== "neither" && (
              <>
                <DocumentField
                  orgId={orgId}
                  label="Service description"
                  uploadTitle={`${form.name || "Provider"} service description`}
                  files={files.data?.items ?? []}
                  evidenceId={form.serviceDescriptionEvidenceId}
                  reference={form.serviceDescriptionRef}
                  onEvidence={(id) => setForm((f) => ({ ...f, serviceDescriptionEvidenceId: id }))}
                  onReference={(v) => setForm({ ...form, serviceDescriptionRef: v })}
                />
                <DocumentField
                  orgId={orgId}
                  label="Customer responsibility matrix"
                  uploadTitle={`${form.name || "Provider"} customer responsibility matrix`}
                  presetFile={matrixFile}
                  files={files.data?.items ?? []}
                  evidenceId={form.crmEvidenceId}
                  reference={form.crmRef}
                  onEvidence={(id) => setForm((f) => ({ ...f, crmEvidenceId: id }))}
                  onReference={(v) => setForm({ ...form, crmRef: v })}
                />
              </>
            )}
            <Field
              label="Notes"
              hint={
                form.data === "neither"
                  ? "Why it holds neither CUI nor Security Protection Data."
                  : "Its relationship to you; the SSP prints this."
              }
            >
              <textarea
                className={inputCls}
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            {form.data !== "neither" && (
              <details className="sm:col-span-2 rounded border border-stone-200 p-2 text-sm">
                <summary className="cursor-pointer">
                  Requirements its CRM says it carries ({form.controls.length} marked)
                </summary>
                <p className="my-2 text-xs text-stone-600">
                  Mark each requirement the matrix assigns to the provider (it carries it) or to
                  both of you (shared). Leave the rest blank: they are yours.
                </p>
                <CrmImport
                  providerName={form.name}
                  controls={form.controls}
                  onApply={(controls) => setForm({ ...form, controls })}
                  onFile={setMatrixFile}
                />
                <div className="max-h-96 overflow-y-auto">
                  {Object.entries(FAMILIES).map(([fam, famName]) => (
                    <fieldset key={fam} className="mb-2">
                      <legend className="text-xs font-semibold text-stone-800">
                        {famName} ({fam})
                      </legend>
                      {LEVEL2.filter((c) => c.family === fam).map((c) => (
                        <label key={c.id} className="flex items-center gap-2 py-0.5 text-xs">
                          <select
                            className="rounded border border-stone-300 px-1 py-0.5 text-xs"
                            value={shareOf(c.id) ?? ""}
                            onChange={(e) => setShare(c.id, e.target.value as Responsibility | "")}
                            aria-label={`Who carries ${c.id}`}
                          >
                            <option value="">Yours</option>
                            <option value="provider">Provider</option>
                            <option value="shared">Shared</option>
                          </select>
                          <span className="font-mono">{c.id}</span>
                          <span className="truncate text-stone-600">{c.text}</span>
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              </details>
            )}
            <div className="sm:col-span-2 space-x-2">
              <ErrorText error={save.error} />
              <button type="submit" className={btnCls} disabled={save.isPending}>
                {editing ? "Save" : "Add"}
              </button>
              {editing && (
                <button type="button" className={btnGhostCls} onClick={reset}>
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

/** A provider document: one of the org's evidence files, a typed reference, or both. */
export function DocumentField({
  orgId,
  label,
  uploadTitle,
  presetFile,
  files,
  evidenceId,
  reference,
  onEvidence,
  onReference,
}: {
  orgId: string;
  label: string;
  uploadTitle: string;
  presetFile?: File | null;
  files: Evidence[];
  evidenceId: string | null;
  reference: string;
  onEvidence: (id: string | null) => void;
  onReference: (v: string) => void;
}) {
  return (
    // Two controls, so a group rather than one <label> (Field) around both.
    <fieldset className="block text-sm">
      <legend className="mb-1 block font-medium text-stone-800">{label}</legend>
      <select
        className={inputCls}
        value={evidenceId ?? ""}
        onChange={(e) => onEvidence(e.target.value || null)}
        aria-label={`${label}: evidence file`}
      >
        <option value="">No evidence file</option>
        {evidenceId && !files.some((f) => f.id === evidenceId) && (
          <option value={evidenceId}>(linked file)</option>
        )}
        {files.map((f) => (
          <option key={f.id} value={f.id}>
            {f.title}
            {f.title !== f.fileName ? ` (${f.fileName})` : ""}
          </option>
        ))}
      </select>
      <input
        className={`${inputCls} mt-1`}
        value={reference}
        placeholder="Or where it is kept: a link, a file name"
        onChange={(e) => onReference(e.target.value)}
        aria-label={`${label}: kept at`}
      />
      <span className="mt-1 block text-xs text-stone-500">
        Pick one of your evidence files, upload the provider's file here, or say where it is kept.
      </span>
      <details className="mt-1 text-xs" open={Boolean(presetFile) || undefined}>
        <summary className="cursor-pointer text-brand-600 underline">
          {presetFile ? "Keep the matrix you read as this file" : "Upload a file here"}
        </summary>
        <EvidenceUpload
          orgId={orgId}
          label={label}
          defaultTitle={uploadTitle}
          presetFile={presetFile}
          onUploaded={(ev) => onEvidence(ev.id)}
        />
      </details>
    </fieldset>
  );
}
