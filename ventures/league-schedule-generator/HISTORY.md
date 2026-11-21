# league-schedule-generator: what has landed

Results moved out of `portfolio/flagships.yaml`'s `next:` by `portfolio/router/flagship_field.py` to keep that row under its 2000-character cap. The README and eval/ files each entry names hold the detail.

## Moved from flagships.yaml `next:`

- (moved 2026-11-19) Bowling bounds and lane limits: README 2026-11-18 sections (eval/bowling-*)
- (moved 2026-11-19) 4k+2 near-whist designs 2026-11-19 (one missed partner each, 0 repeats, opponents 1-2; eval/near-whist-search.mjs annealing)
- (moved 2026-11-19) fails at <=3 spare slots (eval/odd-cyclic.txt). Fully booked: 19 on 3x9, 25 on 4x9, 31 on 5x9, 37 on 6x9 0 waits (eval/odd-orbit.py, 3 k-cycles)
- (moved 2026-11-20) tee rows and skins 2026-11-20 (golf.test.mjs, worked by hand)
- (moved 2026-11-20) Whist 48, 60 and near-whist 46, 54, 62 by tabu search 2026-11-19 (eval/whist-anneal.c, .txt)
- (moved 2026-11-20) even 40, 46 on 3 sessions 0 waits (eval/session-orbit.py). 29 on 5x9, 35 on 6x9: 0 waits (odd-lns.py). 41 on 7x9 0 waits (last night UNSAT alone, eval/lns-bad-night.py; re-dealt with the short night). 43 on 7x9 0 waits (odd-orbit.py, 9,849 s). Americano whist designs 2026-11-19 (whist.mjs; eval/whist-vs-greedy.txt)
- (moved 2026-11-21) a real tournament; league officials pick and give back games from their own links 2026-11-20 (officiating.mjs, README), next a real league's referees
- (moved 2026-11-21) Cards and suspensions 2026-11-21 (discipline.mjs: yellow accumulation, reds, bans served on played fixtures only; next: a real league's cards)
- (moved 2026-11-21) referee crews 2026-11-20 (tournament-referees.mjs: clubs, hours, caps, ejection chain; CP-SAT check, eval/referee-exact.txt)
