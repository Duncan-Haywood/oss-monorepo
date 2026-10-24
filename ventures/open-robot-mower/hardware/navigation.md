# Navigation: RTK GNSS (no boundary wire), or a perimeter wire

## RTK GNSS, the default

Ordinary GNSS is good to a few metres, which is useless for mowing
stripes. RTK (real-time kinematic) compares the carrier phase seen by the
mower with the phase seen by a fixed **base station** whose position is
known, and gets the mower's position to about 1-2 cm while it holds a
"fixed" solution.

### Parts

- **Rover** (on the mower): a multi-band receiver (u-blox ZED-F9P class)
  and a multi-band antenna on the mast, above the shell, with a clear view
  of the sky.
- **Base**: a second receiver and antenna on a fixed mount (a roof, a
  fence post set in concrete) within a few kilometres, with as much open sky
  as you can give it. Run it in survey-in mode once to fix its position,
  then let it broadcast RTCM corrections.
- **Correction link**: a LoRa radio pair, or Wi-Fi with an NTRIP caster
  running on any small computer. Some regions have free or paid public
  correction networks; with one of those you do not need your own base.

### The mower's frame

The Pi converts the receiver's latitude and longitude to a local
east-north frame in metres with its origin at the base station. That is
the frame `mowerbot` works in: lawn boundary, holes and dock are all
`(x, y)` in metres.

### Mapping a lawn

1. Drive (or push) the mower round the boundary with the blade off and
   record fixes every 0.5 m. Do the same round each flowerbed, tree and
   pond.
2. Simplify each loop to its corners (or keep every point: the planner
   accepts any polygon).
3. Save it as `{"outer": [[x, y], ...], "holes": [[[x, y], ...]], "dock": [x, y]}`
   and plan it: `mowerbot plan --lawn lawn.json`. You can also draw it in
   the browser planner on the project page and copy the JSON.

### When the fix drops

Trees, walls and the house shade the sky, and the solution can fall back
from "fixed" to "float" (tens of centimetres) or worse. The rule in this
design: **when the fix is not RTK-fixed, stop the blade and wait.** The
Pi stops sending `BLADE` and drives nowhere until the fix returns, and gives
up and reports after a timeout. The simulation models this as a Poisson
process of fix losses and shows they cost time, not coverage
(`mowerbot simulate --fix-losses 20`). Lawns with a lot of tree cover may
simply not suit RTK; a perimeter wire is the fallback.

### What the planner does with it

`mowerbot.planner` keeps the disc centre half a cut width inside every edge
(so the cut edge is on the boundary line), cuts two loops round the edge and
one round each hole, fills the rest with stripes at the quickest angle, and
routes transits round holes on a visibility graph. `mowerbot.drive` drives
it one segment at a time (turn on the spot, then pure pursuit along the
segment), which keeps stripe ends square.

## Perimeter wire, the alternative

The older way, used by many commercial robots: a wire pegged round the
lawn edge (and round flowerbeds, as a loop out and back) carries a coded
audio-frequency current. Two coil sensors on the mower measure the field;
its sign tells inside from outside.

What this design would need:

- a signal generator for the wire (a small H-bridge driven by a coded
  pattern, current-limited, powered from the dock);
- two coil sensors with an op-amp each at the front corners, into two spare
  ESP32 ADC pins (GPIO 2 and 12 are free; see [electronics.md](electronics.md));
- a different planner: with no position fix, the mower runs random or
  systematic bounces inside the wire rather than stripes.

It is cheaper (no RTK receivers) and works under trees, but it does not
stripe, and the wire has to be laid and repaired. Not implemented in this
v0.1; the hardware above is a sketch, not a design.
