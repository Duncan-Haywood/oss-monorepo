// The certified payroll page's Oregon part: when this week's certified statement is due under ORS
// 279C.845(4), what BOLI wants attached to a WH-347, and the 25% a late filing holds back
// (src/shared/or-pwr.ts). Nothing here is sent anywhere; it is saved with the draft in this browser.
import { formatCents } from "@shared/money";
import {
  daysUntil,
  isIsoDate,
  lateHold,
  OR_OAR_DIV25,
  OR_ORS_279C,
  OR_PWR_NOTICE,
  OR_PWR_PAGE,
  OR_TIER_LABELS,
  OR_TIERS,
  type OrTier,
  releaseBy,
  weekFiling,
} from "@shared/or-pwr";
import { MoneyInput } from "./money-input";

export interface OrDraftJob {
  on?: boolean;
  /** Who this company contracted with; defaults from the payroll's prime/sub choice. */
  tier?: OrTier;
  /** A qualifying agency's public improvement contract over $3 million: the Enhanced WH-38. */
  enhanced?: boolean;
  /** Unpaid amount earned since the statements were last filed, in cents. */
  earnedCents?: number;
  /** The day this month's statements were filed, to date the release of a hold. */
  filedOn?: string;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const long = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export function OrPwrSection(props: {
  job: OrDraftJob | undefined;
  onJob: (job: OrDraftJob) => void;
  /** The payroll's own prime/sub choice, the default tier. */
  payrollRole: "prime" | "sub" | undefined;
  /** The seven days of the payroll week, oldest first ([] while the week ending is not a date). */
  days: readonly { iso: string }[];
  /** For tests. */
  today?: string;
}) {
  const job = props.job ?? {};
  const setJob = (patch: Partial<OrDraftJob>) => props.onJob({ ...job, ...patch });

  if (!job.on) {
    return (
      <section className="card grid gap-2">
        <label className="text-sm">
          <input type="checkbox" checked={false} onChange={() => setJob({ on: true })} />{" "}
          <strong>Oregon public works:</strong> when this week's certified statement is due, what to
          attach for BOLI, and the 25% a late filing holds back (ORS 279C.845)
        </label>
      </section>
    );
  }

  const tier: OrTier = job.tier ?? (props.payrollRole === "prime" ? "prime" : "first");
  const first = props.days[0]?.iso;
  const last = props.days[6]?.iso;
  const filing = first && last ? weekFiling(first, last) : null;
  const today = props.today ?? todayIso();
  const left = filing ? daysUntil(today, filing.dueOn) : null;
  const hold = lateHold(job.earnedCents ?? 0, tier);
  const filedOn = job.filedOn && isIsoDate(job.filedOn) ? job.filedOn : null;
  const form = job.enhanced ? "Enhanced WH-38" : "WH-38";

  return (
    <section className="card grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Oregon public works: certified statement due dates</h2>
        <button type="button" className="link text-sm" onClick={() => setJob({ on: false })}>
          Hide
        </button>
      </div>

      {filing ? (
        <div className="grid gap-1 text-sm">
          <p>
            This week goes with the <strong>{monthName(filing.month)}</strong> statements, due to
            the public agency by <strong>{long(filing.dueOn)}</strong>, the fifth business day of
            the next month (ORS 279C.845(4))
            {left !== null &&
              (left < 0
                ? `: ${-left} day${left === -1 ? "" : "s"} late.`
                : left === 0
                  ? ": today."
                  : `: ${left} day${left === 1 ? "" : "s"} from today.`)}
          </p>
          {filing.holidaysSkipped.length > 0 && (
            <p className="text-slate-600">
              Not counted as business days:{" "}
              {filing.holidaysSkipped.map((h) => `${h.name} (${long(h.on)})`).join(", ")}.
            </p>
          )}
          {filing.alsoMonth && filing.alsoDueOn && (
            <p className="text-amber-800">
              This week runs into {monthName(filing.alsoMonth)}. The statute does not say which
              month a split week belongs to, so PayApps files it with the earlier month. If the
              public agency wants it with {monthName(filing.alsoMonth)}, it is due by{" "}
              {long(filing.alsoDueOn)}.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-600">Enter the week ending date to see the due date.</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <fieldset className="grid gap-1 text-sm">
          <legend className="text-slate-600">On this job, the company is</legend>
          {OR_TIERS.map((t) => (
            <label key={t}>
              <input
                type="radio"
                name="or-tier"
                checked={tier === t}
                onChange={() => setJob({ tier: t })}
              />{" "}
              {OR_TIER_LABELS[t]}
            </label>
          ))}
        </fieldset>
        <label className="text-sm">
          <input
            type="checkbox"
            checked={job.enhanced ?? false}
            onChange={(e) => setJob({ enhanced: e.target.checked })}
          />{" "}
          A state agency, public university or community college job whose prime contract is over $3
          million (an "enhanced reporting" project: the Enhanced WH-38, OAR 839-025-0010(2)(b))
        </label>
      </div>

      <div className="grid gap-1 text-sm">
        <p className="font-semibold">What BOLI wants with this WH-347</p>
        <ul className="list-disc pl-5">
          <li>
            The WH-347 alone does not meet Oregon's filing rule (BOLI's Prevailing Wage Rate Laws
            Handbook). A payroll on your own form must carry every element of BOLI's {form} and its
            certification statement (OAR 839-025-0010(3)(a)): attach the signed certified statement
            page of the {form}, from BOLI's{" "}
            <a className="link" href={OR_PWR_PAGE} target="_blank" rel="noreferrer">
              prevailing wage page
            </a>
            . An unsigned statement does not count as filed.
          </li>
          <li>
            Each worker's address (ORS 279C.845(3)), which this WH-347 does not print: list it on
            the {form} or an attached sheet.
          </li>
          <li>
            Fringe benefit credits listed for each worker by plan name, with the hourly credit taken
            for each plan (the handbook), as the fringe plans table above sets them out.
          </li>
          {job.enhanced && (
            <li>
              On the Enhanced WH-38: for each worker, journey or apprentice hours and race,
              ethnicity, gender and veteran status (ORS 279C.533(5)). PayApps does not store these.
            </li>
          )}
          <li>
            Keep the statements for three years after the contract is complete (ORS 279C.845(5)).
          </li>
        </ul>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <div className="text-sm md:col-span-3">
          <p className="font-semibold">If the statements are late</p>
          {hold.heldBy ? (
            <p className="text-slate-600">
              The {hold.heldBy} must retain 25% of the unpaid amount you earned since your last
              filed statements, on top of any other retainage, until you file; it is then paid
              within 14 days ({hold.citation}).
            </p>
          ) : (
            <p className="text-slate-600">
              ORS 279C.845's 25% hold names the prime (held by the public agency) and first-tier
              subcontractors (held by the prime). Below the first tier the statute names no hold,
              but the statements are still due, and your subcontract may add its own terms.
            </p>
          )}
        </div>
        {hold.heldBy && (
          <>
            <MoneyInput
              label="Earned and unpaid since the last statements you filed"
              value={job.earnedCents ?? 0}
              onChange={(earnedCents) => setJob({ earnedCents })}
            />
            <p className="self-end text-sm">
              Held if late: <strong>{formatCents(hold.holdCents)}</strong>
            </p>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600">Statements filed on</span>
              <input
                className="input"
                type="date"
                value={job.filedOn ?? ""}
                onChange={(e) => setJob({ filedOn: e.target.value })}
              />
            </label>
            {filedOn && (
              <p className="text-sm md:col-span-3">
                A 25% hold on these statements is due back by{" "}
                <strong>{long(releaseBy(filedOn))}</strong> (14 days after filing).
              </p>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {OR_PWR_NOTICE} Sources:{" "}
        <a className="link" href={OR_ORS_279C} target="_blank" rel="noreferrer">
          ORS chapter 279C
        </a>
        ,{" "}
        <a className="link" href={OR_OAR_DIV25} target="_blank" rel="noreferrer">
          OAR 839 division 25
        </a>
        .
      </p>
    </section>
  );
}
