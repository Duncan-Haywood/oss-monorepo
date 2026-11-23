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
- (2026-11-23) 22-28 team grid seasons (eval/bowling-lane-table.txt, 2026-11-23 section): 2 at the bound and 15 closer stored (bowling-lane-near.mjs). Left: 0 off or a proof for 22x10, 22x21, 24x23, 26x38 (1 off each); exact seasons 24x24, 24x36 (4), 26x26 (10), 26x39 (14), 28x28 (16), 22x33 (6); 8 unmoved (24x25, 24x37, 26x14, 26x27, 26x40, 28x15, 28x27, 28x29). Next: longer count-model runs hinted by the stored answers, or an LNS over a few weeks at a time
- (2026-11-18) bowling, 5+ lane-limited teams: most even of several dealings landed (README); left: 10 x 32, 10 x 34, 14 x 30, 24 x 26 misses (more dealings or SAT answers for 5+ shapes); the page build moved to a worker 2026-11-18 (eval/browser-bowling.txt)

## From quality audit round 87 (2026-11-19, `portfolio/quality/audits/2026-11-19-league-schedule-generator-r87.json`)

- (done 2026-11-23) `calc.mjs` split into 15 feature modules, `calc.mjs` re-exports them (README "One file became fifteen"). Left: `schedule.mjs` is 1,969 lines and `divisions.mjs` 2,212; the multi-division page no longer loads the carry-over search (done 2026-11-23, later: `fields.mjs`, 217 to 75 kB gzip, eval/page-weight.txt); and (done 2026-11-23, latest) `index.html` imports the feature modules directly and loads the carry-over search and night designs on demand, 226 to 110 kB gzip (README "The main page loads half the code").
- (2026-11-20) also by a base round fixed by multiplier 37 (eval/whist-involution.c, 11 s; 69 too)
- (2026-11-20) 52, near-whist 58 by starter + table matching (eval/whist-starter.c)
- (2026-11-20) Americano/Mexicano scorer page 2026-11-19 (americano-night.html, night.mjs: live table, sit-out credit; eval/sit-out-credit.txt)
- (2026-11-20) two courses 2026-11-20 (golf-courses.test.mjs)

## Swiss pairer, after bracket-by-bracket (2026-11-21)

- Exact exchange order shipped 2026-11-21 (eval/swiss-exchange-order.md: 89.1% to 89.3%, 25 of 975 brackets needed one). Most of the remaining gap (5.2% after the 2026-11-21 name fix) is not exchanges: next is which downfloaters to choose (C.8 look-ahead), then which MDPs are paired. Colour criteria order C.12/C.13 tested: 0 boards changed.
- (done 2026-11-22) downfloaters chosen in Dutch order (README "Who floats down, chosen in Dutch order"; eval/swiss-dutch-floaters.txt): 94.8% to 95.9%, 25 of 54 rounds exact. eval/swiss-miss-brackets.mjs now says where each missed round first differs: 25 of 27 are stage B (who meets whom inside a bracket that floats the right players), 2 still floaters (Graz r4 at 2.5, Prague r5 at 1). (done 2026-11-22, later) the 25 stage-B brackets: S1 now meets only S2 when no exchange is needed, and MDPs take the earliest resident before resident floaters are fixed (README "Inside a bracket: S1 meets S2"; eval/swiss-stage-b.txt): 95.9% to 99.1%, 46 of 48 later rounds exact. (done 2026-11-22, latest) Graz r4 at 2.5: one round-3 result (21 v 89, 1-0 in the file) read as a draw gives all 137 boards (README "A result entered after the round was paired"; eval/swiss-result-flip.txt); Prague r5 exact since PR #18219; (done 2026-11-22, later) round 1 of Budapest B (0.45) and Graz (0.03): paired on a provisional list, 1 and 5 players moved, exact on the list read back from the boards, later rounds on the file's (README "Round 1 was paired on an earlier list"; eval/swiss-round1-ranking.txt); lichess events (58%): (2026-11-22) not acceleration or late joiners but the TRF's export-time ratings; backed out game by game they read 67.9% held out (README "The lichess gap is mostly the file's ratings"; eval/lichess-live-ratings.txt). Next: a lichess TRF exported per round, with the ratings each round was paired on.
- (done 2026-11-21) spring_2026_chesshouse's 0.527 was a name bug, not attendance: five players named `0`, and `0 (154)` lost its bracket as a note. Fixed in parseResults; 0.975 now, six events 94.8% (eval/swiss-bracketed-names.txt). Its remaining misses are rounds 2, 6, 7, 9.
- Stage B (`bracketMate`, radix paired/2 + 1) keeps all 7 criteria to about 180 players; the floater choice (`dutchFloaters`, `mdpFloaters`) dropped C.16-C.17 from about 45 players until 2026-11-22 (`lexRadix` now). (done 2026-11-22, later) Stage B uses `lexRadix` too: a latent fault, 0 boards changed on any measured field (eval/swiss-stage-b-radix.txt).
- (2026-11-21) match play recap
- (2026-11-22) lichess gap is drifted ratings (eval/lichess-live-ratings.txt)

## Pairing bye and the round checker (2026-11-22)

- Budapest A round 8: the arbiters gave the pairing bye to 82 (1.5) where the pairer gives 90 (1.0; both no bye yet, seven games each). The only single-result explanation is round 4's 90 v 82 as 1-0 (every file shows a draw), which moves only the bye. ChessHouse round 8 too (82 of 84 from the round-9 file, first at 1 point; no single result explains it, eval/swiss-result-flip.txt). (done 2026-11-23) the bye compared on every round (condition `bye`, eval/swiss-colour-truth.txt): 21 of 24 chess-results rounds, 18 of 18 lichess; misses Graz r1 (provisional list), Budapest A r8 (82 v our 90), ChessHouse r8 (160 v our 128). (done 2026-11-23, later) ChessHouse r8 was the bye's weight, counted from the bottom of the whole field instead of its bracket (README "The pairing bye, priced inside its own bracket"; eval/swiss-bye-bracket.txt): byes 40 of 42. Budapest A r8 stays a result question (82 has 1.5 to 90's 1.0 on the file, so no bye rule picks 82; round 4's 90 v 82 as 1-0 explains it).
- Check a round on the page: a two-result search (pairs of changes) when no single one explains a round; today it says "no single earlier result explains it". No measured round needs it since ChessHouse r8 was fixed (2026-11-23), so it waits for a real file that does.
- (2026-11-23) next: a real league's fields and teams. 2026-11-23 drawn colour (E.5) and TRF XXC: arbiters' colours on 4,358/4,358 boards, byes 21/24 (eval/swiss-colour-truth.txt)
