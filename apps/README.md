# apps/ and packages/: the paid products

The for-profit apps and their shared packages. They moved here from the private
repository `Duncan-Haywood/private-monorepo` on 2026-11-26, as a copy of its tree at
commit `b1b7c3f63ce289c4051d8506eb0744856350f80e` (not its git history). Owner,
2026-11-26: move them "as a priority". GitHub Actions in the private repository started no
jobs (private minutes are metered, and the account's spending limit blocked them), so no
paid app could be tested or deployed. Public-repository Actions are free.

| Directory | Product | Rank in `portfolio/monetization/bets.md` |
|---|---|---|
| `apps/payapps`, `apps/payapps-site` | PayApps: AIA pay applications, lien waivers, retainage for subcontractors | #1 |
| `apps/jobshop-quote`, `apps/jobshop-site` | Job-shop RFQ to quote | #2 |
| `apps/einvoice-preflight`, `apps/einvoice-site` | E-invoice preflight (paid layer in `pro/`) | #3 |
| `apps/seller-books`, `apps/seller-books-site` | Reseller profit and Schedule C books | #5 |
| `apps/cmmc`, `apps/cmmc-site` | CMMC Level 1/2 self-assessment workspace | #4 |
| `apps/wall-framing-takeoff` | Wall-framing takeoff (residential takeoff) | #6 |
| `packages/billing` | Paddle checkout, webhooks, entitlements, catalog sync | (shared) |
| `packages/lien-waivers` | Statutory lien-waiver text, checked against official snapshots | (#1) |
| `packages/qbo-sync` | QuickBooks Online sync (optional, off) | (#1) |
| `packages/cad-features` | CAD feature extraction (STEP) | (#2) |
| `packages/trust-page` | Trust and security pages built from cited repository facts | (shared) |

`docs/trust/` (security policies, CAIQ answers, DPA template, subprocessors) came across
with them.

## Layout, and why

One pnpm workspace at the repository root: `pnpm-workspace.yaml` lists `apps/*` and
`packages/*` only, with the root `package.json`, `pnpm-lock.yaml`, `tsconfig.base.json` and
`biome.json`. The paths are the same as in the private repository, so every relative
import, `workspace:` dependency and workflow path filter carried over unchanged.

Not under `ventures/`: that directory holds about 1,450 independent single-folder
projects that the catalogue build publishes. These apps are a linked workspace with shared
packages and are not static pages. The root workspace file does not touch the ventures:
they use npm (which ignores `pnpm-workspace.yaml`), and the one pnpm venture
(`ventures/retail-pilot-intel`) has its own workspace file, which pnpm finds first. No
venture uses biome, and the root `lint` script checks only `apps` and `packages`.

Two apps began as public ventures and still have their free edition there:
`ventures/einvoice-preflight` and `ventures/wall-framing-takeoff`. The copies here are the
newer, paid superset (each has a `PROVENANCE.md`).

```sh
pnpm install --frozen-lockfile                 # Node 22, pnpm 10 (corepack)
pnpm --filter "{./apps/payapps}..." test       # one app and its workspace deps
pnpm -r typecheck && pnpm -r test && pnpm -r build
```

## Licence

The root `LICENSE` (FSL-1.1-MIT) covers this code. The private repository's
"proprietary" notices were replaced on the move. `apps/einvoice-preflight/LICENSE` and
`apps/wall-framing-takeoff/LICENSE` keep the MIT licence of their public baseline (part
1) and put later work under FSL-1.1-MIT (part 2). Third-party files keep their own notices
(each app's `PROVENANCE.md`; e.g. the MIT NF-e corpus in
`apps/einvoice-preflight/eval/nfe-corpus`, already public in
`ventures/einvoice-preflight`, and the Apache-2.0 STEP fixtures in `packages/cad-features`).

## Checks made before publishing

- **Secrets:** gitleaks with this repository's config (`platform/security/gitleaks.toml`)
  over every moved file. 22 hits, all test placeholders. 18 were in `apps/grants` (not
  moved). The other four are made-up test values, marked `gitleaks:allow` on their line.
- **Personal data:** every email address in the tree was listed and read. Two test
  fixtures put invented people at domains that may belong to real organisations
  (`harborbuilders.com`, `nmfoundation.org` and two others). They now use reserved
  `.example` domains. The remaining real-looking addresses are inside the
  already-published NF-e corpus.
- **Customer data:** see "What stayed private".
- **Licences:** every nested LICENSE and third-party notice read (above).

## What stayed private

- **`apps/grants`** (Grant Autopilot). It names its first client throughout (59 files),
  and that client sends documents under an NDA (`docs/onboarding/IMPORTING_DOCUMENTS.md`
  there). Publishing it would make the client relationship public, which the NDA may not
  allow. It can move once the client's name and any fixtures drawn from their material
  are replaced with invented ones, or the client agrees. Until then it stays in the
  private repository. Many files here still cite `apps/grants/...` as the pattern they were
  copied from; those paths now exist only there. The trust page's grants profile stays
  in `packages/trust-page` as a test fixture, but is not published (`PROFILES`).
- **The private repository's `infra/aws/payments`**: this repository's
  `platform/aws/stacks/saas-starter/payments` replaces it.
- **`scripts/import-venture.mjs`**: it imported public ventures into the private
  repository, which no longer happens.

## Gates lifted (owner, 2026-11-26)

- **Deploys:** no more "deploy by hand only until launch". Deploys run on every merge to
  `main` once their settings exist. The apps are moving off Cloudflare to the AWS SaaS
  starter, so their Cloudflare deploy workflows were not ported. Settings, and what
  deploys today: [`docs/runbooks/paid-apps-secrets.md`](../docs/runbooks/paid-apps-secrets.md).
- **Legal pages:** the "Draft ... have counsel review it before launch" banner is gone from
  every app's terms, privacy, refund and acceptable-use pages, and the bundled
  `documents.ts` files were regenerated. There is no outside counsel; a sibling
  agent session does the legal review and **owns the content of these pages**. Older
  notes that still say "counsel" in `ROADMAP.md` and `docs/` are superseded by this
  section.
- **Checkout:** `BILLING_PROVIDER` defaults to `paddle` when both Paddle secrets exist,
  and to `none` otherwise (`packages/billing/src/factory.ts`; grants had its own copy).
  An explicit `none` still switches checkout off.

## CI

`.github/workflows/apps-<name>-ci.yml`, one per app or package, ported from the private
repository. They run on pull requests, hold no secrets, have read-only permissions, and
use actions pinned to the SHAs in `.github/ci-policy.yaml`.
