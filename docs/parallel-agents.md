# Sixteen agents, one `main`: what parallel work costs here, and what to change

Measured 2026-10-16 with `python3 platform/ci/concurrency_tax.py --since
2026-10-02 --first-pr 6800`. Re-run it after any change below to see whether
the change worked.

## The scale

About 16 agent sessions work on this repository at once, around the clock.
If an agent-hour does the work of roughly ten engineer-hours, that is about
160 engineer-hours every hour. Staffing that with people is 160 seats
covered 24/7: about 640 full-time engineers working in shifts. The owner
put it this way on 2026-10-16. The repository's own output agrees on
the order of magnitude:

| | |
|---|---|
| PRs merged to `main`, 2026-10-02 to 10-13 | 50 to 65 a day |
| PRs merged on 2026-10-15 | 172 (one every 8 minutes) |

An organisation that size never lets every engineer edit the same few files
and merge straight to one branch. This repository does, and the cost is
measured below.

## What it costs

Over the 433 PRs from #6800 to #7234 (repository imports with more than 50
commits are excluded):

- **39% had to merge `main` back in at least once** before they could land.
- Their **692 own commits** came with **223 merge-main commits**, and **201**
  of the 692 are housekeeping: mirror regeneration, count syncing and
  conflict repair.
- So **46% of all commits are concurrency tax**, not product work.

The tax is concentrated in a few places. Of the 969 PRs that landed since
2026-10-02, these are the share that touched each area:

| share of PRs | path | what it is |
|---:|---|---|
| 84% | `gitops/prod/` | the regenerated apex mirror (~2,700 files rewritten for one new venture) |
| 73% | `platform/pages/` | `build.mjs` per-slug entries and the category regex; `launched.json` |
| 70% | `platform/privacy/optout-persistence.test.mjs` | `SWITCHES_IN_THE_CATALOGUE = N` |
| 67% | `gitops/tests/test_manifests.py` | `total = N` mirrored tools |
| 66% | `infra/OWNER_CHECKLIST.md` | "mirrors N of the N tools" |

Each of these is a **shared registry or a counter of the whole tree**. Any
two PRs open at the same time that both add a venture are bound to
conflict on all of them. With a merge every 8 minutes, nearly every PR has
another one ahead of it. `sync_tree_counts.py` exists because the counters
"can only be done on the merge result". It fixes the symptom after the
fact, in every PR.

**The biggest of these serves nothing live.** `gitops/prod/front-door*` is
the ConfigMap mirror for the k3s origin that was retired on 2026-10-01.
GitHub Pages is built by `platform/pages/build.mjs` straight from
`ventures/`. `platform/pages/publish-branch.sh` never reads `gitops/prod`,
and the only Pages code that does (`check.mjs`) reads an nginx MIME table,
not the mirror. The two counters in `OWNER_CHECKLIST.md` and
`test_manifests.py` count that same mirror.

Duplicates are a smaller cost. 50 PRs were closed unmerged from 2026-10-01
to 10-15, against roughly 900 merged. Nearly all were the same niche built
twice in parallel, under the same slug or a near one.

## A gate that is always red is no gate

`Portfolio validate` has failed on every push to `main` since at least
2026-09-29: more than 1,000 consecutive runs, as far back as the API lists.
It stops at `score_ventures.py --check`, which requires a score row for
every venture. About 530 have none, because sessions stopped writing them.
Every step after that one has not run on any PR in that time. With 16
sessions merging, each one reasonably reads the red as "already broken",
and real failures hide behind it. On 2026-10-16 one did: #7226 broke
`gitops/tests` and merged under the same red `validate`, and #7239 fixed
it. #7240 fixed the 12 score-file problems that were plain data errors.
The last one, coverage, needs a policy call.

**Rule for a many-agent repository: `main` must be green, or the failing
check must be fixed or removed the same day.** A check that stays red
stops telling anyone anything, and it trains every agent to merge on red.

## What to change, highest return first

0. **Get `Portfolio validate` green and keep it green.** Decide the
   score-coverage rule (make missing rows a reported count, or score the
   backlog), then make it a required check. Every fix below assumes CI
   can tell a session that it broke something.
1. **Stop committing the dead origin's mirror.** Drop `regen.mjs` from the
   pre-merge checklist and make the `gitops/prod/front-door*` staleness
   tests and their counts not block. Keep the generator, so a future
   self-hosted origin can build the mirror at deploy time. This takes 84% of
   PRs off the biggest conflict surface, and about 2,700 files off a
   typical venture PR. *Owner call: it reverses a CLAUDE.md checklist step.*
2. **Make the remaining tree counters derived, not pinned.** For example,
   `SWITCHES_IN_THE_CATALOGUE` can be computed from the tree, with a
   committed floor that only ratchets upward. A PR then never edits it.
3. **Move per-venture registrations into the venture's own directory.**
   Today these are lines in shared files: the launch date (`launched.json`),
   entry overrides and category (`build.mjs`), publish surface and score.
   They become fields in `ventures/<slug>/VENTURE.yaml`, read by the
   builders. A new venture then touches only its own directory, and
   parallel ventures stop conflicting.
4. **A merge queue** (GitHub's, owner setting) once 1 to 3 have shrunk the
   shared surface. It tests each PR on top of the PR ahead of it, which
   ends "main red after #N" incidents. Its cost is extra CI runs while
   runners are starved, so it comes after the surface shrinks, not before.
5. **Claims for new ventures** (already the rule: open the PR on the first
   push, with the slug in the title). This affects about 5% of PRs.

Items 2 and 3 are ordinary platform code that any session can do. Item 1
needs the owner's yes.

## Re-measured 2026-10-20: the shared-file fix worked, `main`'s CI is next

Windows are by merge date on `main`. Per-PR numbers are taken from each
PR's own `refs/pull/<n>/head` against the commit it merged onto, and imports
over 50 commits are skipped, the same method as `concurrency_tax.py`.
`concurrency_tax.py` itself did not finish inside 10 minutes in a cloud
session (its probe refresh), so this pass ran the same arithmetic over
`git fetch --filter=blob:none origin '+refs/pull/*/head:refs/pull/*/head'`
(38 seconds, 8,350 refs).

| | 10-02 to 10-13 | 10-14 to 10-16 | 10-17 to 10-20 |
|---|---:|---:|---:|
| merges to `main` a day | 55 | 196 | 280 |
| PRs that merged `main` back in | 66% | 39% | **22%** |
| concurrency tax (merge-main + housekeeping commits) | 53% | 36% | **20%** |
| files per PR, median / p90 | 2,339 / 2,654 | 8 / 2,756 | **6 / 16** |
| first commit to merge, median / p90 | 17 / 50 min | 4 / 48 min | **1 / 30 min** |
| PR refs not on `main` (closed or open), #6800-7299 vs #7800-8300 | 10% | | 2% |

Dropping the dead origin's mirror from PRs (P024, #8638) and the earlier
registry work did what this document predicted: the hottest file went from
95% of PRs (`gitops/prod/front-door-tools/kustomization.yaml`) to 24%, and
the tax fell by more than half while throughput rose five-fold. Branch per
session, squash merge and fix forward is the right pattern for this
repository; the remaining costs are in what surrounds it.

**What is still expensive:**

1. **A new registry hotspot.** `research/_homepage/projects.json` (24% of
   PRs) and `research/README.md` (23%) are now the top two files, the same
   shared-list shape that `launched.json` and `build.mjs` had. Fix 3 above
   applies: derive both from each project's own directory.
2. **`main`'s CI was red for a reason that was not a regression.**
   `Portfolio validate` failed on 77 of the last 100 pushes to `main`, all
   at "Check no live venture disappears". On a push it compared the commit
   against `main`'s tip *when the runner started*. At 280 merges a day a
   run starts about 10 merges late, so a venture added in between read as
   deleted. Reproduced: run 39398672489 checked 04d30ea92 against a tip
   that already had `hearth-and-horizon`; against its own parent
   (251913f0e) the same check prints OK. Fixed in this PR: on `push` the
   base is `github.event.before`.
3. **The dead mirror still costs CI time.** "Check the apex tool mirror is
   not stale" took 7 min 36 s of the 10-minute `validate` job in that run.
   It guards `gitops/prod/front-door*`, which serves nothing.
4. **Most `main` runs never finish.** `ventures tests` has
   `cancel-in-progress` per ref, so on `main` 44 of the last 100 runs were
   cancelled by the next merge. That is fine for a PR branch and wrong for
   `main`: no commit gets a full verdict, and a break is found only by
   whichever run happens to survive.
5. **What merges is rarely what was tested.** The PR head was a median of 1
   and a p90 of 5 commits behind `main` at merge (924 PRs, 10-17 to
   10-20); 34% were exactly on the tip. Small diffs keep that cheap, but it
   is the gap a merge queue closes.

**Action items for a later run** (ordinary platform code unless marked).
Each one is a backlog item with exact steps, a metric and a baseline in
[`prompts/process/backlog/`](../prompts/process/backlog/README.md); `python3
prompts/promptctl.py backlog` lists them. Put the id in your PR title.

- [ ] **P040** Derive `research/_homepage/projects.json` and the `research/README.md`
      project list from per-project files, so research PRs stop sharing them.
- [ ] **P039** Take the apex-mirror staleness step out of `Portfolio validate`, or run
      it only when `gitops/prod/` or its generator changes (saves ~7.5 min
      a run).
- [ ] **P038** On `main`, give `ventures tests` (and any workflow with a per-ref
      `cancel-in-progress`) a per-SHA group, or `cancel-in-progress: false`
      for `refs/heads/main`, so every merge gets a verdict.
- [ ] **P037** Re-read after a day of runs: `Portfolio validate` on `main` pushes
      should be mostly green; any remaining red is a real finding.
- [x] **P041** Make `concurrency_tax.py` usable in a cloud session (reuse locally
      fetched `refs/pull/*` instead of refreshing its probe clone).
- [ ] **P042** *Owner setting:* turn on GitHub's merge queue for `main` with batching
      now that the shared surface is small (fix 4 above); it closes the
      tested-is-not-merged gap in item 5.

The rules agents follow because of these findings, the incident timeline
and the alternatives weighed are in
[`.github/prompts/parallel-git.md`](../.github/prompts/parallel-git.md).
