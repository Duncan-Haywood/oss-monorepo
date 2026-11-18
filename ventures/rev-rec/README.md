# Rev Rec

After using this, you can now **hand your bookkeeper a deferred-revenue
schedule and balanced journal entries built from your Stripe invoices, from a
read-only key, on a server you run**, instead of paying a percentage of your
billing volume for Stripe's add-on or rebuilding annual plans in a spreadsheet
every close.

**Live tool:** https://marisstella.app/rev-rec/

Two parts, both free and MIT:

- **`index.html`**: paste an invoice-line export (or load sample data) and get
  billings, revenue recognised and deferred revenue by month, the revenue
  already invoiced for future months, and a journal CSV to download. Runs in
  the browser; nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON
  file. It lists your paid invoices and credit notes from Stripe every few
  hours and serves a password-protected dashboard, `/v1/schedule` and
  `/v1/journal.csv`.

## Why someone would use this

| Today | Cost / catch | Rev Rec |
|---|---|---|
| Stripe Revenue Recognition | Accounting-grade and supported, billed as a share of Billing volume | Free, the core monthly schedule and journal |
| Chargebee RevRec, Maxio | Whole billing platforms; you would move off Stripe | Reads the Stripe account you already have |
| A spreadsheet of annual invoices | Free; day counts, proration lines and refunds drift | Same arithmetic every sync, tested to the cent |
| Your bookkeeper, by hand | Billable hours each month | One CSV |

Honest limits: straight-line daily recognition only (no usage-based, milestone
or multi-element rules), one currency per instance, credit notes never rewrite
months already past, invoices paid in a later
month than they were issued are billed when paid. It is a working schedule, not
audit-ready revenue accounting.

## What it counts

- **Paid invoices only.** An invoice line is billed on the date it was paid.
- **Recognised revenue:** each line is spread evenly per UTC day across its
  service period (`period.start` to `period.end`) and summed by month. Parts
  are rounded so they add up to the line exactly.
- **Net amounts:** line amount minus discounts, minus any tax that is included
  in the price (`tax_amounts[].inclusive`, or `taxes[].tax_behavior:
  "inclusive"` on API versions from 2025-03-31). Tax added on top is not in
  the line amount to begin with.
- **One-off charges** (no period) are recognised on their date.
- **Credit notes** are negative billings. When a credit note line names the
  invoice line it credits (Stripe's `invoice_line_item`; a `credits` column in
  the CSV demo), it is spread from its issue date to the end of that line's
  period, so a prorated refund reverses the unearned remainder and the
  cancelled subscription stops earning (ASC 606 treats this as a contract
  modification, prospectively). An unlinked credit note is recognised on its
  issue date.
- **Deferred revenue at month end** = billed to date minus recognised to date.
  A negative balance means revenue recognised before it was billed.
- **Journal CSV:** per month, `Dr Stripe balance / Cr Deferred revenue`
  for billings (lines are dated when paid, so the money is already in; a
  receivable would never clear) and `Dr Deferred revenue / Cr Subscription
  revenue` for recognition, dated month end. Account names: `ACCOUNT_CASH`
  (the older `ACCOUNT_RECEIVABLE` is still read), `ACCOUNT_DEFERRED`,
  `ACCOUNT_REVENUE`. `?through=YYYY-MM` limits the range (any other form, such as `2026-3`, is a 400 rather than a journal of every month).
- **Period lock:** set `CLOSED_THROUGH=YYYY-MM` (or pass
  `?closed_through=YYYY-MM` on any endpoint) once you have exported a month.
  A line paid after the close (a net-30 invoice, a proration billed later)
  no longer rewrites closed months: what it would have billed or recognised
  in them is booked as a catch-up in the first open month. Totals and the
  closing deferred balance are unchanged; only the timing moves. Lines paid
  in or before the close keep their schedule.
- **Currency units** follow Stripe: zero-decimal currencies (JPY, KRW, VND
  and the rest of Stripe's list) are whole units, the dinars (BHD, JOD, KWD,
  OMR, TND) thousandths, everything else cents. The journal CSV writes amounts
  with that many decimals.
- **CSV import is strict** (browser demo): a row whose date does not exist
  (2026-02-30) or whose amount has more decimals than its currency (`€ 1.000`,
  which a European export means as a thousand) is listed as skipped with the
  reason, never moved to another day or rounded to a different amount.

## Known gaps

From the first quality audit
([`portfolio/quality/audits/2026-11-17-rev-rec.json`](../../portfolio/quality/audits/2026-11-17-rev-rec.json)):

- **Credit notes and voids on closed months:** the period lock moves late
  *payments*; a credit note issued after the close is booked on its own
  date already, but a void of an invoice paid in a closed month still
  rewrites that month on the next full re-read.
- **No standalone-selling-price allocation** for bundles or setup fees. A
  non-distinct setup fee is recognised in full on its date; ASC
  606-10-55-51 spreads it over the service period, so book that adjustment
  by hand.
- No `Stripe-Version` header is pinned. Both tax shapes are read: the older
  `tax_amounts[].inclusive` and the `taxes[].tax_behavior` that API version
  2025-03-31 and later send.

Fixed since the audit (red team, 2026-11-18): late-paid invoices and voided
credit notes are picked up by a full re-read at least once a day (the other
passes ask only for the last three days), and a period that carries a time of
day counts whole days (31 for a month, not 32). Quality fix, 2026-11-18:
the period lock above, and billings debit cash instead of a receivable that
never cleared.

## Run it

```sh
cd ventures/rev-rec
node --test        # no network
STRIPE_SECRET_KEY=rk_live_... ADMIN_KEY=$(openssl rand -hex 16) \
COMPANY_NAME=Acme node server.mjs
```

Open `http://localhost:8080` and sign in with any user name and `ADMIN_KEY` as
the password. API (same key as `Authorization: Bearer ...`): `GET /v1/schedule`,
`GET /v1/journal.csv`, `POST /v1/sync`.

Stripe key: Dashboard, Developers, API keys, **Create restricted key**, set
*Invoices* and *Credit notes* to **Read** and everything else to None. The
server only ever issues GET requests, and the tests assert it.

One-click deploy: `render.yaml` builds the Dockerfile in your own Render
account; you paste the key there and nothing runs on the author's.

Donate: <https://github.com/sponsors/Duncan-Haywood>

## Other self-deploy paths

`docker-compose.yml` runs it on any box with Docker (the command is at its top). Fly.io: the steps are at the top of `fly.toml`. Both keep state on a volume and run in your own account.
