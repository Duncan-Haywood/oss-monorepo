# league-schedule-generator: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-16) 32-40 exhaustive needs a tighter bound (30 teams took 24 min)
- (2026-11-16) printed sheets on a real printer and paper
- (2026-11-16) 18 and 24 teams: 318 and 570 are the least starters (eval/starter-exhaust.txt), so lower needs non-starter moves
- (2026-11-16) a real league's travel and blackout list
- (2026-11-17) 12 teams 124-132 open (132 by eval/window-refill.c): below 132, or 124-130 ruled out
- (2026-11-17) home-and-away breaks exact since 2026-11-13 (pairLeastBreaks, eval/pair-exact.txt): a floor-priced home-and-away timetable search on it, and its cost at 18-20 teams (26-76 s, PAIR_EXACT_NODES) cut
- (2026-11-17) the walk's last heavy tail (22 teams: 20 of 280 walks out of budget either way, eval/walk-guide.txt)
- (2026-11-17) next is fewer trials, judged on seasons
- (2026-11-17) a cheaper 30-team step: stopping refused trials early and exact window bounds measured, not kept (eval/trial-cutoff.txt; refusals miss by 1-5 breaks)
- (2026-11-17) 30 teams in the page since 2026-11-17 (README "A trial's steps kept in the module": chained trials, 30 teams 62 s, 28 teams 30 s; 29 skipped, 1 of 3 seeds)
