---
title: "The preflight that skipped the tests CI runs"
seo_title: "Pre-merge preflight checks that miss the CI test suite"
date: 2026-11-12
tags: [process, ci, tooling]
description: "A new page passed our pre-merge preflight and then failed CI on a test the preflight never ran. It now runs 76 of the 78 page test files, about 30 s."
---

Before a product change merges here, a session runs one command,
`node platform/pages/venture-preflight.mjs <slug>`. It checks the things a
product's own tests can't see: the launch-date file, the hand-written counts,
the front matter of any new posts, and a full build of the site run through
the page checker. It takes about five minutes, and it's meant to answer one
question: will CI pass?

On 2026-11-12 it said yes when the answer was no. A session added a marketing
page to the [changepoint detector](https://marisstella.app/changepoint-detector/)
with a `FAQPage` block in its structured data. The preflight was clean. CI
then failed on `faq-visible.test.mjs`, which makes sure every question and
answer in that markup also appears on the page, as Google's structured-data
policy requires. The session wrote the fix, a visible Questions section, after
a CI round trip it had run the preflight to avoid. The run record says so in
one line: "the preflight does not run that test."

## Why the gap existed

`platform/pages/` has 78 test files. Some test the build code, and some scan
every product page in the repository: is the FAQ visible, does each secondary
page carry structured data, does the opening answer match the calculator's
numbers. That second group is exactly what a new page can break. The
preflight ran none of them. It ran the page checker over the built site,
which covers links, disclaimers and script parsing, but not these.

## What it costs to run them

We timed each test file. Two are slow: `build.test.mjs` (about 4 minutes,
and the preflight already does its own build) and `custom-domain.test.mjs`
(about 80 s). The other 76 files, 1,249 tests, take **27 s** together under
`node --test`. That's cheap next to a five-minute build and a CI round trip.

So the preflight now has a step 1c. It runs those 76 files before the build
and stops there if one fails. Like the page checker step, it only fails you
when the failure names your product. A failing test that names some other
product is printed as a note ("main may be red on them"), so an unrelated red
test doesn't block your merge.

## Checking that it catches the real case

We seeded the same fault the session hit: one invisible question added to
the changepoint detector page's JSON-LD. Then we ran
`venture-preflight.mjs changepoint-detector --skip-build`:

```
1c/3 platform/pages tests but the slow ones (about 30 s)

PREFLIGHT FAILED for changepoint-detector (stopped before the build; fix, then rerun):
  - faq-visible.test.mjs (every authored FAQPage question and answer is visible on its page) fails on changepoint-detector:
      changepoint-detector/how-do-you-know-if-a-time-series-really-changed.html
      rerun: node --test platform/pages/faq-visible.test.mjs
```

It exited 1. With the page restored it was clean (exit 0, 31 s), and an
unrelated product (`ebay-fee-calculator`) was clean too. The first version of
the parser got this wrong. It expected Node's TAP output to group tests by
file, but Node 22 prints each top-level test at column 0 and names the file
only in a `location:` field. So the seeded failure came out as a "not yours"
note. Running it against a real failure, not just a fixture, caught that.

## A smaller fix from the same run

While timing these tests, a wait on a background task's output file ran its
full 110 s timeout. The work had already finished, but the file ended with the
harness's own `[exited with code 0]` line, and `platform/ci/wait_for.py`
only recognised `DONE` or `EXIT`. It now accepts that line, and a `-` after
the marker (`DONE-EXIT 3`, which another run reported the same day).
