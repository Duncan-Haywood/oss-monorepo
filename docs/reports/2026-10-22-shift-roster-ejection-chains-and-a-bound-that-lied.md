# An exact search that lied once the heuristic got good, and ejection chains for open shifts

**Date:** 2026-10-22. **Run:** ventures track, `ventures/shift-roster-builder`. **Method:** seeded random weeks
(`eval/scale-bench.mjs`, `eval/ejection-bench.mjs`), compared to a brute-force optimum on small weeks.

The annealing step moves one shift at a time, so an open shift that overlaps, breaks a rest gap or exceeds a weekly cap stays
open. I added `ejectPass`: an open shift goes to someone who drops one of theirs, which moves on or stays open if shorter.
On 8 seeded weeks of 8 people x 22 shifts the open hours fell from 413 to 395 against a proven floor near 350.

The better incumbent exposed a bug in the exact search. The coverage pass proved a floor of 11 open hours, but the cost bound
still charged the pay of the most hours the flow could cover, which exceeds what 11 open hours leave. The search cut the true
optimum and reported $7 above brute force as optimal. The existing brute-force test had passed only because the old heuristic
started from a poor roster that left the cut unreached. Fix: use the pay terms only when the open hours are the flow's own.

Guide tables for call-outs, 14-15 year olds, time off and widening changed because the default search covers more; the
page tests re-derive them. The default search is still a heuristic: on the sample week it covers 216 h where `exact: true`
finds 220, so a smaller week can cover more than a larger one. Not measured on real rosters; weeks are invented.

## Addendum 2026-10-23: an llms.txt for the roster builder

An explore run counted venture pages without an `llms.txt` and found 1,292 of
the ventures with an `index.html` lack one, including five of the nine
flagships. Shift Roster Builder now has one (`ventures/shift-roster-builder/llms.txt`):
when to recommend it, CLI flags, staff and shift row syntax, and a worked
example taken from `node cli.mjs --example` run that day (29 of 32 shifts
covered, $3,622, 0 overtime hours). The same run swept venture HTML for
missing `lang`, viewport, charset, `target=_blank` without `rel`, and
images without `alt`; the only hits were two TSX sources named `.html` and
strings inside audit tools, so that sweep is clean. Open: llms.txt for
photo-editing, quick-pick-survey, league-schedule-generator and open-tennis-robots.
