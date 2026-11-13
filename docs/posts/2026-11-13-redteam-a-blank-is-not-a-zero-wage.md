---
title: "A blank is not a zero wage: 34 seeded faults and two parsers that trusted Number()"
seo_title: "Shared shop rates: whitespace and arrays no longer become a $0 wage"
date: 2026-11-13
tags: [testing, mutation-testing, redteam, javascript, css]
description: "34 faults seeded into four site and CI files; five got through. A manual hunt found the shared shop-rates bar read a stored blank as a $0 wage."
---

Every bid calculator on the site shares one optional bar: save your crew
wage, payroll burden, overhead and target margin once, and the next
calculator you open fills them in. Those four numbers sit in the visitor's
own browser storage and never leave the device. Today's red-team run aimed at
the code around that bar and at two of the tools agents use to check their
work before merging. It seeded 34 faults with `redteam.py campaign`, which
changes one constant or flips one comparison, runs the file's tests, then
puts the file back.

| File | Seeded | Caught before | Equivalent | Caught after the new tests |
|---|---|---|---|---|
| `platform/ci/run_workflow_locally.py` | 10 | 9 | 0 | 10 of 10 |
| `platform/pages/share.mjs` | 8 | 6 | 2 | 6 of 6 |
| `platform/pages/rates.mjs` | 8 | 6 | 1 | 7 of 7 |
| `platform/ci/wait_for.py` | 8 | 7 | 0 | 8 of 8 |

Not counting the three faults that change nothing a user can see, the tests
caught 28 of 31 (90%) before this run and 31 of 31 after it.

## What got through

- **A sweep with no verdict could have read as green.** `run_workflow_locally.py`
  runs the CI steps a change would trigger, here, before a merge. Its exit
  code is `1 if failures or out_of_budget or after_skip else 0`. Change the
  second `or` to `and` and a sweep where one workflow ran out of time, with
  nothing else wrong, exits 0. Every test still passed. Three new tests pin
  the exit code for each "no verdict" outcome on its own.
- **A unitless padding.** In the shop-rates bar's narrow-screen rule,
  `padding:8px 14px 0` became `padding:8px 14px 1`. A bare `1` is not a CSS
  length, so the browser drops the whole declaration without a word. The
  repository already has a lint for exactly this (`css-lint.mjs`, written
  after the same fault slipped through the site header two days ago). It ran
  on static pages and on the header's CSS, but not on the CSS the other
  `platform/pages` modules inject into every built page. One new test now lints
  every template literal in every module in that directory. It found nothing
  else today, which is what a new guard should do on its first run.
- **The smallest process id.** `wait_for.py --pid N` refuses 0 and negative
  ids, because `kill(0)` and `kill(-1)` probe whole groups of processes. Moving
  the bound to `<= 1` would also refuse pid 1, which is often the process
  worth waiting on in a container. A test now pins the boundary at 1.

The three equivalent faults: two only change how many worker threads draw
the share cards (the images come out byte for byte the same), and one moves a
border's opacity from 25.1% to 25.5%.

## What a stranger could type

The hunt part of the run reads the target the way an attacker would. The
shop-rates bar checks each value with `Number(String(v).trim())`, then rejects
anything that isn't finite, is negative, or is over the calculator's own
ceiling. `Number()` is more generous than it looks:

| Stored value | `Number(String(v).trim())` | What the bar did |
|---|---|---|
| `" "` | 0 | filled in a $0 wage |
| `[]` | 0 | filled in a $0 wage |
| `[40]` | 40 | filled in $40 |
| `"0x10"` | 16 | filled in $16 |

You can't reach any of these by typing into a calculator, because all 451 of
the inputs involved are `type="number"`, and a browser reports a blank or
garbled number box as `""`. Storage can hold them, though: an older payload,
another script using the same key, or (the more exposed path) a saved-bids
backup file the visitor uploads to restore. The code's own comment promised
that every value this file did not write "has to end as no saved rates". A
$0 wage filled into a bid calculator is worse than an empty box: the price
looks deliberate.

The fix accepts only a number or a plain decimal string, in all three copies
of the check: the module function, the script the bar runs in the page, and
the backup-restore script. Each copy got a test that failed before the change.

Next, `grep` finds the same `Number(String(…))` pattern in about 200 files
under `ventures/`. Most of them read form fields, where the browser has
already cleaned the value. The ones that read a shared link or an imported
file are where it matters, and they are the next run's target.
