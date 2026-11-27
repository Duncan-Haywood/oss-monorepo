# jobshop-site: marketing site for the job-shop RFQ-to-quote product

The public site for bet #2 in `portfolio/monetization/bets.md` (oss-monorepo): AI RFQ-to-quote for CNC
and fabrication job shops. The product itself is built in the sibling app `apps/jobshop-quote`; this
app is only the marketing pages and the early-access form.

> **The product name "RFQ Desk" is provisional.** It is a descriptive placeholder, not cleared as a
> trademark and not checked for domain or name conflicts. Change `SITE_NAME` in `src/site/config.ts`
> (and the text in `public/favicon.svg` and `public/og.png`) when a name is chosen.

> **The production URL is provisional too:** `https://marisstella.app/jobshop` (`DEFAULT_SITE_URL`), and
> the sibling CMMC product is linked at `https://marisstella.app/cmmc` (`CMMC_SITE_URL`, apps/cmmc-site)
> and labelled "coming" everywhere. Update both when hosting is decided.

## Pages

| Path | What |
| --- | --- |
| `/` | The estimator's RFQ backlog; quote from email or drawing using your own rates |
| `/how-it-works` | Rate table → RFQ in → read and self-check → priced by your rules → estimator sends |
| `/pricing` | Free early access + proposed plans from $199/mo, cost-plus (see `docs/PRICING.md`) |
| `/for-cmmc-shops` | No CUI / ITAR / EAR drawings during early access; CMMC workspace "coming" |
| `/faq` | FAQ (FAQPage JSON-LD built from the same list) |
| `/early-access` | The form (posts to `/api/early-access`, stored in D1) |
| `/early-access/thanks` | After a successful post (noindex, not in the sitemap) |
| `/privacy` | Privacy notice for the form |

## How it's built

Same conventions as apps/grants' marketing site (`apps/grants/docs/SEO.md`), without React: the site
is plain HTML generated at build time, ships no JavaScript and works as a plain form post.

- `src/site/routes.ts` is the one list of public pages (title, description, sitemap data, JSON-LD
  kinds), like grants' `PUBLIC_ROUTES`.
- `src/site/pages.ts` renders each page body with an escaping `html` template tag (`src/site/html.ts`);
  `src/site/layout.ts` adds the head tags (canonical, OG/Twitter, JSON-LD), header and footer.
- `src/site/build.ts` builds everything as a map of files: page HTML, `sitemap.xml`, `robots.txt`
  (same named AI crawlers as grants, all allowed on pages, disallowed on `/api`), `llms.txt`
  ([llmstxt.org](https://llmstxt.org)) and `llms-full.txt`. `scripts/build.ts` writes it to `dist/`
  with `public/` (styles, favicon, og.png, `_headers`).
- JSON-LD: `WebPage` everywhere, `BreadcrumbList` below home; home adds `Organization`, `WebSite` and
  `SoftwareApplication` (`creativeWorkStatus: "In development"`, no offers, no ratings); pricing adds a
  `Product` with only the free early-access offer (proposed prices aren't for sale, so they aren't
  marked up as offers); FAQ adds `FAQPage`.
- Styling: `public/styles.css`, grants' "Juniper & Sandstone" palette (`apps/grants/docs/DESIGN.md`),
  system fonts, no inline styles; CSP `script-src 'none'`.
- `src/worker/` is the Worker: static assets for everything, except `/api/*` (`run_worker_first`).

## Early-access form

`POST /api/early-access` (`src/worker/early-access.ts`, contract in `src/shared/early-access.ts`):

- Same-origin only (Origin, or `Sec-Fetch-Site: same-origin`); form-encoded or multipart; 16 KB cap.
- Rate limit: 5 posts per IP per minute (`EARLY_ACCESS_LIMITER`, Workers Rate Limiting).
- Honeypot field `website`: filled → nothing stored, normal response.
- Valid → upsert into D1 `early_access_requests` (one row per address, `submit_count` bumped) and
  303 to the thank-you page. The response is identical for new and repeat addresses.
- Invalid → 400 with the form re-rendered, errors inline and the visitor's values refilled (escaped).
- Stored: the form fields, `consent_text_version` (`CONSENT_VERSION`), the source path and, if the
  `IP_HASH_SALT` secret is set, a salted SHA-256 of the IP. Raw IPs are never stored.

**Not tenant data:** these are prospects, with no org. They aren't covered by tenant export/deletion;
deletion is by request to hello@marisstella.app (the privacy page says so):

```bash
pnpm exec wrangler d1 execute DB --remote --command \
  "SELECT created_at, email, name, shop, role, processes, rfqs_per_week, quoting_today, notes, status FROM early_access_requests ORDER BY created_at DESC"
pnpm exec wrangler d1 execute DB --remote --command "DELETE FROM early_access_requests WHERE email = 'someone@example.com'"
```

### Email (why there is no double opt-in yet)

No email service is configured for this app, and none is added unconfigured. So nothing is sent: the
site says "we'll be in touch by email", and replies are sent by hand from hello@marisstella.app. The
consent wording is narrow (early access only), which is what makes a hand reply fine. Before any
automated email, add grants' double opt-in (pending → confirmed with a hashed, single-use token,
confirm on POST not GET, resend limits; `apps/grants/docs/EMAIL_MARKETING.md`) on Cloudflare Email
Service like grants' transactional mail.

## Copy rules

- It's in development: every page says so (status strip), nothing is for sale, prices are "proposed".
- No testimonials, customer counts, logos, ratings, results or time-saved figures. There are none.
  `test/unit/site.test.ts` fails on the usual phrases.
- Never claim certification, CMMC/ITAR/FedRAMP compliance, or that controlled drawings may be sent.
- Describe the product as it is designed (see `apps/jobshop-quote`); say "planned" for anything not
  built (e.g. STEP files, ERP connections). Keep `/how-it-works` in step with that app.
- The illustration on the home page is labelled sample data.

## Commands

```bash
pnpm build                      # dist/ (BASE_PATH=/jobshop for production links; SITE_URL overrides the URL)
pnpm typecheck
pnpm test:unit                  # form contract, plan markup band, every page's SEO and copy rules
pnpm test:worker                # the form route against local D1 in workerd
pnpm db:migrate:local && pnpm dev   # wrangler dev at http://localhost:8787
pnpm exec biome check --write <files>   # from the repo root config
```

## Owner console API

`GET {base}/api/admin/metrics?days=30` (total, by day, by source page) and
`GET {base}/api/admin/accounts?limit=50` (newest requests: email, name, source page, date) serve the owner
console (`apps/admin`) in the `packages/admin-metrics` contract (`src/worker/admin.ts`); `{base}` is
`BASE_PATH` (e.g. `/jobshop`). They answer only `Authorization: Bearer <ADMIN_SERVICE_TOKEN>`, a Worker
secret of at least 32 characters, never committed; unset, they are closed. Every read writes a row to
`admin_audit_log` (`migrations/0002_admin_audit_log.sql`). The list is single opt-in, so `confirmed` and
the per-day `verified` counts are null, and there is no unsubscribed count (deletion is by email request). `ADMIN_METRICS_TOKEN` (same rules) is the agents' read-only credential: `/metrics` only; `/accounts` answers 403.

## Deploying (not set up yet)

There is no deploy workflow for this app yet. To deploy under marisstella.app/jobshop:
1. `BASE_PATH=/jobshop pnpm build` (files land in `dist/jobshop/`, so assets are served at
   `/jobshop/...`; `run_worker_first` already covers `/jobshop/api/*`), deploy with
   `--var BASE_PATH:/jobshop` and the route `marisstella.app/jobshop*`. Checked locally with `wrangler dev --var BASE_PATH:/jobshop`.
2. `wrangler d1 create jobshop-site`, `pnpm db:migrate:remote`, `wrangler secret put IP_HASH_SALT`.
   Optional: `ADMIN_SERVICE_TOKEN`, `ADMIN_METRICS_TOKEN` (set by the `set-admins` workflow; see "Owner console API").
3. Add the app's lines to the host's root `robots.txt` (the portfolio site's `HOSTED_APPS`), since
   crawlers only read the root file; `dist/robots.txt` is the reference.
