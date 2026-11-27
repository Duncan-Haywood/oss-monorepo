---
kind: milestone
date: 2026-11-27
---
# Live funnel check for the paid products (2026-11-27)

`platform/ci/live_funnel_check.mjs` opens each paid product whose sign-up is open, the way a
visitor arrives: at desktop (1280 px) and phone (390 px) width, on the sign-up URL the free pages
link to, and then each listed front-door page. It submits nothing and creates no account.

```
node platform/ci/live_funnel_check.mjs                 # every product in FUNNELS
node platform/ci/live_funnel_check.mjs --only payapps --json
node --test platform/ci/live_funnel_check.test.mjs     # the judging rules, no browser
```

## Why

The deploy workflows wait for `/api/health` to answer `ok`. That stays green when what a customer
sees is wrong. The first run of this check (before this PR) found one of those on bet #1:

| App | URL | Result |
| --- | --- | --- |
| payapps | https://payapps.marisstella.app/?signup | FAIL: title "PayApps (in development)" on a product open on the Free plan; no meta description (desktop and phone) |
| seller-books | https://seller-books.marisstella.app/signup | ok |

The title is what a browser tab, a bookmark and a link preview in a text message show, so a
contractor sent the link saw "in development". This PR gives PayApps' `index.html` a real title, a
description taken from the sign-in page's own sentence and the plan banner, and a favicon (it had
none, so tabs showed a blank icon). The README heading lost "(in development)" too.

## What it checks

Per app and width: status 200; a title that does not read "in development", "coming soon" or a
framework default; a meta description; a visible email and password field; a submit button that
says sign up or create (so the free pages' links really open on sign-up); no sideways scroll; no
uncaught script error; no 4xx/5xx response other than the signed-out `/api/me` probe; and at least
two legal links (terms, privacy), each answering 200. Per front door: 200, and a link to the app's
sign-up URL (`?signup` for PayApps, `/signup` for Seller Books), not just to its sign-in page.

## Next

- Add a product to `FUNNELS` when its sign-up opens (Job Shop Quote waits on the owner's sender
  domain; CMMC on its first deploy). Add Seller Books' front doors once PRs #19718/#19719 (sign-ups
  open) merge.
- The PayApps fix reaches visitors at the next `payapps-deploy` run (manual; agents may run it).
- Worth considering: run this script as the last step of each product's deploy workflow, after the
  health wait. That edits a control-plane workflow, so it is a separate PR through
  `adversarial-gate`.
