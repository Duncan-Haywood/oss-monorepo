# open-tennis-robots: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-17) find where a real actuator's cable leaves its housing and bend a built lead through the travel
- (2026-11-17) measure the lift gearmotor's shaft and body (75 mm face to back at most) and press F626s into the printed fit ring (lift_bearing_fit_ring), run `fit-ring` and set lift_bearing_fit_mm. Scope GPIO 39 at part duty. Actuator's lead: cut 220 mm, 209-231 fits

## Needing a person (added 2026-11-18)

- Log a VESC in speed mode on the bench: a 3 s spin-up from rest at the current limit, eight 2% setpoint steps 400 ms apart (up and back four times) at 1,500 rpm on the free wheel, and a few balls, with the VESC's own rpm and current over UART beside the hall tach. Run `tests/speed_ramp_fit.py` (`spinup_fit`, `loop_from_steps`, `drop_from_speed_ramp`) on it to see whether a real recovery is the clamped ramp then the PI tail (firmware/esp32/README.md, "A ramp-then-PI drop fit for a speed-mode ESC").

## Buildable here (added 2026-11-18)

- (2026-11-19) The eight-point grid (0, 2, 3, 4, 5, 6, 7, 8 ms) shipped (eval/take-grid-eight-2026-11-19.md). The nine-point grid now adds only the 1 ms point; G to I's large misses at 1-2.5 ms are the fit's (the same builds on every grid), so test the fit's take-blindness under 2.5 ms before another grid point.
