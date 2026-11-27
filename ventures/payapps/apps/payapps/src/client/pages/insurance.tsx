// Insurance certificates: the company's own certificates of insurance, typed from each certificate,
// with their status today (src/shared/insurance.ts). Editors add, change, archive and delete; every
// member reads. Also the two places that use them: a note on the Projects page while one is expired
// or expiring, and the pay application's warning about one that lapses by its date. Each certificate
// keeps its files (the certificate PDF, endorsements), which a pay application offers as backup, and
// its holders: the jobs whose GC holds it, so a renewal goes to each and a pay application can say
// whether its GC has the certificate on file.
import type { InsuranceCertificateDto, InsuranceListDto, ProjectDto } from "@shared/api/types";
import { ROLE_RANK } from "@shared/enums";
import {
  holdersByGc,
  INSURANCE_EXPIRING_DAYS,
  INSURANCE_KIND_LABELS,
  INSURANCE_KINDS,
  type InsuranceKind,
  jobCertificates,
  joinNames,
  payAppInsuranceWarnings,
} from "@shared/insurance";
import { renewedCertificate } from "@shared/insurance-renewal-email";
import {
  checkRequirements,
  ENDORSEMENTS,
  LIMIT_LABELS,
  requirementGapLines,
} from "@shared/insurance-requirements";
import { centsToDecimal } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { AttachmentsPanel } from "../components/attachments";
import { ErrorText } from "../components/error";
import { RenewalEmailsPanel } from "../components/insurance-renewal-email";
import {
  coverageSummary,
  parseLimit,
  requirementsQuery,
} from "../components/insurance-requirements";
import { meQuery } from "../components/layout";
import { api, orgPath } from "../lib/api";

export const insuranceQuery = (orgId: string) => ({
  queryKey: ["insurance", orgId],
  queryFn: () => api<InsuranceListDto>(orgPath(orgId, "/insurance")),
});

interface Form {
  kind: InsuranceKind;
  label: string;
  carrier: string;
  policyNumber: string;
  effectiveOn: string;
  expiresOn: string;
  notes: string;
  /** Limits as typed, in dollars; blank when not on the certificate. */
  eachOccurrence: string;
  aggregate: string;
  additionalInsured: boolean;
  waiverOfSubrogation: boolean;
  primaryNoncontributory: boolean;
}
type TextKey = Exclude<
  keyof Form,
  "kind" | "additionalInsured" | "waiverOfSubrogation" | "primaryNoncontributory"
>;

const EMPTY: Form = {
  kind: "general_liability",
  label: "",
  carrier: "",
  policyNumber: "",
  effectiveOn: "",
  expiresOn: "",
  notes: "",
  eachOccurrence: "",
  aggregate: "",
  additionalInsured: false,
  waiverOfSubrogation: false,
  primaryNoncontributory: false,
};

const toBody = (f: Form) => ({
  kind: f.kind,
  label: f.label.trim() || null,
  carrier: f.carrier.trim() || null,
  policyNumber: f.policyNumber.trim() || null,
  effectiveOn: f.effectiveOn || null,
  expiresOn: f.expiresOn,
  notes: f.notes.trim() || null,
  eachOccurrenceCents: parseLimit(f.eachOccurrence, LIMIT_LABELS[f.kind].each),
  aggregateCents: parseLimit(f.aggregate, LIMIT_LABELS[f.kind].aggregate),
  additionalInsured: f.additionalInsured,
  waiverOfSubrogation: f.waiverOfSubrogation,
  primaryNoncontributory: f.primaryNoncontributory,
});

const fromDto = (c: InsuranceCertificateDto): Form => ({
  kind: c.kind,
  label: c.label ?? "",
  carrier: c.carrier ?? "",
  policyNumber: c.policyNumber ?? "",
  effectiveOn: c.effectiveOn ?? "",
  expiresOn: c.expiresOn,
  notes: c.notes ?? "",
  eachOccurrence: c.eachOccurrenceCents === null ? "" : centsToDecimal(c.eachOccurrenceCents),
  aggregate: c.aggregateCents === null ? "" : centsToDecimal(c.aggregateCents),
  additionalInsured: c.additionalInsured,
  waiverOfSubrogation: c.waiverOfSubrogation,
  primaryNoncontributory: c.primaryNoncontributory,
});

export function statusText(c: Pick<InsuranceCertificateDto, "status" | "daysLeft">): string {
  if (c.status === "expired") {
    return c.daysLeft === 0 ? "Expires today" : `Expired ${-c.daysLeft} days ago`;
  }
  if (c.status === "expiring") return `Expires in ${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"}`;
  return "Current";
}

const STATUS_CLASS: Record<InsuranceCertificateDto["status"], string> = {
  expired: "bg-red-100 text-red-800",
  expiring: "bg-amber-100 text-amber-900",
  current: "bg-emerald-100 text-emerald-800",
};

function CertificateForm({
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
  const [err, setErr] = useState<string | null>(null);
  const input = (key: TextKey, label: string, type = "text") => (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        className="input"
        type={type}
        value={f[key]}
        required={key === "expiresOn"}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          toBody(f);
        } catch (x) {
          setErr((x as Error).message);
          return;
        }
        setErr(null);
        onSubmit(f);
      }}
    >
      <label className="block text-sm">
        <span className="text-slate-600">Coverage</span>
        <select
          className="input"
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value as InsuranceKind })}
        >
          {INSURANCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {INSURANCE_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      {input("label", f.kind === "other" ? "Name (e.g. Inland marine)" : "Name (optional)")}
      {input("carrier", "Insurer (optional)")}
      {input("policyNumber", "Policy number (optional)")}
      <div className="grid grid-cols-2 gap-2">
        {input("effectiveOn", "Effective (optional)", "date")}
        {input("expiresOn", "Expires", "date")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {input("eachOccurrence", `${LIMIT_LABELS[f.kind].each} limit (optional, $)`)}
        {input("aggregate", `${LIMIT_LABELS[f.kind].aggregate} limit (optional, $)`)}
      </div>
      <fieldset className="text-sm">
        <legend className="text-slate-600">Shown on the certificate</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {ENDORSEMENTS.map((en) => (
            <label key={en.key} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={f[en.key]}
                onChange={(e) => setF({ ...f, [en.key]: e.target.checked })}
              />
              {en.label}
            </label>
          ))}
        </div>
      </fieldset>
      {input("notes", "Notes (optional)")}
      {err && (
        <p role="alert" className="text-sm text-red-700">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn" disabled={pending || !f.expiresOn}>
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

export function InsurancePage() {
  const { orgId } = useParams({ from: "/orgs/$orgId/insurance" });
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const role = me.data?.memberships.find((m) => m.orgId === orgId)?.role ?? "viewer";
  const canEdit = ROLE_RANK[role] >= ROLE_RANK.editor;
  const list = useQuery(insuranceQuery(orgId));
  const refresh = () => qc.invalidateQueries({ queryKey: ["insurance", orgId] });
  const [editing, setEditing] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState<string | null>(null);
  const [holdersOpen, setHoldersOpen] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState<string | null>(null);
  const from = {
    name: me.data?.user.name ?? "",
    company: me.data?.memberships.find((m) => m.orgId === orgId)?.orgName ?? "",
  };
  const [formKey, setFormKey] = useState(0);

  const create = useMutation({
    mutationFn: (f: Form) =>
      api<InsuranceCertificateDto>(orgPath(orgId, "/insurance"), {
        method: "POST",
        body: toBody(f),
      }),
    onSuccess: async () => {
      setFormKey((k) => k + 1);
      await refresh();
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
      api<InsuranceCertificateDto>(orgPath(orgId, `/insurance/${encodeURIComponent(v.id)}`), {
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
      api(orgPath(orgId, `/insurance/${encodeURIComponent(id)}`), { method: "DELETE" }),
    onSuccess: refresh,
  });

  const items = list.data?.items ?? [];
  const active = items.filter((c) => !c.archived);
  const archived = items.filter((c) => c.archived);

  const row = (c: InsuranceCertificateDto) =>
    editing === c.id ? (
      <tr key={c.id}>
        <td className="td" colSpan={5}>
          <CertificateForm
            initial={fromDto(c)}
            submitLabel="Save"
            pending={update.isPending}
            onSubmit={(f) => update.mutate({ id: c.id, body: toBody(f) })}
            onCancel={() => setEditing(null)}
          />
        </td>
      </tr>
    ) : (
      <Fragment key={c.id}>
        <tr className={c.archived ? "text-slate-500" : ""}>
          <td className="td">
            <div className="font-medium">{c.name}</div>
            {coverageSummary(c) && (
              <div className="text-xs text-slate-500">{coverageSummary(c)}</div>
            )}
            {c.notes && <div className="text-xs text-slate-500">{c.notes}</div>}
            <HoldersLine c={c} all={items} />
          </td>
          <td className="td">
            {c.carrier ?? "—"}
            {c.policyNumber && <div className="text-xs text-slate-500">#{c.policyNumber}</div>}
          </td>
          <td className="td whitespace-nowrap">
            {c.effectiveOn ? `${c.effectiveOn} to ` : ""}
            {c.expiresOn}
          </td>
          <td className="td">
            {c.archived ? (
              "Archived"
            ) : (
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[c.status]}`}>
                {statusText(c)}
              </span>
            )}
          </td>
          <td className="td whitespace-nowrap text-right">
            <span className="flex justify-end gap-2 text-sm">
              <button
                type="button"
                className="underline"
                aria-expanded={filesOpen === c.id}
                onClick={() => setFilesOpen(filesOpen === c.id ? null : c.id)}
              >
                {c.files.length
                  ? `Files (${c.files.length})`
                  : canEdit
                    ? "Add the PDF"
                    : "No files"}
              </button>
              <button
                type="button"
                className="underline"
                aria-expanded={holdersOpen === c.id}
                onClick={() => setHoldersOpen(holdersOpen === c.id ? null : c.id)}
              >
                {c.holders.length ? `Jobs (${c.holders.length})` : canEdit ? "Sent to…" : "No jobs"}
              </button>
              {canEmail(c, items) && (
                <button
                  type="button"
                  className="underline"
                  aria-expanded={emailOpen === c.id}
                  onClick={() => setEmailOpen(emailOpen === c.id ? null : c.id)}
                >
                  Email GCs
                </button>
              )}
              {canEdit && (
                <>
                  <button type="button" className="underline" onClick={() => setEditing(c.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="underline"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: c.id, body: { archived: !c.archived } })}
                  >
                    {c.archived ? "Restore" : "Archive"}
                  </button>
                  <button
                    type="button"
                    className="text-red-700 underline"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete the ${c.name} certificate?`)) remove.mutate(c.id);
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </span>
          </td>
        </tr>
        {holdersOpen === c.id && (
          <tr>
            <td className="td" colSpan={5}>
              <HoldersPanel
                orgId={orgId}
                cert={c}
                all={items}
                canEdit={canEdit}
                onSaved={async () => {
                  setHoldersOpen(null);
                  await refresh();
                }}
              />
            </td>
          </tr>
        )}
        {emailOpen === c.id && list.data && (
          <tr>
            <td className="td" colSpan={5}>
              <RenewalEmailsPanel
                orgId={orgId}
                cert={c}
                all={items}
                from={from}
                today={list.data.today}
                canEdit={canEdit}
                onSaved={refresh}
              />
            </td>
          </tr>
        )}
        {filesOpen === c.id && (
          <tr>
            <td className="td" colSpan={5}>
              <AttachmentsPanel
                base={orgPath(orgId, `/insurance/${encodeURIComponent(c.id)}`)}
                holder="insurance"
                embedded
                onChanged={refresh}
              />
            </td>
          </tr>
        )}
      </Fragment>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="card space-y-3 lg:col-span-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Insurance certificates</h1>
          <Link to="/orgs/$orgId" params={{ orgId }} className="text-sm underline">
            Back to projects
          </Link>
        </div>
        <p className="text-sm text-slate-600">
          Your company's certificates of insurance, as GCs hold them. Record which jobs' GCs hold
          each one ("Sent to…"): a renewal then lists every GC to send it to, and each pay
          application says whether its GC has the certificate on file. Many GCs will not release a
          payment while the certificate they have on file is expired, so PayApps flags a certificate{" "}
          {INSURANCE_EXPIRING_DAYS} days before it expires, here, on the projects page and on any
          pay application dated within that window. PayApps reads only the dates you type; it does
          not check coverage, limits or what a subcontract requires.
        </p>
        {list.isLoading && <p>Loading…</p>}
        <ErrorText error={list.error ?? update.error ?? remove.error} />
        {list.data && items.length === 0 && (
          <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-600">
            No certificates yet. Add each policy from the certificate your agent sends you: general
            liability, auto and workers' compensation are the ones most subcontracts ask for.
          </p>
        )}
        {active.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Coverage</th>
                  <th className="th">Insurer</th>
                  <th className="th">Policy period</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>{active.map(row)}</tbody>
            </table>
          </div>
        )}
        {archived.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-slate-600">
              Archived ({archived.length})
            </summary>
            <table className="mt-2 w-full">
              <tbody>{archived.map(row)}</tbody>
            </table>
          </details>
        )}
      </section>
      {canEdit && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Add a certificate</h2>
          <p className="text-xs text-slate-500">
            When a policy renews, add the new certificate and archive the old one.
          </p>
          <ErrorText error={create.error} />
          <CertificateForm
            key={formKey}
            initial={EMPTY}
            submitLabel={create.isPending ? "Adding…" : "Add certificate"}
            pending={create.isPending}
            onSubmit={(f) => create.mutate(f)}
          />
        </section>
      )}
    </div>
  );
}

/**
 * "Email GCs" is offered on an active certificate not yet expired that someone holds, or that renews
 * one someone held (src/shared/insurance-renewal-email.ts).
 */
export function canEmail(c: InsuranceCertificateDto, all: InsuranceCertificateDto[]): boolean {
  if (c.archived || c.status === "expired") return false;
  return c.holders.length > 0 || renewedCertificate(c, all) !== null;
}

/** Under a certificate's name: who holds it, and, while it is expired or expiring, who needs the renewal. */
function HoldersLine({ c, all }: { c: InsuranceCertificateDto; all: InsuranceCertificateDto[] }) {
  if (c.holders.length === 0) return null;
  const gcs = holdersByGc(c.holders);
  const names = joinNames(gcs.map((g) => g.gcName));
  if (!c.archived && c.status !== "current") {
    // The renewal already typed in: a later active certificate of the same coverage.
    const renewal = all.find(
      (x) => !x.archived && x.kind === c.kind && x.id !== c.id && x.expiresOn > c.expiresOn,
    );
    return (
      <div className="text-xs font-medium text-amber-900">
        Send the renewal to {names}
        {renewal
          ? ` ("Email GCs" on the ${renewal.name} to ${renewal.expiresOn} drafts it)`
          : " (add the renewed certificate when your agent sends it to draft the email)"}
      </div>
    );
  }
  return <div className="text-xs text-slate-500">Held by {names}</div>;
}

interface HolderRow {
  checked: boolean;
  sentOn: string;
}

/**
 * The jobs whose GC holds one certificate: a checkbox and an optional sent date a job. Editors save
 * the whole list; viewers read it. Offers the jobs of the archived certificate of the same coverage
 * it replaces, since a renewal usually goes to the same GCs.
 */
export function HoldersPanel({
  orgId,
  cert,
  all,
  canEdit,
  onSaved,
}: {
  orgId: string;
  cert: InsuranceCertificateDto;
  all: InsuranceCertificateDto[];
  canEdit: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const projects = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => api<{ items: ProjectDto[] }>(orgPath(orgId, "/projects")),
  });
  const initial = () =>
    Object.fromEntries(
      cert.holders.map((h) => [h.projectId, { checked: true, sentOn: h.sentOn ?? "" }]),
    ) as Record<string, HolderRow>;
  const [rows, setRows] = useState<Record<string, HolderRow>>(initial);
  const save = useMutation({
    mutationFn: () =>
      api(orgPath(orgId, `/insurance/${encodeURIComponent(cert.id)}/holders`), {
        method: "PUT",
        body: {
          holders: Object.entries(rows)
            .filter(([, r]) => r.checked)
            .map(([projectId, r]) => ({ projectId, sentOn: r.sentOn || null })),
        },
      }),
    onSuccess: onSaved,
  });
  const jobs = [...(projects.data?.items ?? [])].sort(
    (a, b) =>
      Number(a.status === "closed") - Number(b.status === "closed") || a.name.localeCompare(b.name),
  );
  // The archived certificate of the same coverage with the most holders: the one this renews.
  const previous = all
    .filter((x) => x.archived && x.kind === cert.kind && x.id !== cert.id && x.holders.length > 0)
    .sort((a, b) => b.expiresOn.localeCompare(a.expiresOn))[0];

  if (!canEdit) {
    return cert.holders.length === 0 ? (
      <p className="text-sm text-slate-600">No jobs recorded as holding this certificate.</p>
    ) : (
      <ul className="list-disc pl-5 text-sm">
        {cert.holders.map((h) => (
          <li key={h.projectId}>
            {h.gcName} ({h.projectName}){h.sentOn ? `, sent ${h.sentOn}` : ""}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        Tick each job whose GC has been sent this certificate (the certificate holder on it), with
        the date you sent it if you know it.
      </p>
      {previous && cert.holders.length === 0 && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            setRows((r) => ({
              ...r,
              ...Object.fromEntries(
                previous.holders.map((h) => [h.projectId, { checked: true, sentOn: "" }]),
              ),
            }))
          }
        >
          Same jobs as the archived {previous.name} (expired {previous.expiresOn})
        </button>
      )}
      {projects.isLoading && <p className="text-sm">Loading jobs…</p>}
      {projects.data && jobs.length === 0 && <p className="text-sm text-slate-600">No jobs yet.</p>}
      <ul className="divide-y divide-slate-200 text-sm">
        {jobs.map((p) => {
          const r = rows[p.id] ?? { checked: false, sentOn: "" };
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={r.checked}
                  onChange={(e) =>
                    setRows({ ...rows, [p.id]: { ...r, checked: e.target.checked } })
                  }
                />
                <span>
                  <span className="font-medium">{p.gcName}</span> ({p.name}
                  {p.status === "closed" ? ", closed" : ""})
                </span>
              </label>
              {r.checked && (
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  Sent
                  <input
                    className="input w-auto"
                    type="date"
                    aria-label={`Date sent to ${p.gcName} for ${p.name}`}
                    value={r.sentOn}
                    onChange={(e) => setRows({ ...rows, [p.id]: { ...r, sentOn: e.target.value } })}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <ErrorText error={projects.error ?? save.error} />
      <button type="button" className="btn" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save jobs"}
      </button>
    </div>
  );
}

/** On the Projects page: a one-line note while an active certificate is expired or expiring. */
export function InsuranceAlert({ orgId }: { orgId: string }) {
  const list = useQuery(insuranceQuery(orgId));
  const due = (list.data?.items ?? []).filter((c) => !c.archived && c.status !== "current");
  if (due.length === 0) return null;
  const expired = due.filter((c) => c.status === "expired");
  return (
    <div
      role="status"
      className={`mb-4 rounded border p-3 text-sm ${expired.length ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}
    >
      {due.map((c) => `${c.name}: ${statusText(c).toLowerCase()} (${c.expiresOn})`).join("; ")}.{" "}
      <Link to="/orgs/$orgId/insurance" params={{ orgId }} className="underline">
        Insurance certificates
      </Link>
    </div>
  );
}

/** On a pay application: certificates lapsed by, or expiring soon after, its application date. */
export function PayAppInsuranceNote({
  orgId,
  applicationDate,
  projectId,
}: {
  orgId: string;
  applicationDate: string;
  /** The application's job: its insurance requirements are checked on the application date too. */
  projectId?: string;
}) {
  const list = useQuery(insuranceQuery(orgId));
  const reqs = useQuery({
    ...requirementsQuery(orgId, projectId ?? ""),
    enabled: Boolean(projectId),
  });
  const warnings = payAppInsuranceWarnings(list.data?.items ?? [], applicationDate);
  // Lapsed certificates are already warned about above; the requirement lines add the rest.
  const gaps = requirementGapLines(
    checkRequirements(reqs.data?.requirements ?? [], list.data?.items ?? [], applicationDate).map(
      (c) => ({ ...c, gaps: c.gaps.filter((g) => g.kind !== "lapsed") }),
    ),
  );
  if (warnings.length === 0 && gaps.length === 0) return null;
  const lapsed = warnings.some((w) => w.kind === "lapsed") || gaps.length > 0;
  return (
    <section
      className={`card ${lapsed ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}
    >
      <h2 className="mb-1 font-semibold">Insurance certificates</h2>
      <ul className="list-disc pl-5 text-sm">
        {warnings.map((w) => (
          <li key={w.id}>{w.message}</li>
        ))}
      </ul>
      {gaps.length > 0 && (
        <>
          <p className="mt-2 text-sm font-medium">
            Short of this job's insurance requirements on {applicationDate}:
          </p>
          <ul className="list-disc pl-5 text-sm">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </>
      )}
      <Link to="/orgs/$orgId/insurance" params={{ orgId }} className="text-sm underline">
        Update certificates
      </Link>
    </section>
  );
}

/**
 * On a draft pay application: the files kept with the company's active certificates, each one click
 * from this application's backup (a copy; many GCs want the current certificate with every pay
 * application). Hidden when no active certificate has a file.
 */
export function InsuranceBackupOffer({
  orgId,
  base,
  projectId,
}: {
  orgId: string;
  base: string;
  /** The pay application's job: says which certificates its GC holds, once holders are recorded. */
  projectId?: string;
}) {
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const role = me.data?.memberships.find((m) => m.orgId === orgId)?.role ?? "viewer";
  const canEdit = ROLE_RANK[role] >= ROLE_RANK.editor;
  const list = useQuery(insuranceQuery(orgId));
  const attached = useQuery({
    queryKey: ["attachments", base],
    queryFn: () => api<{ items: { fileName: string }[] }>(`${base}/attachments`),
  });
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const copy = useMutation({
    mutationFn: (v: { certificateId: string; fileId: string }) =>
      api(`${base}/attachments/from-insurance`, { method: "POST", body: v }),
    onSuccess: (_r, v) => {
      setAdded((a) => ({ ...a, [v.fileId]: true }));
      return qc.invalidateQueries({ queryKey: ["attachments", base] });
    },
  });
  const offered = (list.data?.items ?? [])
    .filter((c) => !c.archived && c.files.length > 0)
    .flatMap((c) => c.files.map((f) => ({ cert: c, file: f })));
  const forJob = projectId ? jobCertificates(list.data?.items ?? [], projectId) : null;
  const heldBy = new Map((forJob ?? []).map((j) => [j.id, j]));
  const notHeld = (forJob ?? []).filter((j) => !j.held);
  if (!canEdit || (offered.length === 0 && notHeld.length === 0)) return null;
  const onApp = new Set((attached.data?.items ?? []).map((a) => a.fileName));
  return (
    <section className="card max-w-2xl">
      <h2 className="mb-1 font-semibold">Insurance certificates on file</h2>
      <p className="mb-2 text-sm text-slate-600">
        Add a certificate to this application's backup, so it goes in the one-PDF packet. A copy is
        attached; the certificate's own file stays on the insurance page.
      </p>
      {notHeld.length > 0 && (
        <p className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
          Not recorded as sent to this job's GC: {joinNames(notHeld.map((j) => j.name))}. If the GC
          asks for it, send it with this application and tick the job under "Sent to…" on the{" "}
          <Link to="/orgs/$orgId/insurance" params={{ orgId }} className="underline">
            insurance page
          </Link>
          .
        </p>
      )}
      <ul className="divide-y divide-slate-200 text-sm">
        {offered.map(({ cert, file }) => {
          const done = added[file.id] || onApp.has(file.fileName);
          return (
            <li key={file.id} className="flex items-center justify-between gap-2 py-1">
              <span className="break-all">
                <span className="font-medium">{cert.name}</span>: {file.fileName}
                {cert.status !== "current" && (
                  <span className={`ml-2 rounded px-2 py-0.5 text-xs ${STATUS_CLASS[cert.status]}`}>
                    {statusText(cert)}
                  </span>
                )}
                {heldBy.get(cert.id)?.held && (
                  <span className="ml-2 text-xs text-slate-500">
                    GC has it
                    {heldBy.get(cert.id)?.sentOn ? ` (sent ${heldBy.get(cert.id)?.sentOn})` : ""}
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
                  onClick={() => copy.mutate({ certificateId: cert.id, fileId: file.id })}
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
