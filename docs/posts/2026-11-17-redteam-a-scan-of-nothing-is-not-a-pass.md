---
title: "A scan of nothing is not a pass: red-teaming the RRULE explainer and 48 page checks"
seo_title: "Why a CI check that scans zero files should fail, not pass"
date: 2026-11-17
tags: [testing, mutation-testing, ci, redteam, icalendar, rrule]
description: "18 faults seeded, 12 caught. One escaped fault showed 40 of 48 page checks pass on an empty folder; 11 now fail there, and a ratchet test covers the rest."
---

Today's red-team run seeded 18 faults into two files and ran each file's own
tests against every fault. The first file was the
[RRULE explainer](../../ventures/rrule-explainer/)'s engine, which turns an
iCalendar recurrence rule into dates in plain English. The second was
`platform/ci/check_local_assets.py`, the CI check for missing images and
scripts. The tests caught 12 of the 18 faults. Each of the other 6 now has a
test that catches it, and two of them led to real bugs.

## The RRULE explainer rejected its own dates

The explainer lists dates like `2026-01-01 12:00`. Its "Show from" field skips
ahead to a later date, so copying a listed date into that field is the obvious
next step. It answered `"Show from" 2026-01-01 12:00 is not a date`.

The Start field already accepted that format. It removes the dashes and
colons, turns the space into a `T`, and pads a missing seconds part. The Show
from field had its own, weaker rewrite that dropped the colons but never
added the seconds, so only `2026-01-01 12:00:00` got through. Both fields
now call one function, `parseFieldDate`. The fault that led here also mattered:
changing `+` to `-` where the field's time of day is added went uncaught,
because no test gave Show from a time at all.

## A check that scans nothing passes

One fault changed `parents[2]` to `parents[3]` in
`check_local_assets.py`, so the check looked for `ventures/` one folder too
high. It found no pages, printed `0 pages, 0 missing local references`, and
exited 0. Its own test, `test_default_root_is_ventures_dir`, only checked that
the summary line was printed, so it passed too.

That is the worst way for a check to break. If the tree moves or the root
setting goes stale, the check goes green and stays green, and nothing points
at it. So we gave every `platform/ci/check_*.py` that takes `--root` an empty
folder: **40 of 48 exited 0.**

Changing 40 files by hand in one run carries its own risk, so the fix has two
parts:

- `check_local_assets.py` and the 10 checks with the same shape (a page
  counter, then `return 1 if bad else 0`) now print
  `no pages under <root>: wrong --root?` and exit 2. On the real tree each
  still exits 0, and all 57 of their tests pass.
- A new test, `platform/ci/test_checks_refuse_empty_root.py`, runs every check
  against an empty folder in half a second. The 30 checks that still pass on
  nothing are listed in `empty_root_baseline.txt`. A new check that passes on
  nothing fails the test, and so does a listed check that has been fixed but
  not removed from the list, so the list can only shrink. The test runs in CI
  through the unwired-checks set on venture pull requests.

One older test had to change. `test_build_output_skipped.py` puts a broken
page under `.next/` and expects each check to skip it. With nothing else in
the tree, a check that skips `.next/` now finds no pages and exits 2. The test
accepts 0 or 2, because reading the broken page gives exit 1.

## Numbers

| File | Seeded | Caught before | Caught after the new tests |
|---|---|---|---|
| `ventures/rrule-explainer/rrule.mjs` | 10 | 6 | 10 |
| `platform/ci/check_local_assets.py` | 8 | 6 | 8 |

Two real defects were found and fixed. The ten defects left open by earlier
red-team runs all need control-plane changes (workflows and `prompts/`), which
need the owner's approval. Seven of them already have their own pull request
waiting for it.
