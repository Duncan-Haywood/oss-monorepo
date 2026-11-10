# Can a small boat dock itself in a current? Capture rate against approach strategy, speed and position noise

**Status: preliminary, simulation only; milestone 8 of track 23 (`marine-dock`), filed under the
[`marine-hull`](../marine-hull/PROPOSAL.md) programme.** Written with AI assistance (Claude Code).

**Live page:** https://marisstella.app/research/marine-dock/

## Result

A 200 kg boat approaches a dock mouth from 40 m, steering on a noisy position estimate. Capture means
crossing the mouth within 0.5 m of the axis, heading within 30 degrees and ground speed at most 1.2 m/s.
Capture rates over 60 seeded runs per cell (full table: [`experiments/results.txt`](experiments/results.txt)):

- **Pursuit (head for the dock) and plain line-of-sight capture 0% in any cross current of 0.1 m/s or more,
  with perfect position.** Plain LOS leaves a steady offset `delta*tan(asin(c/U))` (0.60 m for c = 0.1, U = 1,
  delta = 6 m), already wider than the 0.5 m gate. This builds on `marine-path`'s result.
- **Integral LOS captures 98 to 100% with perfect position at 1.0 m/s near-dock speed (0.1 to 0.3 m/s current).**
- **Slow approach fails by crab angle.** The boat must point `asin(c/U)` into the current. At a 0.5 m/s
  docking speed the 0.3 m/s current needs 36.9 degrees, over the 30 degree gate: 0% at 0.2 and 0.3 m/s, 32%
  at 0.1. At 0.8 m/s: 97, 82 and 70% for 0.1, 0.2, 0.3 m/s. The usual "slow down to dock" fails in current;
  the speed floor is `c / sin(psi_max)`.
- **Position noise matters more than strategy once currents are weak.** With AR(1) errors (5 s time
  constant), 0.5 m standard deviation gives 55% for ILOS at 1.0 m/s, and 1.0 m gives 37 to 40%: errors the
  size of the gate leave a coin toss. In still water ILOS is worse than LOS under noise (75% against 98%
  at 0.25 m), since its integrator accumulates the correlated error.
- At 0.25 m noise and 1.0 m/s, ILOS gives 77, 82, 85% for 0.1, 0.2, 0.3 m/s; LOS gives 32, 0, 0%.

So a docking system needs (1) an integral term or current estimate, (2) a near-dock speed above
`c/sin(psi_max)`, and (3) a position source better than about a third of the gate width.

## Method and reproduce

```bash
cd research/marine-dock
PYTHONPATH=src python3 -m pytest tests -q                        # 4 tests
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 8 minutes
```

`boat.py` is `marine-path`'s 3-DOF surge-sway-yaw boat (copied, to keep the project self-contained).
`dock.py`: pursuit, LOS and ILOS (Borhaug, Pavlov and Pettersen 2008) on a noisy estimate, 6 m look-ahead,
ILOS gain 0.5, speed 1.0 m/s beyond 15 m from the mouth, then the near-dock speed. Start offset uniform
within 5 m; 1 degree compass noise; six-sinusoid waves at scale 0.25.

## Limitations

- Boat coefficients, wave forces and the noise model are unsourced placeholders (as in `marine-path`); no
  published docking trial was reproduced. The gate (0.5 m, 30 degrees, 1.2 m/s) is my choice. I tuned the ILOS
  gain (1.0 to 0.5) and widened the heading gate (15 to 30 degrees) on seeds 1000 to 1019 after a first run
  failed in still water; the reported seeds are 0 to 59. The earlier gain 1.0 captured only 35%.
- No funnel, fenders or compliance: a real dock forgives much of what is scored a miss here.
- Along-axis current, wind, a final slow-down and reverse thrust are not modelled; the noise is not drawn from
  a GNSS, USBL or camera spec. Nothing was built or tested in water.
- Any real operation needs the flag state's and harbour authority's rules.

## Owner steps

None for this milestone. A physical test needs a boat, a dock and a position source; none was bought.

## Next steps

Source the noise from a GNSS-RTK or USBL datasheet; add a funnel and a current estimator; compare an MPC.

## Tags

Labs: HIRO Group (manipulation workcell docking analogue), RECUV (unmanned vehicles).

## References

Borhaug, E., Pavlov, A. and Pettersen, K. Y. (2008). Integral LOS control for path following of
underactuated marine surface vessels in the presence of constant ocean currents. *IEEE CDC*,
doi:10.1109/CDC.2008.4739352. Fossen, T. I. (2011). *Handbook of Marine Craft Hydrodynamics and Motion
Control*. Wiley, doi:10.1002/9781119994138.
