// Quarterly estimated tax (Form 1040-ES) from the books: what to have paid by each due date under the
// regular and the annualized (Schedule AI) methods. The seller's own figures (filing status, wages, last
// year's tax, payments sent) are saved to the shop for its owner and admins
// (`/reports/estimated-tax/settings/:year`), so every device shows the same ones; an editor or viewer,
// who may not be the taxpayer, keeps them in this browser only. Figures typed before saving existed move
// from the browser to the shop the first time an owner or admin opens that year.
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, orgPath, usd } from "../lib/api";
import {
  EMPTY,
  type Filing,
  fromSaved,
  type Inputs,
  isEmpty,
  num,
  type Saved,
  toSaved,
} from "../lib/estimate-figures";
import { useOrgId } from "./org";
import { ErrorText, useMe } from "./public";

interface Row {
  period: string;
  due: string;
  status: "complete" | "in-progress" | "not-started";
  profitToDate: number | null;
  /** Line 30 already taken off profitToDate; null when no home office is saved. */
  homeOfficeToDate?: number | null;
  annualizedProfit: number | null;
  annualizedInstallment: number | null;
  regularInstallment: number | null;
  cumulativeTarget: number | null;
  credited: number;
  stillToPay: number | null;
}

interface Estimate {
  year: number;
  asOf: string;
  disclaimer: string;
  bracketsOnFile: boolean;
  projectedProfit: number | null;
  projected: {
    se: { tax: number };
    incomeTax: number;
    addlMedicare: number;
    total: number;
    qbiDeduction: number;
    taxable: number;
  } | null;
  safeHarbor: { current90: number | null; prior: number | null; required: number | null };
  exempt: boolean;
  rows: Row[];
  next: { due: string; stillToPay: number | null } | null;
  homeOffice?: { officeSqft: number; months: number[] } | null;
  warnings: string[];
}

const localToday = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const STATUS: Record<Row["status"], string> = {
  complete: "Period over",
  "in-progress": "So far",
  "not-started": "Not started",
};

function storageKey(orgId: string, year: number) {
  return `seller-books:estimated-tax:${orgId}:${year}`;
}

function load(orgId: string, year: number): Inputs {
  try {
    const raw = localStorage.getItem(storageKey(orgId, year));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Inputs>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function forget(orgId: string, year: number) {
  try {
    localStorage.removeItem(storageKey(orgId, year));
  } catch {
    // Blocked storage: nothing was kept there either.
  }
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function EstimatedTaxPage() {
  const orgId = useOrgId();
  const me = useMe();
  const role = me.data?.memberships.find((m) => m.orgId === orgId)?.role;
  // Wages and last year's tax are the taxpayer's own: the shop keeps them for its owner and admins.
  const savesToShop = role === "owner" || role === "admin";
  const [year, setYear] = useState(new Date().getFullYear());
  const [inputs, setInputs] = useState<Inputs>(() => load(orgId, year));
  /** True once the seller has typed since the year's figures were loaded: only then is anything saved. */
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const qc = useQueryClient();
  const settingsPath = orgPath(orgId, `/reports/estimated-tax/settings/${year}`);
  const saved = useQuery({
    queryKey: ["estimated-tax-settings", orgId, year],
    queryFn: () => api<{ year: number; settings: Saved | null }>(settingsPath),
    enabled: savesToShop,
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Load the year's figures: the shop's saved ones, else (first visit since saving existed) this
  // browser's, which are then saved to the shop once and dropped from the browser.
  // Inputs stay disabled until then, so nothing typed early is overwritten by the load.
  const key = `${orgId}:${year}:${savesToShop}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const ready = me.isSuccess && loadedKey === key;
  useEffect(() => {
    if (!me.isSuccess) return;
    if (!savesToShop) {
      setInputs(load(orgId, year));
      setDirty(false);
      setLoadedKey(key);
      return;
    }
    if (!saved.isSuccess || loadedKey === key) return;
    setLoadedKey(key);
    setDirty(false);
    setSaveState("idle");
    if (saved.data.settings) {
      setInputs(fromSaved(saved.data.settings));
      forget(orgId, year);
      return;
    }
    const local = load(orgId, year);
    setInputs(local);
    if (!isEmpty(local)) setDirty(true);
  }, [key, loadedKey, me.isSuccess, orgId, year, savesToShop, saved.isSuccess, saved.data]);

  // Editors and viewers: this browser only, as before.
  useEffect(() => {
    if (savesToShop || !ready) return;
    try {
      localStorage.setItem(storageKey(orgId, year), JSON.stringify(inputs));
    } catch {
      // Private window or blocked storage: the page still works, it just forgets on reload.
    }
  }, [orgId, year, inputs, savesToShop, ready]);

  // Owner and admins: save to the shop a moment after the last keystroke.
  useEffect(() => {
    if (!savesToShop || !dirty) return;
    const body = toSaved(inputs);
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await api<{ year: number; settings: Saved | null }>(settingsPath, {
          method: "PUT",
          body,
        });
        qc.setQueryData(["estimated-tax-settings", orgId, year], res);
        forget(orgId, year);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [savesToShop, dirty, inputs, settingsPath, orgId, year, qc]);

  const set = <K extends keyof Inputs>(k: K, v: Inputs[K]) => {
    setInputs((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };

  const body = {
    year,
    asOf: localToday(),
    filing: inputs.filing,
    wages: num(inputs.wages) ?? 0,
    otherIncome: num(inputs.otherIncome) ?? 0,
    withholding: num(inputs.withholding) ?? 0,
    priorYearTax: num(inputs.priorYearTax),
    priorAgiOver150k: inputs.priorAgiOver150k,
    paid: inputs.paid.map((p) => Math.max(0, num(p) ?? 0)),
    ...(num(inputs.mileageRate) != null ? { mileageRate: num(inputs.mileageRate) } : {}),
  };

  const q = useQuery({
    queryKey: ["estimated-tax", orgId, body],
    queryFn: () =>
      api<Estimate>(orgPath(orgId, "/reports/estimated-tax"), { method: "POST", body }),
    placeholderData: keepPreviousData,
  });
  const e = q.data;

  const field = (
    label: string,
    k: "wages" | "otherIncome" | "withholding" | "priorYearTax",
    hint?: string,
  ) => (
    <label>
      <span className="label">{label}</span>
      <input
        className="input w-36"
        disabled={!ready}
        inputMode="decimal"
        placeholder="$0"
        value={inputs[k]}
        onChange={(ev) => set(k, ev.target.value)}
      />
      {hint && <span className="block text-xs text-stone-500">{hint}</span>}
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Quarterly estimated tax</h1>
        <label>
          <span className="label">Tax year</span>
          <input
            className="input w-24"
            type="number"
            value={year}
            onChange={(ev) => {
              // Unsaved keystrokes belong to the year they were typed for, never the next one.
              setDirty(false);
              setYear(Number(ev.target.value));
            }}
          />
        </label>
      </div>
      <p className="rounded-md border border-accent-100 bg-accent-100/50 p-3 text-sm text-accent-700">
        {e?.disclaimer ?? "Estimate only: not tax advice and not a filing."} Federal only; your
        state may want its own payments.{" "}
        {savesToShop
          ? "The figures you type here are saved to this shop, for its owner and admins only."
          : "The figures you type here stay in this browser: only the shop's owner and admins can save them to the shop."}
      </p>

      {e?.next && !e.exempt && e.next.stillToPay != null && (
        <section className="card">
          <p className="text-sm text-stone-600">Next due date</p>
          <p className="text-2xl font-semibold">
            {usd(e.next.stillToPay)} by {e.next.due}
          </p>
          <p className="text-xs text-stone-500">
            The lower of the regular and annualized amounts to date, less what you have paid and a
            share of your withholding. Pay at irs.gov/payments (Direct Pay or EFTPS).
          </p>
        </section>
      )}

      {savesToShop && <ReminderCard orgId={orgId} />}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-medium">Your other figures</h2>
          {savesToShop && (
            <span className="text-xs text-stone-500" aria-live="polite">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : saveState === "error"
                    ? "Not saved: check the figures, or try again"
                    : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-4">
          <label>
            <span className="label">Filing status</span>
            <select
              className="input"
              disabled={!ready}
              value={inputs.filing}
              onChange={(ev) => set("filing", ev.target.value as Filing)}
            >
              <option value="single">Single</option>
              <option value="mfj">Married filing jointly</option>
              <option value="hoh">Head of household</option>
            </select>
          </label>
          {field("W-2 wages this year", "wages", "Yours (and a spouse's on a joint return)")}
          {field("Federal tax withheld", "withholding", "From those wages, for the year")}
          {field("Other taxable income", "otherIncome", "Interest, dividends, ...")}
          {field("Last year's total tax", "priorYearTax", "Form 1040, line 24")}
          <label className="flex items-center gap-2 self-center text-sm">
            <input
              type="checkbox"
              disabled={!ready}
              checked={inputs.priorAgiOver150k}
              onChange={(ev) => set("priorAgiOver150k", ev.target.checked)}
            />
            Last year's AGI was over $150,000 ($75,000 married filing separately)
          </label>
          <label>
            <span className="label">One mileage rate for every trip (¢/mile, optional)</span>
            <input
              className="input w-28"
              disabled={!ready}
              inputMode="decimal"
              placeholder="IRS by date"
              value={inputs.mileageRate}
              onChange={(ev) => set("mileageRate", ev.target.value)}
            />
            <span className="block text-xs text-stone-500">
              Blank: each trip at the IRS rate on its date, as on the Schedule C page
            </span>
          </label>
        </div>
      </section>

      <ErrorText error={q.error} />
      {e && (
        <>
          <section className="card overflow-x-auto">
            <h2 className="mb-2 font-medium">By due date</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Due</th>
                  <th>Books</th>
                  <th className="num">Profit to date</th>
                  <th className="num">Regular</th>
                  <th className="num">Annualized</th>
                  <th className="num">Paid toward it</th>
                  <th className="num">Still to pay</th>
                </tr>
              </thead>
              <tbody>
                {e.rows.map((r, i) => (
                  <tr key={r.due}>
                    <td className="whitespace-nowrap">{r.due}</td>
                    <td className="text-xs text-stone-500">
                      {r.period}
                      <div>{STATUS[r.status]}</div>
                    </td>
                    <td className="num">
                      {usd(r.profitToDate)}
                      {r.homeOfficeToDate != null && r.homeOfficeToDate > 0 && (
                        <div className="text-xs text-stone-500">
                          after {usd(r.homeOfficeToDate)} home office
                        </div>
                      )}
                    </td>
                    <td className="num">{usd(r.regularInstallment)}</td>
                    <td className="num">{usd(r.annualizedInstallment)}</td>
                    <td className="num">
                      <input
                        className="input w-24 text-right"
                        disabled={!ready}
                        inputMode="decimal"
                        aria-label={`Estimated payment sent for ${r.due}`}
                        placeholder="$0"
                        value={inputs.paid[i]}
                        onChange={(ev) => {
                          const paid = [...inputs.paid] as Inputs["paid"];
                          paid[i] = ev.target.value;
                          set("paid", paid);
                        }}
                      />
                    </td>
                    <td className="num font-medium">{usd(r.stillToPay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-stone-500">
              Regular: a quarter of the required annual payment (the smaller of 90% of this year's
              tax and 100% of last year's, 110% if last year's AGI was over $150,000). Annualized:
              Form 2210 Schedule AI, from the profit in your books to each period's end, which asks
              less early in the year when sales come late. "Still to pay" is cumulative to that
              date.{" "}
              {e.homeOffice
                ? "Profit to date is Schedule C line 31: the home office you saved for this year is taken off for the months used by each date."
                : "No home office is saved for this year; add one on the Schedule C page and it is taken off here."}
            </p>
          </section>

          <section className="card">
            <h2 className="mb-2 font-medium">This year's tax, projected</h2>
            {e.projected ? (
              <table className="table">
                <tbody>
                  <tr>
                    <td>
                      Schedule C profit{" "}
                      {e.asOf < `${e.year}-12-31` ? "(projected to the full year)" : ""}
                    </td>
                    <td className="num">{usd(e.projectedProfit)}</td>
                  </tr>
                  <tr>
                    <td>Self-employment tax</td>
                    <td className="num">{usd(e.projected.se.tax)}</td>
                  </tr>
                  <tr>
                    <td>QBI deduction</td>
                    <td className="num">{usd(e.projected.qbiDeduction)}</td>
                  </tr>
                  <tr>
                    <td>Taxable income</td>
                    <td className="num">{usd(e.projected.taxable)}</td>
                  </tr>
                  <tr>
                    <td>Income tax</td>
                    <td className="num">{usd(e.projected.incomeTax)}</td>
                  </tr>
                  {e.projected.addlMedicare > 0 && (
                    <tr>
                      <td>Additional Medicare Tax</td>
                      <td className="num">{usd(e.projected.addlMedicare)}</td>
                    </tr>
                  )}
                  <tr className="font-medium">
                    <td>Total federal tax</td>
                    <td className="num">{usd(e.projected.total)}</td>
                  </tr>
                  <tr>
                    <td>Required this year (safe harbour)</td>
                    <td className="num">{usd(e.safeHarbor.required)}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-stone-600">
                No projection:{" "}
                {e.bracketsOnFile
                  ? "no books for this year yet."
                  : `no ${e.year} brackets are on file yet.`}
              </p>
            )}
          </section>
          {e.warnings.map((w) => (
            <p key={w} className="text-sm text-accent-700">
              {w}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

interface ReminderSetting {
  enabled: boolean;
  lastSentDue: string | null;
  next: { due: string; year: number; quarter: number; sendsOn: string };
  delivers: boolean;
  emailVerified: boolean;
}

/**
 * The 1040-ES reminder email for the signed-in owner or admin (services/books/estimate-reminders.ts on
 * the worker): one email a week before each due date, with what is still to pay from the figures saved
 * here. Per member: each owner or admin turns their own on.
 */
function ReminderCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const path = orgPath(orgId, "/reports/estimated-tax/reminder");
  const q = useQuery({
    queryKey: ["estimate-reminder", orgId],
    queryFn: () => api<ReminderSetting>(path),
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async (enabled: boolean) => {
    setPending(true);
    setError(null);
    try {
      qc.setQueryData(
        ["estimate-reminder", orgId],
        await api<ReminderSetting>(path, { method: "PUT", body: { enabled } }),
      );
    } catch {
      setError("Not saved: try again.");
    } finally {
      setPending(false);
    }
  };
  const r = q.data;
  return (
    <section className="card space-y-2">
      <label className="flex items-center gap-2 font-medium">
        <input
          type="checkbox"
          disabled={!r || pending}
          checked={r?.enabled ?? false}
          onChange={(ev) => toggle(ev.target.checked)}
        />
        Email me a week before each due date
      </label>
      <p className="text-sm text-stone-600">
        One email per due date (April, June, September and January), with what is still to pay by
        then from your books and the figures saved on this page. A date your payments and
        withholding already cover sends nothing. Each owner or admin turns on their own.
      </p>
      {r?.enabled && (
        <p className="text-sm text-stone-700">
          Next: the {r.next.due} payment, reminded on {r.next.sendsOn}.
        </p>
      )}
      {r?.enabled && !r.emailVerified && (
        <p className="text-sm text-amber-700">
          Confirm your email address first: reminders only go to a confirmed address.
        </p>
      )}
      {r?.enabled && !r.delivers && (
        <p className="text-xs text-stone-500">
          This copy of Seller Books has no mail sender set up yet, so nothing is sent.
        </p>
      )}
      {(error || q.error) && <ErrorText error={error ?? q.error} />}
    </section>
  );
}
