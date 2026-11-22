# The last 4 late dates after XER -> Project XML, traced, 2026-11-22

**Question.** `eval/msproject-check-2026-11-21.md` left 4 of 19,822 open
activities unexplained: in-progress activities in the CCA file (P6 6.0) whose
late dates (and so total float) differed between the original XER recomputed
under Project's rules and the Project XML read back. Early finish agreed on all
of them. Two guesses (the Resume date, the at-completion duration) had been
ruled out. What is it, and is the converter wrong?

**Data.** The six public XER files of `eval/cpm-vs-p6-2026-11-19.md`, fetched
for this check and not committed.

**Method.** `node eval/msproject-check.mjs <dir> --json eval/msproject-check-2026-11-22.json`,
plus a throwaway script that printed, for each differing activity, its XER
row, its read-back row and its resource assignments (TASKRSRC) on both sides.

## What it was

Run on today's `main` first, the check said **14,261 of 14,270** on CCA, not
14,266: 9 differed, not 4. Two separate things.

1. **The check's own reference was stale (5 activities).** The converter writes
   an external late finish (from a link to a project not in the file) as a
   Project deadline. On 2026-11-21 the MSPDI reader did not model deadlines, so
   the reference dropped the external late finish too. Later that day
   `mspdi.mjs` started keeping a deadline as `deadline_date`, and `cpm.mjs`
   caps late finish at it, as Project's slack does. The read-back side moved;
   the reference did not. GGLRD09201C0, GP2AB09201C0 and T19RK09201C0 carry
   external late finishes; GGLRD23001C0 and GP2AB23001C0 precede them. The
   reference now keeps the external late finish as a deadline: those 5 agree.

2. **A P6 rule Project does not have (the original 4).** Two of them,
   D03UR26001C0 and DP1CL26009C0, are started, have **0 h remaining
   duration**, and carry a labour assignment with no units left whose
   restart-to-reend still runs on past the data date:

   | Activity | Remaining | Labour row restart -> reend | Reference (P6 rule) | Read back (Project) |
   |---|---|---|---|---|
   | D03UR26001C0 | 0 h | 2011-10-01 08:00 -> 2011-11-03 16:00 | late finish 863 h (elapsed) after late start | late finish = late start; float 629.8 h both |
   | DP1CL26009C0 | 0 h | 2011-10-11 08:00 -> 2011-12-21 08:48 | late start 1,632.8 h (elapsed) before late finish, float 360.2 h | late start = late finish, float 809 h |

   P6 rolls an assignment's late dates up to its activity, so such an
   activity's late start sits that much work before its late finish. `cpm.mjs`
   models this (`bwRsrcRemain`, added when the CPM matched P6's stored dates;
   `engine.test.mjs` case 2), and so the reference run gave these two a late
   start far earlier than their late finish. Project keeps an assignment
   inside its task's dates: the converter writes each assignment on its
   task's span, and the reader builds no assignment dates, so the read-back
   gives a zero-duration task a late start equal to its late finish. The
   other two, DP1CL09201C0 and DP1CL23001C0, are predecessors of
   DP1CL26009C0 (FS links, 173040 -> 173030 -> 173026): its later late start
   gives them later late finishes and 16.8 h more float.

So the converter is right: Project has no such rule, and these late dates
will move in Project. The check was measuring a P6 rule against Project's
rules. Two changes:

- `eval/msproject-check.mjs` recomputes the "Project's rules" reference with
  `bwRsrcRemain` off (and the external late finish kept as a deadline).
- `msproject.mjs` names those activities when it writes the file, as it names
  every other place Project will schedule differently: "2 started activities
  have no remaining duration but an assignment still running past the data
  date (restart to reend): P6 sets their late start that much before the late
  finish, Project has no such rule, so their late start and the total float of
  their predecessors can come out later in Project (D03UR26001C0,
  DP1CL26009C0)". It is `counts.rsrcRollUp`; the other five files have none.
  A unit test plants one (and checks that an assignment ending where it
  restarts is not counted).

## Result

| File | Schedule equal under Project's rules, 2026-11-21 | 2026-11-22 |
|---|---|---|
| CCA (6.0) | 14,266 / 14,270 | **14,270 / 14,270** |
| Expressway (7.0) | 823 / 823 | 823 / 823 |
| example (24.12) | 404 / 404 | 404 / 404 |
| hotel (HBTF-2, 6.0) | 4,217 / 4,217 | 4,217 / 4,217 |
| sample (20.12) | 42 / 42 | 42 / 42 |
| terminal (5.0) | 66 / 66 | 66 / 66 |
| **Total** | 19,818 / 19,822 | **19,822 / 19,822** |

Everything else in the 2026-11-21 table is unchanged: 21,422 of 21,422
activities intact, 54,843 of 54,843 links, 1,810 of 1,810 level-of-effort
links in notes. Under P6's own options all three values agree on 6,971 (was
6,966: the deadline fix in the reference moves 5 onto P6's side too); early
finish alone on 12,169, as before.

## Not checked

Not opened in Microsoft Project itself (no licence here), so "Project gives a
zero-duration task with a long assignment a late start equal to its late
finish" rests on how MSPDI and Project's scheduling are documented, the
writer putting each assignment on its task's span, and this tool's reader.
Whether Project, on open, would instead stretch the task to the assignment's
finish (it does when an assignment's own dates run past its task's) cannot
happen here, because the writer never writes such dates. A P6 Resource Usage
export of one of these activities would show how P6 itself presents the
rolled-up late start.
