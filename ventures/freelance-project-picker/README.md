# Freelance Project Picker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/freelance-project-picker/>

Three clients want you this month and you can only deliver two. Paste your weekly billable hours and the
project offers on the table (fee, hours, deadline week) and see the exact set to accept for the most income,
why each other offer loses, and the fee a declined project would need to earn its place — your counter-offer
number. Browser page or zero-dependency CLI.

```
node cli.mjs plan projects.csv --buffer 20
cat projects.csv | node cli.mjs plan - --json
```

Input: `capacity,,hours[,week]` rows (a row without a week is the default for every week) and
`project,fee,hours,deadline_week[,label]` rows. See `fixtures/projects.csv`.

## How it decides

Hours can be split across weeks, so a set of projects is deliverable exactly when, for every deadline week,
the hours due by then fit the hours you have by then. The highest-fee deliverable set is found exactly by
dynamic programming over projects sorted by deadline, and the tests check it against trying every subset on
300 random instances. It also scores highest-fee-first, best-hourly-rate-first and listed order, computes the
break-even fee for each declined project, and says what ten more billable hours a week would add.

## What it is not

Not a forecast and not a scheduler: projects are treated as splittable and startable any week; start dates,
dependencies, payment timing, taxes and the chance an offer falls through are not modelled. Not financial,
tax or legal advice, no warranty. You remain responsible for any commitment you make to a client.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never
uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
