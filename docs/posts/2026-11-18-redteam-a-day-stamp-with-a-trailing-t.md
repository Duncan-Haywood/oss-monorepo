---
title: "A day stamp with a trailing T: what three red-team campaigns found"
seo_title: "Testing a localStorage usage counter: check the date stamp it writes"
date: 2026-11-18
tags: [redteam, testing, javascript, privacy]
description: "24 faults seeded in a bid calculator, a usage counter and the deploy build: 14 caught, test gaps closed, and a day-stamp check for 1,286 counters."
---

This red-team run seeded 24 small faults, one at a time, into three files, and ran each file's
own tests after every fault. 14 faults broke a test, a catch rate of 61%. One of the ten that got
through could not change anything (see below). The run added tests for the other nine, and the
rerun confirmed the new tests catch the five faults it can measure on its own. That puts the rate
at 83% by the tool's count, and every fault is now caught once CI's shared contract runs too.

## A bid calculator that assumed zero

The [basement finishing bid calculator](https://marisstella.app/basement-finishing-bid-calculator/)
reads about forty numbers, and every one falls back to 0 when the caller leaves it out
(`input.hoursPerBedroom ?? 0`). Two faults changed a fallback to 1. No test noticed, because every
test passes every field. A shared link or a script calling the library can leave a field out, and
then the quote would include an hour per bedroom that nobody entered.

The new test covers all forty fallbacks at once, not just those two. For each numeric field in two
sample jobs, leaving the field out must give the same quote as passing `0`.

## A day stamp with a trailing T

Most of the portfolio's 1,286 tools carry their own copy of a small on-device usage counter. It
keeps counts in the visitor's own browser, never sends them anywhere, and stamps the day as
`new Date().toISOString().slice(0, 10)`. One fault turned the `10` into `11`, so the stamp read
`2026-11-18T`. Nothing caught it: not the tool's suite, and not the shared contract
(`platform/ci/usage_contract.mjs`) that CI runs on every copy. Neither one ever read the stamp's
value.

The contract now checks it. A field with "day" in its name, or a key shaped like a date, must be a
bare `YYYY-MM-DD` for today, by UTC or local time. The first run of the new check passed all 1,286
copies. It rejects the `.slice(0, 11)` fault and a full timestamp put where a day belongs. Both are
now test cases in `platform/ci/test_check_storage_guard.py`.

The counter's other three escapes were already caught by that contract. The red-team tool
measures only the tool's own suite, so it still counts them as escaped. That gap is logged
(2026-11-15) and needs a change to a control-plane file.

## The deploy page's command line

The third target was `platform/deploy/build.mjs`, which writes the
[one-click deploy page](https://marisstella.app/deploy/). Three faults in its command-line block
got through: reading the wrong argument, flipping the "am I the main module" check, and cutting
the `--out=` value one character short. The tests call `build()` directly, so they never run the
command the pages workflow runs. A new test runs `node build.mjs --out=<temp dir>` and checks the
output folder and the summary line. The fourth fault was harmless. It made one `mkdir` call
non-recursive, but the line before it had already created the parent folder.

## One note for the next run

A target whose tests import numpy gives a "red baseline" under the container's bare `python3`. That
was the first draw here (`platform/audio/test_narrate.py`). The fix is to run `redteam.py` with the
interpreter that `platform/ci/pyenv.py pytest numpy` prints.
