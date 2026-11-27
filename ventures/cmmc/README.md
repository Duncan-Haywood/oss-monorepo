# CMMC Workspace: CMMC Level 1/2 and ISO 9001 for small defense and aerospace shops

Bet #4 in [`portfolio/monetization/bets.md`](../../portfolio/monetization/bets.md). A hosted workspace
where a small machine shop or other defense supplier **prepares** its own CMMC self-assessment: each
Level 1 (FAR 52.204-21) and Level 2 (NIST SP 800-171 Rev. 2, 110 requirements, 320 objectives)
requirement with its status, owner, notes and evidence; the System Security Plan; the POA&M with the
32 CFR 170.21 eligibility rules; the SPRS score; affirmation dates; the asset inventory and external
service providers scoped by 32 CFR 170.19; personnel and training records; supplier flow-down under
DFARS 252.204-7021; security policies; and an ISO 9001:2015 checklist with document control, internal
audits and corrective actions. Hosted SaaS on Cloudflare Workers, sold by subscription through the
owner's merchant of record (Paddle), dark until the owner sets the Paddle keys.

**Not a certification, not a C3PAO, not government-endorsed.** It produces self-assessment working
documents; the organization's affirming official affirms in SPRS, and the app never submits anything.
Do not store CUI in it. The regulations govern, not this app.

**Source visible, all rights reserved** ([LICENSE](LICENSE)). Publishing this directory grants no
licence to use, host or resell it.

## Why someone would use it

DoD estimates 337,968 affected contractors, 229,818 of them small, and Level 1 and Level 2
self-assessments stay required while Phase 2 is suspended (sources in `bets.md`). Today a small
shop's choices are a consultant (about $3k to $25k for an SSP and POA&M), spreadsheets, or
compliance platforms such as FutureFeed ($99/$399 a month) and PreVeil Pass ($450 a month for three
users). CMMC Workspace is priced for a shop of a few people (Level 1 free, Level 2 $249, Level 2 +
Quality $399 a month; `apps/cmmc/src/shared/plans.ts`, proposals until the first paying shop),
reads the shop's existing spreadsheets (self-assessment workbook, POA&M, asset list, a provider's
customer responsibility matrix, training reports) instead of making it start over, quotes the rule
behind every check, and keeps CMMC and ISO 9001 evidence in one place for the same quality manager.
AI drafts implementation statements only from the shop's own notes, marks unknowns
`[CONFIRM: …]`, and nothing reaches the SSP until a person accepts it. Free front doors: the CMMC
pages in [`machine-shop-guides`](../machine-shop-guides/) and the site's SPRS score calculator
(`apps/cmmc-site`). Same buyers as bet #2, [`jobshop-quote`](../jobshop-quote/).

## Layout

A self-contained pnpm workspace, moved here from `private-monorepo` on 2026-11-27 (task
`move-cmmc-public` in [`portfolio/work/tasks.yaml`](../../portfolio/work/tasks.yaml)); the
relative paths inside are the same as there.

| Path | What |
| --- | --- |
| `apps/cmmc` | the app: Hono API + React SPA in one Worker, D1, R2 ([README](apps/cmmc/README.md), [roadmap](apps/cmmc/ROADMAP.md), [sources](apps/cmmc/docs/SOURCES.md)) |
| `apps/cmmc-site` | the marketing site, the free SPRS score calculator and the early-access sign-up (no dependencies) |
| `packages/billing` | Paddle billing port, plans, entitlements, the margin-floor check |
| `packages/admin-metrics` | the owner-console metrics contract |
| `scripts/` | the no-source-maps check |
| `docs/legal/OPERATOR.md` | operator and launch authority |

`packages/billing` and `admin-metrics` also exist in the other moved products' workspaces
(`ventures/payapps`, `ventures/jobshop-quote`, while their move PRs are open); each workspace builds on
its own copy so none reaches outside its directory. Folding them into one shared package is a later step.

## Run it

```sh
cd ventures/cmmc
pnpm install --frozen-lockfile
cd apps/cmmc
cp .dev.vars.example .dev.vars && pnpm db:migrate:local && pnpm dev   # offline, fake LLM, no keys
pnpm typecheck && pnpm test:unit && pnpm test:worker && pnpm build
cd ../cmmc-site && node src/build.mjs && node --test test/*.test.mjs
```

CI: [`.github/workflows/cmmc-ci.yml`](../../.github/workflows/cmmc-ci.yml) (read-only, no secrets).
Deploying: [DEPLOY.md](DEPLOY.md).

## Where the work happens

Until the deploy is ported (DEPLOY.md), `private-monorepo/apps/cmmc` is still where scheduled runs
build, and this copy is a snapshot of private-monorepo commit `5f0757c7` (2026-11-27). Refresh it with
[`sync-from-private.sh`](sync-from-private.sh), which runs the pre-publication audit first. Once the
public deploy works, the private copy is removed and this directory becomes the one source.
