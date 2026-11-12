---
title: "Good Friday is not a business day: UK bank holidays in the sales agent, checked against GOV.UK"
date: 2026-11-12
tags: [sales-agent, scheduling, holidays, testing]
description: Call retries in the sales agent now skip UK bank holidays. A test against GOV.UK's own file caught an Easter bug and a one-off holiday.
---

Earlier today the [sales agent](https://marisstella.app/sales-agent/) learned to bring a missed cold call back the next business day and to skip US holidays when it does. That leaves a UK rep in a bad spot. Miss a call on the Thursday before Easter and it comes back on Good Friday, when nobody is at their desk.

So the days-off list now takes `gb-eng` (England and Wales), `gb-sct` and `gb-nir`, everywhere it took `us`: the CLI, the self-hosted server and the free page. The self-hosted page also has a Days off field now. It used to be a setting you changed by restarting the server.

The presets are rules, not a pasted table, so they never run out of years. Easter comes from the Gregorian computus. The bank holiday Mondays are counted from the calendar. Fixed days that land on a weekend move to the next free weekday: Christmas on a Saturday is kept on Monday the 27th, so Boxing Day goes to Tuesday.

Rules written from memory are only as good as the memory, and the US rules from this morning are still unchecked, because opm.gov refuses this host. GOV.UK publishes its list as JSON, so the UK rules got a real check. The file has 280 bank holidays for 2019-2028 across the three divisions, and the test has to reproduce every year of every division, date for date.

The first run failed 27 of 30 division-years. The Easter formula had dropped a factor of two, so it was off by days nearly every year. A test pinned on two years computed from the same formula would not have caught that. The file also has a date no rule gives: 15 June 2026, Scotland's World Cup bank holiday. It now sits in a short list of one-offs set by proclamation, next to VE Day 2020, the 2022 jubilee and state funeral, and the 2023 coronation. After those two fixes all 280 dates match.

Checked on a real plan for a UK prospect, with the call on Wednesday 1 April 2026 missed twice: the third try lands on Good Friday with no days off, Tuesday 7 April for England and Wales, and Monday 6 April in Scotland, which works Easter Monday.

Canada is next, as soon as canada.ca answers. It timed out from here today, and a preset nobody has checked against the government's list is the thing this change set out to avoid. Code and tests: [`ventures/sales-agent`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/sales-agent) (`holidays.mjs`, `fixtures/`). GOV.UK data is used under the Open Government Licence v3.0.
