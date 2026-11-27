// Insurance requirements on a job (insurance certificates, part 4): what the job's subcontract asks
// the company to carry, one row a coverage, and each checked against the certificates on file today
// (src/shared/insurance-requirements.ts has the rules). Every member reads; editors change the list.
// Editors can fill the list from the subcontract's insurance exhibit (part 6): a PDF or pasted text,
// read in the browser by src/shared/insurance-exhibit.ts, each value shown with the sentence it came
// from, saved only when they press Save.
import type { JobInsuranceRequirementsDto } from "@shared/api/types";
import { ROLE_RANK } from "@shared/enums";
import { INSURANCE_KIND_LABELS, INSURANCE_KINDS, type InsuranceKind } from "@shared/insurance";
import {
  type ExhibitReading,
  exhibitLinesFromPdf,
  MAX_EXHIBIT_CHARS,
  readInsuranceExhibit,
} from "@shared/insurance-exhibit";
import {
  ENDORSEMENTS,
  type EndorsementKey,
  formatLimit,
  type InsuranceRequirement,
  LIMIT_LABELS,
  requirementText,
} from "@shared/insurance-requirements";
import { centsToDecimal, parseDollarsToCents } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { api, orgPath } from "../lib/api";
import { browserOcr } from "../lib/ocr";
import { ErrorText } from "./error";
import { meQuery } from "./layout";

export const requirementsQuery = (orgId: string, projectId: string) => ({
  queryKey: ["insurance-requirements", orgId, projectId],
  queryFn: () =>
    api<JobInsuranceRequirementsDto>(
      orgPath(orgId, `/insurance/requirements/${encodeURIComponent(projectId)}`),
    ),
});

export interface Row {
  kind: InsuranceKind;
  each: string;
  aggregate: string;
  additionalInsured: boolean;
  waiverOfSubrogation: boolean;
  primaryNoncontributory: boolean;
  umbrellaCounts: boolean;
}

const toRow = (r: InsuranceRequirement): Row => ({
  kind: r.kind,
  each: r.eachOccurrenceCents === null ? "" : centsToDecimal(r.eachOccurrenceCents),
  aggregate: r.aggregateCents === null ? "" : centsToDecimal(r.aggregateCents),
  additionalInsured: r.additionalInsured,
  waiverOfSubrogation: r.waiverOfSubrogation,
  primaryNoncontributory: r.primaryNoncontributory,
  umbrellaCounts: r.umbrellaCounts,
});

/** A typed limit to cents: blank is "none asked", anything else must be whole or two-decimal dollars. */
export function parseLimit(text: string, label: string): number | null {
  if (!text.trim()) return null;
  const cents = parseDollarsToCents(text);
  if (cents === null || cents < 0) throw new Error(`${label}: enter dollars, or leave it blank`);
  return cents;
}

const fromRow = (r: Row): InsuranceRequirement => ({
  kind: r.kind,
  eachOccurrenceCents: parseLimit(
    r.each,
    `${INSURANCE_KIND_LABELS[r.kind]} ${LIMIT_LABELS[r.kind].each.toLowerCase()}`,
  ),
  aggregateCents: parseLimit(
    r.aggregate,
    `${INSURANCE_KIND_LABELS[r.kind]} ${LIMIT_LABELS[r.kind].aggregate.toLowerCase()}`,
  ),
  additionalInsured: r.additionalInsured,
  waiverOfSubrogation: r.waiverOfSubrogation,
  primaryNoncontributory: r.primaryNoncontributory,
  umbrellaCounts: r.umbrellaCounts,
});

const blankRow = (kind: InsuranceKind): Row => ({
  kind,
  each: "",
  aggregate: "",
  additionalInsured: false,
  waiverOfSubrogation: false,
  primaryNoncontributory: false,
  umbrellaCounts: false,
});

/**
 * The exhibit laid over the form: a coverage it names takes the limits it gives (a limit it does not
 * give keeps what is typed) and the endorsements it asks for (none is unticked); other rows stay.
 */
export function mergeExhibitRows(rows: readonly Row[], reading: ExhibitReading): Row[] {
  const out = rows.map((r) => ({ ...r }));
  for (const { requirement } of reading.found) {
    const f = toRow(requirement);
    const i = out.findIndex((r) => r.kind === f.kind);
    const r = out[i];
    if (!r) {
      out.push(f);
      continue;
    }
    out[i] = {
      kind: r.kind,
      each: f.each || r.each,
      aggregate: f.aggregate || r.aggregate,
      additionalInsured: r.additionalInsured || f.additionalInsured,
      waiverOfSubrogation: r.waiverOfSubrogation || f.waiverOfSubrogation,
      primaryNoncontributory: r.primaryNoncontributory || f.primaryNoncontributory,
      umbrellaCounts: r.umbrellaCounts || f.umbrellaCounts,
    };
  }
  return out;
}

/** Reads the subcontract's insurance exhibit (a PDF or pasted text) in the browser. */
function ExhibitReader({
  onRead,
  contractSumCents,
}: {
  onRead: (r: ExhibitReading) => void;
  contractSumCents: number | null;
}) {
  const options = { contractSumCents };
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [ocrPage, setOcrPage] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<{ from: string; r: ExhibitReading } | null>(null);

  const done = (from: string, r: ExhibitReading) => {
    setReading({ from, r });
    if (r.found.length) onRead(r);
  };

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReading(null);
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
        const t = await exhibitLinesFromPdf(bytes, {
          ocr: browserOcr,
          onOcrProgress: (page, pages) => setOcrPage([page, pages]),
        });
        if (!t.ok) setError(t.error);
        else done(file.name, readInsuranceExhibit(t.lines, options));
      } else {
        done(file.name, readInsuranceExhibit(new TextDecoder().decode(bytes), options));
      }
    } catch {
      setError("This file could not be read. Paste the exhibit's text instead.");
    } finally {
      setBusy(false);
      setOcrPage(null);
    }
  }

  return (
    <div className="rounded border border-slate-200 p-2 text-sm">
      <p className="font-medium">Read from the subcontract's insurance exhibit</p>
      <p className="mb-2 text-slate-600">
        Choose the exhibit (a PDF, or a text file) or paste its text. It is read here in your
        browser and not uploaded. The coverages, limits and endorsements found are filled in below
        with the sentence each came from: check every one against the subcontract before you save,
        because exhibits are worded many ways and a value read from the wrong line is possible.
      </p>
      <label className="block">
        <span className="text-slate-600">Exhibit file</span>
        <input
          type="file"
          className="block"
          accept=".pdf,.txt,application/pdf,text/plain"
          disabled={busy}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <label className="mt-2 block">
        <span className="text-slate-600">Or paste the exhibit's text</span>
        <textarea
          className="input h-24"
          value={pasted}
          maxLength={MAX_EXHIBIT_CHARS}
          onChange={(e) => setPasted(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn-secondary mt-1"
        disabled={busy || !pasted.trim()}
        onClick={() => {
          setError(null);
          done("the pasted text", readInsuranceExhibit(pasted, options));
        }}
      >
        Read pasted text
      </button>
      {busy && (
        <p className="mt-1 text-slate-600" role="status">
          Reading…
          {ocrPage &&
            ` The PDF is a scan: reading its text, page ${ocrPage[0]} of ${ocrPage[1]} (a few seconds a page).`}
        </p>
      )}
      {error && (
        <p className="mt-1 text-red-700" role="alert">
          {error}
        </p>
      )}
      {reading && (
        <div className="mt-2" aria-live="polite">
          {reading.r.found.length === 0 ? (
            <p className="text-slate-700">
              No coverage was found in {reading.from}. Type the requirements below instead.
            </p>
          ) : (
            <>
              <p className="text-slate-700">
                Read {reading.r.found.length}{" "}
                {reading.r.found.length === 1 ? "coverage" : "coverages"} from {reading.from} and
                filled them in below. Not saved yet.
              </p>
              <ul className="mt-1 space-y-1">
                {reading.r.found.map((f) => (
                  <li key={f.requirement.kind}>
                    <span className="font-medium">{INSURANCE_KIND_LABELS[f.requirement.kind]}</span>
                    {f.evidence.length === 0 ? (
                      <span className="text-slate-600">
                        : named, with no limit or endorsement read.
                      </span>
                    ) : (
                      <ul className="list-disc pl-5 text-slate-700">
                        {f.evidence.map((e) => (
                          <li key={`${e.what}|${e.quote}`}>
                            {e.what}: <q className="text-slate-500">{e.quote}</q>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {reading.r.tiers.length > 0 && (
            <p className="mt-1 text-slate-700">
              The exhibit sets limits by contract size.{" "}
              {reading.r.jobTier && contractSumCents
                ? `This job's contract sum of ${formatLimit(contractSumCents)} falls in ${reading.r.jobTier}, so that tier's limits are filled in.`
                : "Check which tier applies to this job."}
            </p>
          )}
          {reading.r.unplaced.length > 0 && (
            <div className="mt-1">
              <p className="text-slate-700">
                Amounts not placed (type them in if they are limits):
              </p>
              <ul className="list-disc pl-5 text-slate-700">
                {reading.r.unplaced.map((e) => (
                  <li key={`${e.what}|${e.quote}`}>
                    {e.what}: <q className="text-slate-500">{e.quote}</q>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reading.r.notes.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-amber-800">
              {reading.r.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function JobInsuranceRequirements({
  orgId,
  projectId,
  contractSumCents = null,
}: {
  orgId: string;
  projectId: string;
  /** The job's original contract sum: it picks the tier when an exhibit sets limits by contract size. */
  contractSumCents?: number | null;
}) {
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const role = me.data?.memberships.find((m) => m.orgId === orgId)?.role ?? "viewer";
  const canEdit = ROLE_RANK[role] >= ROLE_RANK.editor;
  const q = useQuery(requirementsQuery(orgId, projectId));
  const [rows, setRows] = useState<Row[] | null>(null);
  const save = useMutation({
    mutationFn: (list: Row[]) =>
      api<JobInsuranceRequirementsDto>(
        orgPath(orgId, `/insurance/requirements/${encodeURIComponent(projectId)}`),
        { method: "PUT", body: { requirements: list.map(fromRow) } },
      ),
    onSuccess: (d) => {
      qc.setQueryData(requirementsQuery(orgId, projectId).queryKey, d);
      setRows(null);
    },
  });
  const data = q.data;
  if (!data) return null;
  const editing = rows !== null;
  const unused = (list: Row[]) => INSURANCE_KINDS.filter((k) => !list.some((r) => r.kind === k));
  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => (rs ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const unmet = data.checks.filter((c) => !c.met);

  return (
    <section className="card" aria-labelledby="insurance-req-h">
      <h2 id="insurance-req-h" className="mb-1 font-semibold">
        Insurance the subcontract requires
      </h2>
      <p className="mb-2 text-sm text-slate-600">
        Type what this job's subcontract (or the GC's insurance exhibit) asks you to carry, or read
        it from the exhibit's PDF. Each line is checked against the certificates on your{" "}
        <Link to="/orgs/$orgId/insurance" params={{ orgId }} className="underline">
          insurance page
        </Link>
        , so a short limit or a missing endorsement shows before the GC sends a pay application
        back. PayApps reads what you typed from the certificate, not the policy: your broker
        confirms the coverage.
      </p>

      {!editing && data.requirements.length === 0 && (
        <p className="text-sm text-slate-500">No requirements recorded for this job.</p>
      )}

      {!editing && data.checks.length > 0 && (
        <ul className="divide-y divide-slate-200 text-sm">
          {data.checks.map((c, i) => {
            const r = data.requirements[i] as InsuranceRequirement;
            return (
              <li key={c.kind} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${c.met ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
                  >
                    {c.met ? "Met" : "Gap"}
                  </span>
                  <span>{requirementText(r)}</span>
                </div>
                {c.met && c.certificateName && (
                  <p className="mt-1 text-xs text-slate-500">
                    By {c.certificateName}
                    {c.usedUmbrella ? " with the umbrella" : ""}.
                  </p>
                )}
                {!c.met && (
                  <ul className="mt-1 list-disc pl-5 text-slate-700">
                    {c.gaps.map((g) => (
                      <li key={g.message}>{g.message}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!editing && unmet.length > 0 && (
        <p className="mt-2 text-sm text-slate-600">
          {unmet.length} of {data.checks.length} not met on {data.today}. Ask your insurance agent
          for a certificate (or endorsement) that shows them, and update it on the insurance page.
        </p>
      )}

      {!editing && canEdit && (
        <button
          type="button"
          className="btn-secondary mt-2"
          onClick={() => setRows(data.requirements.map(toRow))}
        >
          {data.requirements.length ? "Change requirements" : "Add requirements"}
        </button>
      )}

      {editing && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(rows);
          }}
        >
          <ExhibitReader
            contractSumCents={contractSumCents}
            onRead={(reading) => setRows((rs) => mergeExhibitRows(rs ?? [], reading))}
          />
          {rows.map((r, i) => (
            <fieldset key={r.kind} className="rounded border border-slate-200 p-2">
              <legend className="px-1 text-sm font-medium">{INSURANCE_KIND_LABELS[r.kind]}</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="text-slate-600">{LIMIT_LABELS[r.kind].each} (optional, $)</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={r.each}
                    onChange={(e) => set(i, { each: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">
                    {LIMIT_LABELS[r.kind].aggregate} (optional, $)
                  </span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={r.aggregate}
                    onChange={(e) => set(i, { aggregate: e.target.value })}
                  />
                </label>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {ENDORSEMENTS.map((en) => (
                  <label key={en.key} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={r[en.key as EndorsementKey]}
                      onChange={(e) => set(i, { [en.key]: e.target.checked })}
                    />
                    {en.label}
                  </label>
                ))}
                {r.kind !== "umbrella" && (
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={r.umbrellaCounts}
                      onChange={(e) => set(i, { umbrellaCounts: e.target.checked })}
                    />
                    Umbrella may count toward the limits
                  </label>
                )}
              </div>
              <button
                type="button"
                className="mt-1 text-sm text-red-700 underline"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </fieldset>
          ))}
          {unused(rows).length > 0 && (
            <label className="block text-sm">
              <span className="text-slate-600">Add a coverage</span>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  const k = e.target.value as InsuranceKind;
                  if (k) setRows([...rows, blankRow(k)]);
                }}
              >
                <option value="">Choose…</option>
                {unused(rows).map((k) => (
                  <option key={k} value={k}>
                    {INSURANCE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" className="btn" disabled={save.isPending}>
              Save requirements
            </button>
            <button type="button" className="btn-secondary" onClick={() => setRows(null)}>
              Cancel
            </button>
          </div>
          <ErrorText error={save.error} />
        </form>
      )}
    </section>
  );
}

/** "each occurrence $1,000,000 · general aggregate $2,000,000 · additional insured", for a certificate. */
export function coverageSummary(c: {
  kind: InsuranceKind;
  eachOccurrenceCents: number | null;
  aggregateCents: number | null;
  additionalInsured: boolean;
  waiverOfSubrogation: boolean;
  primaryNoncontributory: boolean;
}): string {
  const parts: string[] = [];
  if (c.eachOccurrenceCents !== null) {
    parts.push(`${LIMIT_LABELS[c.kind].each.toLowerCase()} ${formatLimit(c.eachOccurrenceCents)}`);
  }
  if (c.aggregateCents !== null) {
    parts.push(`${LIMIT_LABELS[c.kind].aggregate.toLowerCase()} ${formatLimit(c.aggregateCents)}`);
  }
  for (const e of ENDORSEMENTS) if (c[e.key]) parts.push(e.label.toLowerCase());
  return parts.join(" · ");
}
