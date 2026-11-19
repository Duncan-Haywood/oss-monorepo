---
title: "Deputy's availability records are really unavailability, and that is easier to import"
seo_title: "Import Deputy unavailability and leave into a free shift scheduler"
date: 2026-11-19
tags: [scheduling, shift-roster-builder, deputy, integrations]
description: "Shift Roster Builder now turns Deputy EmployeeAvailability blocks and approved leave into dated time off for the week you plan."
---

Earlier today the [Shift Roster Builder](../../ventures/shift-roster-builder/) learned to
[read a Deputy team and its pay rates](2026-11-19-deputy-staff-and-wages-by-location.md).
What it could not yet read was who can't work when. Every imported person came in as
available any time, so the manager had to type in the student's Wednesday lecture and the
approved holiday again.

That part landed this afternoon. With a week picked, the same import now writes lines like:

```
Ana Silva, 24, 40, 0, any, off: 2026-11-18 9-13:30
Ben Ng, 22, 40, 0, any, off: 2026-11-20; 2026-11-21
```

## The resource is named for the opposite of what it holds

Deputy's resource is called `EmployeeAvailability`, so it's natural to expect windows when
someone *can* work. Deputy's own developer guide, "Setting an Employees Unavailability",
says each row is the opposite: a block the person cannot work, with a start and end in
Unix time and the same two times on the location's clock (`StartTimeLocalized`,
`EndTimeLocalized`). That makes the conversion easy, because the scheduler already has a
cell for time taken out of a standing pattern: `off:`, which takes dates and hours.

Two more details from the guide shaped the reader:

- **Recurring patterns arrive as separate rows.** A weekly lecture is stored as one row per
  week, up to a date Deputy records in `MaxDateRecurringGenerated`. Deputy does not create
  future rows forever. So the reader treats each row like a one-off. If the generated rows
  stop before the weeks you are planning end, it says so, rather than quietly showing the
  person as free.
- **Blocks can cross midnight.** A Saturday 10pm to Sunday 6am block becomes
  `2026-11-21 22-24; 2026-11-22 0-6`, because the builder plans day by day.

Leave lives in a separate resource. Deputy's "Leave" page lists six statuses. Approved
(1), date-only approved (4) and pay approved (5) block whole days. A request still
awaiting approval (0) is counted in a note but not applied, because blocking someone for
leave their manager hasn't approved yet would make the scheduler decide something that
isn't its call.

## What was checked, and what wasn't

Fifteen tests cover the reader. The blocks are applied through the same staff parser the
builder uses, and one test checks that the roster reader no longer mistakes an
unavailability row for a shift, since both carry `StartTime` and `EndTime`. On invented
files, a week of one 9-to-5 shift a day kept Ana off Wednesday and Ben off Friday and
Saturday, with all seven shifts covered. The page's staff-import box gave the same lines in
headless Chromium.

No Deputy account, token or real response was used. Unlike the two earlier Deputy readers,
which worked from open-source clients, this one could check Deputy's own documented sample
response. It has still not been run against a live install. If you run a Deputy account and
try `--fetch-deputy-staff --week-start <Monday>` against it, a note on what came back would
be the most useful next input.

Next on this path: the areas each person may work, so imported staff get `role:` cells too.

*Planning aid, not legal advice. Not affiliated with Deputy.*
