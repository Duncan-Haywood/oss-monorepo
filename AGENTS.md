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
- **Do not close a PR as "already on main"** until
  `python3 portfolio/ledger/supersede_check.py <n>` exits 0. Exit 1 prints the
  lines the close would destroy. See `CLAUDE.md` for why: the claim has been
  wrong three times in one hour, and each time the feature existed only on the
  branch being closed.

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

1. **Liability disclaimers** — no advice-of-record, no compliance warranties.
   Copy the wording from [`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md) §5b; it
   goes in the README *and* somewhere the user sees it (footer, about, `--help`).
2. **Usage stats** — anonymous events only (feature used, page viewed), never
   people: no PII, no IPs, no content, no analytics vendor. Rules and the file
   readings land in: [`portfolio/usage/`](portfolio/usage/README.md).
3. **Free full access** for now — no paywalls; optional GitHub Sponsors/donate link OK.
4. **A LICENSE and the discoverability basics** — landing copy in the user's
   search words, meta description, JSON-LD, sitemap, crawlable robots.txt.
   Search and AI-assistant discovery are the growth channel, so they ship with
   v0, not later. Checklist: `PRODUCT_PLAYBOOK.md` §5e.

**Building one from scratch?** `PRODUCT_PLAYBOOK.md` is the step-by-step:
picking a niche, shapes that cost $0 per user, the API-key switch (product works
fully without a key; a user's own key unlocks the AI parts), and the definition
of done.

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
