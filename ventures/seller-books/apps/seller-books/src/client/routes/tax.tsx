// Schedule C worksheet, 1099-K threshold notes (with sources), a 1099-K checked against the books, and members.
import { PLATFORM_LABELS, PLATFORMS, type Platform } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { api, orgPath, usd } from "../lib/api";
import { apiUrl } from "../lib/base-path";
import { useOrgId } from "./org";
import { ErrorText } from "./public";

interface ScLine {
  line: string;
  label: string;
  amountCents: number | null;
  note?: string;
}

interface Worksheet {
  year: number;
  disclaimer: string;
  lines: ScLine[];
  partIII: ScLine[];
  otherExpenses: ScLine[];
  warnings: string[];
  businessMiles: number;
  mileagePricing: {
    cents: number | null;
    byRate: {
      from: string;
      to: string;
      cents: number;
      source: string | null;
      miles: number;
      amountCents: number;
    }[];
    unpricedMiles: number;
  } | null;
  homeOffice: HomeOffice | null;
  openingInventory: { booksCents: number; filedCents: number | null };
  unlinkedSales: {
    orders: number;
    lastDate: string;
    itemsOnHand: number;
    itemsOnHandCents: number;
  } | null;
}

interface HomeOffice {
  officeSqft: number;
  homeSqft: number | null;
  months: number[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ALL_MONTHS = MONTHS.map((_, i) => i + 1);

/** Line 30 by the simplified method: the space, the whole home and the months, saved per tax year. */
function HomeOfficeCard({
  orgId,
  year,
  saved,
}: {
  orgId: string;
  year: number;
  saved: HomeOffice | null;
}) {
  const qc = useQueryClient();
  const [office, setOffice] = useState(saved ? String(saved.officeSqft) : "");
  const [home, setHome] = useState(saved?.homeSqft != null ? String(saved.homeSqft) : "");
  const [months, setMonths] = useState<number[]>(saved?.months ?? ALL_MONTHS);
  const done = () => qc.invalidateQueries({ queryKey: ["schedule-c", orgId, year] });
  const save = useMutation({
    mutationFn: () =>
      api(orgPath(orgId, `/reports/home-office/${year}`), {
        method: "PUT",
        body: {
          officeSqft: Math.round(Number(office)),
          homeSqft: home.trim() ? Math.round(Number(home)) : null,
          months,
        },
      }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api(orgPath(orgId, `/reports/home-office/${year}`), { method: "DELETE" }),
    onSuccess: done,
  });
  const toggle = (m: number) =>
    setMonths((ms) =>
      ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m].sort((a, b) => a - b),
    );
  return (
    <section className="card space-y-3" data-testid="home-office">
      <h2 className="font-medium">Line 30: business use of your home (simplified method)</h2>
      <p className="text-sm text-stone-600">
        $5 a square foot of the space you use for the business, at most 300 square feet, for the
        months you used it, and never more than line 29. Nothing above that limit carries to next
        year under this method. A space usually has to be used regularly and only for the business;
        storing your inventory is an exception when your home is the business's only fixed location
        (IRS Publication 587). Whether your space qualifies, and whether Form 8829's actual expenses
        would give more, is for you or your preparer.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label>
          <span className="label">Business area (sq ft)</span>
          <input
            className="input w-32"
            inputMode="numeric"
            required
            value={office}
            onChange={(e) => setOffice(e.target.value)}
          />
        </label>
        <label>
          <span className="label">Whole home (sq ft, optional)</span>
          <input
            className="input w-32"
            inputMode="numeric"
            value={home}
            onChange={(e) => setHome(e.target.value)}
          />
        </label>
        <fieldset className="w-full">
          <legend className="label">
            Months used for the business (15 days or more that month)
          </legend>
          <div className="flex flex-wrap gap-3">
            {MONTHS.map((name, i) => (
              <label key={name} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={months.includes(i + 1)}
                  onChange={() => toggle(i + 1)}
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="btn" type="submit" disabled={save.isPending || months.length === 0}>
          Save for {year}
        </button>
        {saved && (
          <button
            className="btn-secondary"
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Remove
          </button>
        )}
      </form>
      <ErrorText error={save.error ?? remove.error} />
    </section>
  );
}

/**
 * Line 35 is last year's line 41. The seller types in the figure from the return they filed for the year
 * before; the worksheet then uses it and warns when the books' own count on December 31 differs.
 */
function FiledOpeningForm({
  orgId,
  year,
  opening,
}: {
  orgId: string;
  year: number;
  opening: Worksheet["openingInventory"];
}) {
  const qc = useQueryClient();
  const prior = year - 1;
  const [amount, setAmount] = useState(
    opening.filedCents == null ? "" : (opening.filedCents / 100).toFixed(2),
  );
  const done = () => qc.invalidateQueries({ queryKey: ["schedule-c", orgId, year] });
  const save = useMutation({
    mutationFn: () =>
      api(orgPath(orgId, `/reports/filed-inventory/${prior}`), {
        method: "PUT",
        body: { closing: formNum(amount) },
      }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () =>
      api(orgPath(orgId, `/reports/filed-inventory/${prior}`), { method: "DELETE" }),
    onSuccess: done,
  });
  const parsed = formNum(amount);
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-3 border-t border-stone-200 pt-3"
      data-testid="filed-opening"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="w-full text-sm text-stone-600">
        Line 35 should equal line 41 of your {prior} return. Your books show{" "}
        {usd(opening.booksCents)} on hand at December 31, {prior}. If you filed for {prior}, enter
        the line 41 you reported and the worksheet uses it, with a warning if the two differ.
      </p>
      <label>
        <span className="label">Line 41 on your {prior} return ($)</span>
        <input
          className="input w-36"
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <button
        className="btn"
        type="submit"
        disabled={save.isPending || parsed == null || parsed < 0}
      >
        Save
      </button>
      {opening.filedCents != null && (
        <button
          className="btn-secondary"
          type="button"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          Remove
        </button>
      )}
      <ErrorText error={save.error ?? remove.error} />
    </form>
  );
}

function Lines({ lines }: { lines: ScLine[] }) {
  return (
    <table className="table">
      <tbody>
        {lines.map((l) => (
          <tr key={`${l.line}-${l.label}`}>
            <td className="w-14 font-mono text-xs text-stone-500">{l.line}</td>
            <td>
              {l.label}
              {l.note && <div className="text-xs text-stone-500">{l.note}</div>}
            </td>
            <td className="num">{usd(l.amountCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ScheduleCPage() {
  const orgId = useOrgId();
  const [year, setYear] = useState(new Date().getFullYear());
  const [rate, setRate] = useState("");
  const rateParam =
    rate.trim() && Number.isFinite(Number(rate)) ? `&mileageRate=${Number(rate)}` : "";
  const q = useQuery({
    queryKey: ["schedule-c", orgId, year, rateParam],
    queryFn: () => api<Worksheet>(orgPath(orgId, `/reports/schedule-c?year=${year}${rateParam}`)),
  });
  const ws = q.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Schedule C worksheet</h1>
        <label>
          <span className="label">Tax year</span>
          <input
            className="input w-24"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </label>
        <label>
          <span className="label">One rate for every trip (¢/mile, optional)</span>
          <input
            className="input w-28"
            inputMode="decimal"
            placeholder="IRS by date"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <a
          className="btn-secondary"
          href={apiUrl(orgPath(orgId, `/reports/schedule-c.csv?year=${year}${rateParam}`))}
        >
          Download CSV
        </a>
        <a
          className="btn-secondary"
          href={apiUrl(
            orgPath(orgId, `/reports/sales-ledger.csv?from=${year}-01-01&to=${year}-12-31`),
          )}
          title="The sale-by-sale records behind lines 1 to 7, for your records or your accountant"
        >
          Sales ledger (CSV)
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">Year-end records behind the worksheet:</span>
        <a
          className="btn-secondary"
          href={apiUrl(orgPath(orgId, `/reports/closing-inventory.csv?year=${year}`))}
          title="Every item on hand on December 31, at cost; the total is Part III line 41"
        >
          Closing inventory (CSV)
        </a>
        <a
          className="btn-secondary"
          href={apiUrl(orgPath(orgId, `/reports/mileage-log.csv?year=${year}${rateParam}`))}
          title="Every trip with its date, purpose, miles and rate; the totals are the business miles and line 9"
        >
          Mileage log (CSV)
        </a>
        <a
          className="btn-secondary"
          href={apiUrl(orgPath(orgId, `/reports/expenses.csv?year=${year}`))}
          title="Every expense for the year, with the worksheet line it lands on"
        >
          Expenses (CSV)
        </a>
        <a
          className="btn"
          href={apiUrl(orgPath(orgId, `/reports/year-end.zip?year=${year}${rateParam}`))}
          title="The worksheet, sales ledger, closing inventory, mileage log, expenses and QuickBooks journal for the year in one ZIP, with a README for your preparer"
        >
          Everything for your preparer (ZIP)
        </a>
      </div>
      <p className="rounded-md border border-accent-100 bg-accent-100/50 p-3 text-sm text-accent-700">
        {ws?.disclaimer ?? "Worksheet only: not a tax return and not tax advice."} Line 9 prices
        each trip at the IRS standard mileage rate for business in force on the day it was driven
        (the rates table at{" "}
        <a
          className="underline"
          href="https://www.irs.gov/tax-professionals/standard-mileage-rates"
          target="_blank"
          rel="noreferrer"
        >
          irs.gov
        </a>
        , 2019 on; 2022 and 2026 changed on July 1). It applies only if you use the standard mileage
        rate for this car rather than actual expenses; type in one rate above to use it for every
        trip instead.
      </p>
      <ErrorText error={q.error} />
      {ws && (
        <>
          {ws.warnings.map((w) => (
            <p key={w} className="text-sm text-accent-700">
              {w}
            </p>
          ))}
          <section className="card">
            <h2 className="mb-2 font-medium">Parts I and II: income and expenses</h2>
            <Lines lines={ws.lines} />
          </section>
          <section className="card">
            <h2 className="mb-2 font-medium">Part III: cost of goods sold (inventory at cost)</h2>
            <Lines lines={ws.partIII} />
            {ws.unlinkedSales && ws.unlinkedSales.itemsOnHand > 0 && (
              <p className="mt-2 text-sm">
                Line 41 may be overstated by up to {usd(ws.unlinkedSales.itemsOnHandCents)}:{" "}
                <Link to="/o/$orgId/sales" params={{ orgId }} className="text-brand-700 underline">
                  link the{" "}
                  {ws.unlinkedSales.orders === 1 ? "sale" : `${ws.unlinkedSales.orders} sales`} with
                  no item
                </Link>{" "}
                to the stock they sold.
              </p>
            )}
            <FiledOpeningForm
              key={`${year}-${ws.openingInventory.filedCents}`}
              orgId={orgId}
              year={year}
              opening={ws.openingInventory}
            />
          </section>
          <section className="card">
            <h2 className="mb-2 font-medium">Part IV: vehicle</h2>
            <p className="text-sm">Line 44a business miles: {ws.businessMiles.toFixed(1)}</p>
            {ws.mileagePricing && ws.mileagePricing.byRate.length > 0 && (
              <table className="mt-2 text-sm">
                <caption className="text-left text-slate-600">Line 9 by rate</caption>
                <thead>
                  <tr className="text-left">
                    <th className="pr-4 font-normal">Dates</th>
                    <th className="pr-4 font-normal">Miles</th>
                    <th className="pr-4 font-normal">Rate</th>
                    <th className="font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ws.mileagePricing.byRate.map((g) => (
                    <tr key={`${g.from}-${g.cents}`}>
                      <td className="pr-4">
                        {g.source == null ? "Your rate" : `${g.from} to ${g.to} (${g.source})`}
                      </td>
                      <td className="pr-4">{g.miles.toFixed(1)}</td>
                      <td className="pr-4">{g.cents}¢</td>
                      <td>{usd(g.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <HomeOfficeCard
            key={`${year}-${JSON.stringify(ws.homeOffice)}`}
            orgId={orgId}
            year={year}
            saved={ws.homeOffice}
          />
          {ws.otherExpenses.length > 0 && (
            <section className="card">
              <h2 className="mb-2 font-medium">Part V: other expenses</h2>
              <Lines lines={ws.otherExpenses} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

interface Note {
  jurisdiction: string;
  code: string;
  rule: string;
  years: string;
  url: string;
  quote: string;
  status: string;
  checkedOn: string;
  caveat?: string;
}

const STATUS_LABEL: Record<string, string> = {
  "official-excerpt": "Stated on the official page",
  "general-1099-rule": "State's general 1099 rule (1099-K not named)",
  unverified: "Unverified",
};

interface Reconciled {
  bases: { key: string; label: string; booksCents: number; differenceCents: number }[];
  closest: string;
  matches: boolean;
  months:
    | {
        month: string;
        booksOrders: number;
        booksCents: number;
        formCents: number | null;
        differenceCents: number | null;
      }[]
    | null;
  findings: string[];
  disclaimer: string;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const formNum = (s: string) => {
  const v = Number(s.replace(/[$,\s]/g, ""));
  return s.trim() && Number.isFinite(v) ? v : null;
};

/** The figures typed from the form go to the server in the request body and are not kept. */
function Reconcile1099k() {
  const orgId = useOrgId();
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [platform, setPlatform] = useState<Platform>("ebay");
  const [box1a, setBox1a] = useState("");
  const [box3, setBox3] = useState("");
  const [months, setMonths] = useState<string[]>(() => Array(12).fill(""));
  const run = useMutation({
    mutationFn: () => {
      const typed = months.map(formNum);
      return api<Reconciled>(orgPath(orgId, "/reports/1099k-reconcile"), {
        method: "POST",
        body: {
          year: Number(year),
          platform,
          box1a: formNum(box1a) ?? 0,
          months: typed.some((m) => m != null) ? typed : null,
          box3: formNum(box3),
        },
      });
    },
  });
  const r = run.data;
  return (
    <section className="card space-y-3" data-testid="reconcile-1099k">
      <h2 className="font-medium">Check a 1099-K against your books</h2>
      <p className="text-sm text-stone-600">
        Type the figures from one platform's form. The books' sales for that platform and year are
        added up three ways (item sales; plus shipping buyers paid; plus the sales tax the platform
        collected) and set against box 1a, then month by month if you type boxes 5a-5l. Nothing you
        type is saved.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <label>
          <span className="label">Tax year</span>
          <input
            className="input w-24"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </label>
        <label>
          <span className="label">Platform</span>
          <select
            className="input"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Box 1a gross amount ($)</span>
          <input
            className="input w-36"
            inputMode="decimal"
            required
            value={box1a}
            onChange={(e) => setBox1a(e.target.value)}
          />
        </label>
        <label>
          <span className="label">Box 3 transactions</span>
          <input
            className="input w-28"
            inputMode="numeric"
            value={box3}
            onChange={(e) => setBox3(e.target.value)}
          />
        </label>
        <details className="w-full text-sm">
          <summary className="cursor-pointer">Boxes 5a-5l, by month (optional)</summary>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {MONTH_SHORT.map((m, i) => (
              <label key={m}>
                <span className="label">{m}</span>
                <input
                  className="input w-full"
                  inputMode="decimal"
                  aria-label={`Box 5 ${m}`}
                  value={months[i]}
                  onChange={(e) =>
                    setMonths((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                  }
                />
              </label>
            ))}
          </div>
        </details>
        <button className="btn" type="submit" disabled={run.isPending}>
          Compare
        </button>
      </form>
      <ErrorText error={run.error} />
      {r && (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Books total</th>
                  <th className="text-right">Books</th>
                  <th className="text-right">Form minus books</th>
                </tr>
              </thead>
              <tbody>
                {r.bases.map((b) => (
                  <tr key={b.key} className={b.key === r.closest ? "font-medium" : ""}>
                    <td>
                      {b.label}
                      {b.key === r.closest ? (r.matches ? " (matches)" : " (closest)") : ""}
                    </td>
                    <td className="text-right">{usd(b.booksCents)}</td>
                    <td className="text-right">{usd(b.differenceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.months && (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-right">Orders</th>
                    <th className="text-right">Books</th>
                    <th className="text-right">Form</th>
                    <th className="text-right">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {r.months.map((m, i) => (
                    <tr key={m.month}>
                      <td>{MONTH_SHORT[i]}</td>
                      <td className="text-right">{m.booksOrders}</td>
                      <td className="text-right">{usd(m.booksCents)}</td>
                      <td className="text-right">{m.formCents == null ? "" : usd(m.formCents)}</td>
                      <td className="text-right">
                        {m.differenceCents == null ? "" : usd(m.differenceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="reconcile-findings">
            {r.findings.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="text-xs text-stone-500">{r.disclaimer}</p>
        </div>
      )}
    </section>
  );
}

export function Form1099kPage() {
  const q = useQuery({
    queryKey: ["1099k"],
    queryFn: () =>
      api<{ federal: Note; states: Note[]; omitted: { code: string; reason: string }[] }>(
        "/api/reference/1099k",
      ),
  });
  const fees = useQuery({
    queryKey: ["fee-sources"],
    queryFn: () =>
      api<{ items: { platform: string; officialPages: string[]; note: string }[] }>(
        "/api/reference/fee-sources",
      ),
  });
  const card = (n: Note) => (
    <div key={n.code} className="card">
      <h3 className="font-medium">{n.jurisdiction}</h3>
      <p className="text-sm">{n.rule}</p>
      <p className="text-xs text-stone-500">{n.years}</p>
      <blockquote className="my-2 border-l-2 border-stone-300 pl-2 text-xs italic">
        “{n.quote}”
      </blockquote>
      {n.caveat && <p className="text-xs text-accent-700">{n.caveat}</p>}
      <p className="mt-1 text-xs">
        <a className="text-brand-700 underline" href={n.url} target="_blank" rel="noreferrer">
          Source
        </a>{" "}
        · {STATUS_LABEL[n.status] ?? n.status} · checked {n.checkedOn}
      </p>
    </div>
  );
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Form 1099-K notes</h1>
      <p className="text-sm text-stone-600">
        A 1099-K threshold only decides whether a platform sends a form. It does not change what you
        owe: your profit is reportable whether or not a form arrives, and these books are the record
        of it. Quotes were checked against excerpts of each official page on the date shown. Open
        the source before relying on it.
      </p>
      <Reconcile1099k />
      {q.data && (
        <>
          <section>
            <h2 className="mb-2 font-medium">Federal</h2>
            {card(q.data.federal)}
          </section>
          <section>
            <h2 className="mb-2 font-medium">States with their own reporting rule</h2>
            <div className="grid gap-3 md:grid-cols-2">{q.data.states.map(card)}</div>
            {q.data.omitted.map((o) => (
              <p key={o.code} className="mt-2 text-xs text-stone-500">
                Not listed: {o.code}. {o.reason}
              </p>
            ))}
          </section>
        </>
      )}
      <section className="card">
        <h2 className="mb-2 font-medium">Where fees come from</h2>
        <p className="mb-2 text-sm text-stone-600">
          Seller Books never estimates a fee from a rate: every fee is read from the platform's own
          report. The marketplaces publish their current fees here:
        </p>
        <ul className="space-y-1 text-sm">
          {fees.data?.items.map((f) => (
            <li key={f.platform}>
              <span className="font-medium">
                {PLATFORM_LABELS[f.platform as keyof typeof PLATFORM_LABELS]}
              </span>
              : {f.note}{" "}
              {f.officialPages.map((u) => (
                <a
                  key={u}
                  className="text-brand-700 underline"
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                >
                  fee page
                </a>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function MembersPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => api<{ items: MemberRow[] }>(orgPath(orgId, "/members")),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const invite = useMutation({
    mutationFn: () =>
      api<{ url: string; emailSent: boolean }>(orgPath(orgId, "/members/invitations"), {
        method: "POST",
        body: { email, role },
      }).then((r) => ({ ...r, email })),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(orgPath(orgId, `/members/${id}`), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", orgId] }),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Members</h1>
      <section className="card">
        <table className="table">
          <tbody>
            {members.data?.items.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.email}</td>
                <td>{m.role}</td>
                <td>
                  {m.role !== "owner" && (
                    <button
                      type="button"
                      className="text-xs text-red-700 underline"
                      onClick={() => remove.mutate(m.id)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ErrorText error={remove.error} />
      </section>
      <form
        className="card flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate();
        }}
      >
        <input
          className="input max-w-xs"
          type="email"
          placeholder="Email to invite"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select className="input max-w-36" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
        <button className="btn" type="submit" disabled={invite.isPending}>
          Send invitation
        </button>
        <ErrorText error={invite.error} />
        {invite.data && (
          <p className="w-full text-sm" data-testid="invite-result">
            {invite.data.emailSent
              ? `Invitation emailed to ${invite.data.email}. If it doesn't arrive, send them this link yourself (valid 7 days, shown once): `
              : `No email was sent from here. Send this link to ${invite.data.email} yourself (valid 7 days, shown once): `}
            <code className="break-all">{invite.data.url}</code>
          </p>
        )}
        <p className="w-full text-xs text-slate-600">
          Inviting the same address again replaces its earlier invitation with a new link.
        </p>
      </form>
    </div>
  );
}
