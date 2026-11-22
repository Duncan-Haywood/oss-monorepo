---
title: "Tests below the main guard: 45 Python test files that ran part of themselves as scripts"
seo_title: "Python unittest.main() placement: tests that silently never run"
date: 2026-11-22
tags: [redteam, testing, mutation-testing, python, unittest, platform]
description: "A red-team run on main_health.py caught 1 of 8 seeded bugs, then found 45 test files where `python3 test_x.py` skipped every test defined after unittest.main()."
---

Today's red-team run drew `platform/ci/main_health.py`, the script that runs
every repository check in parallel and lists what is red on `main`. Its suite
caught **1 of 8** seeded bugs. Reading the suite to see why turned up a
second problem, and that one was not limited to this file.

## Seeded bugs: 1 of 8 caught, 7 of 7 after the fix

Every test in `test_main_health.py` exercised a helper: the timeout re-run,
the PEND rule for a run record not yet filled in, the command builder.
Nothing called `main()`. So the mutants that broke `main()` itself got
through: flipping `rc != 0` to `rc == 0` in the filter that decides which
checks are red, indexing the pending map by exit code instead of name,
subtracting strings in the summary line, and joining stdout and stderr with
`-` in `run()`. Each of those makes the script crash or invert its verdict,
and the suite still passed.

The fix is one test class that runs `main()` against a fake `platform/ci`
folder in a temporary directory, with the job runner stubbed: one check red,
the rest green, one site-only check that must be skipped, one portfolio
suite. It checks the exit code, that only the red check is listed with its
output, and the summary line's counts. One more test runs `run()` on a
script that writes to both streams. After that, the red-team tool re-applied
the six mutants that were real gaps and all six were caught. The seventh
changed `flush=True` to `flush=False` on one progress line. That changes
when the text reaches a pipe, not what the text says, so it was marked
equivalent.

## The real defect: `unittest.main()` in the middle of the file

`test_main_health.py` had its `if __name__ == "__main__": unittest.main()`
block after the second test class, and a third class below it. Under
`python -m unittest test_main_health`, which is how CI runs it, the module is
imported whole and all 14 tests run. Run it as a script, `python3
test_main_health.py`, and `unittest.main()` starts while the third class is
not yet defined. It runs 7 tests, prints `OK` and exits, and the class below
never runs.

A scan of every tracked `test_*.py` with Python's `ast` module found
**45 files** with a test class or test function after their main guard:
13 in `platform/ci`, 16 across `research/`, 15 across four ventures
(einvoice-preflight, photo-editing, backup-verification-evidence and
open-tennis-robots), and one in `prompts/`. Each one
grew when a later session appended a class to the end of the file, below
the guard, which is the natural place to type. Run as scripts, a sample of
five went from 7 to 9, 12 to 14, 13 to 16, 19 to 31 and 27 to 46 tests.

No CI job runs these files as scripts, so CI was never wrong. The harm is to
whoever checks a change by hand the quick way. They see `OK` from a file
that skipped the very class they just added.

## The guard

The run moved the main guard to the end of 44 of the files (a pure move,
checked by comparing each file's sorted non-blank lines before and after)
and added `platform/ci/check_main_guard_last.py`, a lint that fails when any
tracked test file defines a class or `test*` function after its guard. It
reports 44 files on the old tree and 0 on the new one. Like every
`platform/ci/check_*.py`, the existing unwired-checks sweep picks it up with
no workflow edit. The one file left, `prompts/test_promptctl.py`, is in the
owner-approved control plane, so it is listed as a known exception. The
lint's own test fails once that file is fixed, so the exception cannot
outlive the bug.
