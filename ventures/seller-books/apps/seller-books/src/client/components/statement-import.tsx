// Expenses page: read a bank or card statement CSV, review each line, save the ones ticked.
// The server reads the file and suggests (POST /expenses/statement); nothing is saved until "Save".
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, orgPath, usd } from "../lib/api";
import { ErrorText } from "../routes/public";

type ChargesAre = "positive" | "negative";

interface Row {
  line: number;
  date: string;
  description: string;
  amountCents: number;
  bankCategory: string | null;
  alreadyInBooks: boolean;
  suggestion: {
    kind: string;
    category: ExpenseCategory;
    include: boolean;
    reason: string | null;
    matched: string | null;
    learned?: { merchant: string; category: ExpenseCategory; count: number; lastDate: string };
    leftOut?: LeftOut;
  };
}

interface LeftOut {
  merchant: string;
  count: number;
  lastDate: string;
}

interface Saved {
  created: number;
  duplicatesSkipped: number;
  totalCents: number;
  merchantsRemembered: number;
}

interface Preview {
  rows: Row[];
  rowCount: number;
  skipped: { line: number; reason: string }[];
  warnings: string[];
  matched: Record<string, string>;
  signRule: "debit-credit-columns" | "type-column" | "given" | "guessed";
  chargesAre: ChargesAre | null;
}

interface Choice {
  include: boolean;
  category: ExpenseCategory;
}

const MAX_BYTES = 5 * 1024 * 1024;

export function StatementImport({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [saved, setSaved] = useState<Saved | null>(null);
  const [remember, setRemember] = useState(true);

  const read = useMutation({
    mutationFn: async (chargesAre?: ChargesAre) => {
      if (!file) throw new Error("Choose a CSV file");
      if (file.size > MAX_BYTES)
        throw new Error("File is larger than 5 MB: download a shorter period.");
      const csv = await file.text();
      return api<Preview>(orgPath(orgId, "/expenses/statement"), {
        method: "POST",
        body: { fileName: file.name, csv, chargesAre },
      });
    },
    onSuccess: (p) => {
      setSaved(null);
      const next: Record<number, Choice> = {};
      for (const r of p.rows) {
        next[r.line] = {
          include: r.suggestion.include && !r.alreadyInBooks,
          category: r.suggestion.category,
        };
      }
      setChoices(next);
    },
  });

  const p = read.data;
  const ticked = p ? p.rows.filter((r) => choices[r.line]?.include) : [];
  const tickedCents = ticked.reduce((s, r) => s + r.amountCents, 0);
  // Lines that started ticked and that the seller unticked: what "Remember" would learn from.
  const unticked = p
    ? p.rows.filter((r) => r.suggestion.include && !r.alreadyInBooks && !choices[r.line]?.include)
    : [];
  const leftOutSent = remember ? unticked : [];

  const save = useMutation({
    mutationFn: () =>
      api<Saved>(orgPath(orgId, "/expenses/batch"), {
        method: "POST",
        body: {
          fileName: file?.name ?? null,
          rows: ticked.map((r) => ({
            date: r.date,
            category: choices[r.line]?.category ?? r.suggestion.category,
            amountCents: r.amountCents,
            vendor: r.description,
          })),
          leftOut: leftOutSent.map((r) => ({ date: r.date, description: r.description })),
        },
      }),
    onSuccess: (s) => {
      setSaved(s);
      read.reset();
      setChoices({});
      return qc.invalidateQueries();
    },
  });

  const set = (line: number, c: Partial<Choice>) =>
    setChoices((all) => ({ ...all, [line]: { ...(all[line] as Choice), ...c } }));

  return (
    <section className="card space-y-2" aria-labelledby="statement-import">
      <h2 id="statement-import" className="font-medium">
        Import from a bank or card statement
      </h2>
      <p className="text-sm text-stone-600">
        Download the account's transactions as CSV from your bank's website and choose the file.
        Each purchase gets a suggested category; postage, packaging suppliers, listing software and
        storage units start ticked. Thrift and liquidation buys (inventory), marketplace charges
        (already in their reports), fuel (covered by the mileage rate) and transfers start unticked,
        with the reason. A merchant you have filed before starts with your own latest category
        instead, and ticked (stores that sell everything and transfers still wait for you). Nothing
        is saved until you press Save, the file itself is not kept, and lines already in your books
        are left unticked. If you untick a line that started ticked (a personal subscription on the
        business card), the page can remember that merchant, so the next statement starts it
        unticked.
      </p>
      <input
        className="input"
        type="file"
        accept=".csv,text/csv"
        aria-label="Statement CSV"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          read.reset();
          setSaved(null);
        }}
      />
      <div className="space-x-2">
        <button
          className="btn"
          type="button"
          disabled={!file || read.isPending}
          onClick={() => read.mutate(undefined)}
        >
          Read statement
        </button>
      </div>
      <ErrorText error={read.error} />
      {saved && (
        <p className="text-sm" role="status">
          Saved {saved.created} {saved.created === 1 ? "expense" : "expenses"} totalling{" "}
          {usd(saved.totalCents)}
          {saved.duplicatesSkipped > 0 && `; ${saved.duplicatesSkipped} were already in your books`}
          {saved.merchantsRemembered > 0 &&
            `; ${saved.merchantsRemembered} ${saved.merchantsRemembered === 1 ? "merchant" : "merchants"} you left out will start unticked next time`}
          .
        </p>
      )}
      {p && (
        <div className="space-y-2 text-sm">
          <p>
            {p.rows.length} purchases read from {p.rowCount} rows; {ticked.length} ticked, totalling{" "}
            {usd(tickedCents)}.
          </p>
          <p className="text-xs text-stone-500">
            Columns read:{" "}
            {Object.entries(p.matched)
              .map(([k, v]) => `${k} ← "${v}"`)
              .join(", ")}
          </p>
          {p.warnings.map((w) => (
            <p key={w} className="text-accent-700">
              {w}
            </p>
          ))}
          {(p.signRule === "guessed" || p.signRule === "given") && (
            <button
              className="text-xs underline"
              type="button"
              disabled={read.isPending}
              onClick={() => read.mutate(p.chargesAre === "negative" ? "positive" : "negative")}
            >
              Wrong way round? Read {p.chargesAre === "negative" ? "positive" : "negative"} amounts
              as purchases
            </button>
          )}
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Save</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => {
                  const c = choices[r.line];
                  return (
                    <tr key={r.line}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Save ${r.description}`}
                          checked={c?.include ?? false}
                          onChange={(e) => set(r.line, { include: e.target.checked })}
                        />
                      </td>
                      <td>{r.date}</td>
                      <td>
                        {r.description}
                        {r.bankCategory && (
                          <span className="ml-1 text-xs text-stone-500">({r.bankCategory})</span>
                        )}
                        {r.alreadyInBooks ? (
                          <span className="block text-xs text-stone-500">
                            Already in your books.
                          </span>
                        ) : (
                          r.suggestion.reason && (
                            <span className="block text-xs text-stone-500">
                              {r.suggestion.reason}
                            </span>
                          )
                        )}
                      </td>
                      <td>
                        <select
                          className="input"
                          aria-label={`Category for ${r.description}`}
                          value={c?.category ?? r.suggestion.category}
                          onChange={(e) =>
                            set(r.line, { category: e.target.value as ExpenseCategory })
                          }
                        >
                          {EXPENSE_CATEGORIES.map((k) => (
                            <option key={k} value={k}>
                              {k.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="num">{usd(r.amountCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {unticked.length > 0 && (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>
                Remember the {unticked.length === 1 ? "line" : `${unticked.length} lines`} I
                unticked, so the next statement starts{" "}
                {unticked.length === 1 ? "that merchant" : "those merchants"} unticked too. Only the
                merchant's name and the latest date are kept, never the amount or the statement.
              </span>
            </label>
          )}
          <button
            className="btn"
            type="button"
            disabled={(ticked.length === 0 && leftOutSent.length === 0) || save.isPending}
            onClick={() => save.mutate()}
          >
            {ticked.length === 0
              ? "Remember the merchants I left out"
              : `Save ${ticked.length} ${ticked.length === 1 ? "expense" : "expenses"}`}
          </button>
          <ErrorText error={save.error} />
          {p.skipped.length > 0 && (
            <details className="text-xs text-stone-600">
              <summary>{p.skipped.length} rows left out</summary>
              <ul className="list-disc pl-5">
                {p.skipped.map((k) => (
                  <li key={k.line}>
                    Line {k.line}: {k.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <LeftOutMerchants orgId={orgId} />
    </section>
  );
}

/** The merchants the import leaves out, each with a "Forget" button (DELETE /expenses/left-out/:m). */
function LeftOutMerchants({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["left-out-merchants", orgId],
    queryFn: () => api<{ merchants: LeftOut[] }>(orgPath(orgId, "/expenses/left-out")),
  });
  const forget = useMutation({
    mutationFn: (merchant: string) =>
      api(orgPath(orgId, `/expenses/left-out/${encodeURIComponent(merchant)}`), {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["left-out-merchants", orgId] }),
  });
  const merchants = list.data?.merchants ?? [];
  if (merchants.length === 0) return null;
  return (
    <details className="text-sm">
      <summary>
        {merchants.length} {merchants.length === 1 ? "merchant starts" : "merchants start"} unticked
        because you left {merchants.length === 1 ? "it" : "them"} out
      </summary>
      <ul className="mt-1 space-y-1">
        {merchants.map((m) => (
          <li key={m.merchant} className="flex items-center justify-between gap-2">
            <span>
              {m.merchant}{" "}
              <span className="text-xs text-stone-500">
                ({m.count} {m.count === 1 ? "line" : "lines"}, latest {m.lastDate})
              </span>
            </span>
            <button
              className="text-xs underline"
              type="button"
              aria-label={`Forget ${m.merchant}`}
              disabled={forget.isPending}
              onClick={() => forget.mutate(m.merchant)}
            >
              Forget
            </button>
          </li>
        ))}
      </ul>
      <ErrorText error={forget.error} />
    </details>
  );
}
