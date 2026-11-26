# Perf track, prompt 0

Performance engineering across the repository. The master prompt
(`prompt.md`) routes about 5% of runs here (`routing.json` weight 0.05; the
owner, 2026-10-24: "add some work distribution to overall performance
engineering across the repo"). The goals and guardrails in
[`prompts/goals.md`](../goals.md) bind every version of this prompt.

**North star** (owner, 2026-11-24: $10k MRR; `goals.md`, "North star"):
where this track leaves the target open, prefer one that brings a paying
subscriber closer: a for-profit product's code, pages or funnel, or a free
page that leads to one. `python3 portfolio/monetization/transition.py` lists
the for-profit products (its numbered rows; `transition.json` has each paid
page).

"Merge when done" below means: open a pull request for your work and merge it
yourself, every session. This is the explicit request to create that PR. A
pushed branch is not done. Steps:
[`.github/prompts/land-your-work.md`](../../.github/prompts/land-your-work.md).

---

## Why this track exists

The repository is public, so standard runners cost no money. The
concurrent-job ceiling is the real limit: every minute one job wastes is a
minute another PR's check waits (`platform/ci/ci_starvation.py`). The same
holds for agent sessions, which wait on the same builds and tests locally.
Three passes so far (`docs/history/pages-build-perf-2026-10-20.md`,
`ci-perf-2026-10-21.md`, `ci-perf-2026-10-24.md`) found every cost in a
setting, a library choice, a clone or an algorithm, never in a slow language.

## Where to look, in order

Fetch `origin/main` before any sweep (`git fetch --depth=1 origin main`):
a clone hours stale once sent a run to a page another perf run had fixed the
day before.

1. **Open perf items**: `python3 prompts/promptctl.py backlog --title perf:`
   prints the agent-workable ones (search open PRs for the id first) or one
   line saying there are none. On 2026-11-26 there were none: P063, P064 and
   P086 are owner rows, and thirty-odd runs from 2026-11-20 to 25 reported
   re-checking them for nothing. Since 2026-11-24 only `priv-*` workflows and
   the gate scripts in `.github/CODEOWNERS` wait for the owner; other
   workflow changes land after `ci-policy` and the risk review. The pool
   reading below mostly lands on `priv-*` workflows too (2026-11-25), so a
   for-profit product's front door (item 4, `transition.py`) is often the
   quicker target.
2. **A fresh reading of the runner pool**:
   `python3 platform/ci/ci_profile.py --runs 600 --top 25`. Take the largest
   consumer nobody is working on. Checkout share, queue time and jobs per PR
   head are the pool-wide numbers to move.
3. **The slowest local step an agent session waits on**: the Pages build and
   its tests (`platform/pages`), a venture's test suite, the session gate.
   `run_venture_tests.py --times 15` ranks suites from
   `venture_suite_times.json` (its `taken` date says how stale; suites added
   since are missing, so `--write-times` refreshes it), and
   `suite_file_times.py <slug>` times one suite's files and lists the earlier
   perf passes on it: a suite with several passes is tight loops by now
   (league and shift-roster were dead ends), an untouched one is the cheaper win.
4. **What visitors wait on.** Weight first, without a full build:
   `node platform/perf/module-weight.mjs ventures/<slug>` and
   `module-exclusive.mjs ventures/<slug>/index.html` answer in seconds.
   Weight is often not the lever, so measure the wait itself: a CPU profile
   of load and of the first action on a realistic large input (a tool whose
   first click runs every engine is compute-bound; count calls before
   trusting a 4x-throttled profile's self time, which inflates one-off set-up),
   and `platform/perf/revalidate-serve.mjs` for request chains the live
   site's `max-age=0` makes slow (a Web Worker's module graph is not covered
   by the page's modulepreload links).

## How to work

- **Measure first, then choose the fix.** `python3 -m cProfile -s cumulative`,
  `node --cpu-prof` (sum self time per function), and phase timestamps when a
  profile is mostly idle (idle means waiting: child processes, worker
  threads, I/O). Write down the before number and how you got it.
- **Same answers, faster.** A change is only a speed-up if the output is
  unchanged: byte-identical artifacts (`cmp`), or a test that pins the old
  behaviour against the new path. Never drop, skip or weaken a test or a
  check to save time. Narrowing a trigger is fine only when you can show the
  skipped job cannot fail on the files it now skips.
- **Read the comment before changing a trigger or a checkout.** Several wide
  path lists and full-history clones are deliberate (the workflow's own
  comments say why). Required check names are listed in branch protection
  (`branch-protection-drift-check`); renaming or merging jobs can strand PRs.
- **A rewrite in another language** is worth proposing only when a profile
  shows the time inside our own tight loop with the work already minimal.
  Say so with the profile if you find one.
- **No paid runners, no new unattended workflows** that push commits or
  spend budget (`CLAUDE.md`).

## Land and write it up

- After the fix, take the after number the same way as the before.
- Extend or add `docs/history/<topic>-perf-<date>.md`: the reading, the
  profile, the change, the verification, and a ranked "not changed" list for
  the next run. Close or update the backlog item with the metric.
- A short post in `docs/posts/` when the finding would interest a reader
  (`goals.md`, "Write about the work"); extending
  `2026-10-20-we-almost-rewrote-it-in-rust.md` is fine.

Record the run with `--track perf`. Its `notes` must carry the metric, the
before and after numbers, and how each was taken, so the review track can
tell whether this share of runs pays for itself.
