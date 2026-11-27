// The job's lien deadline: the last day this company can record (or file) a mechanics lien on the
// property, from the job's state and the day it last furnished labor or materials, or, until that
// is entered, estimated from the billing (src/shared/lien-deadline.ts). Saved through the job's PATCH;
// the cash page and the weekly email name the date once money is owed and it is near. A public job
// (src/shared/public-jobs.ts) has no lien: a federal one shows the Miller Act bond-claim dates in its
// place, and a state or local one shows the state's payment bond claim steps (the eight states in
// STATE_BOND_RULES) and its retainage cap on public work instead.
import type { ProjectDetailDto } from "@shared/api/types";
import { daysUntil, LIEN_DEADLINE_RULES, LIEN_DEADLINE_STATES } from "@shared/lien-deadline";
import {
  MILLER_TIER_LABELS,
  MILLER_TIERS,
  type MillerTier,
  type PublicOwner,
  RETAINAGE_CAP_STATES,
  RETAINAGE_CAPS,
  retainageCapCheck,
  STATE_BOND_RULES,
  STATE_BOND_STATES,
  stateBondClaim,
} from "@shared/public-jobs";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";
import { MillerNoticeDraft } from "./miller-notice";

const today = () => new Date().toISOString().slice(0, 10);

function whenText(dueOn: string): string {
  const left = daysUntil(today(), dueOn);
  if (left < 0) return `passed ${-left} day${left === -1 ? "" : "s"} ago`;
  if (left === 0) return "today";
  if (left === 1) return "tomorrow";
  return `in ${left} days`;
}

export function LienDeadlinePanel(props: {
  path: string;
  project: ProjectDetailDto;
  onSaved: () => void | Promise<void>;
}) {
  const { path, project: p, onSaved } = props;
  const [state, setState] = useState(p.lienState ?? "");
  const [residential, setResidential] = useState(p.lienResidential);
  const [last, setLast] = useState(p.lastFurnishedOn ?? "");
  const [completed, setCompleted] = useState(p.workCompletedOn ?? "");
  const [noc, setNoc] = useState(p.noticeOfCompletionOn ?? "");
  const [owner, setOwner] = useState<PublicOwner | "">(p.publicOwner ?? "");
  const [tier, setTier] = useState<MillerTier | "">(p.millerTier ?? "");
  useEffect(() => {
    setOwner(p.publicOwner ?? "");
    setTier(p.millerTier ?? "");
  }, [p.publicOwner, p.millerTier]);
  useEffect(() => {
    setState(p.lienState ?? "");
    setResidential(p.lienResidential);
    setLast(p.lastFurnishedOn ?? "");
    setCompleted(p.workCompletedOn ?? "");
    setNoc(p.noticeOfCompletionOn ?? "");
  }, [
    p.lienState,
    p.lienResidential,
    p.lastFurnishedOn,
    p.workCompletedOn,
    p.noticeOfCompletionOn,
  ]);

  const save = useMutation({
    mutationFn: () => {
      const s = state.trim().toUpperCase();
      if (s && !/^[A-Z]{2}$/.test(s)) throw new Error("Enter the state's two-letter code, like CA");
      const completionState = !owner && (s === "CA" || s === "AZ");
      // A state or local job keeps the public body's acceptance in the same column.
      const keepsCompletion = completionState || owner === "state_local";
      return api<ProjectDetailDto>(path, {
        method: "PATCH",
        body: {
          lienState: s || null,
          lienResidential: residential,
          lastFurnishedOn: last || null,
          workCompletedOn: keepsCompletion ? completed || null : null,
          noticeOfCompletionOn: completionState ? noc || null : null,
          publicOwner: owner || null,
          millerTier: owner ? tier || null : null,
        },
      });
    },
    onSuccess: () => onSaved(),
  });

  const r = p.lienDeadline;
  const d = r.kind === "deadline" ? r.deadline : null;
  const upper = state.trim().toUpperCase();
  const rule = (LIEN_DEADLINE_STATES as readonly string[]).includes(upper)
    ? LIEN_DEADLINE_RULES[upper as keyof typeof LIEN_DEADLINE_RULES]
    : null;
  const completionState = !owner && (upper === "CA" || upper === "AZ");
  const federal = p.publicOwner === "federal";
  // Every rate the job holds at: the latest application's (else the job's), and lines' own rates.
  const latest = p.payApps[p.payApps.length - 1];
  const rates = [
    latest?.retainagePctBps ?? p.retainagePctBps,
    latest?.storedRetainagePctBps ?? p.storedRetainagePctBps,
    ...(p.sovLines ?? []).map((l) => l.retainagePctBps ?? 0),
  ];
  const cap = p.publicOwner === "state_local" ? retainageCapCheck(p.lienState, rates) : null;
  const bond =
    p.publicOwner === "state_local"
      ? stateBondClaim(p.lienState, {
          tier: p.millerTier ?? null,
          lastFurnishedOn: p.lastFurnishedOn ?? null,
          acceptedOn: p.workCompletedOn ?? null,
        })
      : null;
  // The next bond date still ahead (else the latest passed one) leads the summary.
  const bondNext =
    bond?.kind === "checked"
      ? (bond.dated.find((x) => daysUntil(today(), x.dueOn as string) >= 0) ?? bond.dated.at(-1))
      : undefined;
  const summaryOn = d?.dueOn ?? bondNext?.dueOn ?? null;
  const title =
    p.publicOwner === "federal"
      ? "Payment bond claim (Miller Act)"
      : p.publicOwner === "state_local"
        ? "Public job: bond and retainage"
        : "Lien deadline";

  return (
    <details
      className="card max-w-3xl"
      open={
        d !== null ||
        bondNext !== undefined ||
        (cap?.kind === "checked" && cap.verdict !== "within")
      }
    >
      <summary className="cursor-pointer font-semibold">
        {title}
        {summaryOn && (
          <span className="font-normal text-slate-600">
            {" "}
            · {summaryOn} ({whenText(summaryOn)})
          </span>
        )}
      </summary>
      <div className="mt-2 grid gap-3 text-sm">
        {federal ? (
          <p className="text-slate-600">
            Federal property cannot be liened. Your security on a federal job is the prime
            contractor's payment bond under the Miller Act (40 U.S.C. § 3133), and it has two dates:
            a 90-day notice to the prime if you contracted with one of its subcontractors, and a
            one-year limit on the suit for everyone.
          </p>
        ) : p.publicOwner === "state_local" ? (
          <p className="text-slate-600">
            Public property cannot be liened, so PayApps shows no lien date on this job. Your
            security is the prime's payment bond under the state's own bond law (a "little Miller
            Act"). PayApps lists its notice and suit steps for{" "}
            {STATE_BOND_STATES.map((s) => STATE_BOND_RULES[s]?.name).join(", ")}; elsewhere, read
            the bond and the statute for them.
          </p>
        ) : (
          <p className="text-slate-600">
            The last day to record a mechanics lien on this job if you are not paid. Lien rights end
            on that date whether or not anyone reminds you. PayApps counts it for a subcontractor or
            supplier on a private job in{" "}
            {LIEN_DEADLINE_STATES.map((s) => LIEN_DEADLINE_RULES[s].name).join(", ")}.
          </p>
        )}

        {bond?.kind === "checked" && (
          <div className="rounded border border-slate-200 p-3">
            <p className="font-medium">
              Payment bond claim: {bond.rule.law}{" "}
              <a
                className="font-normal underline"
                href={bond.rule.url}
                target="_blank"
                rel="noreferrer"
              >
                (read it)
              </a>
            </p>
            <ol className="mt-1 grid list-decimal gap-1 pl-5">
              {bond.steps.map((x) => (
                <li
                  key={x.citation + x.act}
                  className={
                    x.dueOn && daysUntil(today(), x.dueOn) <= 45 && daysUntil(today(), x.dueOn) >= 0
                      ? "text-amber-800"
                      : ""
                  }
                >
                  <span className="font-medium">
                    {x.act}
                    {x.dueOn ? ` by ${x.dueOn} (${whenText(x.dueOn)})` : ""}
                  </span>
                  {x.who === "not-prime" && (
                    <span className="text-slate-600">
                      {" "}
                      · if you are not in contract with the prime
                    </span>
                  )}
                  <br />
                  <span className="text-slate-600">
                    {x.rule} ({x.citation})
                    {x.statutoryOn &&
                      x.dueOn &&
                      x.statutoryOn !== x.dueOn &&
                      `. The statute's date, ${x.statutoryOn}, is a weekend, so this is the Friday before it`}
                    {x.waitsFor && !x.dueOn && `. Not dated: PayApps needs ${x.waitsFor}`}.
                  </span>
                </li>
              ))}
            </ol>
            <ul className="mt-1 list-disc pl-5 text-slate-600">
              {bond.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {bond?.kind === "unsupported" && (
          <p>
            PayApps does not list {bond.state}'s bond claim steps yet. It does for{" "}
            {STATE_BOND_STATES.map((s) => STATE_BOND_RULES[s]?.name).join(", ")}.
          </p>
        )}
        {cap?.kind === "checked" && (
          <div
            className={`rounded border p-3 ${cap.verdict === "over" ? "border-red-400 bg-red-50" : cap.verdict === "within" ? "border-slate-200" : "border-amber-400 bg-amber-50"}`}
          >
            <p className="font-medium">Retainage cap: {cap.rule.cap}</p>
            <p className="text-slate-700">{cap.text}</p>
            <p className="text-slate-600">
              {cap.rule.notes}{" "}
              <a className="underline" href={cap.rule.url} target="_blank" rel="noreferrer">
                Read {cap.rule.citation}
              </a>
              .
            </p>
          </div>
        )}
        {cap?.kind === "unsupported" && (
          <p>
            PayApps has no retainage cap for {cap.state}'s public work yet. It checks{" "}
            {RETAINAGE_CAP_STATES.map((s) => RETAINAGE_CAPS[s]?.name).join(", ")}.
          </p>
        )}
        {p.publicOwner === "state_local" && !p.lienState && (
          <p>
            Enter the job's state to check its retainage against the state's cap on public work.
          </p>
        )}
        {r.kind === "not-covered" && (
          <p className="rounded border border-amber-400 bg-amber-50 p-3">
            The Miller Act bond covers only those who contracted with the prime or with one of its
            subcontractors (J.W. Bateson Co. v. United States, 434 U.S. 586 (1978)). Below that tier
            there is no claim on the federal payment bond: look at the contract above you, which may
            have its own bond, and ask a construction attorney what your state allows.
          </p>
        )}

        {d && (
          <div
            className={`rounded border p-3 ${daysUntil(today(), d.dueOn) <= 45 ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}
          >
            <p className="font-medium">
              {d.state === "US" ? "Miller Act" : d.stateName}: {d.act} by {d.dueOn} (
              {whenText(d.dueOn)})
            </p>
            <p className="text-slate-700">
              {d.rule} ({d.citation})
              {d.statutoryOn !== d.dueOn &&
                `. The statute's date, ${d.statutoryOn}, is a weekend, so this is the Friday before it`}
              .
            </p>
            {d.basis === "estimated" && (
              <p className="text-amber-800">
                Estimated: no last day on the job is entered, so PayApps counted from the start of
                Pay App #{d.fromPayAppNumber}'s period ({d.fromOn}), the earliest your last day of
                work can be. Enter the real day below for the exact date.
              </p>
            )}
            <ul className="mt-1 list-disc pl-5 text-slate-600">
              {d.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {federal && r.kind !== "not-covered" && p.millerTier !== "first" && (
          <MillerNoticeDraft
            path={path}
            savedKey={`${p.millerTier ?? ""}|${p.lastFurnishedOn ?? ""}`}
          />
        )}
        {r.kind === "unsupported" && (
          <p>
            PayApps does not count the lien deadline for {r.state} yet. Check that state's lien law
            for the date.
          </p>
        )}
        {r.kind === "no-dates" && (
          <p>
            Enter the day you last furnished labor or materials (or bill a pay application with work
            on it) and PayApps will date the{" "}
            {r.state === "US" ? "Miller Act deadlines" : `${r.stateName} lien deadline`}.
          </p>
        )}

        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid">
              <span className="text-slate-600">Who owns the job</span>
              <select
                className="input"
                value={owner}
                onChange={(e) => setOwner(e.target.value as PublicOwner | "")}
                aria-label="Who owns the job"
              >
                <option value="">A private owner</option>
                <option value="state_local">A state or local public body</option>
                <option value="federal">The federal government</option>
              </select>
            </label>
            {owner && (
              <label className="grid">
                <span className="text-slate-600">You contracted</span>
                <select
                  className="input"
                  value={tier}
                  onChange={(e) => setTier(e.target.value as MillerTier | "")}
                  aria-label="Who you contracted with"
                >
                  <option value="">Not sure</option>
                  {MILLER_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {MILLER_TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid">
              <span className="text-slate-600">Property's state</span>
              <input
                className="input w-20 uppercase"
                maxLength={2}
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                aria-label="State the property is in (two letters)"
              />
            </label>
            <label className="grid">
              <span className="text-slate-600">Last day you furnished labor or materials</span>
              <input
                className="input"
                type="date"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                aria-label="Last day you furnished labor or materials"
              />
            </label>
            {rule?.residential && !owner && (
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={residential}
                  onChange={(e) => setResidential(e.target.checked)}
                />
                <span>Residential: {rule.residentialMeaning}</span>
              </label>
            )}
          </div>
          {owner === "state_local" && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid">
                <span className="text-slate-600">
                  Public body accepted the work (completion and acceptance), if it has
                </span>
                <input
                  className="input"
                  type="date"
                  value={completed}
                  onChange={(e) => setCompleted(e.target.value)}
                  aria-label="Day the public body accepted the work"
                />
              </label>
            </div>
          )}
          {completionState && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid">
                <span className="text-slate-600">Whole project completed (if known)</span>
                <input
                  className="input"
                  type="date"
                  value={completed}
                  onChange={(e) => setCompleted(e.target.value)}
                  aria-label="Completion of the whole project"
                />
              </label>
              <label className="grid">
                <span className="text-slate-600">Notice of completion recorded on</span>
                <input
                  className="input"
                  type="date"
                  value={noc}
                  onChange={(e) => setNoc(e.target.value)}
                  aria-label="Day the owner recorded a notice of completion"
                />
              </label>
            </div>
          )}
          <div>
            <button type="submit" className="btn" disabled={save.isPending}>
              Save
            </button>
          </div>
          {save.error && <ErrorText error={save.error} />}
        </form>
        <p className="text-xs text-slate-500">
          A date lookup, not legal advice. State bond claim steps are read from each statute's text
          only (court rulings, the bond's own terms and other statutes can change them). It does not
          cover a sub-subcontractor's supplier, contract terms or holidays, and a lien or bond claim
          also needs the notices the law requires and the right content and service. Retainage caps
          are summaries of public-work statutes with exceptions not shown. Confirm with a
          construction attorney or the statute before relying on it.
        </p>
      </div>
    </details>
  );
}
