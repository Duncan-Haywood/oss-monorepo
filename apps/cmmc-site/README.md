# cmmc-site: marketing site for the CMMC Level 1/2 + ISO 9001 workspace

Public site for bet #4 in oss-monorepo `portfolio/monetization/bets.md`: a workspace for small defense
and aerospace machine shops to prepare the SSP, POA&M and SPRS score in-house. The product itself is
`apps/cmmc` (built separately); its sibling for the same shops is the job-shop quoting product
(`apps/jobshop-site`, linked at `https://marisstella.app/jobshop`).

Served at `https://marisstella.app/cmmc`. Early access only; prices are proposals.

## Layout

| Path | What |
|---|---|
| `src/site.mjs` | Site name, URLs, sibling link, `STATUS_CHECKED`, the source register (`SOURCES`), consent wording |
| `src/pages.mjs` | Page content: home, Level 1 vs 2 explainer, what it does / does not, security, pricing, early access, privacy, utility pages |
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
4. Daily cron deletes never-confirmed rows after 30 days.

No email address or token is ever logged.

## Deploy (owner)

Not wired into CI yet (this change stays inside `apps/cmmc-site`). To deploy by hand:

1. `wrangler d1 create cmmc-site`, put the id in `wrangler.jsonc`, then
   `wrangler d1 migrations apply cmmc-site --remote`.
2. Onboard the sender domain for Cloudflare Email Service (grants: `scripts/email-sending.mjs`) and set
   `EMAIL_FROM` in `wrangler.jsonc`.
3. `wrangler secret put TOKEN_SECRET` and `wrangler secret put IP_HASH_SALT` (random, 32+ bytes).
   Without `TOKEN_SECRET` the sign-up endpoint answers 503.
4. `node src/build.mjs && wrangler deploy`. The route is `marisstella.app/cmmc*`.
5. Add `/cmmc/api/` and `/cmmc/early-access/` disallow lines and `/cmmc/sitemap.xml` to the host's root
   `robots.txt` (built in oss-monorepo `platform/pages/build.mjs`, `HOSTED_APPS`).

Before launch: click through every source in `src/site.mjs` (direct fetches were blocked when this was
written; facts were confirmed through search) and confirm the `apps/jobshop-site` URL.

## Provenance

Moved on 2026-11-26 from `Duncan-Haywood/private-monorepo` `apps/cmmc-site` at commit
`b1b7c3f63ce289c4051d8506eb0744856350f80e` (a copy of the tree, not its git history), when the paid apps moved
to this public repository. Licence: the root `LICENSE` (FSL-1.1-MIT) unless this
directory's own LICENSE says otherwise; third-party files keep their notices. Index:
[`apps/README.md`](../../apps/README.md).
