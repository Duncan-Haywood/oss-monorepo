# Robot vacuum module

The vacuum build is the platform plus a nozzle, a roller brush, a side
brush, and a dust bin with the fan on its lid.

```
floor --> [silicone lip, 4 mm gap] --> roller brush (40 x 160 mm) --> printed nozzle housing
      --> duct --> foam gasket --> dust bin (0.22 L) --> filter pad --> fan (60 mm brushless) --> out through the deck vents
side brush (110 mm sweep, front right) flicks edge and corner dirt into the roller's path
```

| Part | What | Where |
| --- | --- | --- |
| Roller brush | 40 mm x 160 mm bristle/rubber roller, driven by a 25 mm DC motor and a GT2 belt | across the base slot, 50 mm behind the axle |
| Nozzle housing | printed hood over the slot with a duct to the bin | `manufacturing/vacuum/print/nozzle_housing.stl` |
| Nozzle lip | two silicone strips glued to the slot edges, 4 mm off the floor | cut list in the BOM |
| Side brush | N20 gearmotor on a printed mount, shaft down through the base | sweep reaches 196 mm from the centre, 31 mm past the bumper |
| Dust bin | printed box, 0.22 L inside, lid holds the filter pad and the fan | lifts out through the deck hatch with the fan |
| Fan | 60 mm brushless vacuum fan, 12-14 V, PWM speed input | on the bin lid |

## Sizing the fan

`floorbots size-fan` finds where the fan curve crosses the system curve
(nozzle and duct losses plus the filter). With the default numbers,
which are **assumptions** for a 60-70 mm robot-vacuum fan and this nozzle,
not measurements:

```
floorbots size-fan   (a summary of the JSON it prints)
operating point: 8.4 L/s, 758 Pa at the nozzle, 13.1 m/s inlet air speed,
                 6.3 W air power, 21 W electrical at an assumed 30% fan efficiency
```

The command also sweeps the nozzle gap (`--gap`, in mm): with the lip at
6 mm instead of 4 the inlet air speed falls from 13.1 to 9.2 m/s for 6%
more flow. That trade (faster air at the floor, less of it) is why the
design has a silicone lip rather than an open slot. The `--target-speed`
you want is your call; the default 10 m/s is an assumption, not a measured
pickup threshold.

## Measuring the system curve

Replace the assumed losses with two numbers from your build:

1. Block the nozzle and read the pressure at the bin with a cheap
   differential pressure gauge: that is close to the fan's real shut-off
   pressure (`--p-max`).
2. Open the nozzle, measure the outlet air speed with a vane anemometer
   and multiply by the outlet area for the flow, and read the pressure
   again. Fit `--k-inlet` and `--r-filter` so `size-fan` gives the same
   point.

## Bin capacity

0.22 L inside (computed from the CAD). `floorbots plan` reports how much
floor fills it at an assumed dust load of 0.5 g per m^2 per clean and a
loose bulk density of 0.3 g/ml. Both are assumptions: weigh what one
clean of your floor collects.

## Safety notes

The fan runs only with the bin in place (a reed switch). Brushes and fan
stop when either wheel-drop switch opens, so a lifted robot does not spin
its brushes near fingers. See [safety.md](safety.md).
