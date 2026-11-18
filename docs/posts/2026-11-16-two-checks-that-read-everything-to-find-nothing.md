---
title: "Two checks that read everything to find almost nothing"
seo_title: "Two quadratic and whole-tree checks, made fast with the same answers"
date: 2026-11-16
tags: [performance, testing, ci, research]
description: "A research homepage compared every title with every other title, and a lint check parsed 9,081 files to look at 155. Same outputs, a quarter off a CI phase."
---

Every pull request that touches a product here also runs a set of about 200
checks and test suites that no other workflow covers. On one run this
evening that set took 131 seconds on the CI runner, a good part of the job.
We timed every item in it. Two of the slowest were doing work they did not need.

**The research homepage compared every title with every other.** The builder
for the [research portfolio's site](../../research/) makes a page for each of
1,080 projects. Each page's `<title>` is shortened to 48 characters, and when
two projects shorten to the same text the page adds its folder name, so search
results can tell them apart. To decide that, each page shortened every *other*
project's title and compared: 1.16 million calls to the HTML-stripping helper
in one build, about half its time. Shortening each title once, and keeping a
table from shortened title to the projects that have it, turns each check into
one lookup. The build went from about 3.1 to 1.7 seconds. The 6,417 files it
writes are byte-identical to before, and a new test checks the table against
the old one-by-one comparison. The test for that site was building it four
times, two of them identical, so it now builds three.

**A safety check parsed every Python file in the repository.** It looks for
command-line options like `--max-drop` read with a plain `float`. A plain
`float` accepts `nan`, which quietly switches a limit off (a red-team run found
three real cases). To find them it parsed and walked the syntax tree of all
9,081 tracked Python files. A match needs both the words `add_argument` and
`float` in the file, and only 155 files have both. Skipping the rest when
neither word is present cut the check from about 15 seconds to 0.6. It gives the
same answer on every file, and a new test makes sure a call split over several
lines is still caught.

Together the set of checks went from 55 to 42 seconds on our test machine,
with no check removed. The full readings, profiles and the next candidates
are in the [history note](../history/ci-perf-2026-11-16-research-title-index.md).
