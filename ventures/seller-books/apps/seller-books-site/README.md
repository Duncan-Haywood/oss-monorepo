# Seller Books: marketing site + early-access list

> **Provisional product name.** "Seller Books" is a working name (it matches the sibling app
> `apps/seller-books`). It has not been checked for trademark or domain conflicts. Change it in one
> place, `SITE_NAME` in `src/content.mjs`, plus the favicon title and `wrangler.jsonc` `EMAIL_FROM`.

Marketing site for bet #5 (reseller profit and Schedule C books; oss-monorepo
`portfolio/monetization/bets.md`): true profit across eBay, Poshmark, Mercari, Whatnot, Depop and
Etsy — fees, cost of goods, mileage, a Schedule C worksheet. The product is built separately in
`apps/seller-books`; this app only explains it and runs the early-access list.

## What's here

| Path | What |
| --- | --- |
| `src/content.mjs` | Every word that matters: name, summary, platforms, features, Schedule C lines, tiers, FAQ |
| `src/pages.mjs`, `src/html.mjs` | Page bodies and the shared HTML shell (title, description, canonical, OG/Twitter, JSON-LD) |
| `build.mjs` | Prerenders `dist/`: pages, `sitemap.xml`, `robots.txt` (AI crawlers named), `llms.txt`, `llms-full.txt`, `_headers` |
| `src/worker.mjs` | Cloudflare Worker: static assets + `/seller-books/api/early-access/*` |
| `src/early-access.mjs`, `migrations/` | Double opt-in list on D1 (docs/EARLY_ACCESS.md) |
| `docs/PRICING.md` | Proposed tiers and the reasoning |

Pages: `/` · `/platforms` + one per platform · `/schedule-c-worksheet` · `/1099-k` · `/cost-of-goods-sold` · `/mileage-deduction` · `/home-office-and-equipment` · `/reseller-tax-deductions` · `/quarterly-estimated-tax` · `/pricing` · `/faq` ·
`/early-access` · `/privacy` (all under `/seller-books`).

Conventions follow apps/grants' marketing site (`apps/grants/docs/SEO.md`, `EMAIL_MARKETING.md`):
per-page meta + JSON-LD (WebPage, BreadcrumbList, FAQPage, SoftwareApplication without offers or
ratings), llms.txt in llmstxt.org format, the same AI crawler list, a strict CSP, double opt-in with
hashed tokens and a salted IP hash. Unlike grants it ships no JavaScript at all (CSP `script-src 'none'`)
and has no dependencies: plain ESM, `node --test`, Wrangler only to run/deploy.

## Commands (from this directory)

```bash
node build.mjs                          # → dist/
node --test "test/*.test.mjs"           # build/SEO/honesty checks + early-access integration tests
pnpm -w exec biome check apps/seller-books-site
```

Local run (Wrangler from apps/grants' install; no new dependency):

```bash
W=../grants/node_modules/.bin/wrangler
node build.mjs && $W d1 migrations apply seller-books-site --local
$W dev --var SITE_URL:http://localhost:8787/seller-books   # http://localhost:8787/seller-books/
```

Without a `TOKEN_SECRET` and outside production a development secret is used; local `send_email`
writes the message to `.wrangler/tmp/email/`.

## Copy rules (tests enforce most of them: `test/site.test.mjs`)

- One switch, `APP_URL` (with `PAID_PLANS_ON`) in `src/launch.mjs` or the build's env, sets the status
  everywhere: header, footer, every page's closing call to action, the FAQ's availability and price
  answers, the pricing page and `llms.txt`. Before launch (`null`) the site is **early access**: the
  list form, "proposed" prices, nothing sold. Since 2026-11-27 it is set to
  `https://seller-books.marisstella.app` (the app is live there; `../../DEPLOY.md`): every page says
  **open now, free for one platform and up to 25 orders a month**, buttons go to
  `<APP_URL>/signup?from=seller-books-site/<page>`, `/early-access` stays (noindex) for old links, and
  paid plans read "not on sale yet" until `PAID_PLANS_ON`. `normaliseAppUrl` refuses a `workers.dev`
  address (its subdomain names the Cloudflare account), plain http or a path, so a wrong value fails the
  build. `test/launch.test.mjs` builds all three states.
- The pricing page's plans are the app's own: `test/launch.test.mjs` reads
  `apps/seller-books/src/shared/plans.ts` and fails if a price, annual price, order allowance, platform
  limit or feature line differs. Change the app first, then `src/content.mjs`.
- No testimonials, ratings, user counts or savings claims. The one worked example is labelled invented.
- Not tax advice (said on every page). 1099-K only as fact: federal threshold over $20,000 and more
  than 200 transactions, some states lower; never as a scare.
- No platform fee percentages: they change and differ by category. The product reads the fees each
  seller was actually charged.

## Owner console API

`GET /seller-books/api/admin/metrics?days=30` (total, confirmed, unsubscribed, by day, by source page) and
`GET /seller-books/api/admin/accounts?limit=50` (newest sign-ups: email, source page, confirmed, date) serve
the owner console (`apps/admin`) in the `packages/admin-metrics` contract (`src/admin.mjs`, which imports
that package's TypeScript source; Node ≥ 22.18 and wrangler both load it). They answer only
`Authorization: Bearer <ADMIN_SERVICE_TOKEN>`, a Worker secret of at least 32 characters, never committed;
unset, they are closed. Every read writes a row to `admin_audit_log` (`migrations/0002_admin_audit_log.sql`).
Unsubscribed rows stay as suppression records, so they count in `total` and `unsubscribed`. `ADMIN_METRICS_TOKEN` (same rules) is the agents' read-only credential: `/metrics` only; `/accounts` answers 403.

## Hosting and launch checklist (not deployed)

The copy is launched (above); the site itself is not served yet (`https://marisstella.app/seller-books/`
answers 404). Serving it as a static export copied by the catalogue build is the next step, following
whichever of PayApps' two open approaches lands (PRs #19733 and #19736), so the two sites are served the
same way. The early-access list API needs the Worker; a static copy needs only the open copy.


Intended URL `https://marisstella.app/seller-books` (provisional, like grants at `/grants`). Before launch:

- [ ] Confirm the product name; update `SITE_NAME`.
- [ ] Route `marisstella.app/seller-books*` to this Worker, and add its disallow + sitemap lines to the
      host root `robots.txt` (built by the portfolio site in oss-monorepo; see apps/grants/docs/SEO.md).
- [ ] `wrangler secret put TOKEN_SECRET`; set `APP_ENV=production` (fails closed without the secret).
- [ ] Optional: `ADMIN_SERVICE_TOKEN`, `ADMIN_METRICS_TOKEN` for the owner console (set by the `set-admins` workflow; below).
- [ ] Onboard the sender domain for Cloudflare Email Service and set a real `EMAIL_FROM`.
- [ ] `wrangler d1 migrations apply seller-books-site --remote`.
- [ ] Reconcile docs/PRICING.md competitor figures with bets.md and the vendors' own pages.
- [ ] CI: no workflow yet; add one running build + tests (and a deploy job) when it goes live.
