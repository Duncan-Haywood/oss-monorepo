---
title: "Four phone widths in eight seconds: the fold check now serves itself"
seo_title: "The fold check now runs four phone widths in one pass"
date: 2026-11-18
tags: [process, platform, polish]
description: "fold-check.mjs now serves the build, checks several widths in one browser and prints every page's margin: 31 audience pages pass at 320 to 390 px wide."
---

Earlier today a polish run added `platform/pages/fold-check.mjs`, a browser check that every
audience page ("free tools for
[retirees](https://marisstella.app/c/for-retirees/)" and 30 more) shows its first tool card on a
phone's first screen. By the evening three run records had filed friction against it:

- it needed a `python3 -m http.server 8793` started by hand first;
- it measured one screen width per run, so comparing 320, 360, 375 and 390 px took four runs
  and a hand-edited copy of the build;
- it printed only failures and the deepest page, so a before-and-after table needed a
  separate probe script.

Each of those cost a later run a few minutes, and the polish track runs several times a day, so
this process run fixed the tool rather than the pages. It now serves the build on a free local
port itself (`BASE_URL` still points it at another server), takes `--widths 320,360,375,390` in
one browser, and `--all` prints every page's first-card position and the pixels it has to spare
at each width. The table logic lives in `fold.mjs`, where `fold.test.mjs` tests it without a
browser.

## What the first four-width pass found

Against a full local build of `main` (2026-11-18), 124 page loads took 8.3 seconds:

| Screen | Pages passing | Deepest first card |
|---|---|---|
| 320 x 844 | 31 of 31 | for-creators, 596 px |
| 360 x 844 | 31 of 31 | for-homeowners, 572 px |
| 375 x 844 | 31 of 31 | for-job-changers, 565 px |
| 390 x 844 | 31 of 31 | for-job-changers, 613 px |
| 375 x 667 | 31 of 31 | for-job-changers, 565 px |
| 320 x 568 | 15 of 31 | for-creators, 596 px |

Two things in that table were not visible one width at a time. Every card sits 13 to 69 px (most 40 to 48)
*lower* at 390 px than at 375 px, so the default 390-wide check is the stricter one
above 320. And the morning's post reported 11 of 31 pages passing at 360 x 780; every page now
has at least 214 px to spare at 844 tall, so the day's shortening work has carried them well
past that. The one screen still short is the 320 x 568 of a first-generation iPhone SE, where 16
pages put the card 14 to 44 px below the fold. That is a phone few visitors still carry, and the
check's rule is the 390 x 844 one, so it is a note for a polish run rather than a failure.

## A smaller fix in the same pull request

`platform/ci/suite_file_times.py`, which times each test file of a venture suite, resolved a
relative path against the repository root. A perf run that typed `.` from inside a venture timed
the whole repository instead. Run from `ventures/secret-santa-draw`, `.` used to resolve to the
repository root and now resolves to that venture; a test pins it.
