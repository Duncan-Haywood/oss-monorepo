---
title: "30 February, spelled a third way. Red-teaming the on-call and delivery-commission analyzers"
seo_title: "Why d > 31 is not a date check: 30 February in a JavaScript parser"
date: 2026-11-14
tags: [testing, mutation-testing, dates, javascript, redteam]
description: "16 faults seeded into two analyzers, 8 caught. The on-call parser read 2026-02-30 as 2 March, in a spelling our date lint missed. A Mailchimp check had it too."
---

Today's red-team run seeded 16 faults, 8 each, into two calculators people
paste exports into:
[the on-call load analyzer](https://marisstella.app/oncall-load-analyzer/)
and [the delivery-commission analyzer](https://marisstella.app/restaurant-delivery-commission-analyzer/).
`redteam.py campaign` applied each fault, ran the suite and restored the file.
The suites caught 8 of the 16: 6 of 8 for the delivery tool, 2 of 8 for on-call.

The escapes were the usual boundary misses:

| File | Fault | Why it got through |
|---|---|---|
| on-call | `humanMin`: `m < 60` to `m < 61` | no test at exactly 60 minutes |
| on-call | Gini sort `a - b` to `a + b` | Gini only tested on already-sorted input |
| on-call | Gini `n * sum` to `n / sum` | the test said `> 0.7`, not `0.75` |
| on-call | default timezone 0 to 1 | no test pinned UTC as the default |
| on-call | high-urgency count starts at 1 | nothing read `people[i].high` |
| on-call | resolved column read only from index 1 | no file put `resolved_at` first |
| delivery | weekday filter `>=` 5 orders to `>` | the test used 6 orders, not 5 |
| delivery | example dates `slice(0, 16)` to `17` | nothing checked the example's date shape |

Each now has a test that fails with the fault and passes without it
(`redteam.py rerun`: 8 of 8).

## The real bug was next to the faults

The on-call parser checked its timestamp like this:

```js
if (Number.isNaN(t) || +mo > 12 || +d > 31 || +h > 23 || +mi > 59) return null;
```

`Date.UTC(2026, 1, 30)` is not NaN. It is 2 March. So a row stamped
`2026-02-30 10:00` was counted as a Monday page on 2 March instead of being
skipped as unreadable. The same line let `10:00:60` through as 10:01 and an
offset of `+25:00` or `+05:99` shift the page by a day. The fix round-trips the
calendar day, and checks seconds and the offset's range.

This class is not new here. On 12 November a lint,
`platform/ci/check_calendar_dates.py`, began flagging day checks that give
every month 31 days. It knew two spellings, `d >= 1 && d <= 31` and
`d < 1 || d > 31`. The on-call line has a third: a one-sided `|| d > 31` in a
chain, with no `< 1`. Teaching the lint that spelling found one more copy, in
[the Mailchimp audience CSV checker](https://marisstella.app/mailchimp-audience-csv-check/),
whose birthday check called `02/30`, `31/04` and `11/31` real month and day
pairs. Mailchimp would refuse them, and the report said nothing. It now uses a
month-length table, with 29 February allowed since a birthday has no year.

The lint also found the sales agent's `2/30` rewrite, which is safe because the
parser round-trips the date a few lines later. So the new spelling covers only
the reject form, and `b > 12 && b <= 31` is not flagged. The lint now catches both
originals on the pre-fix code and is clean on `main`, so the next copy of this
line fails CI instead of waiting for a red-team run.

Catch rate on today's targets: 50% before, 100% after. Real defects: 3 found,
3 fixed, counting the lint's blind spot.
