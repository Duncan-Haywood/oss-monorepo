// Imports page: "Did I import everything?" The deposits on a bank statement against the payouts the books
// expect per platform and month (POST /reports/payout-reconcile). The statement is read on the server and
// not kept; excluding a line re-runs the check.
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api, orgPath, usd } from "../lib/api";
import { ErrorText } from "../routes/public";

type ChargesAre = "positive" | "negative";

interface Month {
  month: string;
  orders: number;
  expectedCents: number;
  depositsCents: number;
  runningGapCents: number;
}

interface PlatformRow {
  platform: string;
  label: string;
  expectedCents: number;
  depositsCents: number;
  depositCount: number;
  gapCents: number;
  status: "matches" | "books_ahead" | "deposits_ahead" | "no_deposits" | "no_books";
  months: Month[];
}

interface Deposit {
  line: number;
  date: string;
  description: string;
  amountCents: number;
  platform: string | null;
  excluded: boolean;
}

interface Result {
  from: string;
  to: string;
  platforms: PlatformRow[];
  deposits: Deposit[];
  otherDepositsCents: number;
  findings: string[];
  disclaimer: string;
  signRule: string;
  chargesAre: ChargesAre | null;
  warnings: string[];
}

const STATUS: Record<PlatformRow["status"], string> = {
  matches: "Matches",
  books_ahead: "Books expect more",
  deposits_ahead: "More deposited",
  no_deposits: "No deposits found",
  no_books: "No sales imported",
};

const MAX_BYTES = 5 * 1024 * 1024;

export function PayoutCheck({ orgId }: { orgId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [exclude, setExclude] = useState<number[]>([]);
  const run = useMutation({
    mutationFn: async (args: { exclude: number[]; chargesAre?: ChargesAre }) => {
      if (!file) throw new Error("Choose a CSV file");
      if (file.size > MAX_BYTES)
        throw new Error("File is larger than 5 MB: download a shorter period.");
      const csv = await file.text();
      return api<Result>(orgPath(orgId, "/reports/payout-reconcile"), {
        method: "POST",
        body: { csv, exclude: args.exclude, chargesAre: args.chargesAre },
      });
    },
  });
  const r = run.data;
  const chargesAre = r?.chargesAre ?? undefined;
  const toggle = (line: number) => {
    const next = exclude.includes(line) ? exclude.filter((l) => l !== line) : [...exclude, line];
    setExclude(next);
    run.mutate({ exclude: next, chargesAre });
  };
  const matched = r?.deposits.filter((d) => d.platform) ?? [];
  return (
    <section className="card space-y-3" data-testid="payout-check">
      <h2 className="font-medium">Did I import everything? Check your deposits</h2>
      <p className="text-sm text-stone-600">
        Upload the CSV statement of the bank account your payouts go to. Each deposit that names a
        platform is set against what your books expect that platform to pay out (sales and shipping,
        less refunds, fees and postage), month by month, so a month you never imported shows up. The
        statement is not saved.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label>
          <span className="label">Bank statement (CSV)</span>
          <input
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setExclude([]);
            }}
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={!file || run.isPending}
          onClick={() => run.mutate({ exclude })}
        >
          {run.isPending ? "Checking…" : "Check deposits"}
        </button>
      </div>
      <ErrorText error={run.error} />
      {r && (
        <div className="space-y-3">
          <p className="text-sm">
            Statement from {r.from} to {r.to}.
          </p>
          {r.signRule === "guessed" && (
            <p className="text-sm text-accent-700">
              Deposits were taken to be the {r.chargesAre === "negative" ? "positive" : "negative"}{" "}
              amounts.{" "}
              <button
                type="button"
                className="underline"
                onClick={() =>
                  run.mutate({
                    exclude,
                    chargesAre: r.chargesAre === "negative" ? "positive" : "negative",
                  })
                }
              >
                Flip it
              </button>{" "}
              if the deposits below are your purchases.
            </p>
          )}
          {r.platforms.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th className="text-right">Books expect</th>
                    <th className="text-right">Deposited</th>
                    <th className="text-right">Difference</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {r.platforms.map((p) => (
                    <tr key={p.platform}>
                      <td>{p.label}</td>
                      <td className="text-right">{usd(p.expectedCents)}</td>
                      <td className="text-right">
                        {usd(p.depositsCents)} ({p.depositCount})
                      </td>
                      <td className="text-right">{usd(p.gapCents)}</td>
                      <td>{STATUS[p.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="payout-findings">
            {r.findings.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {r.platforms.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">By month</summary>
              {r.platforms.map((p) => (
                <div key={p.platform} className="mt-2 overflow-x-auto">
                  <h3 className="font-medium">{p.label}</h3>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="text-right">Orders</th>
                        <th className="text-right">Books expect</th>
                        <th className="text-right">Deposited</th>
                        <th className="text-right">Running difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.months.map((m) => (
                        <tr key={m.month}>
                          <td>{m.month}</td>
                          <td className="text-right">{m.orders}</td>
                          <td className="text-right">{usd(m.expectedCents)}</td>
                          <td className="text-right">{usd(m.depositsCents)}</td>
                          <td className="text-right">{usd(m.runningGapCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </details>
          )}
          {matched.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">
                Deposits matched to a platform ({matched.length}): untick any that is not a payout
              </summary>
              <ul className="mt-2 space-y-1">
                {matched.map((d) => (
                  <li key={d.line}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!d.excluded}
                        disabled={run.isPending}
                        onChange={() => toggle(d.line)}
                      />
                      <span>
                        {d.date} · {d.description} · {usd(d.amountCents)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs text-stone-500">{r.disclaimer}</p>
        </div>
      )}
    </section>
  );
}
