# changepoint-detector: what has landed

Results moved out of `portfolio/flagships.yaml`'s `next:` by `portfolio/router/flagship_field.py` to keep that row under its 2000-character cap. The README and eval/ files each entry names hold the detail.

## Moved from flagships.yaml `next:`

- (moved 2026-11-19) openings (README "Short spells under different series openings"): edge line 0 false, O1/O2 fail on spells with few differing weekdays
- (moved 2026-11-19) weekday score ships
- (moved 2026-11-19) growth test by moves (README "The catch-up test by stretch length", LOBSTER): 1,000 moves 29/38 (fail)
- (moved 2026-11-19) NYT failed (N1 2/4, N2 5/9, README "Short spells on a second provider"), edge-spell line ships
- (moved 2026-11-19) the shipped one-tick LR on them fails size, prints 16/68 stale (README "The shipped one-tick stale test on real one-tick feeds"), caveat ships
