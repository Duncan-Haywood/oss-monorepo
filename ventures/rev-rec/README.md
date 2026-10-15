# Rev Rec

After using this, you can now **hand your bookkeeper a deferred-revenue
schedule and balanced journal entries built from your Stripe invoices, from a
read-only key, on a server you run**, instead of paying a percentage of your
billing volume for Stripe's add-on or rebuilding annual plans in a spreadsheet
every close.

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
or multi-element rules), one currency per instance, credit notes reduce revenue
when issued rather than rewriting the original months, invoices paid in a later
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
- **Credit notes** are negative lines recognised when issued, in both billings
  and revenue, so the deferred balance they touch is unchanged.
- **Deferred revenue at month end** = billed to date minus recognised to date.
  A negative balance means revenue recognised before it was billed.
- **Journal CSV:** per month, `Dr Accounts receivable / Cr Deferred revenue`
  for billings and `Dr Deferred revenue / Cr Subscription revenue` for
  recognition, dated month end. Account names: `ACCOUNT_RECEIVABLE`,
  `ACCOUNT_DEFERRED`, `ACCOUNT_REVENUE`. `?through=YYYY-MM` limits the range.

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
