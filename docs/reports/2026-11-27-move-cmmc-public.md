---
kind: note
subjects: [security, cmmc]
---
# CMMC Workspace moved into this repository (part 1 of `move-cmmc-public`)

Step 4 of task `products-to-public-repo` for bet #4 (`portfolio/monetization/bets.md`), done the way
Job Shop Quote's move does it (open PR 19594, `docs/reports/2026-11-27-move-jobshop-quote-public.md`
there) and PayApps' (open PR 19586). The CMMC Workspace, its marketing site and the two packages they
import as source now live in [`ventures/cmmc/`](../../ventures/cmmc/README.md) under the
all-rights-reserved notice. Why: `private-monorepo`'s Actions start no jobs, so the app could not
deploy; this repository's runners do. On 2026-11-27 `roadmap_claim.py --bets` found no free,
ungated item on any bet, and PayApps, E-invoice and Job Shop Quote each already had an open move PR,
so bet #4 was the next one nobody had started.

## What was copied

`git archive` of `private-monorepo` commit `5f0757c7` (2026-11-26), tracked files only:
`apps/cmmc`, `apps/cmmc-site`, `packages/billing`, `packages/admin-metrics` (found from
`apps/cmmc/aliases.ts` and `tsconfig.json`; nothing else outside the app is imported), the
no-source-maps script and its test, the workspace root files, and `docs/legal/OPERATOR.md` with a
header saying where it came from. Not copied: `cmmc-deploy.yml`, `infra/`, `docs/security/`, owner
checklists, the other apps and packages.

## Changes made in the copy

- **Package scope** `@private-monorepo/*` renamed `@cmmc/*` (only `packages/billing` carried it;
  nothing imports by package name, aliases point at the source). Root package renamed
  `cmmc-workspace-root` (the app is already `cmmc-workspace`).
- **One fixture domain**: the invite form's placeholder `colleague@company.com` became
  `company.example` (RFC 2606). The test fixtures already used `.example`.
- **Lockfile** pruned with `pnpm install --lockfile-only` to this workspace's importers.
- `platform/ci/third_party.json`: the wrangler-generated workerd types (Apache-2.0);
  `THIRD_PARTY.md` and `portfolio/monetization/transition.json` regenerated (cmmc becomes the 22nd
  proprietary venture, a subscription).
- `apps/cmmc-site` had no CI in `private-monorepo`; its 37 tests (build, SEO, claims, Worker with a
  `node:sqlite` fake D1) now run in `cmmc-ci.yml`.

- **A real bug CI found on its first run here**: the four spreadsheet import panels (controls,
  POA&M, assets, people) read \`csv\` (and the POA&M date order) from the closure inside
  \`useMutation\`'s \`mutationFn\`. TanStack Query swaps in a new \`mutationFn\` in an effect after the
  render, so a click that lands between the render that enables Preview and that effect sends the
  previous render's \`csv: null\`. GitHub's runner hit it in \`PoamImport.test.tsx\` ("expected null");
  it never failed locally. The values are now passed as the mutation's variables
  (\`run.mutate({ apply, csv })\`). The same patch goes to \`private-monorepo\` so a sync does not undo it.

## Verification (this session)

| check | result |
| --- | --- |
| `apps/cmmc`: biome ci, typecheck | clean |
| `apps/cmmc`: unit (vitest) | 490 passed (41 files) |
| `apps/cmmc`: worker (workerd) | 156 passed (22 files) |
| provisioning script, build, no source maps | pass |
| drizzle-kit check and generate | no drift; `migrations/` byte-identical to private (`diff -rq`) |
| `apps/cmmc-site` `node --test test/*.test.mjs` | 37 passed, 0 failed |
| biome ci on site, packages, scripts; billing typecheck + tests; admin-metrics; scripts | all pass |
| `validate_workflows.py`, `check_third_party.py` | valid; all signals covered |

`.github/workflows/cmmc-ci.yml` runs the same steps in two jobs (read-only, no secrets, SHA-pinned
actions, sparse checkout).

## Pre-publication audit

`python3 platform/security/prepub_audit.py` on the source paths at `5f0757c7`: **block 0, review
21** (8 phone-number shapes, 10 `private-monorepo` mentions, 2 confidentiality markers, 1 email).
On `ventures/cmmc` as committed: Files: 352 (1 binary). Block: **0**. Review: **28**.

| level | rule | where | detail (redacted) |
|---|---|---|---|
| review | confidentiality marker | `ventures/cmmc/apps/cmmc/docs/legal/terms.md:45` | confidential |
| review | confidentiality marker | `ventures/cmmc/apps/cmmc/src/worker/services/legal/documents.ts:59` | confidential |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/DEPLOY.md:3` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/DEPLOY.md:28` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/DEPLOY.md:35` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/DEPLOY.md:36` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/README.md:38` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/README.md:71` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/README.md:72` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/VENTURE.yaml:12` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/apps/cmmc/docs/BILLING.md:22` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/apps/cmmc/src/shared/plans.ts:4` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/docs/legal/OPERATOR.md:1` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/sync-from-private.sh:2` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/sync-from-private.sh:4` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/sync-from-private.sh:6` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/sync-from-private.sh:16` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/sync-from-private.sh:34` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/sync-from-private.sh:35` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/cmmc/sync-from-private.sh:36` |  |
| review | phone-number shape | `ventures/cmmc/apps/cmmc/src/client/views/Suppliers.tsx:168` | (252) ***-**** |
| review | phone-number shape | `ventures/cmmc/apps/cmmc/src/client/views/Suppliers.tsx:171` | (252) ***-**** |
| review | phone-number shape | `ventures/cmmc/apps/cmmc/src/client/views/Suppliers.tsx:431` | (252) ***-**** |
| review | phone-number shape | `ventures/cmmc/apps/cmmc/src/shared/suppliers.test.ts:107` | (252) ***-**** |
| review | phone-number shape | `ventures/cmmc/apps/cmmc/src/shared/suppliers.ts:379` | (252) ***-**** |
| review | phone-number shape | `ventures/cmmc/apps/cmmc/src/shared/suppliers.ts:420` | (252) ***-**** |
| review | phone-number shape | `ventures/cmmc/apps/cmmc/src/shared/suppliers.ts:442` | (252) ***-**** |
| review | phone-number shape | `ventures/cmmc/apps/cmmc/src/shared/suppliers.ts:447` | (252) ***-**** |

Each remaining review finding read:

- **phone-number shapes**: all DFARS clause numbers (`252.204-7021(d)(4)` and the like) in the
  supplier flow-down checks. Not phone numbers.
- **confidentiality markers**: the Terms (and their copy in `documents.ts`) promising to treat
  customer content as confidential. Keep.
- **`private-monorepo` mentions**: they describe the move and the sync (README, DEPLOY.md, the sync
  script, OPERATOR.md's header), the app's deploy doc pointing at the private workflow, and the
  `portfolio/monetization/models.yaml` row key `private-monorepo/apps/cmmc`, repointed when the
  private copy goes.
- **The binary**, `apps/cmmc/test/fixtures/self-assessment-libreoffice.xlsx`, unzipped and read: a
  made-up "Acme Machining" sheet (`it@acme.example`), written by LibreOffice from the committed
  `.source.csv`; `docProps` hold no author.

## Sync keeps the edits made here (2026-11-27, PR #19714)

PR #19689 landed this move. PR #19714 had re-verified the same branch in parallel and closes with the
one gap it found. On private-monorepo `7ca83b92`, a sync changed nothing in the app. Its only diffs
were three hand edits made here after the copy, which `sync-from-private.sh` would have quietly
reverted:

- `packages/billing/src/paddle.test.ts`: the host is compared exactly (CodeQL);
- `packages/billing/src/paddle-key.test.ts`: the comment on the same comparison;
- `apps/cmmc/docs/DEPLOY.md`: the private deploy workflow named as text.

The script now saves these files before it replaces the tree and puts them back afterwards (its
`keep_local` list). Drop an entry once private-monorepo has the same edit. The payapps and
seller-books syncs may have the same gap (PR #19632's CodeQL fixes); not checked.

## Next

1. `priv-cmmc-deploy.yml`, ported from the private workflow, in its own PR (control-plane tier),
   after PayApps' deploy port lands. Settings it needs: `ventures/cmmc/DEPLOY.md`. A deploy for
   `apps/cmmc-site` too (none exists anywhere yet).
2. Deploy once by hand, remove the private copy, repoint `bets.md` and `models.yaml`.
3. Until then, scheduled runs keep building in `private-monorepo/apps/cmmc`; refresh this copy
   with `ventures/cmmc/sync-from-private.sh <clone>` (audits first, stops on a block finding).
4. `packages/billing` and `admin-metrics` now exist in up to three workspaces; fold them into one
   shared copy once the products build here.
