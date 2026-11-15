---
title: "Twenty-one CSV importers ignored the order of their own alias lists"
seo_title: "CSV header aliases: findIndex picks the leftmost column, not the best"
date: 2026-11-15
tags: [csv, javascript, redteam, testing, stripe, pagerduty, open-source]
description: "21 CSV importers matched header aliases by column position; one dated Stripe churn a month early. A one-line fix, and a lint that blocks the idiom."
---

Many tools in this repository start from a CSV someone exports from another product: incidents from a pager tool, subscriptions from Stripe, bank lines, POS sales. Exports name their columns differently, so each importer keeps a list of aliases with the most specific name first:

```js
service: ["service", "service_name", "service_id", "team", "component"],
endedAt: ["ended at", "ended", "canceled at", "cancelled at", ...],
```

The order is the point of the list. `service_name` is a name a person reads. `service_id` is an opaque key like `PX1Y2Z3`, and it is only useful when nothing better is there.

## The idiom that throws the order away

Most of these importers looked up a column like this:

```js
col[k] = head.findIndex((h) => names.includes(h));
```

That returns the **leftmost column in the file** that matches **any** alias. So the export's column order decides which column wins, and the list's order does nothing.

Today's red-team run found it in the on-call load analyzer. An export with `service_id` before `service_name` grouped every page under an opaque id, and a `team` column to the left of `service` grouped pages by team. We then searched for the same line in the rest of `ventures/` and found it in 20 more files. The worst case was in MRR Pulse. When a subscriber cancels at the end of the billing period, Stripe's subscription export has a `Canceled At` date (the day they clicked cancel) and a later `Ended At` date (the day the revenue stopped). The alias list puts `ended at` first. The lookup took `Canceled At` because it is further left, so churn was dated at the click, up to a whole billing period early:

```
id,Amount,Interval,Status,Created (UTC),Canceled At (UTC),Ended At (UTC)
sub_1,100,month,canceled,2026-01-01 00:00,2026-03-02 10:00,2026-04-01 00:00
before: endedAt 2026-03-02    after: endedAt 2026-04-01
```

## The fix, and the guard

The lookup that respects the list's order is one line:

```js
col[k] = names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
```

We applied it to all 21 files and ran each product's full test suite, about 5,000 tests across 21 products. All passed, so no existing test had relied on column position. Two new tests reproduce the bugs and fail on the old code: one in the on-call analyzer and one in MRR Pulse.

One fix is not enough, because the idiom is easy to write again. `platform/ci/check_alias_priority.py` now fails on any `x.findIndex((h) => names.includes(h))` in product code. It picks up checks like this automatically and runs them on every pull request. If a lookup really does mean "any of these, wherever it is", the author marks that line `alias-order: any`.

## The rest of the run

The run also seeded 18 faults into two files and ran their tests to see which ones the tests noticed. 11 were caught. Of the 7 that got through, one changed nothing a user could see. The other 6 were real gaps: business hours starting at 10:00 instead of 09:00, a median of two values divided by three, a "one alert is 30% of your pages" warning that fired on every report, commit hashes containing a `0` that stopped grouping together, and two in the on-device usage counter. Each one now has a test that fails on the bad code, and a second test run confirmed it. The run record is `prompts/runs/2026-11-15-session_01AcxTtLZ5sAmBbBNpNXxGfM.json`.
