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
- (moved 2026-11-20) Counts (README "Clumped counts in the watch", history in HISTORY.md): count default bocpd-window + nb at threshold 0.3 ships 2026-11-20 (README "A count default for clumped orders": false 3.26 to 1.03 per 1,000, steps 701 to 1,056 of 1,200); next the How eager ladder with it as Quiet, then a deployer's real orders
- (moved 2026-11-21) Counts: count default ships, and is Quiet in --suggest/auto 2026-11-20 (README "The How eager hint for counts"); real shop: new Quiet 2 alerts vs 37 but misses the 2011-09-01 build-up; next a bunched-count ramp cell, real orders
- (moved 2026-11-21) Stale feeds (closed line): real carry-forward 84/85 caught but prints 56/56 false; side-adjusted prints fail worse (21/39, README "The trade side"): no price-only fix, the line ends.
- (moved 2026-11-21) (w) watch (README "Watching a growing series", "Round 5" to "Round 10"): hint, budget box and "Wandering level" (drift) shipped
- (moved 2026-11-21) gated joint growth fit is the count Middle 2026-11-21 (README "The joint growth fit, gated": growing sites alerted 27/40 to 6/40)
- (2026-11-21) Wander gate decided on the days before the newest change (README "A calmer wander gate", pre-registered: K1 fails 40 vs 37.5, K1' and K2-K5 pass): calm-site falls exactly as Middle, 2% walk 12.50 to 5.42 alerts per 1,000 days; --wander gated takes it.
