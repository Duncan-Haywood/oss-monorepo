// The QuickBooks Online journal export: a download link for the P&L page's date range, with the account
// names the seller uses in QuickBooks. Those names are kept in this browser only (localStorage, which may be
// unavailable); they are a convenience, never stored with the books.
import {
  DEFAULT_JOURNAL_ACCOUNTS,
  JOURNAL_ACCOUNT_KEYS,
  JOURNAL_ACCOUNT_LABELS,
  type JournalAccounts,
} from "@shared/journal-accounts";
import { useState } from "react";
import { orgPath } from "../lib/api";
import { apiUrl } from "../lib/base-path";

const storageKey = (orgId: string) => `seller-books:qbo-accounts:${orgId}`;

interface Saved {
  accounts: Partial<JournalAccounts>;
  cogs: boolean;
}

function load(orgId: string): Saved {
  try {
    const raw = window.localStorage.getItem(storageKey(orgId));
    if (raw) {
      const v = JSON.parse(raw) as Saved;
      return { accounts: v.accounts ?? {}, cogs: v.cogs === true };
    }
  } catch {
    // Storage blocked or a damaged value: start from the defaults.
  }
  return { accounts: {}, cogs: false };
}

function save(orgId: string, v: Saved) {
  try {
    window.localStorage.setItem(storageKey(orgId), JSON.stringify(v));
  } catch {
    // Not saved; the export still works with what is on screen.
  }
}

export function QuickBooksExport({ orgId, from, to }: { orgId: string; from: string; to: string }) {
  const [saved, setSaved] = useState<Saved>(() => load(orgId));
  const update = (next: Saved) => {
    setSaved(next);
    save(orgId, next);
  };
  const params = new URLSearchParams({ from, to });
  if (saved.cogs) params.set("cogs", "1");
  for (const k of JOURNAL_ACCOUNT_KEYS) {
    const v = saved.accounts[k]?.trim();
    if (v && v !== DEFAULT_JOURNAL_ACCOUNTS[k]) params.set(`account.${k}`, v);
  }
  const monthEnd = (iso: string) => {
    const [y, m] = iso.split("-").map(Number) as [number, number];
    return new Date(Date.UTC(y, m, 0)).getUTCDate() === Number(iso.slice(8, 10));
  };
  const partial = !from.endsWith("-01") || !monthEnd(to);
  return (
    <details className="card text-sm">
      <summary className="cursor-pointer font-medium">QuickBooks Online journal entries</summary>
      <div className="mt-3 space-y-3">
        <p className="text-stone-600">
          One summary journal entry per platform per month for these dates: sales, shipping charged,
          refunds, fees, ads, postage and subscriptions on their own accounts, and the net on a
          clearing account for each platform. Record each payout in QuickBooks as a transfer from
          that clearing account to your bank; what stays in it is money the platform still holds.
          Hand-entered expenses and mileage are left out, since they usually reach QuickBooks from
          your bank feed.
        </p>
        <p className="text-stone-600">
          In QuickBooks: Settings, Import data, Journal entries, then map the columns. Create the
          accounts below first (or type the names you already use; "Parent:Sub" for a subaccount).
          Journal numbers repeat for the same platform and month, so QuickBooks can warn you before
          a month is imported twice.
        </p>
        {partial && (
          <p className="text-amber-700">
            These dates do not cover whole months, so a month's entry holds only part of it. Export
            whole months to avoid importing a month twice with different totals.
          </p>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          {JOURNAL_ACCOUNT_KEYS.filter(
            (k) => saved.cogs || (k !== "cogs" && k !== "inventory"),
          ).map((k) => (
            <label key={k}>
              <span className="label">{JOURNAL_ACCOUNT_LABELS[k]}</span>
              <input
                className="input"
                maxLength={100}
                placeholder={DEFAULT_JOURNAL_ACCOUNTS[k]}
                value={saved.accounts[k] ?? ""}
                onChange={(e) =>
                  update({ ...saved, accounts: { ...saved.accounts, [k]: e.target.value } })
                }
              />
            </label>
          ))}
        </div>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={saved.cogs}
            onChange={(e) => update({ ...saved, cogs: e.target.checked })}
          />
          <span>
            Also post cost of goods sold against an inventory asset account. Only if your purchases
            go to inventory in QuickBooks; if you expense them when you buy, leave this off or the
            cost is counted twice.
          </span>
        </label>
        <a
          className="btn-secondary inline-block"
          href={apiUrl(orgPath(orgId, `/reports/quickbooks-journal.csv?${params.toString()}`))}
        >
          Download QuickBooks journal (CSV)
        </a>
      </div>
    </details>
  );
}
