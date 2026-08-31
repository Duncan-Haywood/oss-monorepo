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

**Deploy what is already built before starting another product.** If a
venture on `main` still has no public URL, that deploy is the next task.
See [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) "Current priority".
Do not open a second `deploy-settings` ask.

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
- **Read the RENAME SUSPECTED section if the report prints one.** Exit 1 with
  that section means the branch's lines are `main`'s own lines with the
  identifiers changed — `largestCostComponent` where `main` says
  `largestCostDriver`. The report prints each pair and the file the twin lives
  in. Merging that branch adds a duplicate button or a weaker copy of a live
  function; it is not new work. It is still not a licence to close unread — the
  one word that differs can be the point of the branch.
- **A red check is not a failed check right now.** The repo-wide runner outage
  (owner decision #1849) fails every workflow in 3-6 seconds with no runner, so
  checks arrive *red*, not absent — including on `main` and on the commit that
  queued the outage. An outage job has empty check-run output and 404s on log
  download; a real `Portfolio validate` installs Python and Node and runs 36
  steps, so it cannot finish in five seconds. Verify locally, record what you
  ran, and do not "fix" code the check never executed. See `CLAUDE.md`. The
  single field that settles it is `runner_id: 0` with an empty `runner_name` —
  no runner was ever assigned, so no step ran.
- **Verify with the workflow's own step list, not a subset you chose — and
  with every workflow your change would start, not just the one you know.**

  ```
  python3 platform/ci/run_workflow_locally.py --for-changes
  ```

  That reads the `paths:` filter on every workflow, works out which ones your
  current diff against `origin/main` would trigger, and runs the jobs among
  them that cannot write anything (holding, and naming, any job that grants a
  write permission or reads a secret). Prefer it to naming a single workflow.
  Naming `portfolio-validate.yml` alone is how a `FAQPage` whose JSON-LD did
  not match its own visible copy reached `main` on 2026-08-30: the guard that
  catches it lives in `portfolio-pages.yml`, which runs on any `ventures/**`
  change, and the session that merged verified the wrong workflow. Add
  `--list` to see the selection without running it.

  To run one workflow by name:

  ```
  python3 platform/ci/run_workflow_locally.py portfolio-validate.yml
  ```

  It reads `.github/workflows/<file>` and runs its `run:` steps in order, in
  each step's working directory, then reports what passed and names every step
  it did *not* run (`uses:` steps, steps needing a `${{ }}` expression, steps
  that look like they would push or deploy). Improvising a subset instead is
  how `main` came to be failing two `Portfolio validate` steps for days in
  August: several sessions each verified locally before merging, and none of
  their subsets happened to include `check_ask_hosts.py`. Paste the summary
  line into the pull request — including the count it says did not run, which
  is the part that keeps "verified locally" honest.
- **No workflow covers the browser.** `run_workflow_locally.py` runs what CI
  would run, and CI never ran the six checks in `platform/pages/` — they need
  Playwright, which is not a dependency of this repo. They are the only thing
  that catches a page which renders perfectly and computes nothing. When your
  change touches a `ventures/**` surface or `platform/pages/`, run them:

  ```
  PLAYWRIGHT=$(npm root -g)/playwright/index.js python3 platform/ci/browser_checks.py
  ```

  It builds into a temporary directory (so nothing stale can be verified by
  accident), serves it, and refuses to start unless the origin echoes a
  sentinel token it just wrote — the leftover-server false pass that cost a
  clean report on 2026-08-28 is an error here rather than a green run. Add
  `--checks sweep,sideways` for a subset, or `--dist <dir>` to reuse a build.
  A missing Playwright exits 2 and says so; it is a skip, not a pass.
- **`git fetch --unshallow` first.** A scheduled session's clone is shallow, so
  every branch reads as an unrelated history: no merge base, `git merge` refuses,
  and a normal PR looks like a 2,800-file catastrophe. That is the clone, not the
  branch. `supersede_check.py` now unshallows itself, but `git merge` and
  `git diff origin/main <branch>` do not.

**Rely on the owner as little as possible.** Merge product work. Do not
invent a review gate.

Merge yourself after CI is green:

- `platform/`, `portfolio/`, docs, tests, CI
- Usage tracking, disclaimers, free-tier features, GitHub Sponsors links
- `ventures/*` product code. Answered 2026-08-25: yes, merge it. Do not
  re-ask.

Only flag the owner when you cannot finish without them:

- Payment collection, payout rails, live billing
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
   *and* somewhere the user sees it (footer, about, `--help`).
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
(prepare a GitHub Pages artifact or a Hetzner product-box deploy; the
owner flip is `deploy-settings`). See [`portfolio/hosting/`](portfolio/hosting/README.md).
Do not add Cloudflare or Vercel. Only then:

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
