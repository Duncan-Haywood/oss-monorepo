# Working in this repo

**Read [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) and [`AGENTS.md`](AGENTS.md)
first.** The portfolio's job is to ship products people use — not to debate
policy, re-verify old PRs, or maintain admin queues.

[`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md) is how to build one: niche
selection, product shapes with ~$0 marginal cost, the API-key switch, the
disclaimer text, the SEO/AI-discovery checklist, and the definition of done.
Usage — the metric while everything is free — is specified in
[`portfolio/usage/`](portfolio/usage/README.md).

`README.md` covers repo layout.

## Product-first default

Every session should move a venture closer to something strangers can use for
free, with usage tracked and disclaimers in place. Features, fixes, landing
pages, SEO, integrations (behind env vars), and VM-runnable apps beat ledger
entries and analysis documents.

**Deploy-first.** Products already on `main` with no public URL outrank new
candidates. Prepare a GitHub Pages artifact or a Hetzner product-box
deploy; do not clone another undeployed calculator. The host is decided
([`portfolio/hosting/`](portfolio/hosting/README.md)). The owner flip is
`deploy-settings` — do not add a second ask. See `portfolio/DIRECTION.md`.

Target super-niches where users have money and a real problem — especially
tools that help them earn more. Low variable cost, traditional software, AI
only where it clearly helps. Payment and payout rails stay off; GitHub
Sponsors/donations are fine.

## Session gate (generic briefs only)

```
python3 portfolio/ledger/session_gate.py
```

Run this when the brief is vague ("continue work", "improve the process",
"research new projects"). **BUILD** → ship product value (gate names a
`build-now` candidate if one exists). **PROCEED** → keep building. The gate
never means stop.

Named tasks, venture work, red CI, and PRs you are driving skip the gate.

## Ship without review ceremony

**Merge when CI is green.** No human code review. Fix forward. Rely on the
owner as little as possible. Product PRs are the work — merge them.

Before merge: run or read CI; scope stays in-bounds; new user-facing surfaces
have disclaimers and usage tracking.

**Merge yourself after CI is green:**

- `platform/`, `portfolio/`, docs, tests, CI
- Usage tracking, disclaimers, free-tier features, GitHub Sponsors links
- `ventures/*` product code (calculators, apps, CLIs). Do not wait. Do not
  open a queue row asking whether a product PR may merge.

Answered 2026-08-25: yes, agents merge product PRs. That question is closed.
Do not re-ask it.

**Only flag the owner when you cannot finish without them:**

- Taking or moving money (billing, payout rails, live Stripe)
- Registering accounts needing card, government ID, domain, or bank
- Publishing under the portfolio's public name (store listing, npm publish,
  production domain) — building the artifact privately is always allowed
- Enabling unattended automation that spends paid API budget
- Pasting a secret they hold (Pages enable, deploy tokens, a GitHub PAT)

`python3 portfolio/ledger/decision_queue.py` lists owner decisions already
queued. Do not add duplicate asks. Do not expand the queue with items that
do not block shipping. Do not add "should we merge this product PR?"

If a prior verification exists, run
`python3 portfolio/ledger/verification_status.py` before re-running tests —
do not re-verify unchanged PRs.

## Pipeline and new ventures

Screening is done — see `portfolio/pipeline/README.md`. Do not produce another
candidate list. Either:

1. Deploy a product that is already on `main` and still has no public URL, or
2. Build a `build-now` candidate (`session_gate.py` names the top one), or
3. Graduate and build a new niche not in `screened-out.md`.

(1) comes first while `publish_surface.py` reports nothing live.

**That tool now reads `gitops/` as well as `.github/workflows/`** (changed
2026-08-31). It used to answer "what does a merge to `main` publish?" from the
workflow files alone, which stopped being the whole answer when the site moved
to Argo CD — a manifest merged to `main` *is* the deploy there, and no workflow
runs. So it reported "nothing publishes" while `gitops/prod` carried three
public hostnames, and would have gone on saying so on the day the site went up.
It now prints the Argo surface too, per hostname, and for the portfolio site
that reads:

```
    prod  (gitops/prod)
      + https://marisstella.dev/            (301 redirect at the ingress)
      - https://tools.marisstella.dev/      (serves content, waiting on Secret
                                             portfolio-site-repo)
      + https://www.marisstella.dev/        (301 redirect at the ingress)

  No stranger can reach content yet, despite the hosts marked + above:
    - prod: https://marisstella.dev/ answers on merge but 301s to
      https://tools.marisstella.dev/, which is waiting on Secret
      portfolio-site-repo.
```

Two of the three hostnames *do* answer on a merge today — the apex and `www`
are annotation-only redirects needing no workload and no Secret. Both 301 to
the one host that serves nothing, so the portfolio still has no reachable
content. `--check` prints that dead-end as a note rather than leaving the
"+" marks to be misread.

So "nothing live" still holds, but it now means **one seal away**, not
"nothing is built": `portfolio-site-repo`, via
`./bootstrap/scripts/seal-owner-secrets.sh site`. Do not read it as a reason
to build a twelfth calculator.

A candidate becomes routable when it has `ventures/<slug>/VENTURE.yaml` or a
`product_lines` entry on its host venture.

## Duplicate PRs

Scheduled sessions often overlap. Before opening a PR, check open PRs and
recent commits. Extend or consolidate instead of duplicating. If the backlog
is large, merge the strongest and close the rest with a pointer.

**A close that names a survivor must verify the survivor is still open —
immediately before closing, and again after.** Two sessions can each close
their PR pointing at the other's as the one to keep; both pointers then aim
at something closed and nothing ships. This happened on 2026-08-24: a bot
closed #948 as "superseded by #953" at 16:04:20, and 38 seconds later
another session closed #953 "in favour of #948". Two complete
implementations of the same browser calculator, zero shipped, until #948
was reopened.

If you find the PR you deferred to already closed, **reopen one of them**
rather than opening a third implementation — the work is already written
and re-deriving it is how a duplicate becomes a triplicate. Prefer
reopening the one a reasoned merits comparison picked over one closed on
arrival order alone.

**Never close a PR as "already on main" without running:**

```
python3 portfolio/ledger/supersede_check.py <pr-number>
```

Exit 0 means the branch adds nothing `main` lacks and the close is safe.
Exit 1 prints the lines the close would destroy. The rule above covers a
survivor that is *another PR*; this covers a survivor that is *`main`
itself*, which is the claim that has actually been wrong.

Exit 0 now comes from either of two proofs, and the report names which:
the original line scan, or an **identical-merge proof** — replaying the
branch on `main` with `main` winning every conflict produces `main`'s tree
exactly. The second exists because the first went silent: on 2026-08-27 it
said NOT SUPERSEDED for 65 of 66 open PRs, none of which were mergeable
either, because `main` keeps absorbing the same feature from a sibling
branch under a different filename. A gate that never opens is a gate
nobody uses.

A **NOT SUPERSEDED** verdict may now carry a **RENAME SUSPECTED** section.
It fires when most of a file's unmatched lines have a close twin already in
`main` under different identifiers, and it prints each pair with the file
the twin lives in:

```
  branch  export function largestCostComponent(result) {
  base    export function largestCostDriver(result) {
          ↳ ventures/3pl-quote-normalizer/calc.mjs  (85% alike)
```

This is the case neither proof above catches: the branch spells the feature
`largestCostComponent`, `main` spells it `largestCostDriver`, so no line
matches and no merge replay is clean, yet the work is shipped. Merging such
a branch adds a second button, a second storage key, or a weaker copy of a
live function.

**It does not license a close, and the exit code stays 1.** Similarity is
evidence to read, not a verdict: the one word that differs between two
93%-alike lines can be the fix the branch exists to make. Read the pairs.
If they are the same feature, close naming the *twin's file* — the rename
report is what you looked at, not what decided it. If the branch changes
what the twin does, that difference is the work and it still has to merge.

**Your clone is shallow.** `git fetch --unshallow` before any of this.
Without it there is no merge base with `main`, so `git merge` refuses with
"unrelated histories" and `git diff origin/main <branch>` reports thousands
of files. That is the clone, not the branch — do not read it as a conflict
or as a reason to close anything.

On 2026-08-24 between 17:24 and 17:25, two sessions closed finished,
tested features minutes apart — #1006 ("superseded by the merged eBay
calculator follow-up work") and #1016 ("already represented on main"). In
both cases `main` did not contain the feature: no `share.mjs`, no
`compareFeeScenarios`. #1006 had to be reopened and #1016 recovered as
#1022, spending two more sessions to get back to work that was already
written. Run against those two commits the check exits 1 and names
`share.mjs` and `compareFeeScenarios` as absent from the base.

Overlap is not supersession. A branch touching the same venture, the same
file, or the same feature area as recent work on `main` is the normal case
here, not evidence that its work already landed.

There was a third close in that same five seconds — #1014, at 17:24:48,
"superseded by the repricing/sensitivity improvements already present in
the eBay calculator workstream". `main` had no `calculatePriceScenarios`
and no sensitivity UI. It is on `main` now only because the close was
reversed. Two of the three closes also gave a second reason, and both of
those reasons are wrong on their own terms:

**"The branch is conflicted" is not a reason to close.** It is a reason to
merge `main` into the branch and resolve it. A conflict means the work is
still wanted where someone else is editing — the opposite of redundant. All
three of these branches conflicted; all three resolved in minutes, and one
resolution turned up a live bug (`share.mjs` carried its own field
allowlist, so a shared link silently dropped `quantity` and `targetMargin`
and the recipient computed a different profit than the sender saw).

**Absent CI is not failed CI.** PRs opened by bots using `GITHUB_TOKEN` do
not trigger Actions, so most PRs here show *zero* checks — not red ones.
#1006 was triaged as "not merge-ready because Portfolio validate and
agent-permission-harness checks are failing" when neither check had ever
run on it. If a PR shows no checks, verify locally (`node --test`, the
venture's suite, a browser pass) and record what you ran; do not read the
blank as a failure.

**And while no runner is being assigned, red CI is not failed CI either.**
Since 2026-08-26 every workflow in the repo fails without a runner, so checks
now arrive *red* rather than absent — which reads very differently and is the
easier mistake. On 2026-08-27 four PRs verified green locally each came back
with `validate`, `check`, `test`, `build`, `site-test` and `page-integrity`
failing; so did the merge of #1849, and every other session's merge that hour.

**This is not an outage and it will not pass on its own.** Earlier revisions of
this file called it one, and that word cost real time: an outage is something
you wait out, so session after session re-derived the same signature, wrote it
into the ledger, and moved on. The last green run was
**2026-08-26T22:41:49Z** — a clean cliff, not a degradation. It affects all 218
workflows at once, including ones that touch no code, which places it at the
account level rather than anywhere in this repo. The repository is private and
owned by a user account, so Actions minutes here are metered; the ceiling that
was hit is some account-level Actions condition (exhausted included minutes, a
spending limit, a payment problem, or Actions switched off).

**Which one it is, is not knowable from a session.** Do not try to measure it:
the run-timing API (`/actions/runs/<id>/timing`) reports a billable
`total_ms` of 0 for this repo even on a *pre-cliff run that genuinely occupied
a runner for 99 seconds*, so it cannot attribute burn per workflow, and any
minute or dollar figure derived from it is fiction. The cost note inside
`.github/workflows/claude-routine-trigger.yml` is likewise an estimate its
author wrote, not a reading. Only the owner's billing page settles the
sub-cause.

**What a session should do about it is report the unblock, not re-diagnose.**
The fix does not depend on which sub-cause it is — self-hosted runners are not
metered, so they restore CI either way — and it is already built and waiting in
[`gitops/ci/`](gitops/ci/README.md). All 218 workflows already read
`runs-on: ${{ vars.CI_RUNNER || 'ubuntu-latest' }}`, so one repository variable
moves every one of them at once. It needs two owner actions nobody else can
take: seal the runner PAT (`./bootstrap/scripts/seal-owner-secrets.sh`, which
seals this and the two other secrets the portfolio is dark behind) and set
`CI_RUNNER` = `self-hosted`. If you are writing this up, write *that* — a
ledger entry re-confirming the signature adds nothing the next session did not
already know.

Tell them apart in one call, before you debug anything:

```
python3 platform/ci/ci_starvation.py --run <run_id>   # or a bare <job_id>
```

Exit 0 means every job ran on a real runner, so a failure there is a real
result and yours to fix. Exit 1 means at least one job never got one.

**It no longer needs the `gh` CLI** (changed 2026-08-31). It did until then,
which meant it exited 2 with "the gh CLI is not installed" in the web sessions
that run these routines — the one environment where a session is most likely to
reach for it and least able to check by hand. It now falls back to
`api.github.com` with `GH_TOKEN`/`GITHUB_TOKEN`, and `--from-json <file>` will
classify a jobs payload you fetched some other way (the MCP
`list_workflow_jobs` tool, say) with no credential of its own.

**The one field that settles it is `runner_id`**, and that is the only thing
the tool votes on. A starved job carries `"runner_id": 0` and
`"runner_name": ""` — no runner was ever assigned, so no step ever ran. It also
runs 3-6 seconds, has empty `output.title/summary/text`, and 404s on log
download, but each of those has a benign explanation on its own: a real job
*can* fail in three seconds, which is how a genuine failure gets waved through
as "the outage". An unassigned runner cannot be anything else. Verified against
both live cases on 2026-08-31 — today's `validate` job (`runner_id: 0`, 4s,
no steps) and the last green one before the cliff (`runner_id: 1000027517`,
95s, 38 steps).

If it reports starvation, the failure is not yours: verify locally, say what
you ran, and give the unblock above — do not "fix" green code, and do not
spend the session re-establishing the signature.

**And check for `check_runs`, not just statuses.** The commit-status API
(`/commits/<sha>/status`, and the `get_status` method of the GitHub MCP tools)
returns only *legacy commit statuses*. This repo's checks are **check runs**, so
that call reports `total_count: 0` on a PR whose checks are running or already
red. On 2026-08-28 that read as "no checks ran — absent CI" on four PRs that
each had six to eight red check runs. Absent CI and red CI call for different
handling under the rules above, so confirming which one you are looking at
needs the check-runs endpoint (`/commits/<sha>/check-runs`) or the PR's own
checks tab — never the bare status call.

## Ledger (minimal)

Record outcomes per `portfolio/ledger/README.md` when you **shipped or learned
something new** — not when you looked and confirmed the same blockers. Never
bundle a ledger entry into a PR waiting on the owner.

`git fetch origin main` before appending; skip if the latest entry already
covers your finding.

## Automation

Do not add or re-enable unattended workflows that push commits or call paid
APIs without owner approval.

## Never write `fixes #N` / `closes #N` about someone else's PR

GitHub closes the referenced PR **unmerged** when that commit hits `main`.
Refer as "#109" or "PR #109". Rephrase "fixed #109's conflict" → "resolved
the merge conflict on #109".

When intentionally closing a PR, comment why and point to what supersedes it.
