---
title: "Ten calendar exports that never folded a line, and a checker that rejected INTERVAL=02"
seo_title: "RFC 5545 line folding at 75 octets in JavaScript .ics generators"
date: 2026-11-12
tags: [ical, rfc-5545, testing, mutation-testing, javascript]
description: "Ten of our .ics exports wrote lines over 75 octets. One helper fixed them, a dogfood test now fails on it, and our checker stopped rejecting INTERVAL=02."
---

[RFC 5545](https://www.rfc-editor.org/rfc/rfc5545#section-3.1) says a line in
an `.ics` file SHOULD be no longer than 75 octets. A longer line is split with a
CRLF followed by one space, and a reader joins the pieces back together.
Most calendar apps cope with long lines, but some importers cut them off
silently, which usually costs you the end of an event title.

Our [calendar checker](https://marisstella.app/ics-calendar-check/)
already warns about long lines. A dogfood test runs every calendar export in
the catalogue (33 generators across 31 products) through that checker. Until
today the dogfood test failed only on errors. An earlier red-team run noticed
that ten generators wrote lines longer than 75 octets. The longest was a
235-octet `SUMMARY` from the wedding-day timeline builder.

## The fix

Each of the ten products now passes its finished calendar through a
20-line `foldIcs` helper before returning it. The helper splits the file
into lines, measures each one in UTF-8 octets, and cuts lines at 75 octets
(74 for continuation lines, which already start with a space). It never cuts
inside a multi-byte character, so an accented name or an emoji stays intact.
The products are business-insurance-policy-reader, coi-expiry-gap-checker,
commercial-lease-abstract-reader, patent-maintenance-fee-planner,
saas-renewal-planner, severance-package-calculator,
state-residency-day-counter, subscription-audit-from-statement,
vendor-contract-clause-reader and wedding-day-timeline-builder. All ten
products' own test suites still pass.

To keep the bug from coming back, the dogfood test now also fails on the
checker's "longer than 75 octets" finding. With that one line added, the same
ten tests went red. With the fix in place, all 33 pass, so a new export that
forgets to fold will fail CI.

## Mutation testing the checker

Because the checker now gates every export in the catalogue, we seeded 8
faults into it. Its tests caught 5. These three got through:

- Changing the leap-second limit from 60 to 61, so `23:59:61` passed as a
  real time.
- Marking the missing-`VERSION` finding as not auto-fixable, which made the
  downloadable findings CSV disagree with what the repair button does.
- Breaking the `INTERVAL` check's pattern so that `INTERVAL=0` passed and
  `INTERVAL=2` was flagged.

Each now has a test, and a rerun confirms that all three faults are caught.

## A real bug found along the way

While testing what the `INTERVAL` check accepts, we found that the checker
flagged `INTERVAL=02` and `COUNT=05` as **errors**. RFC 5545 defines both
values as `1*DIGIT`, so leading zeros are valid, and the checker already
accepted `BYMONTHDAY=05`. The fix accepts any string of digits except zero.
A test now covers `02`, `05`, `000` and `1.5`.
