---
kind: note
date: 2026-11-27
---
# PayApps marketing site: one launch switch, and the name settled (2026-11-27)

For the session that opens PayApps (bet #1) to the public.

## What changed

- `ventures/payapps/apps/payapps-site` is now **PayApps** everywhere (it said "PayPencil, a working
  name" while the app, its page title and the 30 free pay-app-guides pages all say PayApps).
- `src/site/launch.ts` is the site's equivalent of `ventures/pay-app-guides/cta.mjs`. `APP_URL` and
  `PAID_PLANS_ON` in `src/shared/site.ts` (or `APP_URL=… PAID_PLANS_ON=1 pnpm build`) move every
  page, the header button, the footer, both FAQs, `llms.txt` and the feed between three states:
  pre-launch (early access), open with paid plans dark ("free on one job, no card; paid plans not on
  sale yet"), and open with checkout on. `test/unit/launch.test.ts` builds all three.
- Sign-up links are `<APP_URL>/?signup&from=payapps-site/<page>` (header, home, home-faq, features,
  pricing, early-access), so a later sign-up source report can tell the site from the guides.
- `normaliseAppUrl` refuses a `workers.dev` origin: its subdomain is the Cloudflare account's, a
  person's name (the reason PR #19642 moves the deploy to `payapps.marisstella.app`).
- Two stale lines fixed on the way: Trimble Pay was listed as "not built yet" on the features page and
  in `llms.txt`; its SOV template is built (PR #19633).

## Still to do on launch day

1. Done (adopted by a later session, same day): the app answers on `https://payapps.marisstella.app`
   (PR #19642), `cta.mjs` already linked it, and `APP_URL` in `src/shared/site.ts` is now set to the
   same origin with `CONTENT_UPDATED` 2026-11-27, so every built page says "open now, free on one job".
   The proxy in cloud sessions refuses `payapps.marisstella.app`, so the live answer was not re-read
   from here; the ROADMAP records the health check from the deploy run.
2. Still to do: set `PAID_PLANS_ON` here and in `cta.mjs` the day Paddle checkout is live.
3. The site itself is **not served yet**: `https://marisstella.app/payapps/` answered 404 on
   2026-11-27. It needs either a `priv-payapps-site-deploy.yml` (Worker + D1 for the early-access
   list; a control-plane PR) or, once open, its static pages published under the catalogue (the
   early-access form is the only part that needs the Worker, and after launch the sign-up replaces it).

Checks run: `pnpm test:unit` 26 pass, `pnpm test:worker` 10 pass, `pnpm typecheck`, `biome check`
clean; a 375 px render of the open-state home page has no horizontal scroll.
