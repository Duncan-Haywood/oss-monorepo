# SaaS Renewal Planner

Most SaaS contracts auto-renew at a higher price unless you give notice by a date buried in the order form, and the seats
you pay for are rarely the seats people use. Paste your subscriptions (renewal date, notice days, seats paid and used,
proposed increase) and get the last day to act on each one, the renewals ranked by what negotiating could save, a floor and
stretch target price, an email draft per vendor and a calendar file of the deadlines. Browser page or zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/saas-renewal-planner/

```
node cli.mjs plan renewals.csv --as-of 2026-10-02 --ask 10 --json
node cli.mjs email renewals.csv --vendor Slack
node cli.mjs ics renewals.csv > renewals.ics
```

Input: rows of `vendor,annual_cost,renews_on,notice_days,auto_renew,seats_paid,seats_used,uplift_pct[,note]`. See
`fixtures/renewals.csv`.

## How it decides

Notice deadline = renewal date minus notice days; status is `urgent` (inside your lead time), `upcoming`, `locked-in`
(auto-renewal already past its notice date), `lapses` (does not auto-renew) or `renewed`. Seats needed = used seats plus a
buffer, rounded up, never above seats paid. Do-nothing renewal = annual cost x (1 + uplift). Floor target = seats needed at
today's price per seat with no uplift; stretch target = floor less your ask. Rows are ordered urgent first (nearest
deadline first), then by stretch savings.

## What it is not

Not legal or procurement advice, and it does not read contracts: termination rights, price caps, minimum commitments,
multi-year terms and true-up clauses are not modelled, and your order form controls. It does not connect to any vendor;
seat counts are what you type. No warranty.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
