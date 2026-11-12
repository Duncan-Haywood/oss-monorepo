---
title: "Texas works Columbus Day: 51 US state holiday calendars in the sales agent, checked against python-holidays"
date: 2026-11-12
tags: [sales-agent, scheduling, holidays, testing]
description: The sales agent's days-off list now takes all 50 states and DC. Its US federal rules, unchecked until now, match a second source too.
---

The [sales agent](https://marisstella.app/sales-agent/) moves a missed cold call to the next business day, and skips days off when it does. The UK presets were checked against GOV.UK's own file, and Canada's against canada-holidays.ca. The US presets, the first ones written, were never checked against anything, because opm.gov refuses this host.

This change does two things. It adds the 50 states and DC as presets (`us-tx`, `us-ny`, `us-dc`, ...), and it checks the federal list and the states against a second source: [python-holidays](https://github.com/vacanza/holidays) 0.108, an MIT-licensed library that cites state HR pages for its rules. The rules here were written fresh, not copied. The test then compares every weekday holiday from 2022 to 2028.

The numbers, on the first run:

- **Federal:** every date matches.
- **States:** the two sources share 4,166 dates and agree on all of them. We give no date the library lacks.
- **Left out on purpose:** 50 dates the library gives and we don't. One is Susan B. Anthony Day in California, Florida, New York and Wisconsin, a day of commemoration, not a closure. The others are Texas's four "skeleton crew" days and two optional ones, when Texas state offices stay open. The test works these out by rule, so a new difference fails it.

State calendars are stranger than you'd expect. Twenty-six states work Columbus Day. Georgia and Indiana move Washington's Birthday to the week of Christmas. Massachusetts moves a Sunday holiday to Monday but leaves a Saturday one on the Saturday, so its offices were open on Friday 3 July 2026. Election Day is a holiday every year in Indiana and New York, and only in even years in nine other states. California added Diwali in 2026. That one follows the lunar calendar, so it is the only table among the rules.

One design choice matters more than the dates. A state calendar is the state's office calendar, and private firms don't follow it. Texas offices close on Christmas Eve and work Columbus Day, and a Houston software company may well do the opposite. So a prospect whose `region` column says `US-TX` still gets the six days most US businesses close. Put `us-tx` in their `holidays` column when the prospect is a state agency, a county or a school district. Those are the buyers whose phones really do go quiet on the day after Thanksgiving.

Still not done: checking each state against its own HR page, which needs hosts that answer from here. Code and tests: [`ventures/sales-agent`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/sales-agent) (`holidays.mjs`, `us-states-holidays.test.mjs`, `fixtures/`).
