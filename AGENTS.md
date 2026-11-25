# Agent instructions

Start from what to build: the ranked paid bets in
[`portfolio/monetization/bets.md`](portfolio/monetization/bets.md) and
`prompts/goals.md`, "North star" and "Where effort goes" (owner, 2026-11-24:
$10k MRR, vertical software for small and medium businesses, chosen by
promise rather than sunk cost). Where anything below pulls the other way
(free, static, no accounts, deepen what exists), those win.

Skim [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) by section headings
(`grep -n '^## '`; it is ~15k tokens, so read only what your task needs), then
[`prompts/ventures/prompt-1.md`](prompts/ventures/prompt-1.md) (its depth rules
win over anything below that pushes toward another cheap static page). Before
pushing a direction-only change, run
`python3 portfolio/ledger/check_direction_only.py`; it exits 1 if only this
file and `DIRECTION.md` changed. This file is how to execute the strategy in
this repo.


## Your job

**Build products people pay for.** Ship features, fix bugs, improve UX,
write niche SEO content, wire usage analytics, and deploy runnable software.
Default to action on `ventures/*`, not portfolio administration.

SEO now ranks near the top (owner, 2026-10-16; `prompts/goals.md`): on the
Pages site and in each venture's `README.md`, so strangers can find what we
ship. Shared-template fixes beat one-page edits.

A good session ends with something a user could run, click, or install — not
with a document about what should be built.

Research is a peer portfolio, not part of this file's scope: work under
`research/` follows [`research/CLAUDE.md`](research/CLAUDE.md).

## Using the tools themselves

To get a number from one of the tools (to check your own change, or because
the task needs one), call its engine instead of driving a browser:
`node platform/agents/tools.mjs search <words>`, then `describe <slug>`, then
`call <slug> <function> --input '{...}'`. See
[`platform/agents/README.md`](platform/agents/README.md).

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
`python3 platform/ci/unlanded_work.py` exits 0. Pushed-but-never-opened
branches are how finished work here has gone missing.

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

- Are a ranked bet in `portfolio/monetization/bets.md`, or the front door to one
- Deliver high value to one kind of business (especially: help it earn or save money)
- Keep each customer's running cost well under their price (margin counts toward MRP)
- Need no new spend an agent would have to start: the owner switches on paid
  infrastructure; build the hosted path ready and document what it needs

(Until 2026-11-24 this list asked for "free and full-featured" products and
"no new spend" at launch; the North star replaced that.)

Prefer the most promising product over the most built one (owner,
2026-11-24: "we don't invest dev effort in sunken ships"). Before a new venture, run
`python3 portfolio/pipeline/duplicate_check.py "<one-line niche>"` and name
where its first real visitor comes from (`PRODUCT_PLAYBOOK.md` §1). Before
copying a sibling's feature (share link, save slot, export), check the
venture's row in `portfolio/usage/usage.yaml`. `usage.yaml` zero means
unmeasured, not unwanted: GitHub Pages self-reports nothing.

**Deploying is cheap, so deploy what a bet needs.** The site redeploys on
every merge that touches a site input (`.github/workflows/priv-portfolio-pages.yml`),
so merging is publishing; built work that is not a bet or its front door
does not jump the queue just because it exists.

Use traditional software patterns. Add AI where it clearly helps; avoid
AI-wrapping by default.

## Ship fast

Judgment first: these are defaults, not a ritual (`CLAUDE.md`, top).

- **Merge when verified, yourself.** No human review gate; fix forward;
  `ventures/*` included. Open the PR at your first push.
- **Verify with the workflows' own steps:**
  `python3 platform/ci/run_workflow_locally.py --for-changes`, and for a
  `ventures/**` or `platform/pages/` surface, `python3 platform/ci/browser_checks.py`
  (a missing Playwright exits 2: a skip, not a pass). Say in the PR what ran.
- **Classify red CI before debugging:** `python3 platform/ci/ci_starvation.py --run <run_id>`
  (`.github/prompts/verify-and-merge.md`, "Reading CI").
- **Don't re-verify** PRs `python3 portfolio/ledger/verification_status.py`
  reports unchanged, and avoid landing ledger prose alone
  (`python3 portfolio/ledger/check_ledger_only.py`).

Flag the owner only for the owner-only items in `CLAUDE.md` ("Ship without
review ceremony"): money, accounts, publishing under the portfolio's name,
paid automation, secrets. Payment code on the deployer's own keys is fine
(`prompts/goals.md`).

## Every user-facing product includes

1. **Liability disclaimers** — no advice-of-record, no compliance warranties,
   and no SLA on hosted URLs. Copy the wording from
   [`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md) §5b; it goes in the README
   *and* somewhere the user sees it (footer, about, `--help`). A page that
   names a specific competitor (`vs-<competitor>.html`) needs a second,
   separate disclaimer — §5f, nominative fair use plus a "not affiliated
   with" line — checked by `node platform/pages/clauses.mjs <slug>`.
2. **Usage stats** — anonymous aggregate events (feature used, page viewed,
   kind of referring site) on by default; anything that identifies a returning
   browser only with the consent the law requires; nothing personal committed.
   Follow the law, no stricter (owner, 2026-10-20): cookies a feature needs are
   fine. Rules and the file readings land in: [`portfolio/usage/`](portfolio/usage/README.md).
3. **A paid tier where the product has depth** (owner, 2026-11-24; replaces
   "free full access for now"): the checkout ships dark until the owner sets
   it (`prompts/goals.md`, "Payments"), and nothing the site already promises
   as free goes behind a paywall.
4. **A LICENSE and the discoverability basics** — landing copy in the user's
   search words, meta description, JSON-LD, sitemap, crawlable robots.txt.
   Search and AI-assistant discovery are the growth channel, so they ship with
   v0, not later. Checklist: `PRODUCT_PLAYBOOK.md` §5e.

**Building one from scratch?** `PRODUCT_PLAYBOOK.md` is the step-by-step:
picking a niche (start from `bets.md`), shapes, the API-key switch, and the
definition of done.

## Graduating from the pipeline

A product with an `index.html` is on the Pages site once it merges, so there
is usually no deploy step to do first; a product that needs a process ships
for its users to run ([`portfolio/hosting/`](portfolio/hosting/README.md)).
If something on `main` still has no public URL, fixing that tends to beat
starting something new.

Pipeline candidates come after the ranked bets. If `session_gate.py` names a
`build-now` candidate that serves a bet's customers, graduate it:

- `graduate_as: venture` → create `ventures/<slug>/VENTURE.yaml` and build
- `graduate_as: product-line` → add slug under host venture's `product_lines`

Otherwise take the next ranked bet; a new niche goes into `bets.md` with its
evidence before it gets a build.

## Git hygiene

- Avoid writing `fixes #N` / `closes #N` when referring to someone else's PR —
  GitHub closes the PR unmerged. Say "per #109" or "resolved the conflict on #109".
- One logical change per commit; push your branch, open its PR, and merge
  it. Work pushed after that PR merges needs a **new** PR.
  `python3 platform/ci/unlanded_work.py` exits 1 while anything on your
  branch is outside a PR and `main`.

## Venture-specific notes

Each venture may have its own `AGENTS.md` (framework rules, doc conventions).
Those add constraints; they do not override the product-first direction above.
