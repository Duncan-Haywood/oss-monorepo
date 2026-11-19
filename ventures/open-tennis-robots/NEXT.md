# open-tennis-robots: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-17) find where a real actuator's cable leaves its housing and bend a built lead through the travel
- (2026-11-17) measure the lift gearmotor's shaft and body (75 mm face to back at most) and press F626s into the printed fit ring (lift_bearing_fit_ring), run `fit-ring` and set lift_bearing_fit_mm. Scope GPIO 39 at part duty. Actuator's lead: cut 220 mm, 209-231 fits

## Needing a person (added 2026-11-18)

- Log a VESC in speed mode on the bench: a 3 s spin-up from rest at the current limit, eight 2% setpoint steps 400 ms apart (up and back four times) at 1,500 rpm on the free wheel, and a few balls, with the VESC's own rpm and current over UART beside the hall tach. Run `tests/speed_ramp_fit.py` (`spinup_fit`, `loop_from_steps`, `drop_from_speed_ramp`) on it to see whether a real recovery is the clamped ramp then the PI tail (firmware/esp32/README.md, "A ramp-then-PI drop fit for a speed-mode ESC").

## Buildable here (added 2026-11-18)

- (2026-11-19) Short takes (eval/take-short-2026-11-19.md): the fit sees 1.5 ms takes (summed dense least right on 13 of 18); the grid's end misses them. Candidate grid 0, 1.5, 2.5, 3-8 ms on held-out set M: within 0.5 ms 48 vs 41 of 66, large misses 3 vs 11, but one instant build read 0.8 ms (not advised), so it failed its rule. Next: a fresh set (new lag and seed) with the instant clause written on advice (no instant build advised), committed before capture; `tests/take_short_blind.py --compare`.
