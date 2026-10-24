# Does the `osrobot-uav` multirotor energy model match real aircraft? A check against two published endurance figures

Follow-up to `osrobot-uav` (track 9, open-source purpose-built robots), taking the first item of its "Next steps": **calibrate the constants against published data.** In the direction of the RECUV and Autonomous Systems IRT interest in UAV simulation; nothing here is affiliated with or endorsed by either. Produced with AI assistance (Claude). Pure Python standard library; the `osrobot-uav` model is imported unchanged. No aircraft was built or flown. Only two aircraft had a published mass, pack energy and endurance I could fetch, so this is a small, preliminary check, not a calibration of the whole model. **The fixed-wing and VTOL models were not checked** (no published pack energy found).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/osrobot-uavcal/

- **The model is the right size, but the unpublished rotor diameter decides the verdict.** For the DJI Mavic 3E (1.050 kg, 77 Wh, 45 min) and the Parrot Anafi UKR (1.450 kg, 78.5 Wh, 38 min), the model's endurance over the published one runs from 0.68 to 2.21 (Mavic) and 0.47 to 1.47 (Anafi) as rotor diameter goes from 0.15 to 0.30 m and usable pack share from 0.8 to 1.0. Neither the 0.15 nor the 0.30 m end is excluded by anything sourced here.
- **Diameter at which the model reproduces the published endurance:** Mavic 3E 0.181 m at 90 % usable (0.168 to 0.197 over 100 to 80 %); Anafi UKR 0.248 m (0.230 to 0.269). Both are plausible rotor sizes for 1 to 1.5 kg quadrotors, but I did not source the aircraft's actual rotor diameters, so this is a consistency check, not a pass.
- **At a mid-range 0.22 m rotor and 90 % usable energy** the model gives 58.9 min for the Mavic 3E (1.31 × published, at its own best-range speed of 15.1 m/s) and 32.3 min for the Anafi at the published 6.0 m/s (0.85 ×). The two errors have opposite signs, so a single constant (figure of merit 0.70, drive efficiency 0.81) is not simply too high or too low.
- **Model hover power at 0.22 m is 96 W (Mavic) and 156 W (Anafi).** No hover power or hover time was found in the sources, so hover is unchecked.

- **Update, with a sourced diameter for the Mavic 3.** DJI's store listing for the Mavic 3 propellers gives 9.4 x 5.3 in (23.9 x 13.5 cm), so rotor diameter is 0.239 m. At that diameter the model gives 58.5, 65.8 and 73.2 min at 80, 90 and 100 % usable energy, which is 1.30, 1.46 and 1.63 times the published 45 min (hover power 88 W). So the model is optimistic for the Mavic 3E: the diameter that "matched" (0.18 m) is well below the real one. That points at the efficiency constants (figure of merit 0.70, drive efficiency 0.81), body drag, or the model's speed (14.5 m/s best-range, which may not be the speed behind the 45 min figure), not at the rotor size. The Anafi UKR diameter was not found, so its row is still a sweep.

Full grid in `experiments/results.txt`.

## Reproduce
```bash
cd research/osrobot-uavcal
python3 -m unittest discover -s tests -v   # 7 tests
python3 experiments/run.py                 # writes experiments/results.txt
```

## Method
`osrobot_uavcal/cal.py` takes each aircraft's mass and pack energy, computes the model's electrical level-flight power (`fwd_power` at the published speed for the Anafi, `mr_best_speed` for the Mavic, whose speed regime is not stated on the page used) plus the model's 5 W avionics, and divides usable pack energy by it. Rotor diameter is swept over 0.15 to 0.30 m, usable share over 0.8 to 1.0, and a bisection finds the diameter that matches.

## Sources
| Value | Source |
|---|---|
| Mavic 3E: max takeoff 1.050 kg, 5000 mAh, 15.4 V (77 Wh), 45 min max flight | English Wikipedia, "DJI Mavic 3", specifications table (fetched 2026-10-22) |
| Mavic 3 rotor diameter 9.4 in (23.9 cm) | DJI store listing, "DJI Mavic 3 Low-Noise Propellers" (store.dji.com), seen as a web-search snippet 2026-10-22; page not fetchable from the sandbox, so check it before citing |
| Anafi UKR: max takeoff 1.450 kg, 6800 mAh, 11.55 V, "38 minutes at 21.6 km/h" | English Wikipedia, "Parrot Anafi", specifications table (fetched 2026-10-22) |

Wikipedia stands in for the manufacturers' pages, which did not return usable text; the figures should be checked against the datasheets before anyone cites them. Manufacturer endurance figures are maxima under stated conditions, not measurements by this project.

## Limitations
- Two aircraft, one class (folding camera quadrotors), figures from a secondary source. Publishers' endurance numbers are best cases, so the model should be expected to look somewhat pessimistic against them.
- Rotor diameter, payload and the Mavic's test speed are unknown, which is the whole spread in the result.
- Nothing about fixed wings or the VTOL design is tested; the Raven (1.9 kg, 60 to 90 min) has no published pack.

## Next steps
Source the Anafi UKR rotor diameter, and the speed behind the Mavic's 45 min, then fit the efficiency constants to both; source battery masses from the manufacturers' datasheets to pin the diameter; find fixed wings with a published pack energy, wing area and endurance to test the fixed-wing branch.

## Builds on
Momentum-theory hover power as in `osrobot-uav` (`research/osrobot-uav`), whose assumed constants this checks.
