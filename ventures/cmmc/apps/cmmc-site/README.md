# cmmc-site: marketing site for the CMMC Level 1/2 + ISO 9001 workspace

Public site for bet #4 in oss-monorepo `portfolio/monetization/bets.md`: a workspace for small defense
and aerospace machine shops to prepare the SSP, POA&M and SPRS score in-house. The product itself is
`apps/cmmc` (built separately); its sibling for the same shops is the job-shop quoting product
(`apps/jobshop-site`, linked at `https://marisstella.app/jobshop`).

Served at `https://marisstella.app/cmmc` by the catalogue build (`platform/pages/cmmc-site.mjs`, every
merge), as static files. **Open since 2026-11-27:** the app is live at `https://cmmc.marisstella.app`, so
every page links "Start free" to its sign-up; Level 1 is free and the paid plans are "not on sale yet"
until checkout is on.

## The launch switch

`src/launch.mjs` holds `APP_URL` (the app's origin; `null` builds the early-access copy) and
`PAID_PLANS_ON`. The build takes `APP_URL` / `PAID_PLANS_ON=1` from the environment when set
(`APP_URL= node src/build.mjs` builds the early-access copy). Open: no early-access pages or form,
sign-up and sign-in links in the header and every call to action, the app's plans on the pricing page
(`src/plans.mjs`, checked against `apps/cmmc/src/shared/plans.ts` by `test/plans.test.mjs`), a privacy
notice for a site that keeps nothing, and the SPRS calculator scored in the browser (`sprs.js`, built
from `src/sprs.mjs` with the data inlined, applied by `src/sprs-page.js`). `test/site.test.mjs` runs
every check on both states. The catalogue refuses to serve the early-access copy, whose form needs this
site's own Worker.

## Layout

| Path | What |
|---|---|
| `src/site.mjs` | Site name, URLs, sibling link, `STATUS_CHECKED`, the source register (`SOURCES`), consent wording |
| `src/pages.mjs` | Page content: home, Level 1 vs 2 explainer, what it does / does not, security, pricing, early access, privacy, utility pages |
| `src/sprs.mjs` | Free SPRS score calculator at `/sprs-score-calculator`: a plain GET form. Behind the Worker it is scored server-side and written into the static page (`applyToPage`); on the static catalogue copy the same file runs in the browser (`sprs.js` + `src/sprs-page.js`). Requirements and point values are read from `apps/cmmc/src/shared/controls/official-text.json` (the official-text extract); rules match `apps/cmmc` `scoring.ts`, and `test/sprs.test.mjs` pins the same worked examples. Result URLs are `noindex`, `no-store`, and nothing is stored |
| `src/poam-rules.mjs` | `/cmmc-poam-eligible-requirements`: all 110 requirements, family by family, with points and whether an open one may sit on a Level 2 POA&M (32 CFR 170.21), from the same data and `POAM_EXCLUDED` as `sprs.mjs`; counts computed, pinned and cross-checked against the calculator's `poamEligible` in `test/poam-rules.test.mjs` |
| `src/level1-requirements.mjs` | `/cmmc-level-1-requirements`: the 15 Level 1 requirements (FAR 52.204-21) word for word, each with its NIST SP 800-171 counterpart, all 59 SP 800-171A objectives read as FCI (32 CFR 170.15(c)(1)(i)), and an example of the evidence a small shop shows (ours, labelled as such); the free Level 1 plan's front door. Mapping mirrors `apps/cmmc/src/shared/controls/level1.ts`, checked by `test/level1-requirements.test.mjs` |
| `src/level2-requirements.mjs` | `/cmmc-level-2-requirements`: all 110 NIST SP 800-171 Rev. 2 requirements word for word, family by family, each with basic/derived, points and its POA&M verdict (from `sprs.mjs` and `poam-rules.mjs`) and all 320 SP 800-171A objectives, plus one example of evidence per family (ours, labelled). Counts pinned in `test/level2-requirements.test.mjs` |
| `src/rev2-vs-rev3.mjs` | `/nist-800-171-rev-2-vs-rev-3` and the `nist-800-171-rev2-to-rev3-crosswalk.csv` it links, written by `build.mjs`: each of the 110 Rev. 2 requirements (text from official-text.json) with its Rev. 3 fate (kept, or withdrawn and incorporated into / addressed by which Rev. 3 requirement), the 20 requirements new in Rev. 3 and the ones withdrawn numbers moved into, word for word, ODPs shown as "[Assignment: ...]", and 32 CFR 170.14(c)(3) on why CMMC still assesses Rev. 2. Rev. 3 data is `fixtures/nist-800-171r3/rev3-extract.json`, made by `scripts/extract-rev3.mjs` from NIST's OSCAL catalog (usnistgov/oscal-content, read 2026-11-28; file hash and every count pinned in `test/rev2-vs-rev3.test.mjs`) |
| `src/dfars-clauses.mjs` | `/dfars-cybersecurity-clauses`: FAR 52.204-21 and DFARS 252.204-7008, -7012, -7019, -7020, -7021, -7024 and -7025, each as provision or clause, what it asks, the clocks it starts and what flows down. Every quotation is in `QUOTES` and `test/dfars-clauses.test.mjs` finds it word for word in `fixtures/dfars/` (the eCFR versioner API, 2026-11-01 point in time, read 27 Nov 2026; file hashes pinned); the plain readings are ours and the page says so |
| `src/fci-cui.mjs` | `/fci-vs-cui`: FCI vs CUI, the question that sets the CMMC level. FAR 52.204-21, 32 CFR 2002.4 and DFARS 252.204-7012 definitions and the 32 CFR 2002.20 marking rules quoted word for word (`QUOTES`, checked against `fixtures/dfars/` and `fixtures/cui/`, Part 2002 read from the eCFR versioner API on 28 Nov 2026, hashes pinned in `test/fci-cui.test.mjs`), and seven kinds of shop paperwork sorted FCI / CUI / neither / ask, each reading labelled ours and tied to the quotation it rests on |
| `src/assessment-sheet.mjs` | `/cmmc-self-assessment-spreadsheet` and the free `cmmc-level-2-self-assessment.xlsx` it links, written by `build.mjs` (zero-dependency zip, same writer as seller-books-site): 110 requirement rows, Status list, partial credit, per-row points lost and "must close first", a Score sheet with the SPRS score and the status it supports. Rules from `sprs.mjs`/`poam-rules.mjs`; `test/assessment-sheet.test.mjs` recalculates it in LibreOffice (skipped without `soffice`) against `score()`, and `apps/cmmc/test/unit/assessment-sheet-import.test.ts` imports it with the app's own reader |
| `src/poam-template.mjs` | `/cmmc-poam-template` and the free `cmmc-poam-template.xlsx` it links, written by `build.mjs` with `assessment-sheet.mjs`'s zip and cell helpers: a POA&M sheet whose headers are the ones `apps/cmmc` `poam-import.ts` reads, points and the 32 CFR 170.21 verdict per row from `poamVerdict`, a Summary (close-out date, points open, score, verdict) and a Rules sheet the formulas read. `test/poam-template.test.mjs` recalculates it in LibreOffice (skipped without `soffice`); `apps/cmmc/test/unit/poam-template-import.test.ts` imports it with the app's reader |
| `src/compare.mjs` | `/cmmc-compliance-software-compared`: a spreadsheet, this workspace, FutureFeed, PreVeil Pass, Cuick Trac, Project Spectrum and a consultant, each vendor price cited to its own page read on `COMPARE_CHECKED` ("quote only" where none is published), "two different jobs" (keeping CUI vs the paperwork) and where another option is the better buy. Our prices come from `plans.mjs`; `test/compare.test.mjs` refuses an uncited $ figure and recomputes the derived "about $183/mo" and "$2,200–$5,400 a year" |
| `src/sprs-submit.mjs` | `/how-to-submit-sprs-score`: getting a score into SPRS, step by step: the PIEE account and SPRS Cyber Vendor User role, a NIST SP 800-171 Basic Assessment (or the DFARS 7019 email route), a CMMC Level 1 or Level 2 self-assessment, and the affirming official. Every quotation is in `QUOTES` and `test/sprs-submit.test.mjs` finds it word for word in `fixtures/sprs/` (DoD SPRS guide texts, downloaded 28 Nov 2026, hashes pinned; PDF hashes in `fixtures/sprs/README.md`) or the DFARS 7019 fixture; the steps are our wording |
| `src/build.mjs` | Zero-dependency static build to `dist/`: HTML per page (canonical, OG, JSON-LD), `sitemap.xml`, `robots.txt` (AI crawlers named), `llms.txt`, `llms-full.txt` |
| `src/worker.mjs` | Worker entry (default export only; workerd treats named exports as entrypoints) |
| `src/early-access.mjs` | Base-path routing, security headers, double opt-in list in D1 (same design as grants' newsletter) |
| `migrations/` | D1 schema for `early_access_signups` |
| `docs/PRICING.md` | Proposed tiers, competitor anchors, cost floor, owner decision |
| `docs/CLAIMS.md` | What the copy may never say, and how the CMMC status was checked |

Conventions follow `apps/grants`' marketing site (`docs/SEO.md` there): honest copy, one route list behind
pages + sitemap + llms.txt, AI crawlers named in robots.txt, no ratings in structured data. Like the other
non-grants apps it has no `package.json` and no dependencies; the root biome config lints it.

## Commands (from `apps/cmmc-site`)

```bash
node src/build.mjs                       # build dist/ (env SITE_URL, BASE_PATH to override)
node --test test/*.test.mjs              # build/SEO/claims tests + Worker tests (node:sqlite fake D1)
pnpm exec biome check --write .          # lint/format (from the repo root: apps/cmmc-site)
```

Local run (wrangler from grants' install):

```bash
node src/build.mjs
../grants/node_modules/.bin/wrangler d1 migrations apply cmmc-site --local
../grants/node_modules/.bin/wrangler dev --var TOKEN_SECRET:dev --var IP_HASH_SALT:dev
# http://localhost:8787/cmmc/
```

## Early-access flow (double opt-in)

1. `POST /cmmc/api/early-access` (plain HTML form, no JavaScript): validates email + consent, honeypot,
   per-address resend limit (10 min, 5/day) and per-IP limit (10 new sign-ups/hour, salted IP hash).
   Always answers 303 → `/early-access/check-email`, whatever the address's state.
2. One transactional email (Cloudflare Email Service binding `EMAIL`) with the confirm link (7 days,
   only its SHA-256 stored) and a leave link (HMAC with `TOKEN_SECRET`, not stored).
3. Confirm and leave links open a page with a button; the change happens on POST, so link scanners
   cannot confirm or delete.
4. A daily Durable Object alarm (`src/purge-clock.mjs`, not a cron trigger: the account has 5) deletes never-confirmed rows after 30 days.

No email address or token is ever logged.

## Owner console API

`GET /cmmc/api/admin/metrics?days=30` (total, confirmed, by day, by source page) and
`GET /cmmc/api/admin/accounts?limit=50` (newest sign-ups: email, source page, confirmed, date) serve the owner
console (`apps/admin`) in the `packages/admin-metrics` contract (`src/admin.mjs`, which imports that
package's TypeScript source; Node ≥ 22.18 and wrangler both load it). They answer only
`Authorization: Bearer <ADMIN_SERVICE_TOKEN>`, a Worker secret of at least 32 characters set by the
`set-admins` workflow and never committed; unset, they are closed. They work without `TOKEN_SECRET`. Every
read writes a row to `admin_audit_log` (`migrations/0002_admin_audit_log.sql`). There is no unsubscribed
count: leaving deletes the row. `ADMIN_METRICS_TOKEN` (same rules) is the agents' read-only credential: `/metrics` only; `/accounts` answers 403.

## Deploy (owner)

Not needed while the site is open: the catalogue serves the static copy. The Worker below is only
for the early-access copy (its list form and server-side calculator). To deploy it by hand:

1. `wrangler d1 create cmmc-site`, put the id in `wrangler.jsonc`, then
   `wrangler d1 migrations apply cmmc-site --remote`.
2. Onboard the sender domain for Cloudflare Email Service (grants: `scripts/email-sending.mjs`) and set
   `EMAIL_FROM` in `wrangler.jsonc`.
3. `wrangler secret put TOKEN_SECRET` and `wrangler secret put IP_HASH_SALT` (random, 32+ bytes).
   Without `TOKEN_SECRET` the sign-up endpoint answers 503. Optional: `ADMIN_SERVICE_TOKEN`, `ADMIN_METRICS_TOKEN` (above).
4. `node src/build.mjs && wrangler deploy`. The route is `marisstella.app/cmmc*`.
5. Add `/cmmc/api/` and `/cmmc/early-access/` disallow lines and `/cmmc/sitemap.xml` to the host's root
   `robots.txt` (built in oss-monorepo `platform/pages/build.mjs`, `HOSTED_APPS`).

Before launch: click through every source in `src/site.mjs` (direct fetches were blocked when this was
written; facts were confirmed through search) and confirm the `apps/jobshop-site` URL.
