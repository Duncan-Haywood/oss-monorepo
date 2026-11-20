# Milestones that hold work back across calendars (2026-11-20)

**Question.** The calendar-slack check (eval/calendar-slack-2026-11-20.md)
left one activity on the public hotel file that its own what-if called
unsound, and traced it to HCMEB1000, a start milestone on the Friday-off
calendar "HBTF # 1" whose predecessor finishes Thursday 16:00. P6 places the
milestone at Saturday 08:00, its calendar's next work start, so its successor
HCMEB1Z1045 on "HCRA - Global" (which works Fridays) cannot start until
Monday. How often does a milestone's own calendar hold work back like this on
the six public files, how much time is it, and is the time real?

**The option.** `schedule(xer, { milestones24h: true })` (cpm.mjs) places
every milestone as if it ran on a 24-hour calendar: a start or finish
milestone sits at the instant its logic gives (forward pass) and takes its
successors' late date unsnapped (backward pass). Mandatory start and finish
dates are kept. Default off: the stored-value comparison is unchanged
(`node eval/cpm-vs-p6.mjs`: 19,820 / 19,822, as before). `milestones.mjs`
diffs the two runs: the milestones that sit later than they would on 24 h
and drive a not-started successor (FS or SS, the successor's early start
equal to the milestone's date plus lag) that would start earlier, the
activities whose early dates move, and the float that comes back.
`node cli.mjs file.xer --milestone-calendars [--csv]` and the page's "Time
milestones hold back across calendars" panel run it.

**Method.** `node eval/milestone-calendars.mjs <the six files> --sample 5000
--json eval/milestone-calendars-2026-11-20.json` (files and commits as in
eval/cpm-vs-p6-2026-11-19.md; not committed). Every not-started, non-ALAP
activity (not a milestone) that gains float is rescheduled, forward pass with
milestones on 24 h, its start floored at its early start plus a delay:

- by the 24 h reading's float: **finish holds** = the project finish does not
  move; **sound** = also no open activity finishes past its late finish (24 h
  reading) by working time on its own calendar, unless it already did;
- by that float plus one working hour: **tight** = some activity does, or
  the finish moves;
- by the same float with milestones left on their calendars (P6's rule):
  **breaks** = some activity runs late or the finish moves, which says the
  float is there only if the milestones move.

## Results

| File | Open | Milestones holding work | Successors held | Activities earlier | Gain float | Max gain | Leave critical | Finish moves | Checked | Sound | Tight | Breaks under P6's rule |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CCA (6.0) | 14,270 | 0 | 0 | 0 | 0 | | 0 | no | | | | |
| Expressway (7.0) | 823 | 1 | 6 | 28 | 28 | 1 h | 0 | no | 28 | 28 | 28 | 28 |
| example (24.12) | 404 | 0 | 0 | 0 | 0 | | 0 | no | | | | |
| hotel (6.0) | 4,236 | 8 | 11 | 205 | 2,201 | 24 h | 115 | no | 1,973 | 1,973 | 1,973 | 1,973 |
| sample (20.12) | 42 | 0 | 0 | 0 | 0 | | 0 | no | | | | |
| terminal (5.0) | 66 | 0 | 0 | 0 | 0 | | 0 | no | | | | |

No activity loses float and no early date gets later on any file. Every
checked gain is exact: delayed by it the finish holds and nothing runs late,
one hour more and something does (2,001 of 2,001 across the two files).

**Hotel.** All 8 are start milestones on "HBTF # 1" (Saturday to Thursday,
08:00 to 16:00) at a zone's mechanical/electrical hand-over. Four (HCMEB1000,
HCMEB4000, HCMEF3000, HCMEF7000) follow a Thursday 16:00 finish, sit at
Saturday 08:00 and hold "HCRA - Global" successors (Monday to Friday, to 17:00)
to Monday: 9 h each (Thursday 16:00-17:00 and Friday). Four (HCMEF1000,
HCMEF4000, HCMEGF000, HCMERF00000) follow a 16:00 finish on another weekday,
sit at 08:00 next morning and cost their successors the 16:00-17:00 hour.
Float gains: 1 h on 126 activities, 8-10 h on 1,418, 16-18 h on 313, 24 h on
344. 115 activities P6 marks critical (total float 0) have 8 to 24 h on the
24 h reading; the finish (HBTF-2, 2014-07-23 16:00) stays, because another
chain with no milestone hand-over reaches it at the same instant.

**Expressway.** BEW/GEN/MS/0010, the project's start milestone on "BEW 7 Day
SIL" (work from 08:00), sits at 08:00 on 16 July 2013 while its six successors
on "BEW 5 Day SIL" start work at 07:00: 1 h each, and 28 activities in all
start an hour earlier.

The calendar-slack check's one unsound activity (HCSWB2Z3240) is explained:
its P6-float delay pushes HCMEB1000's predecessor to a Thursday 16:00 finish,
and the milestone's Saturday placement costs the successor its Friday. With
milestones on 24 h that cliff is gone.

## Limits

Two files carry the effect, and the hotel file's 8 milestones are one
pattern (a hand-over milestone on the trade's Friday-off calendar ahead of a
Monday-to-Friday crew). Whether a scheduler meant the milestone's calendar
is a judgment the tool cannot make; the panel says what moving them gives,
and P6's dates stay the default. The what-ifs check the option against the
same engine's forward pass, which matches P6's stored early dates
everywhere; P6 itself was not run with the milestones moved. Milestones
driving a successor by FF or SF, or an already-started successor, are counted
in the float and early-date totals but not listed as holding work.
