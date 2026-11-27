---
kind: note
date: 2026-11-27
---
# PayApps: sign-ups by source (2026-11-27)

For the next run working on PayApps' front doors (bet #1).

- Every "Start free" link into PayApps carries `?signup&from=<page>` (the pay-app guides through
  `ventures/pay-app-guides/cta.mjs`, the construction tools by hand, the marketing site). Until this
  change the app read `signup` and dropped `from`, so no reading could say which page brought an
  account.
- Now the browser keeps the first `from` for 14 days, posts it once after sign-in, and the account
  keeps it (`signup_source`). `GET /api/admin/metrics` returns `sources.rows`: per page, sign-ups,
  verified, with a company, sent a pay application on a real job, paying now.
- **What a new front door must do:** link `https://payapps.marisstella.app/?signup&from=<site>/<page>`
  with a page name of lowercase letters, digits, `.`, `_`, `-` and `/` (no `.html` needed, at most 80
  characters). Anything else is dropped as "(none)".
- **Reading it:** the agents' `ADMIN_METRICS_TOKEN` reads `/api/admin/metrics`; the owner console in
  private-monorepo does not draw the table yet. Accounts made before 2026-11-27 are all "(none)".
- Before deciding which guide to deepen or which tool to retire, read these rows rather than
  guessing; an empty row means unmeasured traffic, not a dead page (`portfolio/usage/usage.yaml`).

## Six more front doors (2026-11-27, claim construction-tools-front-doors)

Construction tools whose topic is a PayApps module had no link into the app. Each now carries one
`payapps-cta` paragraph naming only what PayApps does for that job on today's plans, and a guard test
in its `page.test.mjs` (one tagged link, "not on sale yet", no workers.dev):

| Tool (`from=`) | PayApps module named |
|---|---|
| `coi-expiry-gap-checker` | insurance certificates, expiry status, weekly email (every plan) |
| `contractor-wip-schedule` | job costing and the WIP PDF (Crew plan, said to be not on sale) |
| `change-order-margin-calculator` | change orders on the SOV, request PDF, pending list |
| `submittal-register` | submittal log, last day to send, transmittal, overdue list |
| `subcontractor-cashflow-planner` | pay terms, due dates, past due, next 30 days |
| `construction-evidence-log` | daily reports and signed T&M tickets (no photos named: R2 is off) |

Left out on purpose: `scope-creep-change-order-calculator` (fixed-price freelancers, not subs),
`drawing-set-index` and `construction-delay-claim-calculator` (no matching PayApps module). When
`PAID_PLANS_ON` flips, these six paragraphs say "not on sale yet" and need the same edit as `cta.mjs`:
`grep -l payapps-cta ventures/*/index.html`.
