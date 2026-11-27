---
kind: note
subjects: [security, seller-books]
---
# Seller Books moved into this repository (part 1 of `move-seller-books-public`)

Step 4 of task `products-to-public-repo` for bet #5 (`portfolio/monetization/bets.md`). Seller Books,
its marketing site and the two packages it imports as source now live in
[`ventures/seller-books/`](../../ventures/seller-books/README.md) under the all-rights-reserved notice.
Why: `private-monorepo`'s Actions start no jobs (PayApps' only deploy, private run 45921558751, got
`runner_id: 0`), so no bet built there can deploy; this repository's runners do. On 2026-11-27 bets
#1 to #4 each already had a move PR (PayApps merged as PR #19586; Job Shop Quote PR #19594, E-invoice
PRs #19574 and #19575, CMMC PR #19601 open). Seller Books had none.

## What was copied

`git archive` of `private-monorepo` commit `5d974943` (2026-11-27), tracked files only:
`apps/seller-books`, `apps/seller-books-site`, `packages/{billing,admin-metrics}`, the no-source-maps
script and its test, and the workspace root files (`package.json`, `pnpm-workspace.yaml`,
`pnpm-lock.yaml`, `biome.json`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`). The layout under
`ventures/seller-books/` matches the private root, so no import path changed. Not copied: the deploy
workflow, `docs/security/`, `infra/`, the other apps.

## Changes made in the copy

- Root `package.json` renamed `seller-books-workspace`; package scope `@private-monorepo/*` renamed
  `@seller-books/*` (nothing imports by package name; the app uses `@billing`-style aliases).
- The one email the audit flagged, `a.b+c@sub.example.co` in the site's address-validation test, moved
  to `sub.example.com` (RFC 2606 reserved; `.co` is a real TLD). The test checks the same shape.
- `apps/seller-books/docs/DEPLOY.md`'s link to the private deploy workflow (above the workspace) now
  names it as text and links the venture's `DEPLOY.md`.
- Lockfile pruned with `pnpm install --lockfile-only` (4,403 to 3,671 lines). The
  `apps/seller-books` importer block is identical to the private one and no package entry was added
  (compared by script).
- `sync-from-private.sh` re-applies all of the above after an audit.
- **Security fix found by this repository's checks:** the site's early-access worker took the
  *left-hand* `X-Forwarded-For` entry as its rate-limit key when `cf-connecting-ip` was missing; that
  entry is client-supplied (`platform/ci/test_xff_rightmost.py` failed on it). It now takes the
  right-hand entry. The same fix landed in private-monorepo PR 481 (`f5bf746c`), so a sync keeps it.
- **Four more from the tree checks** (`run_venture_tests.py --since origin/main`), each fixed here and in
  private-monorepo PR 483 (`db8a39f1`): `isoDate` accepted 2026-02-30 (`check_calendar_dates`; new
  `test/unit/schemas.test.ts` fails on the old code), `provision.mjs` let a trailing `--from` fall back
  silently (`check_trailing_flag_value`; test added), a literal U+FEFF in `parse.test.ts`
  (`check_hidden_unicode`; now `\uFEFF`), and the SPA shell `index.html` was a 9-word indexable page
  (`check_thin_pages`; `noindex`, as PayApps'). `platform/ci/third_party.json` covers the generated
  workerd types and the LICENSE, as for PayApps (`THIRD_PARTY.md` regenerated).
- **Three more from PR CI**, each also in private-monorepo (PR below): `security-scan` read
  `/order…/i.exec(\`${title} …\`)` in the Etsy importer as a shell `exec` (`js-child-process-dynamic`;
  rewritten as the equivalent `String.match`); `adversarial-gate` wanted the disclaimer on the SPA shell
  `index.html` (a footer line, as PayApps has); and the site's card grid used `minmax(260px, …)`, which
  overflows a 320 px phone (`grid-min-reflow.test.mjs`; now `minmax(min(260px, 100%), …)`).
  `platform/ci/publish-surface.yaml` lists the new read-only workflow.
- `portfolio/monetization/transition.json` and `verticals.json` regenerated for the new venture
  (`transition.py --write`, `verticals.py --write`; the only change is seller-books' row and the
  counts and move order after it).
- `.github/workflows/seller-books-ci.yml`'s provisioning step names its script from the repository root
  (the agent-permission harness's R1 rule read `scripts/provision.test.mjs` as missing).

## Verification (this session)

| check | result |
| --- | --- |
| `apps/seller-books`: biome ci, typecheck, unit, worker, provision script, build, no source maps, drizzle check + generate | unit 308 passed (31 files, after the fixes below; 306 before); worker 133 passed (25 files); provision 5 passed; build ok; "No schema changes" |
| `apps/seller-books-site`: biome ci, `node build.mjs`, `node --test "test/*.test.mjs"` | 24 pages built; 56 passed |
| `packages/billing` typecheck + tests; `admin-metrics` tests; `scripts` tests | billing 86 passed; admin-metrics and scripts passed, 0 failures |

`run_workflow_locally.py --for-changes`: `seller-books-ci.yml` 18/18 run steps passed, along with
`portfolio-validate`, `pages`, `doc-refs` and the other triggered workflows. The three failures it found
(the XFF rule, the two stale JSON files and the harness's R1) are fixed above and re-run green.

The same steps run in CI from `.github/workflows/seller-books-ci.yml` (three jobs: app, site,
packages; read-only, no secrets, SHA-pinned actions, sparse checkout of `ventures/seller-books`). The
site had no CI in private-monorepo; it has one now. The private Playwright job is not ported (DEPLOY.md).

## Pre-publication audit

Before the copy, on the source paths at `5d974943`: **block 0, review 11** (2 confidentiality
promises in the Terms, 1 email, 8 `private-monorepo` mentions in `packages/billing`, all of them the
package scope). After the rewrites, on `ventures/seller-books` as committed:

Files: 348 (0 binary, listed not read). Block: **0**. Review: **19**.

| level | rule | count |
|---|---|---|
| review | confidentiality marker | 2 |
| review | email address outside example domains | 1 |
| review | names private-monorepo (rewrite the path after the move) | 16 |

| level | rule | where | detail (redacted) |
|---|---|---|---|
| review | confidentiality marker | `ventures/seller-books/apps/seller-books/docs/legal/terms.md:49` | confidential |
| review | confidentiality marker | `ventures/seller-books/apps/seller-books/src/worker/services/legal/documents.ts:63` | confidential |
| review | email address outside example domains | `ventures/seller-books/sync-from-private.sh:35` | ***@sub.example.co |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/DEPLOY.md:11` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/DEPLOY.md:17` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/DEPLOY.md:18` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/DEPLOY.md:31` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/README.md:29` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/README.md:63` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/README.md:64` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/VENTURE.yaml:10` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/apps/seller-books/docs/DEPLOY.md:6` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/sync-from-private.sh:2` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/sync-from-private.sh:4` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/sync-from-private.sh:6` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/sync-from-private.sh:15` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/sync-from-private.sh:33` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/sync-from-private.sh:34` |  |
| review | names private-monorepo (rewrite the path after the move) | `ventures/seller-books/sync-from-private.sh:41` |  |

Each remaining review finding read: the two "confidential" hits are the Terms promising to treat
customer content as confidential (keep); the email is the rewrite pattern inside
`sync-from-private.sh`; every `private-monorepo` mention describes the move and the sync (README,
both DEPLOY files, VENTURE.yaml's comment, the script).

## Next

1. An allowlist PR for the deploy's secrets in `platform/ci/adversarial_gate/allowlist.yaml`, then
   `priv-seller-books-deploy.yml` ported from the private `seller-books-deploy.yml` in its own PR
   (control-plane tier). PayApps' PR #19610 is the pattern.
2. A launch review: the legal pages are drafts until the operator name and contact are confirmed
   (`apps/seller-books/docs/BILLING.md`, "Turning it on"). PayApps has one; Seller Books does not.
3. Deploy once, then remove the private copy and repoint the ledgers (`ventures/seller-books/DEPLOY.md`).
4. Until then scheduled runs keep building in `private-monorepo/apps/seller-books`; refresh this copy
   with `ventures/seller-books/sync-from-private.sh <clone>`.
