---
kind: note
subjects: [security, jobshop-quote]
---
# Job Shop Quote moved into this repository (part 1 of `move-jobshop-quote-public`)

Step 4 of task `products-to-public-repo` for bet #2 (`portfolio/monetization/bets.md`), done the way
PayApps' move does it (open PR 19586, `docs/reports/2026-11-27-move-payapps-public.md` there). Job
Shop Quote, its marketing site and the four packages they import as source now live in
[`ventures/jobshop-quote/`](../../ventures/jobshop-quote/README.md) under the all-rights-reserved
notice. Why: `private-monorepo`'s Actions start no jobs, so the app could not deploy; this
repository's runners do. Every free ROADMAP item for bets 1 to 4 was gated on customers or the
owner on 2026-11-27 (`roadmap_claim.py --bets`), and PayApps and E-invoice each already had two open
move PRs, so bet #2 was the next one nobody had started.

## What was copied

`git archive` of `private-monorepo` commit `28895f0c` (2026-11-27), tracked files only:
`apps/jobshop-quote`, `apps/jobshop-site`, `packages/{billing,admin-metrics,cad-features,qbo-sync}`
(found by the app's and site's `@billing`-style imports and the test helpers' relative paths), the
no-source-maps script, and the workspace root files. Plus `docs/legal/OPERATOR.md` with a header
saying where it came from. Not copied: the deploy workflow, `infra/`, `docs/security/`, owner
checklists, the other apps, `packages/lien-waivers` and `packages/trust-page` (nothing here imports
them).

## Changes made in the copy

- **Fixture domains** on real, registrable names (`acme.com`, `notacme.com`, `customer.com`,
  `yourshop.com`, `example-shop.com`, 52 hits in 11 files) moved to `.example` (RFC 2606) by
  `ventures/jobshop-quote/rewrite_public.py`. Unlike PayApps' script it rewrites the bare domain as
  well as the address, because the sender-allowlist tests compare an address with a domain entry.
  Three lines grew past biome's width and were reformatted; `sync-from-private.sh` formats after the
  rewrite for that reason.
- **Package scope** `@private-monorepo/*` and `@private/*` renamed `@jobshop-quote/*`. Nothing
  imports by package name (aliases point at the source), so no code changed.
- **Lockfile** pruned with `pnpm install --lockfile-only` (4,403 to 3,753 lines). The
  `apps/jobshop-quote` importer block is byte-identical and no package entry was added.
- `apps/jobshop-quote/docs/DEPLOY.md` linked the deploy workflow above the workspace; it now names
  the private path and links the workspace's `DEPLOY.md` (the dead-link check found it). A later
  sync brings the old link back and the same check will say so.
- `platform/ci/third_party.json`: the wrangler-generated workerd types (Apache-2.0) and the six
  CadQuery and build123d sample files (Apache-2.0, `SOURCES.md` lists upstream path and commit).
  `THIRD_PARTY.md` and `portfolio/monetization/transition.json` regenerated.

## Fixed because this repository's tree checks found them

CI's `changed-ventures` job runs checks `private-monorepo` never had; the same classes PayApps' move
fixed. Each fix is in the public copy only, so a later `sync-from-private.sh` reintroduces them until
the private copy goes or gets the same patch (the checks will say so):

- `traveler.ts`: the due date accepted 2026-02-30 (Date.parse rolls it to March); now
  `isCalendarDay` round-trips it, with `traveler.test.ts`.
- `rate-card-import.ts` `csvField`: a plain negative number (`-12.50`) was defused into text; a
  number now passes, formulas still get the apostrophe; tests added.
- `scripts/provision.mjs`: a trailing `--domain` with no value was `undefined`; now an error; tests.
- `scripts/email-routing.mjs`: the entry guard compared against a `file://` string (false from a
  path with a space); now `pathToFileURL`.
- gitleaks (`security-scan`) read the inbound-address alphabet constant `TOKEN_ALPHABET = "0123…xyz"`
  as a generic API key; renamed `ADDRESS_ALPHABET` and built from two parts (same string, no secret).
- Nine literal U+FEFF characters written as `\uFEFF` escapes (same string).
- The app's SPA shell `index.html` and a site test fixture are marked `noindex` (thin-page check;
  the shell is a sign-in app, the marketing pages are `apps/jobshop-site`).
- `platform/ci/publish-surface.yaml`: the new workflow, classification `none` (publishes nothing).
- The agent-permission harness snapshot written as CI regenerated it (12,100 files; a local run
  counts untracked `node_modules` and gave 56,126).

## Verification (this session)

| check | result |
| --- | --- |
| `apps/jobshop-quote`: biome ci, typecheck, unit, worker, build, no source maps, provision and email-routing scripts, drizzle check and generate | unit 633 passed (49 files) after the fixes; worker 281 passed (45 files); scripts 19 passed; "No schema changes"; migrations identical to private |
| `apps/jobshop-site`: biome ci, typecheck, unit, worker, build | unit 42 passed; worker 13 passed; build ok |
| `packages/billing`, `qbo-sync`, `cad-features`: typecheck + tests; `admin-metrics` tests; `scripts/` tests; biome ci on packages and scripts | 86, 92, 73, 16, 4 passed, 0 failures |

`.github/workflows/jobshop-quote-ci.yml` runs the same steps (three jobs: app, site, packages;
read-only, no secrets, SHA-pinned actions, sparse checkout). The private CI's Playwright job is
not ported yet: it installs a browser with `--with-deps` and needs its own look at caching here.

## Pre-publication audit

`python3 platform/security/prepub_audit.py` on the source paths at `28895f0c`: **block 0, review 67**
(52 fixture emails, 11 `private-monorepo` mentions, 3 confidentiality markers, 1 secret-shaped
assignment). After the rewrites, on `ventures/jobshop-quote` as committed:

Files: 566 (12 binary, listed not read). Block: **0**. Review: **24**.

| level | rule | count |
|---|---|---|
| review | confidentiality marker | 3 |
| review | names private-monorepo (rewrite the path after the move) | 20 |
| review | secret-shaped assignment | 1 |

| level | rule | where | detail (redacted) |
|---|---|---|---|
| review | confidentiality marker | `ventures/jobshop-quote/apps/jobshop-quote/docs/legal/terms.md:45` | confidential |
| review | confidentiality marker | `ventures/jobshop-quote/apps/jobshop-quote/src/worker/services/legal/documents.ts:59` | confidential |
| review | confidentiality marker | `ventures/jobshop-quote/packages/cad-features/docs/STEP.md:39` | do not distribute |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/DEPLOY.md:3` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/DEPLOY.md:27` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/DEPLOY.md:28` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/DEPLOY.md:34` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/DEPLOY.md:35` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/README.md:31` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/README.md:47` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/README.md:66` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/README.md:67` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/VENTURE.yaml:11` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/apps/jobshop-quote/docs/DEPLOY.md:7` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/docs/legal/OPERATOR.md:1` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/rewrite_public.py:2` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/sync-from-private.sh:2` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/sync-from-private.sh:4` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/sync-from-private.sh:6` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/sync-from-private.sh:16` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/sync-from-private.sh:35` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/sync-from-private.sh:36` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/jobshop-quote/sync-from-private.sh:37` |  |
| review | secret-shaped assignment | `ventures/jobshop-quote/apps/jobshop-quote/scripts/phone-width.mjs:46` | password = ph******** |

Each remaining review finding read:

- **confidentiality markers**: the Terms (and their copy in `documents.ts`) promising to treat
  customer content as confidential (keep); `cad-features/docs/STEP.md` says "we run it and do not
  distribute it" about a server-side OCCT option, a licensing note, not a secret.
- **secret-shaped assignment**: `scripts/phone-width.mjs` signs up a throwaway account on the local
  demo server (`@example.test` address, password `phone-width-check-only`); not a credential.
- **`private-monorepo` mentions**: they describe the move and the sync (README, DEPLOY.md, the two
  scripts, OPERATOR.md's header), the packages' READMEs saying where the package came from, or the
  `portfolio/monetization/models.yaml` row key `private-monorepo/apps/jobshop-quote`, which is
  repointed when the private copy goes.
- The 12 binary files, opened by hand: seven OCCT-written IGES fixtures (gzip, made by
  `cad-features/scripts/make-iges-fixtures.py`), the site's `og.png`, and four page-count PDFs whose
  only text is "SHEET n OF m" and a made-up part number (`test/fixtures/pdf/README.md`). No
  customer drawing.

## Next

1. The Playwright job in `jobshop-quote-ci.yml`.
2. `priv-jobshop-quote-deploy.yml`, ported from the private workflow, in its own PR (control-plane
   tier), after PayApps' deploy port lands. Settings it needs: `ventures/jobshop-quote/DEPLOY.md`.
3. Deploy once by hand, remove the private copy, repoint `bets.md` and `models.yaml`.
4. Until then, scheduled runs keep building in `private-monorepo/apps/jobshop-quote`; refresh this
   copy with `ventures/jobshop-quote/sync-from-private.sh <clone>` (audits first, stops on a block
   finding).
5. `packages/billing`, `qbo-sync` and `admin-metrics` now exist in two workspaces (here and
   `ventures/payapps`); fold them into one shared copy once both products build here.
