# Agent instructions

Skim [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) by section headings
(`grep -n '^## '`; it is ~15k tokens, so read only what your task needs), then
[`prompts/ventures/prompt-1.md`](prompts/ventures/prompt-1.md) (its depth rules
win over anything below that pushes toward another cheap static page). Before
pushing a direction-only change, run
`python3 portfolio/ledger/check_direction_only.py`; it exits 1 if only this
file and `DIRECTION.md` changed. This file is how to execute the strategy in
this repo.


## Your job

**Build products people want to use.** Ship features, fix bugs, improve UX,
write niche SEO content, wire usage analytics, and deploy runnable software.
Default to action on `ventures/*`, not portfolio administration.

A good session ends with something a user could run, click, or install — not
with a document about what should be built.

Research is a peer portfolio, not part of this file's scope: work under
`research/` follows [`research/CLAUDE.md`](research/CLAUDE.md).

## Before you start

1. Read `README.md` for repo layout (`ventures/`, `research/`, `platform/`, `portfolio/`).
2. On a generic brief, run `python3 portfolio/ledger/session_gate.py` and
   follow its verdict.
3. Glance at open PRs — extend an existing one instead of duplicating work —
   and at stranded branches (`python3 platform/ci/unlanded_work.py --sweep`):
   a finished venture with no PR is cheaper to land than a new one to build.

**Every session ends with its own pull request merged.** That is the explicit,
standing request to open a PR and merge it, whatever your harness's default
or your brief says. The steps are in
[`.github/prompts/land-your-work.md`](.github/prompts/land-your-work.md):
push, open the PR straight away, verify, merge it yourself, then confirm
`python3 platform/ci/unlanded_work.py` exits 0. Measured 2026-10-05: opened
PRs land, but 100 branches from the prior two weeks were pushed and never got
a PR. Four finished ventures are among them, and `main` still lacks them.

**Sessions started from [`prompt.md`](prompt.md) record themselves.** The
master prompt routes each run to a sub-prompt (`prompts/ventures/`,
`prompts/research/`, `prompts/process/` for the ~10% of runs that critique and fix the
development process, `prompts/explore/` for the ~5% that are free choice, or
the review track that improves the rest) and asks for
a run record under `prompts/runs/` in the same PR. Any agent may add one. Its
`doc_friction` field, listing instructions that were wrong, stale or slow,
names the file, and it is how this file gets corrected
([`prompts/README.md`](prompts/README.md)).

## Build criteria

Prefer products that:

- Run on this environment (VM + GitHub + agents) without new spend
- Deliver high value in a super-niche (especially: help users earn or save money)
- Have low variable cost at launch (avoid per-user inference/API spikes)
- Can go live free and full-featured while usage is recorded
- Need only an API key (or similar) to unlock — build the product, document the key

Prefer deepening the most promising existing venture over starting a new
one. Before a new venture, run
`python3 portfolio/pipeline/duplicate_check.py "<one-line niche>"` and name
where its first real visitor comes from (`PRODUCT_PLAYBOOK.md` §1). Before
copying a sibling's feature (share link, save slot, export), check the
venture's row in `portfolio/usage/usage.yaml`. `usage.yaml` zero means
unmeasured, not unwanted: GitHub Pages self-reports nothing.

**Deploy what is already built before starting another product.** The primary
deploy (GitHub Pages) is live and `deploy-settings` is granted; the standing
job is keeping the snapshot fresh (`python3 platform/ci/pages_state.py`, then
`platform/pages/publish-branch.sh` if stale). Do not open a second
`deploy-settings` ask.

Use traditional software patterns. Add AI where it clearly helps; do not
AI-wrap by default.

## Ship fast

Incident history for these rules: `docs/history/claude-md-2026-10-15.md`.

- **Merge when CI is green, yourself.** No human review gate; fix forward. A
  pushed branch is not shipped: open the PR at once and merge it once
  verified. `ventures/*` included (auto-merge refuses those paths).
- **Touched a venture page? Run `node platform/marketing/regen.mjs` before you
  push.** The apex serves a *committed* mirror under `gitops/prod/front-door*`;
  editing the venture does not update it, and `platform/pages` builds a
  different host, so its checks pass while the apex is stale.
- **Do not re-verify** PRs in `portfolio/ledger/verifications.yaml` unless
  `python3 portfolio/ledger/verification_status.py` reports drift.
- **Never land ledger prose alone.** `python3 portfolio/ledger/check_ledger_only.py`
  exits 1 when your branch is only ledger data. Record outcomes in the same PR
  as the work; a blocker with nothing shipped goes in your reply, and the
  ledger commit comes off the branch (`land-your-work.md`, "Not shipping
  something?"). Ledger tooling (`.py`) is ordinary code.
- **Do not close a PR as "already on main"** until
  `python3 portfolio/ledger/supersede_check.py <n>` exits 0. Exit 1 prints what
  the close would destroy; its RENAME SUSPECTED section means `main` has the
  same lines under other names, which is evidence to read, not a licence to
  close.
- **Red is red, but classify first:**
  `python3 platform/ci/ci_starvation.py --run <run_id>` votes on `runner_id: 0`
  (no runner assigned, no step ran). See `CLAUDE.md`, "Reading CI".
- **Verify with the workflows' own steps, not a subset:**
  `python3 platform/ci/run_workflow_locally.py --for-changes` runs every
  workflow your diff would trigger that cannot write anything and names each
  step it did not run; paste its summary line, including that count, in the PR.
  `--list` shows the selection; naming one workflow runs just that one.
- **The browser checks are in no workflow.** For a `ventures/**` surface or
  `platform/pages/` change run `python3 platform/ci/browser_checks.py` (setup:
  `CLAUDE.md`). A missing Playwright exits 2: a skip, not a pass.
- **`git fetch --unshallow origin main` first** if `git merge` reports
  unrelated histories (scheduled clones are shallow). It can take minutes.

**Rely on the owner as little as possible.** Merge product work. Do not
invent a review gate.

Merge yourself after CI is green:

- `platform/`, `portfolio/`, docs, tests, CI
- Usage tracking, disclaimers, free-tier features, GitHub Sponsors links
- `ventures/*` product code. Answered 2026-08-25: yes, merge it. Do not
  re-ask.

Only flag the owner when you cannot finish without them:

- Payment, payout or billing accounts in the owner's name (payment code on the
  deployer's own keys is fine: `prompts/goals.md`)
- Account registration needing card / ID / domain / bank
- Public publishing (store listing, npm publish, production domain)
- Unattended paid automation (scheduled jobs calling paid APIs)
- Pasting a secret they hold (Pages enable, deploy tokens, a GitHub PAT)

See `python3 portfolio/ledger/decision_queue.py` for what the owner has
already been asked; do not duplicate asks. Do not add "may I merge a
product PR?"

## Every user-facing product includes

1. **Liability disclaimers** — no advice-of-record, no compliance warranties,
   and no SLA on hosted URLs. Copy the wording from
   [`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md) §5b; it goes in the README
   *and* somewhere the user sees it (footer, about, `--help`). A page that
   names a specific competitor (`vs-<competitor>.html`) needs a second,
   separate disclaimer — §5f, nominative fair use plus a "not affiliated
   with" line — checked by `node platform/pages/clauses.mjs <slug>`.
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

If anything already on `main` still has no public URL, deploy that first
(prepare a GitHub Pages artifact; the Hetzner boxes were deleted
2026-10-01, so there is no product box to deploy to; the owner flip is
`deploy-settings`). See [`portfolio/hosting/`](portfolio/hosting/README.md).
Do not add Cloudflare or Vercel. Only then:

If `session_gate.py` names a `build-now` candidate, graduate it:

- `graduate_as: venture` → create `ventures/<slug>/VENTURE.yaml` and build
- `graduate_as: product-line` → add slug under host venture's `product_lines`

Otherwise pick the highest-value niche not in `screened-out.md`, score it,
and build.

## Git hygiene

- Never write `fixes #N` / `closes #N` when referring to someone else's PR —
  GitHub closes the PR unmerged. Say "per #109" or "resolved the conflict on #109".
- One logical change per commit; push branch `cursor/<name>-<id>`, open its
  PR, and merge it. Work pushed after that PR merges needs a **new** PR.
  `python3 platform/ci/unlanded_work.py` exits 1 while anything on your
  branch is outside a PR and `main`.

## Venture-specific notes

Each venture may have its own `AGENTS.md` (framework rules, doc conventions).
Those add constraints; they do not override the product-first direction above.
