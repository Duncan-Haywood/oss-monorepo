# league-schedule-generator: what has landed

Results moved out of `portfolio/flagships.yaml`'s `next:` by `portfolio/router/flagship_field.py` to keep that row under its 2000-character cap. The README and eval/ files each entry names hold the detail.

## Moved from flagships.yaml `next:`

- (moved 2026-11-19) Bowling bounds and lane limits: README 2026-11-18 sections (eval/bowling-*)
- (moved 2026-11-19) 4k+2 near-whist designs 2026-11-19 (one missed partner each, 0 repeats, opponents 1-2; eval/near-whist-search.mjs annealing)
- (moved 2026-11-19) fails at <=3 spare slots (eval/odd-cyclic.txt). Fully booked: 19 on 3x9, 25 on 4x9, 31 on 5x9, 37 on 6x9 0 waits (eval/odd-orbit.py, 3 k-cycles)
- (moved 2026-11-20) tee rows and skins 2026-11-20 (golf.test.mjs, worked by hand)
