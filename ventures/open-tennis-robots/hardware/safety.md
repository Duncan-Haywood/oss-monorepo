# Safety

These are machines that throw hard objects at up to ~30 m/s (more than
100 km/h) and robots that drive around people. Read this before you build
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
  robot. Add a wireless e-stop fob (a latching relay remote in series)
  before you use the feeder alone.
- **Watchdog**: the ESP32 stops every motor if the Pi sends nothing for
  300 ms (`firmware/esp32/controller.py`).
- **Feed interlock**: a ball is released only when both launcher wheels
  are within 5 % of their commanded speed, so a stalled or slowing wheel
  cannot throw a short, unpredictable ball.
- **Command limits** in firmware: wheel rpm, aim angles, base speed and
  drive speed are clamped whatever the Pi sends.
- **Collector bumpers**: contact stops forward motion; only reversing is
  accepted until the bumper clears.
- **Keep-out zones**: the collector never plans a path through the
  player's or the feeder's zone.

## Your responsibility

- Guard both launcher wheels fully; never reach into the head unless the
  e-stop is pressed and the wheels have stopped.
- Test new drills at low speed first; stand to the side, not in front of
  the muzzle, while the feeder spins up.
- Nobody but the player on the court while the feeder runs. Children and
  pets off the court.
- The catch net is a sail: ballast it and stop in strong wind.
- Lithium batteries: use a BMS, a fused output and a charger matched to
  the chemistry; never charge unattended.
- Check your club or facility's rules before running robots on their
  courts.
