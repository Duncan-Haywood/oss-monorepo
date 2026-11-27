// Company documents: the contractor's licenses, W-9, bonding letter, safety program, EMR letter and
// other compliance papers GCs ask a subcontractor for, typed from each document with their status
// today (src/shared/company-documents.ts). Editors add, change, archive and delete; every member
// reads. Also the places that use them: a note on the Projects page while one is expired or
// expiring, a pay application's warning about one that lapses by its date, the text for a GC's
// prequalification form, and (part 2) the files kept with each document, which a draft pay
// application offers as backup. A W-9's files need the person to say PayApps may keep the tax ID
// the signed form shows (W9_FILE_CONSENT_FIELD).
import type { CompanyDocumentDto, CompanyDocumentListDto } from "@shared/api/types";
import {
  COMPANY_DOCUMENT_EXPIRING_DAYS,
  COMPANY_DOCUMENT_ISSUER_LABELS,
  COMPANY_DOCUMENT_KIND_LABELS,
  COMPANY_DOCUMENT_KINDS,
  COMPANY_DOCUMENT_NUMBER_LABELS,
  type CompanyDocumentKind,
  payAppDocumentWarnings,
  prequalificationSummary,
  W9_FILE_CONSENT_FIELD,
} from "@shared/company-documents";
import { ROLE_RANK } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { AttachmentsPanel } from "../components/attachments";
import { ErrorText } from "../components/error";
import { meQuery } from "../components/layout";
import { api, orgPath } from "../lib/api";

export const documentsQuery = (orgId: string) => ({
  queryKey: ["company-documents", orgId],
  queryFn: () => api<CompanyDocumentListDto>(orgPath(orgId, "/documents")),
});

interface Form {
  kind: CompanyDocumentKind;
  label: string;
  issuer: string;
  jurisdiction: string;
  classification: string;
  number: string;
  effectiveOn: string;
  expiresOn: string;
  notes: string;
}
type TextKey = Exclude<keyof Form, "kind">;

const EMPTY: Form = {
  kind: "contractor_license",
  label: "",
  issuer: "",
  jurisdiction: "",
  classification: "",
  number: "",
  effectiveOn: "",
  expiresOn: "",
  notes: "",
};

const toBody = (f: Form) => ({
  kind: f.kind,
  label: f.label.trim() || null,
  issuer: f.issuer.trim() || null,
  jurisdiction: f.jurisdiction.trim() || null,
  classification: f.classification.trim() || null,
  // A kind with no number field (a W-9) sends none, whatever was typed before the kind changed.
  number: COMPANY_DOCUMENT_NUMBER_LABELS[f.kind] ? f.number.trim() || null : null,
  effectiveOn: f.effectiveOn || null,
  expiresOn: f.expiresOn || null,
  notes: f.notes.trim() || null,
});

const fromDto = (d: CompanyDocumentDto): Form => ({
  kind: d.kind,
  label: d.label ?? "",
  issuer: d.issuer ?? "",
  jurisdiction: d.jurisdiction ?? "",
  classification: d.classification ?? "",
  number: d.number ?? "",
  effectiveOn: d.effectiveOn ?? "",
  expiresOn: d.expiresOn ?? "",
  notes: d.notes ?? "",
});

export function documentStatusText(d: Pick<CompanyDocumentDto, "status" | "daysLeft">): string {
  const n = d.daysLeft ?? 0;
  if (d.status === "no_expiry") return "No expiry date";
  if (d.status === "expired") return n === 0 ? "Expires today" : `Expired ${-n} days ago`;
  if (d.status === "expiring") return `Expires in ${n} day${n === 1 ? "" : "s"}`;
  return "Current";
}

const STATUS_CLASS: Record<CompanyDocumentDto["status"], string> = {
  expired: "bg-red-100 text-red-800",
  expiring: "bg-amber-100 text-amber-900",
  current: "bg-emerald-100 text-emerald-800",
  no_expiry: "bg-slate-100 text-slate-700",
};

/** Kinds that are for one state or city, so the form asks which. */
const HAS_JURISDICTION: ReadonlySet<CompanyDocumentKind> = new Set([
  "contractor_license",
  "business_license",
  "diversity_certification",
  "other",
]);

function DocumentForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: Form;
  submitLabel: string;
  pending: boolean;
  onSubmit: (f: Form) => void;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<Form>(initial);
  const input = (key: TextKey, label: string, type = "text") => (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        className="input"
        type={type}
        value={f[key]}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
      />
    </label>
  );
  const numberLabel = COMPANY_DOCUMENT_NUMBER_LABELS[f.kind];
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(f);
      }}
    >
      <label className="block text-sm">
        <span className="text-slate-600">Document</span>
        <select
          className="input"
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value as CompanyDocumentKind })}
        >
          {COMPANY_DOCUMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {COMPANY_DOCUMENT_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      {input("label", f.kind === "other" ? "Name (e.g. Union letter)" : "Name (optional)")}
      {HAS_JURISDICTION.has(f.kind) && input("jurisdiction", "State or city (optional)")}
      {f.kind === "contractor_license" && input("classification", "Class or trade (optional)")}
      {numberLabel && input("number", `${numberLabel} (optional)`)}
      {f.kind === "w9" && (
        <p className="text-xs text-slate-500">
          PayApps does not keep the taxpayer identification number on a W-9. Record the date you
          signed it and keep the signed form with your own records.
        </p>
      )}
      {input("issuer", `${COMPANY_DOCUMENT_ISSUER_LABELS[f.kind]} (optional)`)}
      <div className="grid grid-cols-2 gap-2">
        {input("effectiveOn", f.kind === "w9" ? "Signed (optional)" : "Issued (optional)", "date")}
        {input("expiresOn", "Expires (blank if it does not)", "date")}
      </div>
      {input("notes", "Notes (optional)")}
      <div className="flex gap-2">
        <button type="submit" className="btn" disabled={pending}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function detailLine(d: CompanyDocumentDto): string {
  const parts: string[] = [];
  if (d.classification) parts.push(d.classification);
  const numberLabel = COMPANY_DOCUMENT_NUMBER_LABELS[d.kind];
  if (d.number && numberLabel) parts.push(`${numberLabel}: ${d.number}`);
  if (d.issuer) parts.push(d.issuer);
  return parts.join(" · ");
}

function PrequalificationText({
  items,
  company,
  today,
}: {
  items: CompanyDocumentDto[];
  company: string;
  today: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = prequalificationSummary(items, company, today);
  return (
    <section className="card space-y-2">
      <h2 className="font-semibold">For a prequalification form</h2>
      <p className="text-sm text-slate-600">
        GCs' subcontractor prequalification forms ask for license numbers, the EMR and bonding
        capacity. This is what you typed above, as text to paste into the form or an email; an
        expired document is listed and marked.
      </p>
      <textarea
        className="input h-40 font-mono text-xs"
        readOnly
        value={text}
        aria-label="Prequalification text"
      />
      <button
        type="button"
        className="btn-secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </section>
  );
}

/**
 * The files kept with one document. For a W-9 an editor first ticks that PayApps may keep the
 * signed form, since it shows the taxpayer identification number; the Worker refuses the upload
 * without that answer.
 */
export function DocumentFiles({
  orgId,
  doc,
  canEdit,
  onChanged,
}: {
  orgId: string;
  doc: Pick<CompanyDocumentDto, "id" | "kind" | "files">;
  canEdit: boolean;
  onChanged?: () => unknown;
}) {
  const [keepTaxId, setKeepTaxId] = useState(false);
  const base = orgPath(orgId, `/documents/${encodeURIComponent(doc.id)}`);
  const isW9 = doc.kind === "w9";
  if (isW9 && canEdit && !keepTaxId && doc.files.length === 0) {
    return (
      <div className="max-w-2xl space-y-2 text-sm">
        <p className="text-slate-600">
          A signed W-9 shows your taxpayer identification number (your EIN, or your Social Security
          number if you file as a sole proprietor). PayApps never keeps that number in the record
          above. Keeping the signed form here is your choice: it is stored privately for your
          company like your other files, every member of the company can download it, and it is
          deleted when you delete the file or this record. You can also keep it in your own records
          and send it to the GC yourself.
        </p>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={keepTaxId}
            onChange={(e) => setKeepTaxId(e.target.checked)}
          />
          <span>Keep the signed W-9 in PayApps, with the number it shows</span>
        </label>
      </div>
    );
  }
  return (
    <AttachmentsPanel
      base={base}
      holder="companyDocument"
      embedded
      onChanged={onChanged}
      uploadFields={isW9 ? { [W9_FILE_CONSENT_FIELD]: "yes" } : undefined}
    />
  );
}

export function DocumentsPage() {
  const { orgId } = useParams({ from: "/orgs/$orgId/documents" });
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const membership = me.data?.memberships.find((m) => m.orgId === orgId);
  const canEdit = ROLE_RANK[membership?.role ?? "viewer"] >= ROLE_RANK.editor;
  const list = useQuery(documentsQuery(orgId));
  const refresh = () => qc.invalidateQueries({ queryKey: ["company-documents", orgId] });
  const [editing, setEditing] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const create = useMutation({
    mutationFn: (f: Form) =>
      api<CompanyDocumentDto>(orgPath(orgId, "/documents"), { method: "POST", body: toBody(f) }),
    onSuccess: async () => {
      setFormKey((k) => k + 1);
      await refresh();
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
      api<CompanyDocumentDto>(orgPath(orgId, `/documents/${encodeURIComponent(v.id)}`), {
        method: "PATCH",
        body: v.body,
      }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(orgPath(orgId, `/documents/${encodeURIComponent(id)}`), { method: "DELETE" }),
    onSuccess: refresh,
  });

  const items = list.data?.items ?? [];
  const active = items.filter((d) => !d.archived);
  const archived = items.filter((d) => d.archived);

  const row = (d: CompanyDocumentDto) =>
    editing === d.id ? (
      <tr key={d.id}>
        <td className="td" colSpan={4}>
          <DocumentForm
            initial={fromDto(d)}
            submitLabel="Save"
            pending={update.isPending}
            onSubmit={(f) => update.mutate({ id: d.id, body: toBody(f) })}
            onCancel={() => setEditing(null)}
          />
        </td>
      </tr>
    ) : (
      <Fragment key={d.id}>
        <tr className={d.archived ? "text-slate-500" : ""}>
          <td className="td">
            <div className="font-medium">{d.name}</div>
            {detailLine(d) && <div className="text-xs text-slate-500">{detailLine(d)}</div>}
            {d.notes && <div className="text-xs text-slate-500">{d.notes}</div>}
          </td>
          <td className="td whitespace-nowrap">
            {d.effectiveOn ? `${d.effectiveOn}${d.expiresOn ? " to " : ""}` : ""}
            {d.expiresOn ?? (d.effectiveOn ? "" : "—")}
          </td>
          <td className="td">
            {d.archived ? (
              "Archived"
            ) : (
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[d.status]}`}>
                {documentStatusText(d)}
              </span>
            )}
          </td>
          <td className="td whitespace-nowrap text-right">
            <span className="flex justify-end gap-2 text-sm">
              <button
                type="button"
                className="underline"
                aria-expanded={filesOpen === d.id}
                onClick={() => setFilesOpen(filesOpen === d.id ? null : d.id)}
              >
                {d.files.length
                  ? `Files (${d.files.length})`
                  : canEdit
                    ? "Add the file"
                    : "No files"}
              </button>
              {canEdit && (
                <>
                  <button type="button" className="underline" onClick={() => setEditing(d.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="underline"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: d.id, body: { archived: !d.archived } })}
                  >
                    {d.archived ? "Restore" : "Archive"}
                  </button>
                  <button
                    type="button"
                    className="underline text-red-700"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete ${d.name}?`)) remove.mutate(d.id);
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </span>
          </td>
        </tr>
        {filesOpen === d.id && (
          <tr>
            <td className="td" colSpan={4}>
              <DocumentFiles orgId={orgId} doc={d} canEdit={canEdit} onChanged={refresh} />
            </td>
          </tr>
        )}
      </Fragment>
    );

  const table = (rows: CompanyDocumentDto[]) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">Document</th>
            <th className="th">Dates</th>
            <th className="th">Status</th>
            <th className="th" />
          </tr>
        </thead>
        <tbody>{rows.map(row)}</tbody>
      </table>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="card space-y-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-xl font-semibold">Licenses and documents</h1>
            <Link to="/orgs/$orgId" params={{ orgId }} className="text-sm underline">
              Back to projects
            </Link>
          </div>
          <p className="text-sm text-slate-600">
            The papers GCs ask a subcontractor for besides insurance: contractor's licenses, the
            W-9, the surety's bonding letter, the safety program, the EMR letter, OSHA's 300A
            summary. PayApps flags a document {COMPANY_DOCUMENT_EXPIRING_DAYS} days before the
            expiry date you type, here, on the projects page and on any pay application dated within
            that window. It reads only what you type: it does not check a license with the state
            board. Insurance certificates are on the{" "}
            <Link to="/orgs/$orgId/insurance" params={{ orgId }} className="underline">
              insurance page
            </Link>
            .
          </p>
          {list.isLoading && <p>Loading…</p>}
          <ErrorText error={list.error ?? update.error ?? remove.error} />
          {list.data && items.length === 0 && (
            <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-600">
              No documents yet. Start with your contractor's license in each state you work in and
              the date you last signed a W-9: they are what most GCs ask for before the first
              payment.
            </p>
          )}
          {active.length > 0 && table(active)}
          {archived.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-slate-600">
                Archived ({archived.length})
              </summary>
              {table(archived)}
            </details>
          )}
        </section>
        {list.data && active.length > 0 && (
          <PrequalificationText
            items={items}
            company={membership?.orgName ?? ""}
            today={list.data.today}
          />
        )}
      </div>
      {canEdit && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Add a document</h2>
          <DocumentForm
            key={formKey}
            initial={EMPTY}
            submitLabel={create.isPending ? "Adding…" : "Add"}
            pending={create.isPending}
            onSubmit={(f) => create.mutate(f)}
          />
          <ErrorText error={create.error} />
        </section>
      )}
    </div>
  );
}

/** On the Projects page: a one-line note while an active document is expired or expiring. */
export function DocumentsAlert({ orgId }: { orgId: string }) {
  const list = useQuery(documentsQuery(orgId));
  const due = (list.data?.items ?? []).filter(
    (d) => !d.archived && (d.status === "expired" || d.status === "expiring"),
  );
  if (due.length === 0) return null;
  const expired = due.some((d) => d.status === "expired");
  return (
    <div
      role="status"
      className={`mb-4 rounded border p-3 text-sm ${expired ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}
    >
      {due
        .map((d) => `${d.name}: ${documentStatusText(d).toLowerCase()} (${d.expiresOn})`)
        .join("; ")}
      .{" "}
      <Link to="/orgs/$orgId/documents" params={{ orgId }} className="underline">
        Licenses and documents
      </Link>
    </div>
  );
}

/** On a pay application: documents lapsed by, or expiring soon after, its application date. */
export function PayAppDocumentsNote({
  orgId,
  applicationDate,
}: {
  orgId: string;
  applicationDate: string;
}) {
  const list = useQuery(documentsQuery(orgId));
  const warnings = payAppDocumentWarnings(list.data?.items ?? [], applicationDate);
  if (warnings.length === 0) return null;
  const lapsed = warnings.some((w) => w.kind === "lapsed");
  return (
    <section
      className={`card ${lapsed ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}
    >
      <h2 className="mb-1 font-semibold">Licenses and documents</h2>
      <ul className="list-disc pl-5 text-sm">
        {warnings.map((w) => (
          <li key={w.id}>{w.message}</li>
        ))}
      </ul>
      <Link to="/orgs/$orgId/documents" params={{ orgId }} className="text-sm underline">
        Update documents
      </Link>
    </section>
  );
}

/**
 * On a draft pay application: the files kept with the company's active documents, each a click from
 * the application's backup (a copy; the document keeps its own). An expired document's file is
 * offered with its status, so nobody sends a lapsed license without seeing it.
 */
export function DocumentsBackupOffer({ orgId, base }: { orgId: string; base: string }) {
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const role = me.data?.memberships.find((m) => m.orgId === orgId)?.role ?? "viewer";
  const canEdit = ROLE_RANK[role] >= ROLE_RANK.editor;
  const list = useQuery(documentsQuery(orgId));
  const attached = useQuery({
    queryKey: ["attachments", base],
    queryFn: () => api<{ items: { fileName: string }[] }>(`${base}/attachments`),
  });
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const copy = useMutation({
    mutationFn: (v: { documentId: string; fileId: string }) =>
      api(`${base}/attachments/from-documents`, { method: "POST", body: v }),
    onSuccess: (_r, v) => {
      setAdded((a) => ({ ...a, [v.fileId]: true }));
      return qc.invalidateQueries({ queryKey: ["attachments", base] });
    },
  });
  const offered = (list.data?.items ?? [])
    .filter((d) => !d.archived && d.files.length > 0)
    .flatMap((d) => d.files.map((f) => ({ doc: d, file: f })));
  if (!canEdit || offered.length === 0) return null;
  const onApp = new Set((attached.data?.items ?? []).map((a) => a.fileName));
  return (
    <section className="card max-w-2xl">
      <h2 className="mb-1 font-semibold">Licenses and documents on file</h2>
      <p className="mb-2 text-sm text-slate-600">
        Add a license, the W-9 or the bonding letter to this application's backup, so it goes in the
        one-PDF packet. A copy is attached; the document's own file stays on the{" "}
        <Link to="/orgs/$orgId/documents" params={{ orgId }} className="underline">
          documents page
        </Link>
        .
      </p>
      <ul className="divide-y divide-slate-200 text-sm">
        {offered.map(({ doc, file }) => {
          const done = added[file.id] || onApp.has(file.fileName);
          return (
            <li key={file.id} className="flex items-center justify-between gap-2 py-1">
              <span className="break-all">
                <span className="font-medium">{doc.name}</span>: {file.fileName}
                {(doc.status === "expired" || doc.status === "expiring") && (
                  <span className={`ml-2 rounded px-2 py-0.5 text-xs ${STATUS_CLASS[doc.status]}`}>
                    {documentStatusText(doc)}
                  </span>
                )}
              </span>
              {done ? (
                <span className="text-xs text-slate-500">In the backup</span>
              ) : (
                <button
                  type="button"
                  className="btn-secondary whitespace-nowrap"
                  disabled={copy.isPending}
                  onClick={() => copy.mutate({ documentId: doc.id, fileId: file.id })}
                >
                  Add to backup
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <ErrorText error={copy.error} />
    </section>
  );
}
