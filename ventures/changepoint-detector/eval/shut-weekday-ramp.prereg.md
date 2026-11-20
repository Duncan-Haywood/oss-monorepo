# A shop shut one weekday, round 3: a gradual climb instead of a step (pre-registered 2026-11-20, before any ramp shop ran)

## Why this round

Rounds 1 and 2 (`eval/shut-weekday.prereg.md`, README "A shop shut one weekday") left a contradiction. On the real
shop (UCI Online Retail, both years) Quiet never heard the autumn climb with the shut Saturdays in, and heard it within
a week with them left out. On 100 simulated shops with a +30% **step**, the default was not deaf (38 caught) and the
drop gained nothing (34). The README named the likeliest difference: the real climb is **gradual over weeks**
(about £26k to £50k a day, September to November), not a step. This round tests that explanation, and whether the
drop helps on it.

Nothing in this round has run. The step-shop results (rounds 1 and 2) are known and are not re-scored here.

## Simulation (`eval/shut-weekday-ramp-sim.mjs`, seed 20261120, fixed now)

The same shop as `eval/shut-weekday-sim.mjs` (371 days from a Monday; Saturdays 0; other days
`level * weekday factor * lognormal(0, 0.35)`; factors Sun 0.6, Mon 1.2, Tue to Fri 1.0; AR(1) wobble in the log level,
rho 0.5, sd 0.05; 3% wholesale days x4; 5 random one-day weekday closures), with a fresh seed and three groups of 100:

- **N**: no change.
- **R30**: a ramp to +30%: from a start day `a` drawn uniformly in days 200 to 300, the log level rises linearly over
  `L` days (`L` uniform in 28 to 56) to log(1.3), then stays there.
- **R90**: the same with a ramp to +90% (the real shop's size: £26k to £50k is x1.9).

Arms, as before, Quiet (the default detector, `model: 'mean'`, watch from day 74): **D** the default with
`--period 7`; **T** `dropShutWeekdays` (round 2's last-8 rule) with period 7 - k.

**Caught** (a ramp has no single date, so the window is the ramp): an alert dated from `a - 7` to `a + L`, sent no
earlier than day `a` and within 14 days of its date (the F1 timing on the real shop).

## Bars

- **P1 (the explanation: ramps deafen the default):** D catches at most 25 of 100 R30 shops (two-thirds of its 38 on
  +30% steps). If P1 fails, gradual climbs are not what made the real watch deaf, whatever the other bars say.
- **P2 (the drop hears the real-sized climb):** on R90, T catches at least 60 and at least D + 15.
- **P3 (and the smaller one):** on R30, T catches at least D + 10.
- **P4 (no new false alerts):** on N, T sends at most 2 alerts per 100 checks.

Descriptive, no bar: Middle (`detector: 'bocpd'`) with and without the drop on R30 and R90 (the README's second open
item, "Middle's deafness to slow climbs"), and the median delay of caught alerts.

## What follows from each outcome

- P1 to P4 all pass: the drop ships as an **opt-in** watch option (round 2's F4 failure on steps stands, so it is
  not the default), named in the README with both results.
- P1 passes and P2 or P3 fails: ramps explain the deafness but the drop is not the fix; nothing ships, the helpers
  stay for the next round.
- P1 fails: the explanation is wrong; the real shop's deafness needs another simulation feature (a rising AR(1)
  estimate, real wholesale clumping), and nothing ships.

Whatever happens, the result is written up in the README.
