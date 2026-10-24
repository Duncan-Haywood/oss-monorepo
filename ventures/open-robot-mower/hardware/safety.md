# Safety

A robotic mower is a spinning blade that drives itself around a garden
where children and animals play. Read this before you build or power one.

**No warranty.** This design is provided free and as-is, without warranty
of any kind, express or implied. It is not engineering, electrical or
safety advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying it before relying on it**, and for
building, testing and operating anything you make from it safely and
lawfully. To the maximum extent permitted by law, the authors accept no
liability for any loss, damage or injury arising from its use.

## The hazard, in numbers (`mowerbot blade-stop`)

At 2,800 rpm the blade tips move at about **34 m/s** (over 120 km/h). The
disc and blades store about **51 J**; one razor blade carries about **1.4 J**
on its own, which matters if its pivot screw ever fails and it leaves. Those
figures come from the design's dimensions and typical blade masses, not
from measurement.

## Built into the design

- **Guard ring.** A full ring round the blade, 29 mm outside the blade-tip
  circle, reaching down to 15 mm off the ground, which is below the blade
  plane at every cut height. A design rule fails the CAD build if the guard
  stops short of the blade plane or comes within 12 mm of the tips.
- **Distance from the edge.** The blade-tip circle is at least 129 mm in
  from the shell's outer edge on every side (design rule: at least 100 mm).
- **Pivoting razor blades** rather than a rigid bar: low mass, and they fold
  back on a hard hit.
- **Blade interlock in firmware** (`firmware/esp32/controller.py`): the blade
  runs only while there is no latched stop, the Pi's heartbeat is fresh
  (300 ms), the shell is not lifted or bumped, the mower is within 20 degrees
  of level, it is dry, it is off the dock and the battery is above cutoff.
  Any failure stops the blade, and it stays stopped until the Pi asks again.
- **Latched stops** on the stop button, a lifted shell, a tilt past 35
  degrees and a software `ESTOP`. They clear only on `CLEAR_ESTOP`, and only
  while the input that caused them has gone.
- **Hardware stop path.** The stop button is wired in series with the blade
  relay's coil, so it stops the blade even if the ESP32 hangs. The relay's
  normally-closed contacts short the motor phases, which brakes the disc
  without the ESC.
- **Stop-time check.** If the disc is still turning 1.5 s after a stop, the
  firmware latches a blade fault until power is cycled.
- **Missing sensors read as unsafe.** A missing or failed IMU reads as tipped
  over; a cut stop-button wire reads as pressed.

### The stop-time target

This project's own target is **the blade below 30 rpm within 1.0 s** of any
stop signal. The model gives about 0.46 s with short braking and about 14 s
if the disc only coasts, with motor constants assumed rather than read
from a datasheet. Measure your build: film the disc with a phone's slow
motion while you lift the shell, and count frames. The target is a design
choice with margin, not a figure taken from a standard.

### Standards

Robotic lawn mowers sold to the public are covered in many places by the
IEC 60335-2-107 safety standard (and its regional versions), which sets
requirements on blade access, stopping, lifting, tilting and markings. This
design was not assessed against it and makes **no claim of compliance**. If
you sell mowers built from it, you are the manufacturer: meeting the
standards, radio and battery rules where you sell is your responsibility.

## What it does not protect against (v0.1)

- **Single-channel sensing.** Apart from the stop button, every stop goes
  through one microcontroller. A safety-rated design would use redundant,
  monitored channels.
- **A hand or a foot under the shell.** The shell skirt stops 90 mm above
  the ground; the guard ring is the only barrier around the blade at ground
  level. Nothing detects a person or animal in front of the mower: the bump
  sensors need contact, and a small animal or a lying child may not trip them.
- **Thrown objects.** A stone hit by a blade can be thrown out under the
  guard. Clear the lawn first.
- **Wrong position.** If the RTK fix is wrong but reported as fixed, the
  mower can leave the lawn. Keep the boundary away from drops, ponds, roads
  and play areas, and run the first sessions while you watch.

## Rules for running it

1. **Never run it while children or pets are on the lawn.** Schedule it
   when nobody is outside.
2. Bench-test with the **blade disc removed** and the wheels off the ground
   until every stop works ([firmware README](../firmware/esp32/README.md)).
3. Remove the disc before you turn the mower over, adjust the height or
   clean underneath. The main switch off is not enough on its own: the
   relay or ESC could fail closed.
4. Wear gloves when changing blades; the razor blades are sharp.
5. Never mow wet grass or slopes steeper than the model says, and test new
   slopes with the blade off.
6. Charge the battery with the charger made for it, away from anything
   flammable, and stop using a pack that swells or gets hot.
