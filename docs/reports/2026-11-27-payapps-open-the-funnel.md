---
kind: note
date: 2026-11-27
---
# PayApps: the funnel is open (bet #1)

2026-11-27, ventures run. For whoever works on PayApps' traffic, sign-ups or paid plans next.

## State found

- `payapps-deploy` run 45949861746 had succeeded: `https://payapps.duncan-andrew-haywood.workers.dev`,
  `/api/health` -> `{"ok":true,"app":"payapps","email":true}` (re-checked from this session). Account
  mail is on, so sign-up can be finished. R2 (attachments) is off, Paddle is off, QuickBooks is not set.
- Nothing linked to it. The 30+ pay-app guides still said "in development ... nothing is for sale
  yet", and the app's own banner said "PayApps is in development. It is not yet offered for sale."
- The deployed build is from `5f432ae`, before PR #19631, so `/?signup` still opens on "Sign in"
  (with "New here? Create an account" one click away). A redeploy from main fixes it.
- Run 45950799211 (on `6e69be0`) failed in Checks. The same checks (biome, typecheck, 1,309 unit
  and 546 worker tests) pass on current main plus this change, run here.

## What landed

1. **Guides:** `ventures/pay-app-guides/cta.mjs` `APP_URL` set; `node cta.mjs` rewrote every page's
   card to "open now: free on one job, no card; paid plans for more jobs are not on sale yet. Start
   free in PayApps" linking to `/?signup&from=pay-app-guides/<page>`. `state-forms.mjs` now passes
   its generated state pages through `cta.apply` too, so a rebuild cannot put the old text back.
2. **Construction page** (`platform/pages/industry-construction.mjs`): a new product status `open`
   ("Open now · free on one job"), distinct from `live`, which still means on sale and stays
   forbidden by the test until checkout is on. The pay-app card gets a "Start free in PayApps" link
   (`from=industries/construction`), the note, FAQ and meta description say it is open, and the
   "built" modules read as in the app (QuickBooks left out: not connected). Pay apps leave the
   early-access form; takeoff stays. The URL comes from `cta.mjs`, one constant for both.
3. **App banner:** reads `/api/health`'s new `checkout` flag (a billing provider is configured):
   "PayApps is open and free on one job; paid plans are not on sale yet. Check every figure before
   you send it." It drops the not-on-sale clause by itself when Paddle is turned on.
4. The customer post on pay applications says it opened, with a sign-up link.

## Why the workers.dev address

It contains the account's subdomain, which is the owner's name. It is already in the tree
(`platform/edge/wrangler.toml`) and the public Actions logs, so linking it publishes nothing new,
and waiting for a custom domain would keep the only funnel to the top bet shut. A custom domain
(`PAYAPPS_DOMAIN`, e.g. `payapps.marisstella.app`, as `grants.marisstella.app` is) is better: set it,
redeploy, and change `APP_URL` in the same PR, because `provision.mjs` turns workers.dev off when a
domain is set and every guide link would break.

## Next

- Store the `from` parameter at sign-up so sources can be counted (not built yet).
- Paddle key and catalog sync (owner-held secret), then `PAID_PLANS_ON = true` in `cta.mjs`.
- R2 edit on the Cloudflare token for attachments.
