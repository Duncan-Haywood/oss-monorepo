---
title: "Fifteen days of red team: what it broke, and what the blue team fixed"
date: 2026-10-29
description: "294 red-team runs seeded 3,437 bugs and none is in the code today. The blue team closed 864 test gaps and 89 defects, yet fresh files still miss 3 in 10."
tags: [redteam, testing, agents, ci]
---

# Fifteen days of red team: what it broke, and what the blue team fixed

About 7% of the agent runs in this repository go to a red team / blue team
track. The red side changes one line of a file on purpose (flips a `<` to
`<=`, adds one to a constant) and checks whether that file's tests notice.
It also reads the code looking for real bugs. The blue side writes a test for
every seeded bug that got through and fixes every real bug.

Deliberately breaking code in a repository that ships to the public sounds
risky, so this post asks two questions. How much damage has the red team
done? And how much has the blue team got done in return? Every number below
comes from the 294 red-team run records in `prompts/runs/` (2026-10-15 to
2026-10-29) and from `python3 prompts/redteam.py tally`.

## The red side: how destructive?

**No seeded bug is in the code today.** I took each of the 3,429 seeded bugs
whose file still exists, rebuilt the broken line, and looked for it in the
current file. A seeded bug that had reached `main` would show up as the broken
line present and the original line gone. That pattern matched zero times.
The tool (`prompts/redteam.py`) applies one change at a time, runs the suite,
and restores the file byte for byte. It refuses to start on a file with
uncommitted changes, and it refuses one whose tests already fail.

The near misses are all in run records, none on `main`:

- **Two killed campaigns left changed files behind.** On 2026-10-16 a tool
  timeout killed a campaign on `meter-keeper/engine.mjs` while a seeded bug
  was in place. On 2026-10-18 a campaign on `sync_tree_counts.py` overran
  300 s and left regenerated files under `gitops/`, `infra/` and
  `platform/privacy/`. Both runs saw the changes in `git status` and restored
  them before committing. The restore step that saved them is now written
  into the prompt ("check `git status` afterwards").
- **One stale Python cache served a seeded bug after the restore.** When a
  changed line has the same length as the original, a `.pyc` can match on
  mtime and size, so Python keeps running the bad version. A new test then
  failed on clean code until the run deleted `__pycache__` (2026-10-18).
- **Slow test suites wasted time.** Several runs lost about five minutes each
  to suites over the 300 s timeout, mostly `changepoint-detector`, before they
  switched to another file.

The direct cost was small. The records show 680 minutes of wall time and
$64.53 of recorded model spend, about 22 cents a run. Treat the dollar figure
as a lower bound, because not every run filled in its cost fields.

So the red team's destructive footprint is close to nil. The real risk sits
in the working tree while a campaign runs, and the restore step plus the
dirty-file refusal have held so far.

## The blue side: what it built

| | Count |
|---|---|
| Red-team runs | 294 |
| Campaigns (target files) | 431 (193 different files) |
| Seeded bugs | 3,437 |
| Caught by existing tests | 2,342 (72.2% of non-equivalent) |
| Escaped, judged harmless ("equivalent") | 191 |
| Escaped, real test gaps | 904 |
| Gaps closed by a new test, proven by `rerun` | 864 (95.6%) |
| Catch rate on targeted files after the fixes | 98.8% |
| Real defects found | 92, in 68 runs (23% of runs) |
| Real defects patched | 89 (including one fixed in this PR) |

The 92 real defects matter more than the catch rate, because each one was a
wrong answer or a broken check that shipped. A sample:

- The self-employment tax calculator charged Additional Medicare Tax on
  earnings under the $400 Schedule SE floor.
- Twenty calculators looked up `TABLE[input.key]`, which is truthy for
  `constructor` and `__proto__`. A crafted input crashed them or returned
  garbage.
- `platform/llm/byok.mjs` treated `10.evil.com` as a private address, so a
  page could claim "nothing leaves your computer" while talking to a remote
  server.
- The guard against committed payment keys skipped `.sh`, `.go` and `.txt`
  files, and missed a key glued to an underscore.
- Eight calculators printed negative money as `$-9.24`. The blue team fixed
  all eight and widened `check_money_sign.py`, which had only looked at
  functions named `money` or `usd`.
- `ai-bookkeeper` read `1e3` as 1,300 cents and let a blank tax field turn
  every estimated payment into NaN.

Two patterns stand out. First, **19 of the 92 were "main was already red"**:
a test suite failing before the red team touched it, so no campaign could
start. Separately, eleven defects were blog posts whose description ran past
the 160-character limit, most of which turned a test suite red. The red team has been acting as the repository's
janitor for broken builds that nobody else stopped to fix. Second, 34 of the
92 were in `platform/`, mostly in CI guards that passed on the very input
they exist to reject.

## The contrast: local wins, flat baseline

Here is where the two sides diverge. On the files it touched, the blue team
nearly closes the book: 95.6% of escaped bugs now have a test that catches
them. But the catch rate on *fresh* files, the share of seeded bugs a
never-targeted file's tests catch, has not climbed:

| Date | Seeded | First-pass catch rate |
|---|---|---|
| 10-15 | 226 | 64% |
| 10-18 | 356 | 65% |
| 10-21 | 224 | 65% |
| 10-24 | 172 | 77% |
| 10-26 | 280 | 77% |
| 10-28 | 262 | 71% |
| 10-29 | 104 | 72% |

The daily figure moves between 63% and 77% with no steady trend. Targets are
drawn at random, so each day samples a different set of files, and 193 files
touched is a small share of the thousands that have tests. Blue-team fixes
are mostly one test per gap in one file. They raise that file's catch rate
and leave the next file's alone.

The seeded-bug data says where the next file's tests will be weak. Boundary
changes slip through far more than other kinds:

| Seeded change | Seeded | Escaped |
|---|---|---|
| `<=` to `<` | 47 | 55% |
| `<` to `<=` | 74 | 53% |
| `>=` to `>` | 36 | 53% |
| `>` to `>=` | 118 | 46% |
| constant + 1 | 1,446 | 40% |
| `!=` to `==` | 87 | 9% |
| `*` to `/` | 76 | 8% |

Tests in this repository check typical values well and exact limits badly.
Flipping a comparison usually breaks every case and gets caught. Moving a
limit by one only breaks the case at the limit, and about half the time
nobody wrote that case.

The prompt already asks the blue team to "fix the class, not the instance".
When it did, the payoff was large: one widened money-sign check covered eight
products. It did that a handful of times out of 294 runs. A boundary-case
lint or test helper for the calculators would be the class fix the table
above points to.

## Still open

Four of the 92 defects were left unpatched:

- **An unclosed quote in a bank CSV swallowed the rest of the file**
  (`ai-bookkeeper`, found 2026-10-21). Fixed in the PR that carries this
  post. A stray `"` is now read as a plain character, every later row
  imports, and the import warns about that one line. Before the fix, a
  three-row statement imported zero rows.
- **The distribution scripts pointed at the retired `/monorepo-projects/`
  URL** (2026-10-24). A later run has since fixed it: `bluesky.mjs` now uses
  `/oss-monorepo/`.
- **`unlanded_work.py` reads a branch with no shared history as landed**
  (2026-10-26). This is still the case, and a test asserts it, because in a
  shallow clone a missing merge base is normal and reporting it as stranded
  would flood the check with false alarms. It is a trade-off, not an
  oversight, but an orphan branch with real work would go unreported.
- **A `build.test.mjs` case failed for one server venture** (2026-10-26). It
  was logged as unrelated to that run and not re-checked here.

## Verdict

The red team has cost about 11 hours of agent time and a few dollars. It
hasn't put a single bug on `main`, and it surfaced 92 real defects, 19 of
them in builds that were already failing. The blue team has kept pace on
every file the red team picked, but because it fixes one file at a time, the
repository as a whole still lets roughly three seeded bugs in ten through.
The next gain is a boundary-value guard that works across files, not more
campaigns.
