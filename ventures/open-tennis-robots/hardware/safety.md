# Safety

These are machines that throw hard objects at up to about 47 m/s (about
170 km/h) at the firmware's 7,000 rpm wheel limit (`firmware/esp32/controller.py`,
`MAX_RPM`; 150 mm wheels at 0.85 efficiency), and robots that drive around
people. Guard and net for that speed, not for typical rally speeds. Read this before you build
or power one.

**No warranty.** This design is provided free and as-is, without warranty
of any kind, express or implied. It is not engineering or safety advice,
and it does not replace a qualified professional. **You are responsible
for reviewing and verifying it before relying on it**, and for building,
testing and operating anything you make from it safely and lawfully. To the
maximum extent permitted by law, the authors accept no liability for any
loss, damage or injury arising from its use.

## Built into the design

- **Hard-wired e-stop** that cuts motor power through a contactor, on each
  robot. On the feeder the same switch also feeds the precharge relay and the
  contactor's on-delay timer, so pressing it drops all three
  (`electronics.md`, 2026-11-14). Add a wireless e-stop fob (a latching relay remote in series)
  before you use the feeder alone. Since 2026-11-14 the feeder's ESP32 also
  senses the contactor's coil (GPIO 15), so a fob that drops it halts the
  board and clears its feed queue even though the button was never pressed.
- **Reset at the machine** (feeder, 2026-11-18): releasing the e-stop or the
  fob does not re-power the motors, and neither does any command from the Pi or
  a phone. Someone must press and let go of RESET on the feeder, and power
  returns 0.5 s after the button is let go; a RESET jammed down never powers
  them (`electronics.md`, "Reset at the machine"). Test it on every build.
- **Watchdog**: the ESP32 stops every motor if the Pi sends nothing for
  300 ms (`firmware/esp32/controller.py`).
- **Feed interlock**: a ball is released only when both launcher wheels
  have stayed within 3 % of their commanded speed for 150 ms (and at least six
  revolutions of the slower wheel), so a stalled or slowing wheel cannot throw
  a short, unpredictable ball (`controller.SteadyGate`; this said 5 % until
  2026-11-18, the gate's figure before 2026-11-11).
- **Command limits** in firmware: wheel rpm, aim angles, base speed and
  drive speed are clamped whatever the Pi sends.
- **Collector bumpers**: contact stops forward motion; only reversing is
  accepted until the bumper clears.
- **Keep-out zones**: the collector never plans a path through the
  player's or the feeder's zone.

## Your responsibility

- Guard both launcher wheels fully; never reach into the head unless the
  e-stop is pressed and the wheels have stopped.
  The wheels are not braked to a stop: after a stop or an e-stop they coast,
  and from the drill's top speed that takes at least 20 seconds (a lower
  bound on an assumed drag, `Feeder.regen_braking`). Watch them stop; do not
  count on the e-stop to stop them.
- Test new drills at low speed first; stand to the side, not in front of
  the muzzle, while the feeder spins up.
- Nobody but the player on the court while the feeder runs. Children and
  pets off the court.
- The catch net is a sail: ballast it and stop in strong wind.
- Lithium batteries: use a BMS, a fused output and a charger matched to
  the chemistry; never charge unattended.
- Check your club or facility's rules before running robots on their
  courts.
