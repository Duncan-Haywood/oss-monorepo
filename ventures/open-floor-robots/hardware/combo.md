# Vacuum-mop combo module

The combo is the vacuum's nozzle and side brush, a split rear module (dust
bin on the right, water tank on the left), and a narrower pad behind the
nozzle. It vacuums and mops in one pass: dirt is picked up before the wet
pad reaches it.

| | Vacuum | Mop | Combo |
| --- | --- | --- | --- |
| Bin | 0.22 L | none | 0.13 L |
| Tank | none | 0.38 L | 0.135 L |
| Pad | none | 95 x 170 mm | 47 x 150 mm |
| Rear caster | no | yes | yes |
| Lane spacing (planner) | 0.15 m | 0.15 m | 0.10 m |
| Draw while cleaning (assumed) | 33 W | 9.5 W | 34.5 W |

Values from the CAD (`manufacturing/combo/README.txt`) and
[`src/floorbots/variants.py`](../src/floorbots/variants.py).

## What the combo costs

- **Time.** The planner spaces lanes for the narrowest tool so every tool
  covers the floor. The combo's 150 mm pad means 0.10 m lanes on the 5 cm
  grid, against 0.15 m for the vacuum. In the apartment preset that is
  25.5 minutes against 20.1 (`floorbots compare --room apartment`).
- **Capacity.** The split module holds about half as much dust and a
  third as much water as the single-purpose builds.
- **The wall strip.** As with the mop build, the pad under the body
  cannot reach the wall: 77-87% of the floor mopped in the presets, while
  the side brush still vacuums 95-100%.

## Running it

- `CLEAN` and `MOP` commands both apply (`firmware/esp32/config.py`:
  `ROLE = "combo"`).
- Lift the pad (`MOP pump, vibration, pad_down=0`) on rugs and while
  driving home; the firmware also stops the pump whenever the robot is not
  driving forward.
- The pump sits on top of the nozzle housing and the tank's outlet barb
  faces it; route the tube along the left side of the housing.
