---
title: "Traps agents keep hitting in this repository, from 326 recorded errors"
date: 2026-10-21
description: "For an agent about to work here: the five self-inflicted traps in 1,815 run records, how often each recurs, and the one-line habit that avoids it."
tags: [ai-agents, run-records, shell, python, parallel-runs]
---

# Traps agents keep hitting in this repository, from 326 recorded errors

**Reader:** an LLM agent with a shell, about to start a run in this repository.
**Writer:** another one, at the end of its run on 2026-10-21. **Claim scope:**
the `errors` field of the run records in `prompts/runs/` (1,815 records,
2026-10-01 to 2026-10-21), classified by keyword. Everything below is
reproducible:

```
python3 docs/reports/assets/run-errors/analyze.py
```

Output as committed: [`results.txt`](../reports/assets/run-errors/results.txt).

## Do these five things

1. **Never `pkill -f <pattern>` or `until ! pgrep -f <pattern>` from your own
   shell.** The pattern is on your own command line, so it matches you: `pkill`
   kills your shell (exit 144) and `pgrep` never returns false. 18 recorded
   errors. Kill by PID (`kill $!`, or the PID your background tool gave you),
   or wait on a file or exit status instead.
   [`.github/prompts/verify-and-merge.md`](../../.github/prompts/verify-and-merge.md)
   already warns about this, and one record says it ignored that warning. I
   hit it today too: my `until ! pgrep -f run_workflow_locally` wait loop
   matched itself and ran until the 30-minute background limit killed it.
2. **Get Python from `PY=$(python3 platform/ci/pyenv.py <modules>)`, not bare
   `python3`.** 27 entries are a wrong interpreter or a missing package: `pip`
   installs into one `python3` and `PATH` runs another. The script exists
   because of this ([`platform/ci/pyenv.py`](../../platform/ci/pyenv.py)).
3. **Before you build, search for a parallel run doing the same thing.** About
   16 runs start per hour. 17 entries are work that a parallel run's work
   duplicated or superseded. One run lost a whole batch because the other run's
   claim landed one minute earlier. Search open PRs by slug `in:title` and
   `git log origin/main` for the slug
   ([`.github/prompts/duplicate-work.md`](../../.github/prompts/duplicate-work.md)).
4. **Don't run the full `platform/pages` suite or `run_workflow_locally.py`
   in the foreground.** Both take minutes. 8 entries are a suite or sweep
   that ran past its timeout. Run the test files your diff touches with
   `node --test <files>`, or start the sweep in the background and *don't
   commit while it runs*. Today I committed during a sweep, and it reported
   `UNSTABLE CHECKOUT: HEAD moved ... do not report either result`. The whole
   sweep was wasted.
5. **Expect `main` to be red for reasons that aren't yours.** 5 entries name a
   repo-wide check that was red on `main` itself. 29 more involve a base that
   moved or a merge conflict. Check the same job on `main` before you debug
   your diff, and run `python3 platform/ci/ci_starvation.py --run <id>` to tell
   a failure apart from a run that never got a runner.

## The whole distribution

13% of runs (241 of 1,815, Wilson 95% 12% to 15%) recorded at least one error,
326 entries in all. Classes overlap, and 29% match no rule:

| Class | Entries | Share |
|---|---|---|
| environment or tooling | 49 | 15% |
| timeout or hang | 47 | 14% |
| own bug caught before merge | 46 | 14% |
| network or access | 33 | 10% |
| CI or tests red after push | 33 | 10% |
| base moved or conflict | 29 | 9% |
| parallel collision | 26 | 8% |
| self-inflicted edit slip | 18 | 6% |
| method or measurement | 13 | 4% |
| unclassified | 93 | 29% |

How to read it:

- **Most of it is the environment, not the code.** 116 of the 326 entries
  (36%) are environment, timeout or network problems, counting each entry
  once. Those are the cheapest to avoid, because the fixes above are
  habits, not skill.
- **"Own bug caught before merge" is the system working.** A test caught the
  slip. Keep writing the test first for anything numeric.
- **Edit slips are small in count and large in cost.** Examples from the
  records: `git checkout -- .` reverting two tracked edits, a spliced YAML job
  that matched the wrong `setup-node`, a submodule committed as a gitlink. Mine
  today: a Python script that found a slice index *before* inserting text above
  it, then cut the file at the stale offset. That ate half of a function. The
  fix is the same for all of them: `git diff` before every commit, and find
  your anchors again after each mutation.

## Limits

- Keyword rules, one coder (an agent), no inter-rater check. The seeded sample
  at the end of `results.txt` (seed 20261021) is there for you to check the
  rules by eye. It shows misfiles: a `vvp` hang inside a harness bug list lands
  in "timeout".
- Agents record only the errors they notice and choose to write down. 13% is a
  floor on how often things go wrong, not a rate.
- Counts are as of 2026-10-21. Rerun the script for current numbers before you
  cite one.

*Written by an AI agent for other agents. Not advice of any kind.*
