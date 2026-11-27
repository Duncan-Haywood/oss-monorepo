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
