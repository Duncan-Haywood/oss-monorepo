# How much does tacking cost a wing-sail drone? Polar diagram and isochrone routing

**Status: preliminary, simulation only; milestone 5 of `marine-sail` (track 23), a sub-study of the
[`marine-hull`](../marine-hull/PROPOSAL.md) programme.** A 4 m wing-sail drone beating 40 km to windward
loses time on every tack. Does a router that knows the tack cost win it back, and does a simple
layline-tacking controller lose much to the ideal route?

**Live page:** https://marisstella.app/research/marine-sail/

## Result (54 conditions: 3 wind scenes x 3 wind speeds x tide 0 / 0.5 m/s x tack penalty 30 / 60 / 120 s)

Course: 38.6 km at bearing 10 degrees against a northerly wind. Loss is arrival time against the
no-penalty isochrone route (time resolution about 5 min, so about 1 to 2% is quantisation).

| Scene | Plan ignores tack cost | Plan includes tack cost | Greedy layline controller |
|---|---|---|---|
| Steady wind (18 cases) | mean 4.5%, max 9.8% | mean 1.0%, max 3.4% | mean 3.2%, max 17.6% |
| Wind oscillating +-15 deg, 3 h (18) | mean 1.5%, max 5.5% | mean 1.2%, max 3.6% | mean 8.4%, max 13.6% |
| Wind veering 60 deg over 4 h (18) | 0.0% | mean 0.7%, max 2.2% | mean 16.6%, max 25.0% |

- **Tack cost matters only when the route beats.** In steady wind a 120 s stall per tack costs the
  cost-blind route 3 to 10% of the trip; planning with the cost cuts that to 0 to 3% by tacking less often.
- **A greedy controller (best-VMG tack, tack at a 2 km corridor edge) is as good as the planner in steady
  wind with no current, and loses up to 17.6% with a 0.5 m/s tide** (it does not use the tide to pick a
  side). In shifting wind it loses 3 to 25%: it does not sail to the favoured side of a shift.
- In the veering scene the planner changes tack once at most, so the penalty hardly matters (0.0%).
- Polar at 8 m/s true wind (model): best upwind VMG 2.08 m/s at 35 deg, best downwind 2.19 m/s at 160 deg,
  maximum 2.97 m/s at 90 deg. Table: [`experiments/results.csv`](experiments/results.csv).

## Method and reproduce

```bash
cd research/marine-sail
PYTHONPATH=src python3 -m pytest tests -q            # 6 tests
PYTHONPATH=src python3 experiments/run.py > experiments/results.csv   # 45 s
```

`polar.py`: force balance on a wing sail (lift slope 2 pi / (1 + 2/AR), induced drag, stall) against hull
drag (ITTC-1957 friction line x form factor, Froude wave term, keel induced drag for the side force);
speed solved per true wind angle, sail angle of attack optimised. `route.py`: isochrone routing (900 s
steps, 5 deg headings, 90 bearing sectors x tack side kept; tack = wind side change, costing `t_tack`
stalled seconds), a replay that flies a plan under the real penalty then finishes greedily, and the
greedy layline controller.

## Limitations

- **Wind and tide are parametric, not recorded.** Open-Meteo and NDBC were not reachable from the build
  environment, so the "recorded wind and current field" of the track brief is still open.
- Craft parameters (4 m, 2 m^2 wing, aspect ratio 4, keel span 0.8 m) are plausible, not from a datasheet;
  the Froude wave-drag coefficient is unsourced. The polar is not checked against a published one (for
  example a Saildrone polar). Leeway angle, heel, wave added resistance and sail trim time are ignored, so
  upwind performance is flattered.
- One course geometry; wind uniform in space; the greedy arm is one controller, not the best possible.
- The tack penalty is a stall of fixed length, not a measured manoeuvre.

## Next steps

Check the polar against a published one; fetch a recorded wind and current field (Copernicus, NOAA via
a host the proxy allows) and replay; spatial wind gradients; a tack-aware MPC arm; ArduPilot sailboat
frame in SITL as the flying reference.

## Citations (none fetched; check before relying)

- Hagiwara, H. (1989), *Weather routing of (sail-assisted) motor vessels*, PhD thesis, TU Delft (isochrone method).
- Prandtl, L. (1918/1921), lifting-line theory (finite-wing lift slope and induced drag).
- ITTC (1957), model-ship correlation line.
- Fossen, T. I. (2011), *Handbook of Marine Craft Hydrodynamics and Motion Control*, Wiley.
