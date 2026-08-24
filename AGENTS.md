# Agent instructions

Read [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) first. That is the
company strategy; this file is how to execute it in this repo.

## Your job

**Build products people want to use.** Ship features, fix bugs, improve UX,
write niche SEO content, wire usage analytics, and deploy runnable software.
Default to action on `ventures/*`, not portfolio administration.

A good session ends with something a user could run, click, or install — not
with a document about what should be built.

## Before you start

1. Read `README.md` for repo layout (`ventures/`, `platform/`, `portfolio/`).
2. On a generic brief, run `python3 portfolio/ledger/session_gate.py` and
   follow its verdict.
3. Glance at open PRs — extend an existing one instead of duplicating work.

## Build criteria

Prefer products that:

- Run on this environment (VM + GitHub + agents) without new spend
- Deliver high value in a super-niche (especially: help users earn or save money)
- Have low variable cost at launch (avoid per-user inference/API spikes)
- Can go live free and full-featured while usage is recorded
- Need only an API key (or similar) to unlock — build the product, document the key

Use traditional software patterns. Add AI where it clearly helps; do not
AI-wrap by default.

## Ship fast

- **Merge when CI is green.** No human code review gate. Fix forward.
- **Do not re-verify** PRs recorded in `portfolio/ledger/verifications.yaml`
  unless `python3 portfolio/ledger/verification_status.py` says drift
  invalidated them.
- **Do not open ledger-only PRs** that re-state known blockers. Build the
  unblocked parts instead.

Agent-decidable (merge yourself after CI):

- `platform/`, `portfolio/`, docs, tests, CI — internal surfaces
- Usage tracking, disclaimers, free-tier features, GitHub Sponsors links

`python3 platform/ci/publish_surface.py` currently reports nothing live on
push to `main`. That does not make `ventures/*` app code agent-decidable
on its own — Ask 9 (`venture-gate-premise`) is still open.

Owner-only (flag only when it **blocks** product work you cannot finish):

- Payment collection, payout rails, live billing
- Account registration needing card / ID / domain / bank
- Public publishing (store listing, npm publish, production domain)
- Unattended paid automation (scheduled jobs calling paid APIs)
- Breaking changes to deployable `ventures/*` code

See `python3 portfolio/ledger/decision_queue.py` for what the owner has
already been asked; do not duplicate asks.

## Every user-facing product includes

1. **Liability disclaimers** — no advice-of-record, no compliance warranties
   (wording templates live in existing ventures' docs).
2. **Usage stats** — log anonymized events (page views, feature use, signups)
   so the portfolio can see what people actually use.
3. **Free full access** for now — no paywalls; optional GitHub Sponsors/donate link OK.

## Graduating from the pipeline

If `session_gate.py` names a `build-now` candidate, graduate it:

- `graduate_as: venture` → create `ventures/<slug>/VENTURE.yaml` and build
- `graduate_as: product-line` → add slug under host venture's `product_lines`

Otherwise pick the highest-value niche not in `screened-out.md`, score it,
and build.

## Git hygiene

- Never write `fixes #N` / `closes #N` when referring to someone else's PR —
  GitHub closes the PR unmerged. Say "per #109" or "resolved the conflict on #109".
- One logical change per commit; push branch `cursor/<name>-<id>`.

## Venture-specific notes

Each venture may have its own `AGENTS.md` (framework rules, doc conventions).
Those add constraints; they do not override the product-first direction above.
