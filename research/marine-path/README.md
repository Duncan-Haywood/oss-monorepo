# Does integral line-of-sight hold a survey line in current? Guidance for a small boat

**Status: preliminary, simulation only; milestone 1 of `marine-path` (track 23), a sub-study of the
[`marine-hull`](../marine-hull/PROPOSAL.md) programme.** A 200 kg survey boat in a cross current drifts
off a line steered by plain line-of-sight (LOS) guidance by a computable amount; integral LOS removes the
drift, unless its gain is too high for the look-ahead.

## Result

- **Plain LOS has a steady offset** `y = delta * tan(asin(c/U))` (cross current `c`, speed through water
  `U`, look-ahead `delta`). The simulated offset matches it within 1% (3.774 m at c = 0.3 m/s, U = 1 m/s,
  delta = 12 m; `tests/test_path.py`). The offset grows with the look-ahead, so a gentle approach costs accuracy.
- **Integral LOS removes it**: end offset under 0.05 m in the same case.
- Over 216 conditions (current 0 to 0.5 m/s x wave scale 0, 0.25, 0.5, 1 x look-ahead 6, 12, 24 m x gain
  0.5, 1, 2; 3 wave seeds), ILOS has lower rms cross-track error than LOS in **136 of 144** cases with
  current at least 0.2 m/s. The 8 exceptions are all look-ahead 6 m with gain 2: with a short look-ahead and
  a strong integrator the loop oscillates (rms about 2.3 m, even with no current).
- Guidance does not change energy much: median 1.4% difference in Wh per ground km; the maximum 37% is the
  oscillating cases, and the run includes the start-up transient from a 15 m offset.
- Full table: [`experiments/results.txt`](experiments/results.txt).

## Method and reproduce

```bash
cd research/marine-path
PYTHONPATH=src python3 -m pytest tests -q          # 7 tests
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # 20 s
```

`boat.py`: 3-DOF surge-sway-yaw dynamics in the relative-velocity form of Fossen (2011, ch. 7), a
rate-limited rudder, a constant earth-frame current. `guidance.py`: LOS, ILOS and the analytic offset.
`sim.py`: heading PD to the rudder, surge PI on speed through water, wave disturbance of six sinusoids
with periods 4 to 9 s. Scores: rms cross-track error over the last half of a 600 s run, and Wh per
ground km (thrust x speed through water / 0.5).

## Limitations

Damping, rudder and wave-force coefficients are placeholders for a 200 kg craft, not read from a datasheet
or from Fossen's MSS; the wave term is a sum of sinusoids, not a JONSWAP spectrum; no wind; no
MPC arm; no propulsion lag; a straight line only; the transient from the 15 m start is in the rms and energy
figures; no field data. The ranking of LOS against ILOS is a property of this model until checked on logged
tracks.

## Next steps

Source the coefficients (Fossen's MSS Otter or a published USV identification); a JONSWAP sea; a gain
rule (ILOS gain against look-ahead) and an MPC arm, scored as in `PROJECTS.md` track 23, item 2; wind.

## Citations

- Fossen, T. I. (2011), *Handbook of Marine Craft Hydrodynamics and Motion Control*, Wiley (not fetched).
- Borhaug, E., Pavlov, A., Pettersen, K. Y. (2008), Integral LOS control for path following of
  underactuated marine surface vessels in the presence of constant ocean currents, *IEEE CDC* (not fetched).
