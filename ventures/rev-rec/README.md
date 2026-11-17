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
  in the price. Tax added on top is not in the line amount to begin with.
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
- **Journal CSV:** per month, `Dr Accounts receivable / Cr Deferred revenue`
  for billings and `Dr Deferred revenue / Cr Subscription revenue` for
  recognition, dated month end. Account names: `ACCOUNT_RECEIVABLE`,
  `ACCOUNT_DEFERRED`, `ACCOUNT_REVENUE`. `?through=YYYY-MM` limits the range.

## Known gaps

From the first quality audit
([`portfolio/quality/audits/2026-11-17-rev-rec.json`](../../portfolio/quality/audits/2026-11-17-rev-rec.json)):

- **Late-paid invoices can be missed by incremental sync.** After the first
  sync the server asks Stripe for paid invoices *created* since the last sync
  minus three days, so an invoice paid more than about three days after it was
  created (net-30 terms, dunning retries) is never fetched. Until this re-reads
  open invoices or follows `invoice.paid` events, run a full resync each month.
- **Periods with a time of day count one extra day** (32 for a month, 366 for
  a year), pushing a sliver of revenue past the period end.
- **Zero-decimal currencies** (JPY, KRW) are divided by 100.
- **No period lock:** a late payment or proration rewrites months whose
  journal was already exported, and the billing entry debits Accounts
  receivable on the paid date, so AR never clears.
- **No standalone-selling-price allocation** for bundles or setup fees.
- No `Stripe-Version` header is pinned.

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
