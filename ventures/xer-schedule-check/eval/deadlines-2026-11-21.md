# Project deadlines: in the float, and into the XER, 2026-11-21

**Question.** Microsoft Project's deadline moves no date, but Project works
total slack out from it: Microsoft's "Show slack in your project in Project
desktop" page says that a deadline entered before the end of a task's total
slack makes Project recompute total slack from the deadline instead of the
late finish, and that a task forecast past its deadline shows negative slack.
Until today `mspdi.mjs` only counted deadlines in a warning, so a Project
file's recomputed float could be larger than Project's, and the Project XML
to XER converter dropped them ("P6 has no deadline"). Can both carry them?

## What changed

- `mspdi.mjs` keeps an open task's `<Deadline>` as `deadline_date` (not a P6
  column, like `split_gaps`). `cpm.mjs` adds it to the backward pass's finish
  caps, next to an external late finish: the late finish is the earlier of
  the logic's and the deadline. Early dates are untouched. A finished task's
  deadline is dropped.
- `p6xer.mjs` takes `{ deadlines: true }` (CLI `--deadlines`, a checkbox on the
  page). P6 has no deadline field. Its finish-on-or-before constraint is the
  nearest thing: it moves no early date and caps the late finish. Oracle's P6
  help says a secondary constraint needs a primary first (error PRM
  003015106) and that none is allowed beside Start On, Finish On, Mandatory
  Start or Mandatory Finish. So:

  | Task's own constraint | Deadline written as |
  |---|---|
  | none | primary finish-on-or-before |
  | start on or after, start on or before, finish on or after, as late as possible | secondary finish-on-or-before |
  | finish no later than (P6 finish on or before) | the earlier of the two dates, in the primary |
  | must start on, must finish on, mandatory start or finish | not carried; named in the warnings |

  It is off by default. A DCMA review counts finish-on-or-before as a hard
  constraint (check 5), so switching it on can raise that count. And only
  the secondary form comes back from `msproject.mjs` as a deadline: a primary
  finish-on-or-before comes back as Project's Finish No Later Than.

The Oracle points come from the search summaries of Oracle's P6 help pages
("Add a Constraint to an Activity", error reference PRM 003015106 and
003015110). docs.oracle.com could not be reached from this session to read
them in full.

## Checks

`deadlines.test.mjs` (7 tests) uses the planted Project file from
`p6xer.test.mjs`, with deadlines added:

- A deadline 3 working days before Drywall's late finish takes 24 h off its
  total float and the same off its predecessor's. Its early finish does not
  move. A deadline after the late finish changes nothing.
- A deadline before the forecast finish gives negative float.
- With the switch on, the XER recomputed by `cpm.mjs` (which matches P6 on
  19,820 of 19,822 open activities, `eval/cpm-vs-p6-2026-11-19.md`) gives the
  same early finish, late finish and total float as the MSPDI reading on
  every task. Without the switch the float differs on the deadline tasks and
  their predecessors.
- Each constraint row of the table above, a deadline on a finished task, and
  `p6Problems` finding nothing.
- Round trip: a deadline beside a start-on-or-after goes XER, then Project XML
  (`<Deadline>`), then XER, and comes back as the same secondary.

## On real files

No public file tests this yet. In MPXJ's corpus only `legacy/sample1.xml`
has deadlines (23), and every task in it is finished. So the 102-file
comparison with Project's stored values is unchanged: 2,446 of 2,491 before
and after (`node eval/cpm-vs-project.mjs <mpxj>/junit/data`). The six public
P6 files hold no secondary constraints, and none carries a deadline field, so
`cpm-vs-p6` stays at 19,820 of 19,822.

`eval/p6xer-check.mjs --mspdi` reads 2,502 of 2,509 open tasks equal both with
and without this change. The 2,509 recorded in
`eval/p6xer-check-2026-11-21.md` predates the split-task reading
(`mspdisplittask.xml`, `mspditimephased*.xml` now differ there). That is a
separate open item, not caused by this change.

**Still open:** a real Project file with open tasks and deadlines, to compare
the float with Project's stored TotalSlack (MPUG reports that Project does not
let a deadline change a critical task's slack, which this note has not
checked). An import into a real P6, to confirm it takes the secondary
constraint from an XER.
