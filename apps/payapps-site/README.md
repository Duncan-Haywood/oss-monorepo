# payapps-site: marketing site for the pay-app product

The public site for the subcontractor pay-application product (the app itself is `apps/payapps`, built
separately). Pages: home, features, pricing, early access, privacy. It also serves `llms.txt`,
`llms-full.txt`, `sitemap.xml`, `robots.txt`, an Atom `feed.xml` and JSON-LD on every page.

> **Product name: "PayPencil" is a working name.** It nods to the "pencil draft" subs send a GC before
> the final pay app. No trademark or domain search has been done. To rename, change `PRODUCT_NAME` in
> `src/shared/site.ts`, plus the text in `public/og.svg` and `docs/PRICING.md`.

## Honesty rules (the copy)

- The product is **in development**. The site says "early access", collects interest and sells nothing.
- No testimonials, customer counts, logos, ratings or outcome claims. JSON-LD has no `offers` or
  `aggregateRating`. `test/unit/site.test.ts` checks for the obvious cases.
- A feature is marked **built · in testing** only once it is in the app (`apps/payapps/ROADMAP.md`, "Done");
  everything else is **next**.
- Prices are the app's own plans (`apps/payapps/src/shared/plans.ts`); `test/unit/plans-sync.test.ts`
  fails when the pricing page drifts from them.
- No competitor comparisons until they come with sourced, dated facts (see `docs/PRICING.md`, "Market check").
- Wherever pay-app forms, waivers or retainage come up: "not affiliated with the AIA, does not produce
  AIA Contract Documents, not legal advice" (`NOT_AIA_NOTE`).

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
src/worker/             early-access API (app.ts), D1 logic (signups.ts), email, tokens, cron purge
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
5. A daily cron deletes sign-ups never confirmed within 30 days. No IP address is stored.

The site sends only this confirmation email. A later "early access is open" announcement is marketing
mail. Cloudflare Email Service refuses marketing mail, so send it through the provider grants uses for
marketing, with an unsubscribe header.

## Commands (run from `apps/payapps-site`)

- `pnpm build` writes `dist/`. `SITE_URL` sets origin + base path (default `https://marisstella.app/payapps`).
- `pnpm typecheck` · `pnpm test:unit` · `pnpm test:worker`
- Local: `pnpm db:migrate:local`, then `SITE_URL=http://localhost:8787 pnpm build && pnpm exec wrangler dev`.
  With `EMAIL_MODE=log` (the default in `wrangler.jsonc`) the confirmation email, links included, is
  printed to the console.

## Deploying (not automated yet)

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

## Provenance

Moved on 2026-11-26 from `Duncan-Haywood/private-monorepo` `apps/payapps-site` at commit
`cded6eaf5d8aefcb42e61ed1cad3ec0b81826072` (a copy of the tree, not its git history), when the paid apps moved
to this public repository. Licence: the root `LICENSE` (FSL-1.1-MIT) unless this
directory's own LICENSE says otherwise; third-party files keep their notices. Index:
[`apps/README.md`](../../apps/README.md).
