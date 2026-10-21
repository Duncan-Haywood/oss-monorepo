# Safety

These are battery-powered robots with spinning brushes and a fan that
drive around a home, near children and pets, with lithium cells inside and
a mains charger at the dock. Read this before you build or power one.

**No warranty.** This design is provided free and as-is, without warranty
of any kind, express or implied. It is not engineering, electrical or
safety advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying it before relying on it**, and for
building, testing and operating anything you make from it safely and
lawfully. To the maximum extent permitted by law, the authors accept no
liability for any loss, damage or injury arising from its use.

**No compliance claim.** Robot cleaners sold to the public are generally
expected to meet a household-appliance safety standard (for example
IEC 60335-2-2, the part of IEC 60335 that covers vacuum cleaners and
water-suction cleaning appliances), battery and charger standards, and
radio and EMC rules where they are sold. This design has not been tested
against any of them. A build made from it is not certified, and if you
sell one you are the manufacturer and those duties are yours.

## Built into the design

| Hazard | What the design does | Where |
| --- | --- | --- |
| Falling down stairs | Six cliff sensors (four front, two rear). Front cliff while moving forward: the firmware reverses for 400 ms on its own, whatever the Pi says, then refuses forward motion until the sensor sees floor. Rear cliff: no reverse. | `firmware/esp32/controller.py`; sensor lead vs stopping distance in `cad/ofr_cad/params.py` |
| Driving off an edge too fast to stop | Speed is capped at 0.35 m/s, so latency plus braking (38 mm, estimated) fits inside the 52 mm the outer cliff sensors lead the wheels | `MAX_DRIVE_MM_S`; checked by the CAD build and `tests/test_firmware.py` |
| Fingers in brushes when picked up | Two wheel-drop switches: if either opens, everything (wheels, brushes, fan, pump) stops and stays stopped until the robot is down and the fault is cleared | `FLAG_WHEEL_DROP` |
| A crashed or disconnected Pi | No heartbeat for 300 ms stops everything | watchdog |
| Stop button | Normally-closed: a press or a cut wire latches an e-stop; software cannot clear it while the button is open | `FLAG_ESTOP` |
| Tools running at power-on | The PWM board's output-enable has a pull-up: tools are off until the firmware enables them | `hardware/electronics.md` |
| Over-discharged cells | Firmware stops at 3.2 V per cell (sustained 1 s, so a bump's sag does not trip it); the BMS cuts lower | `LOW_BATTERY_MV` |
| Overheating | A thermistor on the battery pack: over 60 C everything stops, and an open or shorted thermistor reads as too hot. The wheel drivers (DRV8871) shut themselves down when hot. | `MAX_TEMP_DC`, `temp_dC()` |
| Water where it should not be | Pump only while driving forward and measured moving, pad down, tank not empty | `pump_allowed()` |
| Fan with the bin out | Fan runs only with the bin's reed switch closed | `bin_present()` |
| Bumping people and pets | 0.35 m/s cap, a 5 mm-travel bumper that stops forward motion on contact, 2.3-2.6 kg estimated mass | |

## Lithium battery

- Use a pack with a **BMS** (over-charge, over-discharge, over-current,
  short circuit) and a thermistor. Buy a built pack from a reputable
  supplier rather than spot-welding cells yourself unless you know how.
- Use a **certified 4S (16.8 V) Li-ion charger**. The dock's mains supply
  must be a certified, enclosed unit; never build a mains supply.
- Fuse the battery positive (7.5 A). Insulate every exposed conductor.
- Do not charge unattended until you have watched many charge cycles,
  and never charge a pack that is swollen, hot, wet or damaged.
- Keep the pack away from the water tank and pump; route the tube on the
  far side of the robot from the battery and electronics, and seal the
  tank (test it full, on paper, for a day before fitting it).

## Your responsibility

- Bench-test with the wheels off the ground and the brushes removed.
  Check that the stop button, unplugging the UART, lifting the robot and
  covering each cliff sensor each stop everything before anything else.
- Test cliff handling on a low step (a book on the floor) before any
  stairs, and keep a hand near it. Dark carpet can look like a cliff to IR
  sensors: tune them on your floors.
- Keep cords, small objects, pet mess and liquids off the floor: brushes
  wind up cords, and a vacuum cannot pick up liquid.
- Mop builds: start with a low pump duty on a floor that tolerates water.
  Do not mop unsealed wood.
- Supervise it until you trust it, and never leave it running with small
  children or pets alone.
