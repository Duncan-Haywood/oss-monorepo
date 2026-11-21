# open-tennis-robots: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-17) find where a real actuator's cable leaves its housing and bend a built lead through the travel
- (2026-11-17) measure the lift gearmotor's shaft and body (75 mm face to back at most) and press F626s into the printed fit ring (lift_bearing_fit_ring), run `fit-ring` and set lift_bearing_fit_mm. Scope GPIO 39 at part duty. Actuator's lead: cut 220 mm, 209-231 fits

## Needing a person (added 2026-11-18)

- Log a VESC in speed mode on the bench: a 3 s spin-up from rest at the current limit, eight 2% setpoint steps 400 ms apart (up and back four times) at 1,500 rpm on the free wheel, and a few balls, with the VESC's own rpm and current over UART beside the hall tach. Run `tests/speed_ramp_fit.py` (`spinup_fit`, `loop_from_steps`, `drop_from_speed_ramp`) on it to see whether a real recovery is the clamped ramp then the PI tail (firmware/esp32/README.md, "A ramp-then-PI drop fit for a speed-mode ESC").

## Buildable here (added 2026-11-18)

- (2026-11-21) Nuts the spanner check (cad/README.md, "Spanners on the nuts") cannot see yet, because what they clamp
  is not drawn as built: draw the turntable bearing as two rings with the access hole and make its eight M5 nuts a
  joint (a ring end through an access hole may not swing: a socket on an extension, along the axis, would then be the
  tool to model); make the levelling feet's jam nuts joints. (Idler axles, fixed through the hub bearings, and the spool
  axle landed 2026-11-21: cad/README.md, "Idler axles fixed, and the spool axle".) Then a person: hold a 13 mm spanner on the drum axle's nut between two
  rods of a built cage and say whether 200 mm is enough.
- (2026-11-19) Straddle vote shipped at margin 2 (eval/take-straddle-vote-2026-11-19.md); margin 1 closed by its own
  pre-registered test (eval/take-straddle-margin-one-2026-11-19.md: 85 of 120 named against 72, but 3 of 48 instant
  builds told to set 1.5 ms on 2-1 splits). The 2.5 ms vote shipped at margin 2 the same day
  (eval/take-straddle-long-2026-11-19.md: held out 70 to 76 of 120 named, 0 of 48 instant misadvised; 11 of the 14
  2.4-3.5 ms builds still at 0 had one straddling wheel or none). The vote in the TAKE_US = 0 bound shipped (`host.TAKE_BOUND_STRADDLE`,
  eval/take-bound-vote-2026-11-19.md: held out 85 of 204 instant builds bounded 1.5 ms against 83, none uncovered; 119
  still at 2.5 ms or more, 109 of 204 with no wheel straddling at 1.5 ms, so the bound now waits on more straddling
  balls, not on the frame's reading). A margin scaled to the straddle count closed on design (eval/take-straddle-scaled-2026-11-19.md:
  no build of 1302 had more than 5 straddling wheels, and below 7 a binomial rule at alpha 0.05 is margin 2). The longer survey
  shipped 2026-11-20 as a recommended drill (drill.survey-long.json, 24 shots; eval/take-straddle-count-2026-11-20.md:
  1.3-2.1 ms takes named 26 of 36 against 17, 0 of 36 instant misadvised, 1.72x the straddles for 2x the balls). The 36-shot
  triple closed by its pre-registered rule 2026-11-20 (eval/take-straddle-triple-2026-11-20.md: 0 of 36 instant
  misadvised, but 27 of 36 short takes named against the long drill's 26, needed 30; 1.3 ms still 4 of 12; the scaled
  margin changed no verdict on its 2 builds at 7+ straddles). That 1.3 ms item was answered 2026-11-20 (eval/feed-phase-2026-11-20.md): the
  simulator had fixed where in a revolution each ball landed, so no shot mix could be tuned for it; with a random
  release (`feed_jitter_ms`) the long drill names 21 of 36 short takes and misadvises 1 of 36 instant builds, and a
  fast drill (34-40 m/s) 22 and 1; not shipped. Margin 3 with the fast drill against margin 2 with the long drill
  closed by its pre-registered rule the same day (eval/feed-phase-margin-2026-11-20.md, 288 fresh builds each: 48
  against 66 of 108 short takes named, 2 against 2 of 108 instant misadvised). The fast drill against the long
  drill, both at the shipped margins, closed by its pre-registered rule the same day (eval/feed-phase-drill-2026-11-20.md,
  fresh seeds 9501-9671: 72 against 65 of 108 short, 68 against 62 of 72 long, but 2 against 0 of 108 instant
  misadvised; one extra allowed). Pooled over both fresh sets: about 7 more short takes named per 100 for about one more
  false alarm per 100; a 2.5 ms margin of 3 stopped neither false alarm. The take-survey vote is now settled on
  simulated data: every drill and margin trades named takes for false alarms at roughly that rate, so the next real
  information is a real wheel's tach log (`tests/take_survey_kept.py --drills`), not another simulated sweep. Every take-survey capture from here on should
  pass `--feed-jitter 26`.
- (2026-11-19) More tach pulses a revolution: tested host-side and closed by its pre-registered rule
  (eval/tach-pulses-2026-11-19.md: four magnets saw 46 of 128 short-take balls against 38, not twice; the step's drop
  error rose 0.11% to 0.55%). Reopen only with a survey-level test written first (the board sums ~22 wheels) and a plan
  for the step's drop. Best lead: with 0.5 us sensor jitter (not judged) four magnets saw 24 short-take balls against 9
  and bounded them at a median 3.5 ms against none, so test it on a jittery tach first; `drop_from_commands_steps(per=, angles=)` and `magnet_spacing` are ready for it.
- (2026-11-19) One informative wheel, counted by drill: closed for simulated sets (eval/take-survey-kept-drills-2026-11-19.md:
  6 of 432 fresh drills rested a verdict on one kept wheel, too few for the rule; `TAKE_SURVEY_MIN_KEPT` stays 0). Reopen
  on a real wheel's logs with `tests/take_survey_kept.py --drills`.
