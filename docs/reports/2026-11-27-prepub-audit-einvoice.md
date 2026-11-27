---
kind: note
subjects: [security, einvoice-preflight]
---
# Pre-publication audit and move: E-invoice Fix & Explain (bet #3)

Steps 3 and 4 of task `products-to-public-repo` (`portfolio/work/tasks.yaml`)
for the second app, after PayApps (PR #19571,
`docs/reports/2026-11-27-prepub-audit-payapps.md`). Bet #3 is built and has a
manual deploy workflow, but `private-monorepo`'s Actions start no jobs, so it
has never deployed. This repository's runners do.

## What moved

`git archive` of private `0c4bf8e8` (the private `main` this session cloned):

- `apps/einvoice-preflight` (the checker plus `pro/`, the paid layer:
  workspace, fixes, explanations, metered API, Paddle billing shipped dark,
  legal pages, Worker build) and `apps/einvoice-site` (marketing site and
  early-access worker): 1,123 files, 21 binary.
- `packages/billing` and `packages/admin-metrics`, the only packages they
  import (relative `../../../packages/...` paths, run through Node 22's type
  stripping, no npm install). Taken **byte for byte from PR #19571's branch**
  (its `@paid-apps/` rename and `LICENSE` included), so the two PRs add
  identical files and merge in either order.

Not moved: `.github/workflows/einvoice-preflight-deploy.yml` (Cloudflare
credentials; a `priv-` workflow with CODEOWNERS is its own reviewed PR), and
the root pnpm/biome workspace files, which PR #19571 brings.

## Audit result

`python3 platform/security/prepub_audit.py <private clone> apps/einvoice-preflight apps/einvoice-site`
at `0c4bf8e8`: **block 0, review 67**. Re-run on the copied tree after the
fixes below: block 0, review 63. Each was read:

| rule | count | decision |
|---|---|---|
| email outside example domains, already public | 52 | The same file, byte for byte, is already published under `ventures/einvoice-preflight` (checked with `cmp` per file): third-party NF-e samples from nfelib (MIT) and sped-nfe (MIT), FNFE-MPE examples (Apache-2.0, made-up parties), AEAT's own published support address in its error list, an Italian PEC test fixture. Publishing them again adds nothing. Keep. |
| email outside example domains, new | 4 fixed, 7 kept | `apps/einvoice-site/test/worker.test.mjs` used `kanzlei.de` (4), a real registrable domain: **now `kanzlei.example`**. `verifactu-response.mjs` (1) names AEAT's published support address, as the public copy does. `fixtures/fr-fnfe/basicwl-f20260024-fx-cii.xml` is a newer FNFE-MPE example (`masociete.fr`, `seller.com`, `buyer.com`), unchanged from the Apache-2.0 source its README names. Keep. |
| public IPv4 | 2 | `xmldsig.mjs:189`: `2.5.4.x` X.500 attribute OIDs, not addresses. False positive. |
| confidentiality marker | 2 | Terms and DPA promising to keep customer content confidential. Keep. |

Also checked: no `private-monorepo` string anywhere in the two apps; no
`.dev.vars`, `.env`, keys or state files; secrets come from Worker bindings
and environment variables only.

## Licence

Both apps get `portfolio/monetization/licences/ALL-RIGHTS-RESERVED`.
`apps/einvoice-preflight/LICENSE` keeps a note that its baseline is the MIT
free edition at `ventures/einvoice-preflight` (commit `8e9e26d5`), which stays
MIT as published. The old "see ../LICENSE, part 2" comments now say
"see ../LICENSE".

## Verification (this session)

- `node --test pro/*.test.mjs`: 263/263.
- `node --test worker/*.test.mjs`: 9/9.
- `node --test --test-concurrency=4 *.test.mjs`: 2,231 pass, 149 skipped,
  1 fail: the poppler test in `repair-facturx.test.mjs` calls
  `pdfdetach -save`, which this container's wrapper refuses ("Saving is
  switched off"). It is skipped where poppler is absent, as on a stock runner.
- `apps/einvoice-site`: `node build.mjs` and `node --test test/*.test.mjs`, 35/35.
- `ci_policy_check.py`: the two new workflows are read-only and secret-free.

## Next

1. A `priv-einvoice-deploy.yml` here (from the private
   `einvoice-preflight-deploy.yml` and `worker/provision.mjs`), with
   `apps/einvoice-preflight` and `packages/` in CODEOWNERS. Then run it, and
   point einvoice-site's CTA at the Worker's `/app` (ROADMAP Next 1).
2. Biome on `apps/einvoice-site` in CI once the root workspace (PR #19571) is
   in.
3. Port private commits after `0c4bf8e8`, then remove the private copy.
