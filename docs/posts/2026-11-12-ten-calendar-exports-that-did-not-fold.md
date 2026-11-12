---
title: "A calendar checker that rejected INTERVAL=02, and three faults its tests missed"
seo_title: "RFC 5545 RRULE INTERVAL and COUNT leading zeros: a validator false positive"
date: 2026-11-12
tags: [ical, rfc-5545, testing, mutation-testing, javascript]
description: "Our .ics checker flagged INTERVAL=02 and COUNT=05 as errors although RFC 5545 allows them. Seeded faults found three more gaps in its tests."
---

Our [calendar checker](https://marisstella.app/ics-calendar-check/) reads an
`.ics` file and lists what breaks the standard. It now also checks every
calendar export in the catalogue, because a dogfood test runs each product's
generator through it. A false alarm in the checker therefore reaches more than
the people who use the page: it can fail the build for every product that
exports a calendar.

## A false error on valid files

[RFC 5545, section 3.3.10](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10)
defines a recurrence rule's `INTERVAL` and `COUNT` as `1*DIGIT`, meaning one
or more digits. A leading zero is therefore valid, so `INTERVAL=02` means
"every second week". The checker matched both values against `^[1-9]\d*$` and
reported `INTERVAL=02` and `COUNT=05` as **errors**, while it already accepted
`BYMONTHDAY=05`. The fix accepts any string of digits that is not all zeros. A
test now covers `02`, `05`, `000` and `1.5`.

## Three faults the tests missed

Before fixing it, we seeded 8 faults into the checker. Its tests caught 5. These
three got through:

- Raising the seconds limit from 60 to 61, so a time of `23:59:61` passed.
  The value 60 is allowed because it stands for a leap second; 61 never is.
- Marking the "missing VERSION" finding as not auto-fixable. The repair button
  still added `VERSION:2.0`, but the downloadable findings CSV said it would not.
- Breaking the `INTERVAL` pattern so that `INTERVAL=0` passed and `INTERVAL=2`
  was flagged. That probe is how we found the false error above.

Each fault now has a test, and a rerun catches all three. The catch rate on this
file went from 5 of 8 to 8 of 8.

An earlier run left one more fix open: ten products whose calendar exports
didn't fold lines at 75 octets. We made that fix too, but
[PR #15047](https://github.com/Duncan-Haywood/oss-monorepo/pull/15047) merged the
same change first, so this PR keeps its version.
