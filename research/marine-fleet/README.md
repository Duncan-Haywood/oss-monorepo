# One big survey boat or several small ones at equal cost? Fleet sizing for a lawnmower survey

**Status: preliminary, simulation only; milestone 7 of `marine-fleet` (track 23), a sub-study of the
[`marine-hull`](../marine-hull/PROPOSAL.md) programme.** For a line-spacing (lawnmower) survey, does a
budget buy a faster, cheaper survey as one large boat or as several small ones?

**Live page:** https://marisstella.app/research/marine-fleet/

## Result (2,916 cases per speed setting)

Boats are geometrically similar to the 200 kg, 4 m reference of `marine-hull` (ITTC 1957 friction line,
form factor 0.25, placeholder wave term, `marine_hull.hull`). The budget is one boat of 200, 400 or 800 kg;
a fleet of boats of mass `M/k` is affordable in number `floor(1/cost)`, with cost = payload share +
(1 - payload share) x (mass ratio)^beta. Survey line length 100, 400 or 1,600 km; swath width is set by water
depth, so it does not depend on boat size (an assumption, see Limits). Each boat works to battery
exhaustion, returns to base, swaps its pack and goes back out.

- **A fleet is affordable only while the payload (sonar and compute) is under half the cost of a boat.**
  At a payload cost share of 0.5, no smaller boat is cheaper than half a big one, so the budget buys one
  boat in all 729 cases per speed setting; at 0.0 and 0.1 it buys 16 and 6 (median), at 0.3 it buys 2. This
  is arithmetic, not a finding about boats, but it is the first gate: sonar cost decides.
- **When a fleet is affordable it finishes the survey sooner:** it wins 2,178 of the 2,187 cases with
  payload share under 0.5 at best speed (2,184 at fixed 1.0 m/s, 2,186 at 1.5 m/s) and is never slower; among
  the wins the median completion-time ratio fleet/single is 0.35 (best speed), 0.29 (1.0 and 1.5 m/s). Most
  of this is parallel work; swap time and transit to base barely move it.
- **Energy per surveyed kilometre is lower for the small boats**: at equal speed a 200 kg boat draws 75 W
  where an 800 kg boat draws 160 W (hotel load scaling with mass^0.5), and both cover the same
  kilometres of swath. Among the wins the median total-energy ratio fleet/single is 0.20 (best speed) to 0.35 (1.5 m/s). This follows from the swath-independent-of-size assumption: the big boat spends energy
  on displacement that the sonar does not use.
- The conclusion (fleet wins wherever affordable) does not change with the hotel-load exponent (0, 0.5, 1), the base distance (1, 10, 30
  km) or the swap time (0.5, 2, 6 h); only the payload share flips it.

## Limits

- Swath width independent of boat size, no sea-state limit, no sensor-quality term: **a big boat that can
  run in rougher water, carry a longer-range sonar or tow a deeper payload is not credited**, and that is
  the real case for it. This study says only that, absent such an advantage, equal-cost small boats win.
- Cost law, payload share, hotel exponent, form constants and efficiencies are swept or from `marine-hull`
  (many unsourced); no acoustic communication, collision, charging queue or ground-station limit.
- Fleet size is capped at 32 candidate mass splits; at payload 0.0 the cap (n = 16 median) binds.
- Not checked against a real fleet campaign. Simulation only; operating real craft needs the flag state's
  and local authority's rules. AI-assisted (Claude Code).

## Reproduce

```
cd research/marine-fleet
PYTHONPATH=src:../marine-hull/src python3 experiments/run.py            # best speed
PYTHONPATH=src:../marine-hull/src python3 experiments/run.py 1.5        # fixed 1.5 m/s
PYTHONPATH=src:../marine-hull/src python3 -m pytest -q tests            # 7 tests
```

## Next steps

Make swath width depend on the sonar (a bigger boat carries a wider-range sonar), add a sea-state speed
limit from `marine-path`'s JONSWAP work, an acoustic-bandwidth cap on fleet size, and a mixed fleet
(one mothership plus small boats). Source the cost law from published USV prices.

## Citations

- ITTC (1957) model-ship correlation line, via `marine_hull.hull` (see that project's README).
