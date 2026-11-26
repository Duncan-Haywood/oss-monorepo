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

Pages: `/` · `/platforms` + one per platform · `/schedule-c-worksheet` · `/pricing` · `/faq` ·
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

- Early access: nothing is sold; prices are "proposed"; no payment details asked.
- No testimonials, ratings, user counts or savings claims. The one worked example is labelled invented.
- Not tax advice (said on every page). 1099-K only as fact: federal threshold over $20,000 and more
  than 200 transactions, some states lower; never as a scare.
- No platform fee percentages: they change and differ by category. The product reads the fees each
  seller was actually charged.

## Hosting and launch checklist (not deployed)

Intended URL `https://marisstella.app/seller-books` (provisional, like grants at `/grants`). Before launch:

- [ ] Confirm the product name; update `SITE_NAME`.
- [ ] Route `marisstella.app/seller-books*` to this Worker, and add its disallow + sitemap lines to the
      host root `robots.txt` (built by the portfolio site in oss-monorepo; see apps/grants/docs/SEO.md).
- [ ] `wrangler secret put TOKEN_SECRET`; set `APP_ENV=production` (fails closed without the secret).
- [ ] Onboard the sender domain for Cloudflare Email Service and set a real `EMAIL_FROM`.
- [ ] `wrangler d1 migrations apply seller-books-site --remote`.
- [ ] Reconcile docs/PRICING.md competitor figures with bets.md and the vendors' own pages.
- [ ] CI: no workflow yet; add one running build + tests (and a deploy job) when it goes live.

## Provenance

Moved on 2026-11-26 from `Duncan-Haywood/private-monorepo` `apps/seller-books-site` at commit
`b1b7c3f63ce289c4051d8506eb0744856350f80e` (a copy of the tree, not its git history), when the paid apps moved
to this public repository. Licence: the root `LICENSE` (FSL-1.1-MIT) unless this
directory's own LICENSE says otherwise; third-party files keep their notices. Index:
[`apps/README.md`](../../apps/README.md).
