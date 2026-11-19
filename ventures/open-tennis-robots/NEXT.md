# open-tennis-robots: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-17) find where a real actuator's cable leaves its housing and bend a built lead through the travel
- (2026-11-17) measure the lift gearmotor's shaft and body (75 mm face to back at most) and press F626s into the printed fit ring (lift_bearing_fit_ring), run `fit-ring` and set lift_bearing_fit_mm. Scope GPIO 39 at part duty. Actuator's lead: cut 220 mm, 209-231 fits

## Needing a person (added 2026-11-18)

- Log a VESC in speed mode on the bench: a 3 s spin-up from rest at the current limit, eight 2% setpoint steps 400 ms apart (up and back four times) at 1,500 rpm on the free wheel, and a few balls, with the VESC's own rpm and current over UART beside the hall tach. Run `tests/speed_ramp_fit.py` (`spinup_fit`, `loop_from_steps`, `drop_from_speed_ramp`) on it to see whether a real recovery is the clamped ramp then the PI tail (firmware/esp32/README.md, "A ramp-then-PI drop fit for a speed-mode ESC").

## Buildable here (added 2026-11-18)

- (2026-11-19) Straddle votes shipped at 1.5 ms (margin 2, eval/take-straddle-vote-2026-11-19.md; margin 1 closed,
  eval/take-straddle-margin-one-2026-11-19.md) and at 2.5 ms (margin 2, eval/take-straddle-two-2026-11-19.md: 102 to 110
  of 180 held-out spread takes named, 0 of 90 instant builds misadvised; margin 1 misadvised 3). Still open: whether the
  votes can tighten the TAKE_US = 0 bound (the 8 builds floor 0 misses had no straddling wheel at all; it won back 2 of
  14 loosened instant bounds there, not held out), and a margin scaling with the straddle count (test on fresh seeds,
  not AA-AN). Most of the 70 still-missed takes have no straddling wheel at either candidate: more tach edges or balls.
- (2026-11-19) More tach pulses a revolution: tested host-side and closed by its pre-registered rule
  (eval/tach-pulses-2026-11-19.md: four magnets saw 46 of 128 short-take balls against 38, not twice; the step's drop
  error rose 0.11% to 0.55%). Reopen only with a survey-level test written first (the board sums ~22 wheels) and a plan
  for the step's drop. Best lead: with 0.5 us sensor jitter (not judged) four magnets saw 24 short-take balls against 9
  and bounded them at a median 3.5 ms against none, so test it on a jittery tach first; `drop_from_commands_steps(per=, angles=)` and `magnet_spacing` are ready for it.
- (2026-11-19) One informative wheel, counted by drill: closed for simulated sets (eval/take-survey-kept-drills-2026-11-19.md:
  6 of 432 fresh drills rested a verdict on one kept wheel, too few for the rule; `TAKE_SURVEY_MIN_KEPT` stays 0). Reopen
  on a real wheel's logs with `tests/take_survey_kept.py --drills`.
