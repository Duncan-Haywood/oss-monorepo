---
title: "Fill the payroll service's template, not ours"
date: 2026-11-17
tags: [scheduling, shift-roster-builder, payroll, small-business]
description: "Shift Roster Builder's team hub now fills the blank hours template your payroll service gives you, matching columns by name, instead of guessing each layout."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) team hub has had
a time clock since 2026-11-15. It can estimate regular, overtime and double-time
hours under a state's rules, and it downloads a timesheet CSV. That CSV uses the
hub's own layout, though. Every payroll service imports hours from a spreadsheet,
and each one wants its own columns. So a manager still had to copy the numbers
from one file into another every week. That copying is where overtime ends up in
the regular-hours column.

The usual fix is to ship one export per provider ("Export for Gusto", "Export for
ADP"). Each export is a layout someone wrote down once, and it breaks when the
provider changes its template. We could not open any provider's current help
pages from this session. Writing their layouts from memory would have meant
shipping a guess with a brand name on it.

So the hub asks for the template itself. On `/admin/payroll` the manager chooses
the blank hours-import file their payroll service offers. Only its first row is
read, and it is read in the browser. The hub saves that header row and matches
each column by its name:

- `Employee ID`, `File #` or `Badge` gets the payroll ID. The IDs are typed once
  as `Name = ID`, and leading zeros are kept.
- `Reg Hours`, `O/T Hours`, `Double Time Hours`, `Sick Hours` or `PTO` get the
  hours from the timesheet's pay estimate and the leave page.
- `First Name`, `Last Name`, `Pay Rate` and `Pay Period End` are filled the
  obvious way.

A longer name gets a whole-word match, most specific first, so `Double Time 2x`
counts as double time and not as overtime. Two kinds of name never get a guess:

- a generic word on its own, such as "hours";
- a column whose name says code, type or department.

So `Hours 3 Code` and `Hours 3 Amount` stay empty rather than collecting
regular hours twice. The page marks every guess and lists every empty column.
For anything the matcher can't know, there is one fix line per column: a company
code or batch number for every row is written `Co Code = "ABC"`.

The hub also warns before the file goes anywhere:

- someone worked overtime, but no column takes overtime;
- someone recorded leave, but no column takes sick or PTO hours;
- the template has an ID column, but some people have no ID;
- the template has no hours column at all, which usually means the employee
  import was uploaded by mistake.

People who are still on the clock are named too, because their open stretch is
not counted.

What was checked: the module's tests fill hand-built comma and tab templates.
One test runs the hub end to end, from saving a template to downloading a week
built from real punches (45 hours under federal rules: 40.00 regular, 5.00
overtime). No file has been uploaded to a real payroll account yet. So use the
provider's import preview as the last check before payroll goes out.
