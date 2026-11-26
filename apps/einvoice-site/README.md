# einvoice-site: marketing site for e-invoice fix-and-explain

A trilingual (German, French, English) static marketing site with an early-access form, for the
e-invoice "fix and explain" service (the product itself is built separately in
`apps/einvoice-preflight`). **Early access: nothing here is live or charged yet.**

> **Native review required before launch.** The German and French copy was written directly in each
> language (not machine-translated), but a native speaker must check `content/i18n/de.mjs` and
> `content/i18n/fr.mjs`, and the deadline texts in `content/deadlines.mjs`, before the site goes
> public. Pay particular attention to the privacy pages and to tax terms (Rechnungsaussteller,
> sonstige Rechnung, plateforme agréée, e-reporting, TVA sur les débits).

## What is on the site

| Page | de | fr | en |
|---|---|---|---|
| Home: deadlines, what fix-and-explain does, what is and is not checked | `/de/` | `/fr/` | `/en/` |
| Accountants: a plan per client | `/de/steuerberater/` | `/fr/experts-comptables/` | `/en/accountants/` |
| API for invoicing software vendors (draft contract) | `/de/api/` | `/fr/api/` | `/en/api/` |
| Pricing (from `content/pricing.mjs`) | `/de/preise/` | `/fr/tarifs/` | `/en/pricing/` |
| Germany deadlines | `/de/fristen/deutschland/` | `/fr/echeances/allemagne/` | `/en/deadlines/germany/` |
| France deadlines | `/de/fristen/frankreich/` | `/fr/echeances/france/` | `/en/deadlines/france/` |
| Early-access form (double opt-in) | `/de/fruehzugang/` | `/fr/acces-anticipe/` | `/en/early-access/` |
| Privacy (GDPR, exactly what the form stores) | `/de/datenschutz/` | `/fr/confidentialite/` | `/en/privacy/` |

Plus `/` (language chooser, the `x-default`), `404.html`, `sitemap.xml` (with `xhtml:link` hreflang
alternates), `robots.txt` (AI crawlers allowed on pages, `/api/` disallowed), `llms.txt`, `_headers`
(strict CSP, `script-src 'none'`: the site ships no JavaScript). Form-flow pages (check your inbox,
confirmed, deleted, error) are `noindex` and not in the sitemap.

Conventions follow `apps/grants/docs/SEO.md`: honest copy only, no invented stats, reviews or ratings;
per-page title, description, canonical, Open Graph and JSON-LD (`WebPage`, `BreadcrumbList`,
`Product` with offers on pricing).

## Layout

```
build.mjs                 static build into dist/ (zero dependencies)
worker.mjs                Cloudflare Worker: serves dist/ + the early-access API, daily purge
site.config.mjs           languages, product name (working name "E-Invoice Preflight"), prod config checks
content/deadlines.mjs     every date and rule the site states, with official source + check date
content/pricing.mjs       plans, API meter, cost model (docs/PRICING.md explains it)
content/routes.mjs        page ids and slugs per language
content/i18n/{de,fr,en}.mjs   copy per language
migrations/0001_early_access.sql   D1 schema
docs/PRICING.md           pricing proposal (cost-plus)
test/                     node:test suites (build, pricing, worker against node:sqlite)
```

## Commands (from `apps/einvoice-site`, Node 22+, no install needed)

```bash
node build.mjs                 # dev build for http://localhost:8787
node --test test/*.test.mjs    # 30 tests
```

Lint/format with the root biome config: `pnpm exec biome check --write apps/einvoice-site` from the
repo root.

## Deadlines: sources and how they were checked

Every date on the site comes from `content/deadlines.mjs`. Each entry names an official page
(bundesfinanzministerium.de, impots.gouv.fr, economie.gouv.fr) and the date it was checked; the
country pages print both. Tests fail if a source is not on an official host, has no check date, or
if any page states a date that is not in that file.

**Limitation, stated on the pages too:** on 2026-11-24 the build environment could not open those
three sites directly (DNS was blocked by its network policy). Each statement was matched against the
official page's own text as returned by a web search restricted to the official domain. Before
launch, open every URL in a browser, re-read the wording, and set `checkedVia: "direct"` with the new
date.

Covered: Germany and France. Not covered: other countries (Belgium, Poland and others have their
own timelines). The bet description in oss-monorepo `portfolio/monetization/bets.md` lists the
deadlines and sources it relies on; this session could not read that repository, so compare its
list with `content/deadlines.mjs` and add anything missing, each with an official source.

Not asserted on purpose: penalty amounts, the list of approved French platforms, and the details of
the BMF letter of 15 October 2026 beyond a pointer to it. Add them only with a source.

## What the product pages promise (and why carefully)

The "checked / not checked" lists and the API contract describe the **planned** scope and say so.
When `apps/einvoice-preflight` ships, make the lists match exactly what it checks. The pages promise
that a fix is proposed only when it follows from the invoice itself, and that a missing fact (e.g. a
SIREN) is asked for, never guessed. That matches the repository's anti-fabrication rule; keep the
product to it or change the copy.

## Early-access form and privacy

Double opt-in, modelled on grants' newsletter (`apps/grants/docs/EMAIL_MARKETING.md`), simplified:

- Plain HTML form, no JavaScript. `POST /api/early-access` checks Origin (CSRF), a honeypot, strict
  validation and the current `CONSENT_VERSION`, then always answers with a 303 to "check your inbox".
  The DB work and the email run after the response, so neither the answer nor its timing reveals
  whether an address is known.
- The confirmation link opens a page with one button: a GET never confirms, because mail scanners
  open links. Tokens: 32 random bytes, only their SHA-256 stored, 7-day expiry, single use.
- Resend limits per address: one email per 10 minutes, at most 5 per rolling day.
- Delete: HMAC-signed link (`SIGNING_SECRET`), not stored, in every email and in `List-Unsubscribe`
  with RFC 8058 one-click. Deleting removes the whole row.
- Daily cron: unconfirmed rows deleted 7 days after the last request; confirmed rows 24 months after
  confirmation.
- **Stored:** email, role, countries, language, consent version and times, token hash/expiry, send
  count and times. **Not stored:** IP address, user agent. Worker observability is off in
  `wrangler.jsonc` because the privacy pages say request logging is off. If you turn it on, update
  the three privacy pages first.

The privacy pages name Cloudflare (hosting, D1, Email Service) as processor and the transfer basis
(EU-U.S. Data Privacy Framework + SCCs). **Have them reviewed** (by a native speaker and ideally a
privacy lawyer) before launch, and confirm Cloudflare's DPF status at that time.

Email: the confirmation is transactional and goes through Cloudflare Email Service (`send_email`
binding `EMAIL`). Later launch news to confirmed addresses is marketing mail, which Cloudflare Email
Service does not accept (see `apps/grants/src/worker/ports/cloudflare-email.ts`); send it through a
provider that allows marketing mail, with the delete link in every message.

## Before launch

1. Native-speaker review of de/fr copy (above).
2. Re-check every source directly and update `checked` / `checkedVia` in `content/deadlines.mjs`.
3. Decide the product name (`SITE_NAME` in `site.config.mjs`) and the domain.
4. Production build: `SITE_URL=https://... CONTROLLER_NAME=... CONTROLLER_ADDRESS=... CONTROLLER_EMAIL=... node build.mjs --prod`
   (it refuses to build if any is missing, so no placeholder can ship).
5. `wrangler d1 create einvoice-site` and put the id in `wrangler.jsonc`;
   `wrangler d1 migrations apply einvoice-site --remote`.
6. `wrangler secret put SIGNING_SECRET` (32+ random bytes). Set `SITE_URL` and `EMAIL_FROM` vars;
   onboard the sender domain in Cloudflare Email Service.
7. `wrangler deploy` (wrangler is installed in `apps/grants`; there is no deploy workflow for this
   app yet).
8. Make the checked / not-checked lists match the released `einvoice-preflight`.

## Pricing

See `docs/PRICING.md`: accountant plans at €19 / €29 / €49 per month and a metered API, cost-plus
(1.3×–2.0× of full cost), enforced by `test/pricing.test.mjs`. Proposal only.

## Provenance

Moved on 2026-11-26 from `Duncan-Haywood/private-monorepo` `apps/einvoice-site` at commit
`b1b7c3f63ce289c4051d8506eb0744856350f80e` (a copy of the tree, not its git history), when the paid apps moved
to this public repository. Licence: the root `LICENSE` (FSL-1.1-MIT) unless this
directory's own LICENSE says otherwise; third-party files keep their notices. Index:
[`apps/README.md`](../../apps/README.md).
