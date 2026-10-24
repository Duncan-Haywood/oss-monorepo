# Robot mop module

The mop build is the platform plus a water tank, a peristaltic pump, a
vibrating pad on a lift, and a rear caster.

```
tank (0.38 L, float switch) --> peristaltic pump (~20 ml/min) --> three drip holes at the front of the pad plate
pad plate (printed, 95 x 170 mm) <-- vibration motor in a pocket
        ^ two 6 mm guide rods through the base, lifted 4.5 mm by two micro servos
microfibre pad (hook-and-loop) on the floor
```

| Part | What | Where |
| --- | --- | --- |
| Water tank | printed, closed, 0.38 L inside, fill cap on top, outlet barb at the front | rear module, under the deck hatch |
| Pump | 12 V peristaltic, ~20 ml/min at full duty (check yours) | on the base behind the axle |
| Pad plate | printed, 8 mm thick, with a pocket for a 7 x 25 mm vibration motor | under the base, 125-30 mm behind the axle |
| Lift | two guide rods in printed guide blocks, two 9 g servos | 4.5 mm travel |
| Pad | 95 x 170 mm microfibre with hook-and-loop backing | buy several and wash them |
| Rear caster | ball caster on a printed spacer | 138 mm behind the axle |

## Water: how much, and never a puddle

`floorbots mop-dose` turns a target wetness into a pump duty:

```
dose (ml/m^2) = pump flow (ml/min) x duty / (pad width x speed x 60)
```

At 0.25 m/s with the 170 mm pad and a 20 ml/min pump, 3 ml/m^2 needs 38%
duty and a full tank lasts about 125 m^2 (`floorbots mop-dose`; the
combo's 0.135 L tank and 150 mm pad: 34% duty, about 43 m^2). The 3 ml/m^2 target is a
starting point to tune on your floor (too wet streaks and soaks wood, too
dry smears), not a tested figure.

The firmware runs the pump only while both wheels are commanded forward
**and** the encoders measure at least 50 mm/s, the pad is down and the
tank is not empty. Turning on the spot, backing off a cliff, stalled
wheels, a lifted robot, a dropped heartbeat or any fault stop it. A
stuck robot cannot leave a puddle; `tests/test_firmware.py` checks each
case.

## The wall strip

A round mop-only robot cannot mop right up to a wall: its pad is under its
body, and its body keeps 165 mm from the wall. The simulator shows the
cost: in the three preset rooms the pad reaches 77-87% of the floor,
against 95-100% for the vacuum, whose side brush reaches past the bumper.
Ways to close the gap, none modelled yet: a D-shaped body with a square
front, a pad that swings out at walls, or a spinning pad that extends past
the body.

## Lift

Two micro servos lift the pad 4.5 mm off the floor for transit, docking
and rugs. The CAD build checks the lifted pad, plate, motor and rods
against everything else. 4.5 mm clears hard-floor thresholds and low
rugs only; carpet needs more travel, which means a higher base plate.
