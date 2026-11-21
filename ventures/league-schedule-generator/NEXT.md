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
- (2026-11-17) the rest of the 20-team gap (40 to 44 still ~444-550: four-round re-deals or a longer run, now ~4x cheaper; or a starter family climbed with the floor as its score)
- (2026-11-17) 49 on 8x9 (orbit ~11 h est.; 4 solvers x 2 h no answer, a turn-fixed night never lays out when fully booked, eval/odd-orbit-sym.txt; next: a split or resumable search, or window shapes fixed first)
- (2026-11-17) 47 on 8x9 (13 of 16; LNS stalled: 5 runs from 13, 0 climbs, night 2 UNKNOWN at 1 h; next: a new model, orbit or symmetry-broken night)
- (2026-11-18) repeats on the seasons the repeat SAT did not move in 400 s (18x27, 20x30, 20x40, 22x23, 24x35: 18-44; eval/bowling-repeat-sat.txt), and lane-limit shape answers re-solved for repeats
- (2026-11-18) SAT answers for the 27 unanswered grid seasons (16x40, 22-28 teams; eval/bowling-lane-table.txt)
- (2026-11-18) bowling, 5+ lane-limited teams: most even of several dealings landed (README); left: 10 x 32, 10 x 34, 14 x 30, 24 x 26 misses (more dealings or SAT answers for 5+ shapes); the page build moved to a worker 2026-11-18 (eval/browser-bowling.txt)

## From quality audit round 87 (2026-11-19, `portfolio/quality/audits/2026-11-19-league-schedule-generator-r87.json`)

- `calc.mjs` is 4,149 lines; split by feature.
- (2026-11-20) also by a base round fixed by multiplier 37 (eval/whist-involution.c, 11 s; 69 too)
- (2026-11-20) 52, near-whist 58 by starter + table matching (eval/whist-starter.c)
- (2026-11-20) Americano/Mexicano scorer page 2026-11-19 (americano-night.html, night.mjs: live table, sit-out credit; eval/sit-out-credit.txt)
- (2026-11-20) two courses 2026-11-20 (golf-courses.test.mjs)

## Swiss pairer, after bracket-by-bracket (2026-11-21)

- The Dutch rules' exact exchange order between S1 and S2 (article 4.3): `bracketMate` offers an S1 player S1 partners from the boundary up, which is an approximation; the late-round lower brackets are where the remaining 11% of chess-results boards differ (eval/swiss-bracket-dutch.md).
- C.8 look-ahead (choose downfloaters so the bracket after next can still comply) and the heterogeneous remainder tie are not modelled.
- spring_2026_chesshouse reads 0.527 later-round recall against 0.81-0.97 for the others: find why (its TRF's pre-entered byes clash with the replay's absences in rounds 7 and 9).
- Very large brackets (over about 180 players) drop the lowest float criteria in stage B to keep weights exact under 2^50; only an open-condition Graz round showed a difference (1 board).
