# payapps-site: marketing site for the pay-app product

The public site for the subcontractor pay-application product (the app itself is `apps/payapps`, built
separately). Pages: home, features, pricing, early access, privacy, and the Terms of Service, Refund Policy and Acceptable Use Policy (rendered from `apps/payapps/docs/legal/*.md`; `pnpm sync:legal` after the app's documents change, and a unit test fails until you do). It also serves `llms.txt`,
`llms-full.txt`, `sitemap.xml`, `robots.txt`, an Atom `feed.xml` and JSON-LD on every page.

> **Product name: PayApps**, the app's own name (`apps/payapps/index.html`) and the one the free
> pay-app-guides already use. It was "PayPencil" until 2026-11-27. No trademark or domain search has
> been done. To rename, change `PRODUCT_NAME` in `src/shared/site.ts`, plus the text in `public/og.svg`.

## Honesty rules (the copy)

- One switch, `APP_URL` (with `PAID_PLANS_ON`) in `src/shared/site.ts` or the build's env, sets the
  status everywhere (`src/site/launch.ts`). Before launch (`null`) the site says **in development**,
  collects early-access interest and sells nothing. Once set, every page says **open now, free on one
  job**, its buttons go to `<APP_URL>/?signup&from=payapps-site/<page>` (the app opens on "Create an
  account"), and paid plans are "not on sale yet" until `PAID_PLANS_ON`. `test/unit/launch.test.ts`
  checks all three states.
- No testimonials, customer counts, logos, ratings or outcome claims. The JSON-LD carries no offers
  and no review or rating markup; `test/unit/site.test.ts` checks for the obvious cases.
- A feature is marked **built · in testing** only once it is in the app (`apps/payapps/ROADMAP.md`, "Done");
  everything else is **next**.
- Prices are the app's own plans (`apps/payapps/src/shared/plans.ts`); `test/unit/plans-sync.test.ts`
  fails when the pricing page drifts from them.
- No competitor comparisons until they come with sourced, dated facts (see `docs/PRICING.md`, "Market check").
- Wherever pay-app forms, waivers or retainage come up: "not affiliated with the AIA, does not produce
  AIA Contract Documents, not legal advice" (`NOT_AIA_NOTE`).

## Launching

Set `APP_URL` on the same day as `APP_URL` in `ventures/pay-app-guides/cta.mjs`, to the app's public
origin. `normaliseAppUrl` refuses a `workers.dev` address (its subdomain is the Cloudflare account's,
a person's name), a path, or plain http, so a wrong value fails the build instead of shipping. Bump
`CONTENT_UPDATED` the same day: the feed's "open on the Free plan" entry takes that date.

```
APP_URL=https://payapps.marisstella.app pnpm build     # one-off, without changing the constant
```

## Stack (same family as apps/grants)

| Concern | Choice |
| --- | --- |
| Hosting | One Cloudflare Worker: static assets from `dist/` + a small Hono API at `/api/*` |
| Pages | Rendered at build time from TypeScript (`src/site/*`, `scripts/build.ts`). No client JS, no cookies, no analytics |
| SEO / AEO | Same set as grants (`apps/grants/docs/SEO.md`): canonical/OG tags, JSON-LD (`WebPage`, `WebSite`, `SoftwareApplication`, `FAQPage`, `BreadcrumbList`), sitemap, robots with named AI crawlers, llms.txt, llms-full.txt, Atom feed |
| Sign-ups | D1 table `early_access_signups` (`migrations/`), double opt-in like grants' newsletter |
| Email | Cloudflare Email Service `send_email` binding (transactional only), as in grants |

Grants builds its marketing pages by prerendering its React SPA. This site has no app around it, so it
renders plain HTML strings with the same metadata, SEO files and honesty checks, and needs no React or
Vite.

### Layout

```
src/shared/site.ts      name, URL, page list (titles, descriptions, indexable)
src/shared/plans.ts     the app's plans, mirrored + cost model (docs/PRICING.md)
src/site/html.ts        escaping, page shell (head/header/footer)
src/site/pages.ts       every page's <main>, FAQ data, JSON-LD
src/site/seo.ts         sitemap, robots, llms.txt, llms-full.txt, feed
src/site/build.ts       all files in memory (tested); scripts/build.ts writes them to dist/
src/site/styles.css     hand-written CSS with tokens and checked contrast
src/worker/             early-access API (app.ts), D1 logic (signups.ts), email, tokens, daily purge (purge-clock.ts)
```

## Early access: double opt-in

1. `POST /api/early-access` (form post or JSON). Validation, honeypot, origin check and a per-IP rate limit
   (`EARLY_ACCESS_LIMITER`). The answer is always the same, whatever the address's state. Form posts get a
   303 to `/early-access/check-your-email`.
2. A confirmation email with a confirm link (7 days) and a remove link. Tokens are stored only as SHA-256.
   Resends are limited to one per 10 minutes and five per day per address. A confirmed address is never
   emailed again by sign-up, and its answers are never overwritten.
3. `GET /api/early-access/confirm?token=` shows a button. Only the `POST` confirms, so link scanners
   can't.
4. `GET|POST /api/early-access/remove?token=` deletes the row.
5. A daily Durable Object alarm (`src/worker/purge-clock.ts`, not a cron trigger: the account has 5) deletes sign-ups never confirmed within 30 days. No IP address is stored.

The site sends only this confirmation email. A later "early access is open" announcement is marketing
mail. Cloudflare Email Service refuses marketing mail, so send it through the provider grants uses for
marketing, with an unsubscribe header.

## Commands (run from `apps/payapps-site`)

- `pnpm build` writes `dist/`. `SITE_URL` sets origin + base path (default `https://marisstella.app/payapps`).
- `pnpm typecheck` · `pnpm test:unit` · `pnpm test:worker`
- Local: `pnpm db:migrate:local`, then `SITE_URL=http://localhost:8787 pnpm build && pnpm exec wrangler dev`.
  With `EMAIL_MODE=log` (the default in `wrangler.jsonc`) the confirmation email, links included, is
  printed to the console.

## Served now: the catalogue copy (2026-11-27)

https://marisstella.app/payapps/ serves `catalogue-export/`, a committed static copy of the open site
built with `earlyAccess: false`: home, features, pricing, privacy, terms, refunds, acceptable use, sitemap, llms.txt, llms-full.txt and
the feed, with no early-access pages, forms or scripts (the app is open, and nothing runs behind the
copy, so its privacy notice says the site stores nothing and points at the app's Privacy Policy).
`platform/pages/payapps-site.mjs` copies it into the catalogue build on every merge, without the
catalogue's free-tool chrome, and the root `sitemap.xml` index lists `payapps/sitemap.xml`.

**After any change to the pages, the plans or the launch switch, run `pnpm export:catalogue` and
commit `catalogue-export/`.** `test/unit/catalogue-export.test.ts` fails until you do. The catalogue
build is plain Node with no pnpm install, which is why the copy is committed rather than built there.

## Deploying the Worker (not automated; only if the early-access list is wanted again)

1. Choose the URL. The default assumes `marisstella.app/payapps`, like grants at `/grants`. Pages are
   built into `dist/payapps/`, and `run_worker_first` already lists `/payapps/api/*`. Add a route for
   `marisstella.app/payapps*` to the Worker.
2. Only the host root's `robots.txt` is read by crawlers. Add the `Disallow: /payapps/api/` lines and
   `Sitemap: https://marisstella.app/payapps/sitemap.xml` to the portfolio site's root robots (as grants
   does, `apps/grants/docs/SEO.md`, "Hosting note").
3. `pnpm db:migrate:remote` (D1 `payapps-site` is created on first deploy).
4. Set vars: `APP_ENV=production`, `SITE_URL`, `EMAIL_FROM` (a sender on a domain onboarded to Cloudflare
   Email Service), and `EMAIL_MODE=cloudflare`. Optional secrets: `ADMIN_SERVICE_TOKEN` and `ADMIN_METRICS_TOKEN` (below).
5. `SITE_URL=... pnpm build && pnpm exec wrangler deploy`.

Sign-ups live in this site's own D1 database, not the app's. When `apps/payapps` launches, export the
confirmed rows (`SELECT email, company, role, jobs, tool FROM early_access_signups WHERE status='confirmed'`).

## Owner console API

`GET /payapps/api/admin/metrics?days=30` (total, confirmed, by day, by source page) and
`GET /payapps/api/admin/accounts?limit=50` (newest sign-ups: email, source page, confirmed, date) serve the
owner console (`apps/admin`) in the `packages/admin-metrics` contract (`src/worker/admin.ts`). They answer
only `Authorization: Bearer <ADMIN_SERVICE_TOKEN>`: a Worker secret of at least 32 characters, set by the
`set-admins` workflow, never committed. Unset, the endpoints are closed. `ADMIN_METRICS_TOKEN` (same rules) is
the agents' read-only credential: it reads `/metrics` only; `/accounts` (emails) answers 403. Every read writes a row to
`admin_audit_log` (`migrations/0002_admin_audit_log.sql`). There is no unsubscribed count: removing a
sign-up deletes it.

## Open items

- `og.svg` is an SVG. Some social networks want PNG for `og:image`, so render a PNG before launch.
- Pricing is a proposal; see `docs/PRICING.md`.
