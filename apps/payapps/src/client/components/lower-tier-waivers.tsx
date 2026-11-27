// Lower-tier lien waivers for one pay application: the waivers the contractor collects from its own
// suppliers and sub-subcontractors to hand the GC with its own. The panel suggests who to ask from
// the job's purchase orders and subcontracts (job costing) and from the last application's list,
// drafts a plain request to paste into an email, and records when each was asked for and received.
// Rules in src/shared/lower-tier-waivers.ts. Reading is open on every plan; changing the list needs
// lien waivers (Crew and up). Nothing is sent from PayApps: "Email" opens a draft in the user's own
// mail app, addressed to the party when an address is saved on the row or on any of the company's
// earlier rows for that party. The signed waiver's file is filed on
// its row ("Attach signed"): a pay-application attachment, so it is in the backup packet, named for
// the party in the packet's index, and the row is marked received.

import type { JobCostDto, LowerTierWaiverDto, LowerTierWaiversDto } from "@shared/api/types";
import { attachmentProblem, extensionOf } from "@shared/attachments";
import { WAIVER_KINDS, type WaiverKind } from "@shared/enums";
import { mailtoHref } from "@shared/follow-up-email";
import {
  defaultLowerTierKind,
  LOWER_TIER_ANCHOR,
  LOWER_TIER_PARTY_KIND_LABELS,
  LOWER_TIER_PARTY_KINDS,
  type LowerTierPartyKind,
  type LowerTierPayAppToChase,
  lowerTierEmailFor,
  lowerTierPartyKey,
  lowerTierRequestText,
  lowerTierSuggestions,
  lowerTierToChaseText,
  WAIVER_KIND_SHORT_LABELS,
} from "@shared/lower-tier-waivers";
import { formatCents, parseDollarsToCents } from "@shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { api, orgPath, projectPath } from "../lib/api";
import { uploadFile } from "./attachments";
import { ErrorText } from "./error";

/** What the backup packet can include: a waiver filed as anything else would be left out of it. */
const PACKET_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"];
const WAIVER_ACCEPT = "application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png";

/** A reason the file cannot be filed as a signed waiver, or null (the Worker checks again). */
export function waiverFileProblem(file: { name: string; sizeBytes: number }): string | null {
  const basic = attachmentProblem(file, 0, { usedBytes: 0, limitBytes: Number.POSITIVE_INFINITY });
  if (basic) return basic;
  if (!PACKET_EXTENSIONS.includes(extensionOf(file.name))) {
    return "Attach the signed waiver as a PDF or a JPEG or PNG photo, so it goes in the backup packet";
  }
  return null;
}

interface Job {
  name: string;
  number: string | null;
  gcName: string;
}

const STATUS_CLASS: Record<LowerTierWaiverDto["status"], string> = {
  owed: "font-semibold text-red-700",
  requested: "text-amber-700",
  received: "text-green-700",
};

function statusText(r: LowerTierWaiverDto): string {
  if (r.status === "received") return `Received ${r.receivedOn}`;
  if (r.status === "requested") {
    const d = r.daysWaiting ?? 0;
    return `Asked ${r.requestedOn}${d > 0 ? `, ${d} day${d === 1 ? "" : "s"} waiting` : ""}`;
  }
  return "Not asked yet";
}

const partyKindOrNull = (v: string): LowerTierPartyKind | null =>
  (LOWER_TIER_PARTY_KINDS as readonly string[]).includes(v) ? (v as LowerTierPartyKind) : null;

export function LowerTierWaiversPanel(props: {
  orgId: string;
  projectId: string;
  payAppId: string;
  periodTo: string;
  job: Job;
  contractorName: string;
}) {
  const { orgId, projectId, payAppId, periodTo, job, contractorName } = props;
  const qc = useQueryClient();
  const url = projectPath(orgId, projectId, "/lower-tier-waivers");
  const key = ["lower-tier-waivers", orgId, projectId, payAppId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<LowerTierWaiversDto>(`${url}?payAppId=${encodeURIComponent(payAppId)}`),
  });
  // Job costing feeds the suggestions; a job without it (or a failed read) just suggests less.
  const jc = useQuery({
    queryKey: ["job-cost", orgId, projectId],
    queryFn: () => api<JobCostDto>(projectPath(orgId, projectId, "/job-cost")),
    retry: false,
  });
  const d = q.data;
  const suggestions = useMemo(
    () =>
      d
        ? lowerTierSuggestions({
            commitments: jc.data?.commitments ?? [],
            previous: d.previous,
            current: d.items,
          })
        : [],
    [d, jc.data],
  );
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const isTicked = (s: (typeof suggestions)[number]) => {
    const k = lowerTierPartyKey(s.party);
    return ticked.has(k) || (s.preselected && !unticked.has(k));
  };
  const toggle = (s: (typeof suggestions)[number]) => {
    const k = lowerTierPartyKey(s.party);
    const on = isTicked(s);
    setTicked((t) => {
      const n = new Set(t);
      if (on) n.delete(k);
      else n.add(k);
      return n;
    });
    setUnticked((t) => {
      const n = new Set(t);
      if (on) n.add(k);
      else n.delete(k);
      return n;
    });
  };
  const [kind, setKind] = useState<WaiverKind>(defaultLowerTierKind(false));
  const [party, setParty] = useState("");
  const [partyKind, setPartyKind] = useState<LowerTierPartyKind | null>(null);
  const [partyEmail, setPartyEmail] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const addMany = useMutation({
    // A row sent without partyEmail takes the address saved for the party (the Worker looks it up).
    mutationFn: (
      items: { party: string; partyKind: LowerTierPartyKind | null; partyEmail?: string }[],
    ) =>
      api<LowerTierWaiverDto[]>(`${url}/bulk`, {
        method: "POST",
        body: {
          payAppId,
          items: items.map((i) => ({ ...i, kind, throughDate: periodTo })),
        },
      }),
    onSuccess: () => {
      setTicked(new Set());
      setUnticked(new Set());
      setParty("");
      setPartyKind(null);
      setPartyEmail("");
      void refresh();
    },
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
      api<LowerTierWaiverDto>(`${url}/${v.id}`, { method: "PATCH", body: v.body }),
    onSuccess: () => void refresh(),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${url}/${id}`, { method: "DELETE" }),
    onSuccess: () => void refresh(),
  });
  // The pay application's own files: the same list the Attachments panel shows.
  const appBase = projectPath(orgId, projectId, `/pay-apps/${payAppId}`);
  const attach = useMutation({
    mutationFn: async (v: { id: string; file: File }) => {
      const problem = waiverFileProblem({ name: v.file.name, sizeBytes: v.file.size });
      if (problem) throw new Error(problem);
      await uploadFile(appBase, v.file, "backup", { lowerTierWaiverId: v.id });
    },
    onSettled: () => {
      void refresh();
      void qc.invalidateQueries({ queryKey: ["attachments", appBase] });
    },
  });

  if (!d) {
    return (
      <section className="card">
        <h2 className="text-lg font-semibold">Lower-tier waivers</h2>
        {q.error ? (
          <ErrorText error={q.error} />
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
      </section>
    );
  }
  const summary = d.summaries[payAppId];
  const today = d.today;
  const chosen = suggestions.filter(isTicked);
  const requestFor = (r: LowerTierWaiverDto) =>
    lowerTierRequestText({
      party: r.party,
      kind: r.kind,
      throughDate: r.throughDate,
      amountCents: r.amountCents,
      jobName: job.name,
      jobNumber: job.number,
      gcName: job.gcName,
      contractorName,
    });
  const copy = async (r: LowerTierWaiverDto) => {
    try {
      await navigator.clipboard.writeText(requestFor(r));
      setCopied(r.id);
    } catch {
      setCopied(null);
    }
  };
  const setEmail = (r: LowerTierWaiverDto) => {
    const text = window.prompt(
      `Email address for ${r.party}'s waiver requests. Leave blank to clear.`,
      lowerTierEmailFor(r, d.partyEmails) ?? "",
    );
    if (text === null) return;
    // Blank clears; the Worker checks the address and says what is wrong with it.
    patch.mutate({ id: r.id, body: { partyEmail: text.trim() || null } });
  };
  const setAmount = (r: LowerTierWaiverDto) => {
    const text = window.prompt(
      `Amount ${r.party}'s waiver is for ($). Leave blank to clear.`,
      r.amountCents === null ? "" : (r.amountCents / 100).toFixed(2),
    );
    if (text === null) return;
    const cents = text.trim() ? parseDollarsToCents(text) : null;
    if (text.trim() && (cents === null || cents < 0)) {
      window.alert("Enter a dollar amount");
      return;
    }
    patch.mutate({ id: r.id, body: { amountCents: cents } });
  };

  return (
    <section className="card grid gap-3" id={LOWER_TIER_ANCHOR}>
      <div>
        <h2 className="text-lg font-semibold">Lower-tier waivers</h2>
        <p className="text-sm text-slate-600">
          Waivers from your own suppliers and sub-subcontractors, for GCs that ask for them with
          your application. Tick who owes one; what a contract or state requires is yours to check.
        </p>
      </div>

      {summary && summary.total > 0 && (
        <p className={summary.complete ? "text-sm text-green-700" : "text-sm text-slate-800"}>
          {summary.received} of {summary.total} in
          {summary.outstandingParties.length > 0 &&
            `; still out: ${summary.outstandingParties.join(", ")}`}
          {summary.complete && ". All in."}
        </p>
      )}

      {!d.canEdit && (
        <p className="text-sm text-slate-600">
          Tracking lower-tier waivers comes with lien waivers on the Crew plan and up.{" "}
          <Link to="/orgs/$orgId/billing" params={{ orgId }} className="underline">
            See plans
          </Link>
        </p>
      )}

      {d.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-2">Party</th>
                <th className="py-1 pr-2">Waiver</th>
                <th className="py-1 pr-2">Through</th>
                <th className="py-1 pr-2 text-right">Amount</th>
                <th className="py-1 pr-2">Status</th>
                {d.canEdit && <th className="py-1" />}
              </tr>
            </thead>
            <tbody>
              {d.items.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="py-1 pr-2">
                    {r.party}
                    {r.partyKind && (
                      <span className="block text-xs text-slate-500">
                        {LOWER_TIER_PARTY_KIND_LABELS[r.partyKind]}
                      </span>
                    )}
                    {lowerTierEmailFor(r, d.partyEmails) && (
                      <span className="block text-xs text-slate-500">
                        {lowerTierEmailFor(r, d.partyEmails)}
                      </span>
                    )}
                    {r.note && <span className="block text-xs text-slate-500">{r.note}</span>}
                    {r.files.map((f) => (
                      <a
                        key={f.id}
                        className="block text-xs underline"
                        href={`${appBase}/attachments/${f.id}`}
                      >
                        {f.fileName}
                      </a>
                    ))}
                  </td>
                  <td className="py-1 pr-2">{WAIVER_KIND_SHORT_LABELS[r.kind]}</td>
                  <td className="py-1 pr-2">{r.throughDate ?? "—"}</td>
                  <td className="py-1 pr-2 text-right">
                    {r.amountCents === null ? "—" : formatCents(r.amountCents)}
                  </td>
                  <td className={`py-1 pr-2 ${STATUS_CLASS[r.status]}`}>{statusText(r)}</td>
                  {d.canEdit && (
                    <td className="py-1">
                      <div className="flex flex-wrap gap-2">
                        {r.status !== "received" && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => patch.mutate({ id: r.id, body: { receivedOn: today } })}
                          >
                            Received today
                          </button>
                        )}
                        <label className="btn-secondary cursor-pointer">
                          {attach.isPending && attach.variables?.id === r.id
                            ? "Attaching…"
                            : r.files.length > 0
                              ? "Attach another"
                              : "Attach signed"}
                          <input
                            type="file"
                            className="sr-only"
                            accept={WAIVER_ACCEPT}
                            aria-label={`Attach ${r.party}'s signed waiver`}
                            disabled={attach.isPending}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file) attach.mutate({ id: r.id, file });
                            }}
                          />
                        </label>
                        {r.status === "owed" && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => patch.mutate({ id: r.id, body: { requestedOn: today } })}
                          >
                            Asked today
                          </button>
                        )}
                        {r.status === "received" && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => patch.mutate({ id: r.id, body: { receivedOn: null } })}
                          >
                            Not received
                          </button>
                        )}
                        {r.status !== "received" && (
                          <>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => void copy(r)}
                            >
                              {copied === r.id ? "Copied" : "Copy request"}
                            </button>
                            <a
                              className="btn-secondary"
                              href={mailtoHref({
                                to: lowerTierEmailFor(r, d.partyEmails),
                                subject: `Lien waiver for ${job.name}${job.number ? ` (${job.number})` : ""}`,
                                body: requestFor(r),
                              })}
                            >
                              Email
                            </a>
                          </>
                        )}
                        <button type="button" className="btn-secondary" onClick={() => setEmail(r)}>
                          {lowerTierEmailFor(r, d.partyEmails) ? "Change address" : "Email address"}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setAmount(r)}
                        >
                          Amount
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            if (window.confirm(`Remove ${r.party} from this list?`))
                              remove.mutate(r.id);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {d.canEdit && (
        <div className="grid gap-3">
          <label className="grid max-w-xs gap-1 text-sm">
            <span className="text-slate-600">Waiver to ask for</span>
            <select
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value as WaiverKind)}
            >
              {WAIVER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {WAIVER_KIND_SHORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>

          {suggestions.length > 0 && (
            <fieldset className="grid gap-1 text-sm">
              <legend className="text-slate-600">
                From this job's purchase orders and subcontracts, and the last application's list
              </legend>
              {suggestions.map((s) => (
                <label key={s.party} className="flex items-center gap-2">
                  <input type="checkbox" checked={isTicked(s)} onChange={() => toggle(s)} />
                  <span>
                    {s.party}
                    <span className="text-slate-500">
                      {s.partyKind ? ` · ${LOWER_TIER_PARTY_KIND_LABELS[s.partyKind]}` : ""}
                      {s.invoicedCents !== null &&
                        ` · ${s.invoicedCents > 0 ? `${formatCents(s.invoicedCents)} invoiced to date` : "nothing invoiced yet"}`}
                      {s.source !== "commitments" && " · on the last application"}
                      {lowerTierEmailFor(s, d.partyEmails) &&
                        ` · ${lowerTierEmailFor(s, d.partyEmails)}`}
                    </span>
                  </span>
                </label>
              ))}
              <div>
                <button
                  type="button"
                  className="btn mt-1"
                  disabled={chosen.length === 0 || addMany.isPending}
                  onClick={() =>
                    addMany.mutate(chosen.map((s) => ({ party: s.party, partyKind: s.partyKind })))
                  }
                >
                  Add {chosen.length} through {periodTo}
                </button>
              </div>
            </fieldset>
          )}

          <form
            className="flex flex-wrap items-end gap-2 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (!party.trim()) return;
              // A typed address is saved with the row; left blank, the saved one (if any) is used.
              addMany.mutate([
                {
                  party: party.trim(),
                  partyKind,
                  ...(partyEmail.trim() ? { partyEmail: partyEmail.trim() } : {}),
                },
              ]);
            }}
          >
            <label className="grid gap-1">
              <span className="text-slate-600">Supplier or sub-subcontractor</span>
              <input
                className="input"
                value={party}
                maxLength={200}
                onChange={(e) => setParty(e.target.value)}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-slate-600">Kind</span>
              <select
                className="input"
                value={partyKind ?? ""}
                onChange={(e) => setPartyKind(partyKindOrNull(e.target.value))}
              >
                <option value="">Not stated</option>
                {LOWER_TIER_PARTY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {LOWER_TIER_PARTY_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-slate-600">Email (optional)</span>
              <input
                className="input"
                type="email"
                value={partyEmail}
                maxLength={254}
                placeholder="ap@supplier.example"
                onChange={(e) => setPartyEmail(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn-secondary"
              disabled={!party.trim() || addMany.isPending}
            >
              Add
            </button>
          </form>
          <p className="text-xs text-slate-500">
            "Attach signed" files the waiver a party sent back on its row (a PDF or a photo): it is
            marked received, listed under Attachments and goes in the backup packet, named for the
            party in the index. An email address saved on a row is remembered for that party on
            every job, so the next request opens addressed to it.
          </p>
        </div>
      )}
      <ErrorText error={addMany.error ?? patch.error ?? remove.error ?? attach.error} />
    </section>
  );
}

/**
 * On the projects page: pay applications on the company's active jobs with lower-tier waivers not yet
 * received, each linking to its list on the pay application (where the request to each party is
 * drafted and the signed waiver is attached).
 */
export function LowerTierToChaseAlert({ orgId }: { orgId: string }) {
  const q = useQuery({
    queryKey: ["lower-tier-outstanding", orgId],
    queryFn: () =>
      api<{ items: LowerTierPayAppToChase[] }>(orgPath(orgId, "/lower-tier-waivers/outstanding")),
  });
  const items = q.data?.items ?? [];
  if (items.length === 0) return null;
  const n = items.reduce((sum, a) => sum + a.outstanding, 0);
  return (
    <section role="status" className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
      <h2 className="mb-1 font-semibold">
        {n === 1
          ? "1 lower-tier lien waiver is still out"
          : `${n} lower-tier lien waivers are still out`}
        {items.length > 1 ? ` on ${items.length} pay applications` : ""}
      </h2>
      <ul className="list-disc pl-5">
        {items.map((a) => (
          <li key={a.payAppId}>
            <Link
              to="/orgs/$orgId/projects/$projectId/pay-apps/$payAppId"
              params={{ orgId, projectId: a.projectId, payAppId: a.payAppId }}
              hash={LOWER_TIER_ANCHOR}
              className="underline"
            >
              {lowerTierToChaseText(a)}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-slate-600">
        Still out means no received date and no signed waiver attached on its row. Each pay
        application&apos;s list drafts the request to the party; nothing is sent from PayApps.
      </p>
    </section>
  );
}
