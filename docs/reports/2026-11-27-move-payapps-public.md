---
kind: note
subjects: [security, payapps]
---
# PayApps moved into this repository (part 1 of `move-payapps-public`)

Step 4 of task `products-to-public-repo` for bet #1 (`portfolio/monetization/bets.md`). PayApps,
its marketing site and the four packages they import as source now live in
[`ventures/payapps/`](../../ventures/payapps/README.md) under the all-rights-reserved notice. Why:
`private-monorepo`'s Actions start no jobs, so PayApps was launch-approved but could not deploy; this
repository's runners do (`docs/reports/2026-11-27-prepub-audit-payapps.md`).

## What was copied

`git archive` of `private-monorepo` commit `03e2e560` (2026-11-26), tracked files only:
`apps/payapps`, `apps/payapps-site`, `packages/{billing,admin-metrics,lien-waivers,qbo-sync}`, the
no-source-maps script, and the workspace root files (`package.json`, `pnpm-workspace.yaml`,
`pnpm-lock.yaml`, `biome.json`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`). Layout under
`ventures/payapps/` matches the private root, so no import path changed. Plus `docs/legal/OPERATOR.md`
(the operator and launch-authority page the deploy doc links to). Not copied: `docs/trust/OWNER-CONFIRM.md`,
`docs/security/` (secret inventories), `infra/`, the deploy workflows, and the other apps.

## Changes made in the copy

- **Fixture and placeholder emails** on real registrable domains (`builder.com`, `supplier.com`,
  `harborbuilders.com`, `peakgc.com`, `sierra.com`) moved to `.example` (RFC 2606) by
  `ventures/payapps/rewrite_public.py`, which also catches the address inside a test's regex literal
  (`@sierra\.com`; the first pass missed those and 4 tests failed until it did).
- **Package scope** `@private-monorepo/*` renamed `@payapps/*`. Nothing imports by package name (the
  apps use `@billing`-style aliases to the source), so no code changed.
- **Lockfile** pruned with `pnpm install --lockfile-only` to this workspace's importers (4,403 to
  3,933 lines). No version changed: the `apps/payapps` importer block is identical and no package
  entry was added.
- Two doc links that pointed above the workspace rewritten (`DEPLOY.md` to the workflow,
  `ROADMAP.md` to `docs/ci-on-aws.md`).

## Verification (this session)

| check | result |
| --- | --- |
| `apps/payapps`: biome ci, typecheck, unit, worker, build, no source maps, provision script | unit 1,279 passed, 1 skipped (136 files); worker 546 passed (86 files); provision 4 passed; build ok |
| `packages/lien-waivers` statutory snapshot tests | 240 passed |
| `apps/payapps-site`: biome ci, typecheck, unit, worker, build | passed |
| `packages/billing`, `lien-waivers`, `qbo-sync` typecheck + tests; `admin-metrics` tests; scripts tests | passed, 0 failures |
| after the email rewrite: `apps/payapps` biome ci, typecheck, unit, worker in full | same counts, all passed |

The same steps run in CI from `.github/workflows/payapps-ci.yml` (three jobs: app, site, packages;
read-only, no secrets, SHA-pinned actions, sparse checkout of `ventures/payapps`).

## Pre-publication audit

Before the copy, on the source paths at `03e2e560`: **block 0, review 47** (27 fixture emails, 18
`private-monorepo` mentions, 2 confidentiality promises in the terms). After the rewrites, on
`ventures/payapps` as committed:

Files: 976 (28 binary, listed not read). Block: **0**. Review: **22**.

| level | rule | count |
|---|---|---|
| review | confidentiality marker | 2 |
| review | names private-monorepo (rewrite the path after the move) | 20 |

| level | rule | where | detail (redacted) |
|---|---|---|---|
| review | confidentiality marker | `ventures/payapps/apps/payapps/docs/legal/terms.md:48` | confidential |
| review | confidentiality marker | `ventures/payapps/apps/payapps/src/worker/services/legal/documents.ts:62` | confidential |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/DEPLOY.md:11` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/DEPLOY.md:17` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/DEPLOY.md:30` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/DEPLOY.md:33` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/DEPLOY.md:38` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/README.md:26` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/README.md:58` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/README.md:59` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/apps/payapps/ROADMAP.md:7` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/apps/payapps/docs/BILLING.md:22` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/apps/payapps/docs/DEPLOY.md:5` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/apps/payapps/src/shared/plans.ts:3` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/docs/legal/OPERATOR.md:1` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/rewrite_public.py:2` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/sync-from-private.sh:2` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/sync-from-private.sh:4` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/sync-from-private.sh:6` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/sync-from-private.sh:16` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/sync-from-private.sh:35` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/payapps/sync-from-private.sh:36` |  |

Each remaining review finding read: the two "confidential" hits are the Terms promising to treat
customer content as confidential (keep); every `private-monorepo` mention either describes the move
and the sync (README, DEPLOY.md, the two scripts, OPERATOR.md's header) or names the
`portfolio/monetization/models.yaml` row key `private-monorepo/apps/payapps` (plans.ts, BILLING.md),
which is repointed when the private copy goes (DEPLOY.md, "Then").

## Next

1. `priv-payapps-deploy.yml`, ported from the private `payapps-deploy.yml`, in its own PR (control-plane
   tier). Secrets and variables it needs: `ventures/payapps/DEPLOY.md`.
2. Deploy once by hand, then remove the private copy and repoint the ledgers.
3. Until step 2, scheduled runs keep building in `private-monorepo/apps/payapps`. Refresh this copy with
   `ventures/payapps/sync-from-private.sh <clone>`, which audits first and stops on a block finding.
