---
title: "Did the backtest cheat? Checking a scheduling win against what the shop could have known"
seo_title: "Backtesting staff schedules from sales data without hindsight in the score"
date: 2026-11-12
tags: [shift-roster-builder, product, measurement]
description: "Shift Roster Builder now counts a staffed closure as spare by default, so half-life auto can pick the last 4 weeks of sales. A pre-registered check shows 77% of that gain survives when the score sees only the past."
---

[Shifts from your sales](https://marisstella.app/shift-roster-builder/shifts-from-sales.html) turns an hourly till or POS export into the shifts a shop needs. It can also backtest its own forecast on your file. Each past week is planned from the weeks before it and then compared, hour by hour, with what that week's sales needed.

Yesterday's runs found that the old backtest had a blind spot. It counted minimum staff as needed in every hour a plan staffed. So a plan that kept someone in a locked shop over lunch was never charged for it. A new score counts a staffed hour as spare when the shop normally keeps that hour shut. Under that score, a plan made from just the last 4 weeks was clearly better on a shop whose opening hours shrank. On four real files it was never worse.

## What changed today

- **The closure-aware score is now the default** for `--backtest` and for half-life auto, which is the default way `--from-sales` weights past weeks. Auto can now pick "the last 4 weeks only" without a flag. `--score-open-hours` gives the old score back.
- **The page has it too.** A box under the half-life field ("a person staffed while the shop is normally shut counts as spare") is on by default. Auto and "Test on my past weeks" both use it. The page also had a bug: when auto picked the 4-week window, the window never reached the planned shifts. That is fixed.

## Did the score cheat?

The score decides which hours are "normally shut" by looking at the whole file, including the weeks after the one being tested. The plans never see those later weeks, but the scorer does. The 4-week window is the method that follows a change in opening hours fastest, so some of its gain could just be the scorer already knowing the new hours.

So we built the check before running it. For each tested week, the shut-hours reference comes only from the dates before that week. The rule was written into the script first: the window stays only if, under this hindsight-free reference, it is clearly worse in none of the 18 settings (three real bakeries × three staffing rates × minimum staff 1 or 2) and lower on average.

| auto with the 4-week window vs without | better / tie / worse | mean |
|---|---|---|
| whole-file reference | 6 / 12 / 0 | −16.3% |
| past-only reference | 6 / 12 / 0 | **−12.5%** |

The window passed the rule and stays in auto. About three quarters of its relative gain doesn't depend on hindsight. In person-hours, hindsight accounts for more of the gain on the Edinburgh bakery, the one whose hours shrank. In one setting the gain drops from 16.7 to 7.8 person-hours a week. Part of the reason is that a past-only reference keeps calling the old late hours "open" for a few weeks after the shop stopped opening them.

The shipped score still uses the whole file. When you run the backtest on your own export, every week in it is already your past.

Everything is in the [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) and `eval/hindsight-closure.mjs`. The data files are downloaded and checked by SHA-256, not committed. These are planning numbers, not a promise about next week.
