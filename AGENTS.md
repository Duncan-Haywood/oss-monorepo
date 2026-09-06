# Agent instructions

Read [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) first — start with its
"North star" section for the six-point version (deploy what's built, new
ventures rank first as the owner's standing preference, donations only, keep
customers happy by shipping working/honest products, market the products
within the fair-use rules — enforced automatically in CI, not a manual
re-derivation — and legal exposure is the one hard stop), then its "Owner
direction, relayed again" section right after for the five-minute version of
the same brief with today's numbers attached, and its "Fast scan for what
should this session do" checklist right after that. This file is how to
execute that strategy in this repo.

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

**As of 2026-09-06 the primary deploy (GitHub Pages) is done and confirmed
current** — `deploy-settings` is granted, ~175 products are live at
`https://duncan-haywood.github.io/monorepo-projects/`, and the standing job
is just keeping the snapshot fresh (`python3 platform/ci/pages_state.py`,
then `platform/pages/publish-branch.sh` if stale). With distribution solved,
default to reading [`portfolio/usage/usage.yaml`](portfolio/usage/README.md)
first and improving a product with an actual signal, over adding depth to
one that has had a fair run at zero. See `portfolio/DIRECTION.md`
"What changes now that distribution is solved" for the full priority order,
including when a new venture is and isn't the better use of the session.

**Before copying a feature onto a venture just because a sibling venture has
it** (a share link, a save slot, an export format), check that venture's row
in `portfolio/usage/usage.yaml`. As of 2026-09-06, 55 of 185 ventures had a
`share.mjs` added this way with zero usage signal on any of them to justify
it, while new, non-duplicative niches are always welcome. See
`portfolio/DIRECTION.md` "The fleet-parity trap, and where new ventures
actually stand" — a new venture or a real discoverability fix now outranks a
parity feature on a product nobody has visited yet.

**New ventures now rank first, not last, and the pipeline's `build-now`
queue is genuinely empty** (added 2026-09-06) — five candidates that had
already shipped were still marked unbuilt in `candidates.yaml` (a
`session_gate.py` misdirection risk, now fixed). The next new-venture
session screens a fresh niche against `portfolio/pipeline/screened-out.md`
and the liability/ethics gates, not the queue. See `portfolio/DIRECTION.md`
"Owner direction, 2026-09-06" for the full read, including why legal
exposure (not speed) is still the one hard stop.

**Raise the bar on graduating the next one, not just the count** (added
2026-09-06, North star point 2) — 195 ventures now exist with zero confirmed
visitors anywhere in `usage/usage.yaml`. Before graduating a fresh niche,
name where its first real visitor comes from (a specific forum, subreddit,
or search phrase with real volume), the same evidence `PRODUCT_PLAYBOOK.md`
§1 already asks for. And do not read the fleet-wide `usage.yaml` zero as
"nobody wants these" — GitHub Pages, the route actually serving, self-reports
nothing, so right now that field is unmeasured, not measured-and-zero; see
`portfolio/DIRECTION.md` North star point 2 for the full correction.

Use traditional software patterns. Add AI where it clearly helps; do not
AI-wrap by default.

## Ship fast

- **Merge when CI is green.** No human code review gate. Fix forward.
- **Touched a venture page? Regenerate the served surface before you push:**

  ```
  node platform/marketing/regen.mjs
  ```

  The apex is the only host serving anything, and what it serves is a
  *committed* artifact under `gitops/prod/front-door*` built from the venture
  tree by two generators. Editing a venture page does not update it. Nothing
  else you run will tell you: `platform/pages/build.mjs` and `check.mjs` build
  `tools.marisstella.dev`, a different host, and both pass happily while the
  apex is stale.

  On 2026-09-05 #3256 added a comparison page and skipped this. The page was
  mirrored nowhere and missing from the apex's sitemap — built, deployed, and
  findable by nobody — and `main` went red on six tests. #3257 and #3258 then
  each ran *one* of the two generators, because that is what the failing test
  named, and each reported success. Three sessions, three hours, one page
  still dark. The hints now name `regen.mjs`, which runs every generator, but
  that only reaches you once a test is already failing; this bullet is for the
  case where you never run those tests at all, which is what #3256 did.
- **Do not re-verify** PRs recorded in `portfolio/ledger/verifications.yaml`
  unless `python3 portfolio/ledger/verification_status.py` says drift
  invalidated them.
- **Never land a change that is only ledger prose.** Not "avoid" — never.
  Gate it mechanically before you push:

  ```
  python3 portfolio/ledger/check_ledger_only.py
  ```

  Exit 1 means every file in your branch is `portfolio/ledger/` data, and the
  branch is not a deliverable. This bullet used to read "do not open
  ledger-only PRs *that re-state known blockers*", and that escape hatch ate
  the rule: in the seven days to 2026-09-02 the fleet landed **381 commits on
  `main` touching nothing but ledger YAML — 34.6% of 1,102** — because every
  session read its own entry as the new one. A third of the fleet's output
  went into describing the other two thirds.

  Recording an outcome is still right, and still cheap. It just **rides with
  the work it describes** — same commit, or same PR. The ledger is a footnote
  to a shipped thing, not a thing that ships.

  If a session genuinely found a blocker instead of shipping: say so in the
  reply and leave `main` alone. An unshipped session is a real outcome and
  does not need a commit to be true. The ledger *tooling* (`.py` under
  `portfolio/ledger/`) is exempt and passes the check — it is ordinary
  platform code.
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
- **A red check is a failed check again, as of 2026-09-01.** This bullet read
  "a red check is not a failed check right now" for five days, and that is no
  longer true: Actions began assigning real runners again at
  2026-09-01T00:00:53Z, and #2601 went green on merit that evening (`gitops`
  ran `kustomize build`, `kubeconform` and 193 pytest cases on runner
  `1000040xxx`). Treat red as red, and fix it.

  The old signature is still worth knowing, because the ceiling appears to
  **cycle** rather than to be gone — the recovery landed at 00:00:53Z on the
  first of the month, which is what a metered minute allowance resetting looks
  like. If starvation returns it looks like this: every workflow fails in 3-6
  seconds with no runner, so checks arrive *red* rather than absent, including
  on `main`; the job has empty check-run output and 404s on log download; and a
  real `Portfolio validate` installs Python and Node and runs 36 steps, so it
  cannot finish in five seconds. The single field that settles it is
  `runner_id: 0` with an empty `runner_name` — no runner was ever assigned, so
  no step ran. Do not judge that by eye: run
  `python3 platform/ci/ci_starvation.py --run <run_id>`, which votes on that
  one field. See `CLAUDE.md`.
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
