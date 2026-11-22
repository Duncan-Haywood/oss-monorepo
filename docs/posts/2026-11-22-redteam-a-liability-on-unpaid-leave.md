---
title: "A dollar liability on unpaid leave: red-teaming the sick leave calculator and the Project export"
seo_title: "Sick leave calculator bugs: unpaid leave priced, Oregon cap missing"
date: 2026-11-22
tags: [redteam, testing, mutation-testing, paid-sick-leave-accrual-calculator, xer-schedule-check, javascript, ventures]
description: "Red team on two files: 7 of 16 seeded bugs caught at first, 16 of 16 after, and three real defects in the sick leave calculator fixed."
---

Today's red-team run went after the
[paid sick leave accrual calculator](https://marisstella.app/paid-sick-leave-accrual-calculator/),
whose Maryland and Minnesota caps changed this morning, and `msproject.mjs`,
the writer that turns a P6 XER into a Microsoft Project XML file in the
[XER schedule check](https://marisstella.app/xer-schedule-check/).

## Seeded bugs: 7 of 16 caught (two more can't change anything)

| File | Seeded | Caught | Can't change output | Gaps closed |
|---|---|---|---|---|
| sick leave `calc.mjs` (37 tests) | 10 | 5 | 1 | 4 |
| `msproject.mjs` (345 tests, 2 s) | 8 | 2 | 1 | 5 |

The calculator's suite never checked Nevada's 1-in-52 rate, a one-person
business, the minus sign on a negative dollar figure, or how hours are rounded.
The Project writer's suite never checked its field-id tables. Those are
hard-coded Microsoft Project field numbers (Cost1..10, Start1..10 and so on).
A typo that gave Start2 the same id as Finish2, or added a Cost11 that
doesn't exist, went through. The same tables are copied into the reader,
`mspdi.mjs`, and nothing checked that the two copies agree. One new test now
checks every table's size, that no id appears twice, that each Start sits
next to its Finish, and that the reader and the writer hold the same tables.

## Three real defects in the calculator

1. **A dollar liability on unpaid leave.** A Maryland employer with 12 staff
   only has to give unpaid leave. The table said "Largest balance liability:
   n/a", but one finding said "Your largest balance liability is $15,360".
   The finding now says the balance is protected time off, not a payroll
   cost. A test checks that no finding shows a dollar amount for unpaid
   leave in Maryland, Oregon, Massachusetts or New York.
2. **Oregon had no accrual cap.** ORS 653.606 lets an employer cap accrual at
   40 hours a year, with the balance capped at 80. The calculator told a
   full-timer they earn "about 69.3 hours". Oregon now caps accrual the way
   Maryland and Minnesota already do.
3. **More people costed than you employ.** Setting 3 employees and 50 to cost
   gave a cost for 50 people. That input is now rejected with a message.

None of these changed the main cost figure for a paid employer. All three
changed a sentence an employer would read and maybe act on.
