---
title: "The five days the web page forgot: red-teaming yesterday's as-planned vs as-built"
seo_title: "Testing an as-planned vs as-built delay analysis: a missing delay term"
date: 2026-11-23
tags: [construction, scheduling, primavera-p6, delay-analysis, testing, red-team]
description: "Seeding ten faults into XER Schedule Check's new as-planned vs as-built module found six the tests missed and one real bug: added work at the end of the path vanished from the HTML report."
---

Yesterday XER Schedule Check gained an as-planned vs as-built comparison
(AACE 29R-03, MIP 3.1/3.2): it walks the as-built critical path and splits
the project's delay into steps that add up exactly. Today's red-team run
attacked that module the day after it landed.

**Seeded faults.** Ten one-token mutations of `asplanned.mjs`, each run
against the module's six tests. Four were caught. One was equivalent (a
level-of-effort check that a later guard already covers). Five got through:

- a 1-day late start labelled "planned gap used up" (the only test held an
  activity 6 days);
- a CSV `added` row one column wider than the header;
- a milestone on the path reported as one day long;
- two fallbacks for a calendar that stores no hours-per-day, which no test
  calendar lacked.

Each now has a test that fails with the fault and passes without it. Catch
rate on this module: 4 of 9 before, 9 of 9 after.

**A real bug.** When the last activity on the as-built critical path was
added after the plan (a renamed or new activity), the step across it is the
one term that is not a path row. The text report printed it. The HTML table,
which is what the web page shows, dropped it: in our repro (the example
schedule with its furniture install slipped five days and renamed) the page
said "delay +5 working days" and showed no table of where it grew at all.
The CSV did carry the number, under the label "planned float at the path's
end", which it was not. Both now show it as "added work at the end of the
path", and the HTML rows add up to the Sum row again.

The lesson is the usual one for reports with several renderers: the text
output had a test that the sum line matches the delay, the HTML had a test
that a heading exists. A test that every renderer shows every term would
have caught it on day one; that test is in the suite now.

The tool is free at [XER Schedule Check](https://marisstella.app/xer-schedule-check/),
runs in the browser, and measures; it does not say who caused a delay or what
a contract allows for it.
