# Float P6's late dates miss across calendars (2026-11-20)

**Question.** The constraints-log check (eval/constraints-check-2026-11-20.md)
found two rows on the public hotel file that pushed an activity past the late
start P6 stored without moving the project finish, on a file with no negative
float and no interim deadline. HMMOAZ040 ("Prepare stores and workshops",
total float 296 h) was the example. Why?

**Trace.** Walking HMMOAZ040's backward-driving successors with a one-day
push (`levelStart`, forward pass): every activity on the chain starts past
its late start down to HCSWB4Z5240 ("Cure and De-shutter slab formwork",
7-day calendar "HBTF # 2 - all days"), whose successor HCSWB3Z3190 (calendar
"HBTF # 1", Friday off) is tied to it by FF 32 h, the lag counted on the
predecessor's 7-day calendar. Pushed, the lag ends on Friday 2 November
2012, HCSWB3Z3190's day off; the forward pass snaps that finish to Saturday
08:00, which on HCSWB3Z3190's own calendar is the same working instant as its
late finish, Thursday 16:00. Its successor starts Saturday 08:00 either way.
P6's backward pass, which `cpm.mjs` reproduces (19,820 of 19,822 open
activities equal P6's stored dates), counts the 32 h back from Thursday 16:00
and so takes the Friday away from the curing activity and from everything
driving it. P6's float there is 8 h short.

**The option.** `schedule(xer, { calendarSlack: true })` keeps, for each
activity, the latest instant it may finish when every bound on its finish
allows it (up to its calendar's next work start) and counts FF and SF links
back from that. Default off: the stored-value comparison is unchanged
(`node eval/cpm-vs-p6.mjs`: 19,820 / 19,822, as before). `calslack.mjs`
lists the links where the slack enters and the activities that gain;
`node cli.mjs file.xer --calendar-slack [--csv]` and the page's "Float P6
does not show across calendars" panel run it.

**Method.** `node eval/calendar-slack.mjs <the six files> --sample 1000
--json eval/calendar-slack-2026-11-20.json` (files and commits as in
eval/cpm-vs-p6-2026-11-19.md; not committed). Every not-started, non-ALAP
activity that gains is rescheduled (forward pass) with its start floored at
its early start plus a delay, three times:

- by the option's float: **finish holds** = the project finish does not
  move; **sound** = also no activity finishes past its late finish (the
  option's) by working time on its own calendar, unless it already did;
- by the option's float plus one working hour: **tight** = some activity
  does, or the finish moves;
- by P6's float, against P6's late dates: the same soundness test, to
  separate this effect from others.

## Results

| File | Open | Gain float | Max gain | Links where it enters | Checked | Finish holds | Sound | Tight | Sound at P6's float |
|---|---|---|---|---|---|---|---|---|---|
| CCA (6.0) | 14,270 | 0 | | 0 | | | | | |
| Expressway (7.0) | 823 | 0 | | 0 | | | | | |
| example (24.12) | 404 | 0 | | 0 | | | | | |
| hotel (6.0) | 4,236 | 188 | 17 h | 22 | 188 | 188 | 187 | 188 | 187 |
| sample (20.12) | 42 | 0 | | 0 | | | | | |
| terminal (5.0) | 66 | 0 | | 0 | | | | | |

No activity loses float and no early date changes on any file (the option
only widens late dates). Only the hotel file joins calendars with different
working days through FF links: 21 of its 22 entry links are FF 32 h from a
"Cure and De-shutter" activity on the 7-day calendar to the next zone's
"Erect slab formwork" on the Friday-off one (the other is an FF 0 from a
7-day roof activity to "Test and commission"). Gains on the hotel file: 1 h
on 8 activities (the 7-day calendar works to 17:00, the 6-day one to 16:00),
8 h on 141, 9 h on 6, 16 h on 32, 17 h on 1. 27 of the 188 have 8 h or less
of P6 float, and HCSWB4Z5240 goes from 8 h to 17 h.

HMMOAZ040 is explained: P6 296 h, with the option 304 h; pushed one day past
P6's late start the finish holds, which is what the constraints check saw.
(That check's note also said a six-week push left the finish alone; rerun
here, a 42-day push moves it from 2014-07-23 to 2014-09-03, as it should.)

The one activity not sound (HCSWB2Z3240, +1 h) is equally unsound delayed by
P6's own float: the delay reaches HCMEB1000, a start milestone on the
Friday-off calendar whose predecessor finishes Thursday 16:00, so the
milestone sits at Saturday 08:00 and its successor on a 7-day calendar
(HCMEB1Z1045, "HCRA - Global") loses the Friday. That is the mirror effect,
P6's float too long where a start milestone joins the calendars; the project
finish still holds. Listed in NEXT.md.

## Limits

One file carries the effect, so 188 activities on 22 links of one pattern
are the evidence; the what-ifs check the option against the same engine's
forward pass, which matches P6's stored early dates everywhere. P6 itself
is not wrong by its own rules; it reports the tighter reading. Start
milestones and SS links are not widened. Each of the 188 is checked, not
sampled.
