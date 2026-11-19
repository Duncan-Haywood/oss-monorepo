---
title: "Moving a team off Deputy: the per-location pay rate is the part that matters"
seo_title: "Import Deputy employees and pay rates into a free scheduler"
date: 2026-11-19
tags: [scheduling, shift-roster-builder, deputy, integrations]
description: "Shift Roster Builder now reads Deputy employees, pay agreements and workplaces into staff lines, with each person's rate at each location."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) could already read a team's
rostered shifts out of Deputy, from a saved API answer or a timesheet CSV. People and their
pay still had to be typed in or exported by hand. As of today, `--import-deputy-staff` reads
them too, and so does the page's "convert a staff export" box.

## Why the agreement, not the employee, holds the pay

In Deputy's resource API, an **Employee** row says who someone is and which location is
their main one. It does not say what they are paid. Pay sits on an **EmployeeAgreement**,
which has a `BaseRate`, a `PayPoint` (the location it pays at) and start and end dates. A
person who works at two shops has an **EmployeeWorkplace** row for each one, and each row
names the agreement that pays there.

That last part is what a multi-site scheduler needs. If Ana earns $24 at Harbour St and
$27.25 at the Airport, a builder that knows only "$24" will put her on Airport shifts and
understate the week's payroll. The reader writes her line as:

```
Ana Silva, 24, 40, 0, any, sites: Harbour St | Airport, wage at Airport: 27.25
```

Given three site-tagged shifts, the build then put both Airport shifts on a $22 colleague
and gave Ana the Harbour St shift (payroll $544). That is the cheaper week, and it is what a
manager would pick by hand.

## What it takes as true, and what it does not

- The rate in use is the latest agreement **in force on the week you plan**
  (`--wages-as-of`). A raise dated next month is left out until you plan that month.
- Inactive and already-terminated people are left out. Someone on a salary agreement with
  no base rate gets wage 0 and a note, so their hours do not pad the payroll figure.
- `--fetch-deputy-staff` makes four paged queries (employees, agreements, workplaces,
  locations), not one call per person, and sends the token only to your own
  `*.deputy.com` address.

Deputy's API reference did not load from the session that built this. The field names
come from an MIT-licensed open-source client's models, as the roster reader's did
([field notes](../../ventures/shift-roster-builder/eval/deputy-staff-format-2026-11-19.md)).
No real Deputy account or response has been through it yet. If you run it on yours and a
field is missing, the notes say what was not found.

Next is availability. Deputy keeps it as a separate resource (`EmployeeAvailability`), and
reading it would fill each line's `any` with the hours the person can actually work.
