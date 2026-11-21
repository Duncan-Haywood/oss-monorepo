---
title: "P6 expenses and Project cost resources: the money that fell out of every conversion"
seo_title: "Convert P6 expenses to Microsoft Project cost resources"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, microsoft-project, cost-loading]
description: "XER Schedule Check now carries P6 expenses as Project cost resources and back, to the cent on 1,526 of 1,526 expense groups, checked with MPXJ."
---

A cost-loaded construction schedule holds two kinds of money. Labour goes on
resource assignments, as hours times a rate. Everything else, such as the
concrete supply, the crane hire, the building permit or a subcontract lump
sum, goes somewhere else. Primavera P6 calls these **expenses**. Microsoft
Project uses **cost resources** for them, plus each task's **fixed cost**.

[XER Schedule Check](../../ventures/xer-schedule-check/) converts schedules
both ways in the browser: XER to Project XML, and Project XML to an XER that
P6 can import. Until today both directions dropped this money and only
listed it as "not carried". So a schedule converted either way lost every
non-labour dollar, and an earned value report on the other side was wrong.

## How they map

Most of the two models line up. The one place they differ is where each
program keeps the expense's details.

- A P6 expense sits on an activity. It has a budgeted, actual and remaining
  cost, a **cost category**, an **accrual** (at start, at end or spread over
  the activity), a vendor, a PO number, a quantity and a description.
- A Project cost resource keeps its **category (Group) and accrual on the
  resource**. Each assignment of it holds only money.

So each expense name becomes a cost resource and each expense becomes an
assignment of it. The budget becomes the baseline cost, and the vendor, PO
and quantity go into the assignment's notes as lines the converter reads
back. Going the other way, each cost resource assignment becomes an expense,
and a task's fixed cost becomes an expense called "Fixed cost". Its actual
cost follows Project's accrual: all of it at the start, all of it at the
finish, or the % complete share.

## The first version lost the categories

The first version made one cost resource per expense name. When we tested it,
63 to 79 of the roughly 390 expenses planted on each file came back in the
wrong category, and about 150 with the wrong accrual. The cause: "Rebar"
bought as material on one activity and as a subcontract on another can only
have one Group in Project. The fix is a second resource for the second
combination, "Rebar (Subcontract, at end)". Its assignments carry the
original name in an `Expense:` line, so P6 gets "Rebar" back.

## What the tests show

- **XER → Project XML → XER, 1,557 expenses.** 41 are real rows from the one
  public XER we found with expenses, which a generator wrote, not P6. The
  other 1,516 were planted on six public P6 files. All 1,526 (activity, name)
  groups came back with the same budget, actual cost, remaining cost,
  category and accrual. The 1,495 single expenses also kept vendor, PO,
  quantity and description. On CCA, a 16,000-activity hospital file, the
  totals are 9,080,312.10 budgeted and 1,583,791.16 actual, the same before
  and after.
- **MPXJ**, an independent open-source reader, found the same expenses in
  both XERs. It also found cost assignments in the Project XML that equal the
  source on 1,213 of 1,213 activities.
- **Project → P6, 102 Project files** (Project 2002 to 2019) with planted cost
  resources and fixed costs. All 615 assignments and all 246 fixed costs
  became expenses with equal totals, and P6's import rules flagged nothing.

The full method and its limits are in
[`eval/expenses-2026-11-21.md`](../../ventures/xer-schedule-check/eval/expenses-2026-11-21.md).
We have not yet imported the result into P6 itself. The two open questions
are whether P6 matches a cost category by name or adds a new one, and how
it handles a real P6 file with booked actuals. If you have a cost-loaded
XER you can share, with private details removed, that is the next test.

Nothing is uploaded: the conversion runs in the browser tab.
