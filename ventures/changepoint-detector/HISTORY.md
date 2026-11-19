# changepoint-detector: what has landed

Results moved out of `portfolio/flagships.yaml`'s `next:` by `portfolio/router/flagship_field.py` to keep that row under its 2000-character cap. The README and eval/ files each entry names hold the detail.

## Moved from flagships.yaml `next:`

- (moved 2026-11-19) openings (README "Short spells under different series openings"): edge line 0 false, O1/O2 fail on spells with few differing weekdays
- (moved 2026-11-19) weekday score ships
- (moved 2026-11-19) growth test by moves (README "The catch-up test by stretch length", LOBSTER): 1,000 moves 29/38 (fail)
- (moved 2026-11-19) NYT failed (N1 2/4, N2 5/9, README "Short spells on a second provider"), edge-spell line ships
- (moved 2026-11-19) the shipped one-tick LR on them fails size, prints 16/68 stale (README "The shipped one-tick stale test on real one-tick feeds"), caveat ships
- (moved 2026-11-19) penny-spread stocks reverse (the half-cent tick passes the gate)
- (moved 2026-11-19) (a) ar1 + floor 2 failed on 5 fresh bee dances (0.244 vs 0.337, README; muted note ships)
- (moved 2026-11-19) update-rate: pegs 4 of 7 dated
- (moved 2026-11-19) Rounds 10-18 failed (NAB; SKAB 33 pump faults: floors bracket the bar; SMD 28 servers, Round 18: no floor 75.8 false/100, floors lose 63-86% of segments): no more label-free floors
- (moved 2026-11-19) Shopify source ships 2026-11-19 (README "Shopify as a source"); counts: bocpd-window 84/100 steps vs 60, false 1.61 vs 1.21/1000 (prereg fails, README "Counts and the windowed detector"); per-column detector ships; margin round fails (window +3.26 false/1000), clumping cost --overdispersion nb ships opt-in (README "Clumped counts in the watch": 0.42 vs 3.10 false/1000, 920 vs 715 of 1200 steps, fails D2 on clumpy 40% drops): next a rule for those
