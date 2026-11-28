# jobshop-site: marketing site for the job-shop RFQ-to-quote product

The public site for bet #2 in `portfolio/monetization/bets.md` (oss-monorepo): AI RFQ-to-quote for CNC
and fabrication job shops. The product itself is built in the sibling app `apps/jobshop-quote`; this
app is only the marketing pages and the early-access form.

> **Name.** The site uses the app's own name, "Job Shop Quote" (`SITE_NAME` in `src/site/config.ts`),
> so the pages and the sign-up a visitor lands in agree. It is descriptive and not cleared as a
> trademark. ("RFQ Desk" was the placeholder before 2026-11-27.)

> **Served at `https://marisstella.app/jobshop/`** by the catalogue build, from the committed static copy
> in `catalogue-export/` (`pnpm export:catalogue`; `platform/pages/jobshop-site.mjs` copies it in; a unit
> test fails when the copy drifts). The sibling CMMC product is linked at `https://marisstella.app/cmmc`
> (`CMMC_SITE_URL`, apps/cmmc-site) and labelled "coming" everywhere.

## The launch switch

`LAUNCH` in `src/site/config.ts` says what the hosted app does today, and the copy follows it:

| Field | Now | What it changes |
| --- | --- | --- |
| `appUrl` | `https://jobshop-quote.marisstella.app` | Sign in / Start free links, the privacy and terms links |
| `open` | `true` | Early-access pages, form and thank-you page gone; "Start free" everywhere; site privacy notice says the site stores nothing |
| `aiReading` | `false` | Every description of AI reading says it is not switched on yet (owner sets `JOBSHOP_ANTHROPIC_API_KEY`) |
| `inboundEmail` | `false` | The "forward the RFQ" step says to upload instead |
| `paidPlans` | `false` | Paid plans read "Coming" / "Not on sale yet." |

Flip a field when the app changes, then `pnpm export:catalogue` and commit `catalogue-export/`. With
`open: false` the site is the pre-launch early-access site below (the Worker in `src/worker/`).

## Pages

| Path | What |
| --- | --- |
| `/` | The estimator's RFQ backlog; quote from email or drawing using your own rates |
| `/how-it-works` | Rate table → RFQ in → read and self-check → priced by your rules → estimator sends |
| `/pricing` | Free Early access plan + paid plans from $199/mo (not on sale yet), cost-plus (see `docs/PRICING.md`) |
| `/for-cmmc-shops` | No CUI / ITAR / EAR drawings during early access; CMMC workspace "coming" |
| `/compare` | Machine shop quoting software compared: spreadsheet, Paperless Parts, QuotedPart, JobBOSS², ProShop, with each price's source and read date (`ALTERNATIVES` in `src/site/pages.ts`; re-check a price before changing it), and what this app does not do |
| `/machine-shop-hourly-rate` | Guide: work out a machine shop hourly rate from your own costs, worked example computed in `src/site/shop-rate.ts` (numbers made up, labelled so) |
| `/machine-shop-markup` | Guide: markup against margin (exact conversion table), separate markups for labor, material and outside services, lot and line minimums, and the CNC guide's made-up bracket priced under four markup policies (split card, rate at cost with a 25% labor markup, pass-through, one flat markup), with the margin over the shop's full cost. `src/site/markup-example.ts`; every policy is priced to the cent by the app's costing engine in `apps/jobshop-quote/test/unit/site-markup-example.test.ts` |
| `/how-to-quote-sheet-metal` | Guide: quote a laser-cut, bent part from its DXF flat pattern (cut length and pierces at the shop's speed, bends, sheets from the nest, outside finish, quantity breaks). The made-up bracket in `src/site/sheet-metal-example.ts` is checked to the cent against the app's DXF suggestions, nester and costing engine by `apps/jobshop-quote/test/unit/site-sheet-metal-example.test.ts` |
| `/how-to-quote-welding` | Guide: quote a weldment (cut list, weld length at the travel speed, the operator factor, fit-up and the fixture, wire and gas from the fillet size, outside finish, quantity breaks). The app does not compute weld times; the made-up cart frame in `src/site/welding-example.ts` is priced to the cent by the app's costing engine in `apps/jobshop-quote/test/unit/site-welding-example.test.ts` |
| `/how-to-quote-cnc-turning` | Guide: quote a turned part (rpm from surface speed, minutes per pass from the feed per revolution, roughing passes from the radial stock and depth of cut, the time between cuts, parts per bar after the cut allowance and remnant, whole bars against the length used, setup, secondary ops, an outside passivation, fallout and quantity breaks). The app does not compute lathe times; the made-up stainless pin in `src/site/turning-example.ts` is priced to the cent by the app's costing engine, both with whole bars and by the length used, in `apps/jobshop-quote/test/unit/site-turning-example.test.ts` |
| `/how-to-quote-outside-processing` | Guide: quote heat treat, anodize, plating and black oxide sent to a vendor (the price in the vendor's unit, a per-lb price as finished weight × $/lb, the larger of per-part × parts started and the lot minimum, where each minimum stops binding, freight and certificates, the outside-service markup, quantity breaks), next to the "naive" quote that multiplies per-part prices by the quantity. The made-up steel block in `src/site/outside-processing-example.ts` is priced to the cent by the app's costing engine, both ways, in `apps/jobshop-quote/test/unit/site-outside-processing-example.test.ts` |
| `/how-to-estimate-cnc-machining-time` | Guide: build a cycle time up from rpm and feed (surface speed, chip load), the removal rate (width × depth × feed, kept at a measured path share), roughing from volume removed, drilling with peck retracts, tapping, and the typed finishing, tool-change and load times. The made-up manifold block in `src/site/cycle-time-example.ts` is checked against the app's own roughing, drilling and tapping suggestions in `apps/jobshop-quote/test/unit/site-cycle-time-example.test.ts` |
| `/machining-material-cost` | Guide: size the blank from the part's envelope, weigh it (density, g/cm³ to lb/in³), and price it the four ways a shop buys stock: plate by the pound or hundredweight, bar by the foot used, whole bars, a precut piece; then starts at the fallout, the supplier minimum and the material markup. The made-up 6061 bracket in `src/site/material-cost-example.ts` is priced through the real engine to the cent in `apps/jobshop-quote/test/unit/site-material-cost-example.test.ts` |
| `/machine-shop-quote-template` | Guide: what goes on a quote and why, what stays off it (cost basis), nine terms as decisions (not wording), a filled-in example at the CNC guide's engine-checked prices and `machine-shop-quote-template.csv` to download (plain values, no formula cells), all from `src/site/quote-template.ts` |
| `/rfq-review-checklist` | Guide: 21 checks on an RFQ before it is priced (documents and revisions, the part, quantity and timing, quality paperwork, terms and restrictions), each with the question and why it matters; names ISO 9001 / AS9100 clause 8.2.3 without claiming the list meets it; says for 11 checks what the hosted app does today; `rfq-review-checklist.csv` to download (plain values). All from `src/site/rfq-checklist.ts`, tested in `test/unit/rfq-checklist.test.ts` |
| `/how-to-price-a-rush-job` | Guide: cost a rush line by line (the operations on overtime at a second rate for the same machine, the bumped job torn down and set up again, same-day material as a per-order extra, the vendor's expedited finish with its own lot minimum) and set it against a flat surcharge. The CNC guide's made-up bracket, normal and rush, in `src/site/rush-example.ts`, priced to the cent by the app's costing engine in `apps/jobshop-quote/test/unit/site-rush-example.test.ts`; the app has no rush switch and the page says so |
| `/cnc-quoting-software`, `/sheet-metal-quoting-software`, `/step-file-quoting`, `/repeat-part-quoting`, `/material-price-tracking`, `/online-quote-acceptance`, `/quote-follow-up-software`, `/quote-win-rate-tracking`, `/job-traveler-software`, `/quickbooks-invoices-from-quotes`, `/machine-shop-lead-time` | A landing page per built module, aimed at the search a buyer makes for that job: what it does in the hosted app today, what it does not do yet, the guides on the topic, three FAQs (FAQPage JSON-LD), links to the other modules. Data in `src/site/module-data.ts` (every bullet from the app's ROADMAP "Done" list; `test/unit/modules.test.ts` checks each module against it), rendered by `src/site/modules.ts`, listed on `/how-it-works`. Parts built but switched off in the hosted app (AI reading, inbound email, the live QuickBooks connection) get no page until they are on; the QuickBooks import file needs no connection and has one |
| `/faq` | FAQ (FAQPage JSON-LD built from the same list) |
| `/early-access` | Closed site only: the form (posts to `/api/early-access`, stored in D1) |
| `/early-access/thanks` | Closed site only: after a successful post (noindex, not in the sitemap) |
| `/privacy` | Open: the site stores nothing, links the app's policy. Closed: privacy notice for the form |

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
  `SoftwareApplication` (open: only the free plan as an offer, pointing at sign-up; closed:
  `creativeWorkStatus: "In development"`; never ratings); pricing adds a `Product` with only the free
  offer (paid prices aren't on sale, so they aren't marked up as offers); FAQ adds `FAQPage`.
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

- Every page states what is open in the status strip (`statusLine`): open, the free plan, paid plans
  not on sale yet. Say only what the hosted app does today; anything built but switched off
  (`LAUNCH`) is called "not switched on yet" wherever it is described. Before launch: "in
  development", prices "proposed".
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
