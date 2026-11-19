# Electronics and pin map

Both robots share one architecture: a Raspberry Pi 5 for vision and
planning, an ESP32 for real-time motor control and safety, a 24 V
LiFePO4 battery, and a hard-wired emergency stop that cuts motor power
independently of any software.

```
            +-------------------+   UART 115200 (protocol.py)   +-----------------------+
 cameras -->|  Raspberry Pi 5   |<----------------------------->|  ESP32 (firmware/)     |
            |  tennisbots       |                               |  speed/position loops  |
            +---------+---------+                               |  watchdog, e-stop sense|
                      | 5 V 5 A buck                            +-----+-----------+-----+
                      |  [2 A]                                        |           |
 24 V LiFePO4 --[30 A]--+--[e-stop contactor]--+--[fuse block]--+-- ESCs / H-bridge --+
                        |                       |
                        +--[relay]--[4.7 ohm]---+   precharge (2026-11-14)
                        |                       |
                        +-----------|<|---------+   regen return Schottky (2026-11-14)
                                                             +-- lift, agitator, stepper driver
                                                             +-- shuttle servo (via 6 V buck) ---+
```

The Pi's buck takes its supply between the main fuse and the contactor, so the
Pi and the ESP32 stay powered through an e-stop and can report it. Every motor
branch is after the contactor.

The e-stop is a normally-closed mushroom switch in series with the
contactor coil: pressing it (or a broken wire) opens the contactor and
de-energises every motor. Since 2026-11-14 the switch feeds two coils: a
small precharge relay, which closes at once and charges the switched bus
through a 4.7 ohm resistor, and a 0.5 s on-delay timer module, which then
closes the contactor's coil. Pressing the e-stop drops both. The wireless
e-stop relay stays in series ahead of them. The ESP32 also reads the switch (GPIO 4) so it
latches a software e-stop and reports it in telemetry; clearing needs the
button released *and* a `CLEAR_ESTOP` command. Since 2026-11-18 the feeder
also needs RESET pressed at the machine before its motors get power again
(next section).

## Reset at the machine (feeder, 2026-11-18)

Before this, releasing the e-stop (or the fob) re-powered the motors at once,
and the only other step was a `CLEAR_ESTOP`, which can come from a phone or a
script anywhere on the network (the 2026-11-08 quality audit named it). An
emergency stop's reset should not restart a machine, and the restart should be
a deliberate act at the machine (ISO 13850 asks the same). Now:

```
 +24 V --[fob relay]--[e-stop NC]--S--+--[RESET NO]--+--H--+--(K0 coil)-- 0 V
                                      |              |     |
                                      +--[K0 NO]-----+     +--[RESET NC]--P--+--(precharge relay coil)
                                         (hold)                              +--(0.5 s timer)--(contactor coil)
```

- **K0** is a small 24 V relay (the same 10 A class as the precharge relay).
  Its coil is on node S, after the fob and the e-stop, through RESET's NO
  contact in parallel with K0's own NO contact, so once set it holds itself.
  Any cut of S (e-stop, fob, a broken wire, the pack disconnected) drops it,
  and nothing but RESET sets it again.
- **RESET** is a 22 mm momentary push button with one NO and one NC contact,
  mounted beside the e-stop. Its NC contact feeds the precharge relay and the
  timer from K0's node. Pressing RESET sets K0 but opens P, so power comes back
  0.5 s after the button is **let go**, never while it is held: a button jammed
  or taped down never powers the motors. Pressing it while the machine runs
  drops the bus, like the fob.
- **At switch-on** K0 is open, so the motors have no power until someone presses
  RESET. The Pi and the ESP32 are before the contactor and start as before.
- **What the board sees.** Nothing new is wired to the ESP32 (it has no free
  pin): with K0 open the contactor's coil is off, so GPIO 15 reads it and
  telemetry carries `FLAG_BUS_OFF`. `CLEAR_ESTOP` still clears the board's own
  latch, but the motors stay unpowered; the drill runner and the phone page
  (`tennisbots serve`) now say to press RESET on the feeder.
- **The fault that defeats it:** RESET's NO contact welded shut with the button
  let go. Then K0 sets itself on any release and the machine behaves as the
  old wiring did (power on release, `CLEAR_ESTOP` still needed). A safety relay
  module with a monitored manual reset (one that resets only on the button's
  falling edge and checks its own contacts) closes that too, at more cost;
  check yours on every build: press the e-stop, release it, and confirm the
  wheels do not turn and the page reports the bus off until RESET.

`Feeder.estop_reset_chain` (cad) steps this logic at 1 ms and
`check_estop_reset` runs it through switch-on, RESET held, e-stop and fob
releases, RESET taped down, RESET while running and the welded contact; the
build fails if a release re-powers the bus by itself, or if the coil current
the hold contact and RESET's NC carry (about 0.32 A with assumed coils: the
precharge relay 0.04 A, the timer 0.03 A, the contactor 0.25 A) passes their
ratings. The simulated feeder (`tests/feeder_sim.py`) has the latch too
(`press_reset()`). Coil currents and contact ratings are assumptions: read your
parts' sheets.

## ESP32 pins, feeder role

| GPIO | Function |
| --- | --- |
| 25 | ESC, top launcher wheel (50 Hz servo pulse) |
| 26 | ESC, bottom launcher wheel |
| 34 | Tachometer, top wheel (IR reflective, 1 pulse/rev) |
| 35 | Tachometer, bottom wheel |
| 27 | Elevation actuator: servo pulse (`ELEV_MODE = "rc"`) or H-bridge PWM (`"pot"`, `"timed"`) |
| 23 | Elevation H-bridge DIR (`pot`, `timed`) |
| 39 | Elevation feedback pot wiper (`pot`; input-only, ADC1, 0-3.3 V: power the pot from 3.3 V; 100k wiper to GND; 1 uF ceramic GPIO 39 to GND at the board, against the actuator's PWM in the same lead: cad/README.md "The pot's pickup from the motor pair") |
| 14 / 21 | Azimuth stepper driver STEP / DIR (NEMA 17, 10:1 gear sector) |
| 22 | Azimuth home switch (to GND, pull-up: low = at home, about -32 deg) |
| 5 | Azimuth stepper driver EN (active low; 4.7k pull-up to 3.3 V keeps the driver off through reset; low only once the contactor is closed) |
| 15 | Contactor coil sense (PC817 across the coil through 10k, transistor to GND, pull-up: low = coil energised) |
| 13 | Feed gate servo |
| 32 / 33 | Base motor driver PWM / DIR (both driven wheels on one channel) |
| 18 / 19 | Base encoder A / B |
| 4 | E-stop sense (NC switch to GND, pull-up: high = pressed) |
| 36 | Battery voltage via 100k/10k divider |
| 12 | Ball lift gearmotor MOSFET (PWM). The module must pull its input down: GPIO 12 high at reset makes the ESP32 pick 1.8 V flash and not boot |
| 2 | Hopper agitator gearmotor MOSFET (PWM; low through reset, so the motor stays off while the board boots) |
| 0 | Lift over-current: LM393 comparator output (open collector, 10k pull-up to 3.3 V; low = the lift draws over its trip current, about 1.6 A). High at reset because the lift is off then, so the board boots normally (cad/README.md "Lift jam cutoff") |
| 17 / 16 | UART2 TX / RX to the Pi |

No GPIO is left: on a WROOM-32 module only 1 and 3 remain, and they are UART0,
the USB console the firmware is flashed over. That is why the empty-hopper
check (2026-11-16) reads the launcher wheels' tachometers instead of a
break-beam over the column (`firmware/esp32/README.md`, "Empty hopper"). A
future sensor needs a pin freed first, or an I/O expander on two of them.

Until 2026-11-14 the lift and agitator were on GPIO 16 and 17, the UART's
own pins: the UART, opened last, took them back, so neither motor would have
turned. `tests/test_pins.py` now loads `firmware/esp32/main.py` against a fake
board and fails on any pin claimed twice, a flash or input-only pin driven, a
strapping pin that floats high at boot, or a feeder pin missing from this table.

## Lift jam cutoff (2026-11-15)

A ball caught between a flight and the boot or the hood stalls the lift's
gearmotor. With nothing watching its MOSFET the stall held for the whole
16 s run-on, restarted by every ball fed: about 190 W in the winding at a full
pack (1.1 kJ in 6 s on the simulated feeder), and a hot stall draws only
about 1.4 times the 3 A branch fuse, which a blade fuse can carry for minutes.
Wiring:

- a 0.01 ohm 1 W 1% shunt (2512, four-terminal if you can) in the lift
  motor's `+` lead, between the lift's branch fuse and the motor, with the
  flyback diode's cathode on the motor side of it: the shunt is inside the loop
  the diode closes, so it carries the motor's current while the MOSFET is on
  and while the diode freewheels, and its reading does not depend on the duty
  (cad/README.md "Lift current sense inside the diode loop");
- an INA186A2 current-sense amplifier (gain 50 V/V; its inputs take -0.2 to
  40 V common mode whatever its supply, so it sits on the 29.2 V pack): `IN+`
  and `IN-` on Kelvin leads across the shunt, `VS` 3.3 V with 100 nF, `REF` to
  ground. Its output is 0.5 V per amp, 2.7 V at a cold stall on the held duty; at full
  duty on a full pack (no battery reading) it saturates at the rail, which still trips;
- 10k from the amplifier's output to an LM393's `-` input, 100 nF from that
  input to ground (1 ms: it averages the motor's current ripple and brush spikes);
- 100k from 3.3 V to the `+` input and 33k from it to ground (0.819 V: a trip
  at 1.64 A, 1.51 to 1.77 A over the rail, resistors, shunt, the amplifier's
  gain error and offset and the comparator's offset). It is the same at every
  duty, so on a full 29.2 V pack, where the firmware holds the duty to 0.82
  (`LIFT_V_REF_MV`, below), the trip stays at 1.77 A at most, 1.30 times under
  the 2.30 A the motor draws while the slip hub (set to 0.9 N m, 1.0 until the
  sense moved high side) slides. History
  (all 2026-11-15): a 0.05 ohm shunt in the MOSFET module's source, which sees
  current only while the MOSFET conducts, so its trip in motor amps was the
  divider's over the duty: 3.9k and 2.48 A until the slip hub, 2.7k and 1.74 A
  until the duty followed the battery, then 2.4k, 1.55 A at full duty and 2.20 A
  at 0.82 (1.14 times under the slide);
- the LM393 powered from 3.3 V, its open-collector output to GPIO 0 with a 10k
  pull-up to 3.3 V (most dev boards already carry one for their BOOT button);
  the unused half's inputs to ground and 3.3 V.

The firmware (`controller.LiftRun`) ignores the comparator for 400 ms after
each start, cuts the motor when it reads low on two ticks 10 ms apart, rests
2 s, tries once more, and then leaves the lift off with `FLAG_LIFT_JAM` set
until the e-stop is pressed and released (the bus dropping clears it). Above
24 V on the battery reading (GPIO 36) it runs the lift at 24 V / reading
(smoothed over 0.5 s, never under 0.82), so the belt keeps its 24 V speed on a
full pack (cad/README.md "Lift duty follows the battery"). The
drill runner logs the flag once and carries on: the hopper still holds balls.
Numbers and their assumptions: the manifest's "lift jam" line and
`tests/lift_jam_sweep.py`.

## ESP32 pins, collector role

| GPIO | Function |
| --- | --- |
| 32 / 33 | Left drive PWM / DIR |
| 18 / 19 | Left encoder A / B |
| 25 / 26 | Right drive PWM / DIR |
| 21 / 22 | Right encoder A / B |
| 27 | Pickup roller MOSFET gate (PWM) |
| 13 / 14 | Bumper switches left / right (to GND, active low) |
| 23 | Hopper-full IR break beam (active low) |
| 4 | E-stop sense |
| 36 | Battery voltage |
| 17 / 16 | UART2 TX / RX to the Pi |

Pins 34-36 are input-only on the ESP32 and have no internal pull-ups; the
tachometer modules drive them directly. Avoid the strapping pins (0, 2,
5, 12, 15) for anything that is pulled at boot.

## Power budget (estimate, not measured)

| Load | Feeder | Collector |
| --- | --- | --- |
| Launcher wheels (spin-up peaks ~300 W, holding speed much less) | ~100 W average | - |
| Base / drive motors | ~40 W average | ~30 W average |
| Pi 5 + cameras | ~12 W | ~10 W |
| ESP32, servos, sensors | ~8 W | ~5 W |
| **Total** | **~160 W** | **~45 W** |
| 24 V 20 Ah LiFePO4 (~510 Wh) runtime | **~3 h** | **~10 h** |

Measure your build with an inline power meter and update this table.

## Wiring notes

- **Cables to the head (2026-11-13):** every driver stays on the deck, and
  the head's wires rise on the turntable axis, twist there, and make one
  free loop to a clip on the head's rear lower standoff. Cut the loop to the
  manifest's `cable_cut_mm` (376 mm), keep it loose in a spiral wrap, and
  keep ties off the run between the axis clamp and the gland
  (`cad/README.md`, "Cables to the head").
- **Servo supply:** a 6 V 5 A buck on the deck, with 20 AWG supply and
  return to the servo. A stock 26 AWG servo extension over the 1.8 m run
  lifts the servo's ground about 0.58 V at stall, which leaves a 3.3 V
  signal little margin. Standard-size servos of this class are rated to about
  6.8 V, so do not run them from a 7.4 V BEC.

- **Deck-side run (2026-11-14):** from the electronics along the deck, up
  the +y rear mast post's inner face, under the crossbar and the clamp arm,
  and up into the axis clamp (`cad/README.md`, "Deck-side cables"). Cut the
  head's wires 789 mm from their deck terminals to the clamp. The azimuth
  stepper's StepStick driver sits on a printed carrier on the deck's M3 grid
  (STEP/DIR on GPIO 14/21, EN on GPIO 5 with a 4.7k pull-up to 3.3 V, 100 uF across 24 V; see "Stepper ENABLE after the contactor" below); its coils run
  874 mm of 22 AWG with the home switch's 26 AWG pair. The lift gearmotor's
  lead is 916 mm of 20 AWG. Twist each tachometer pair: they share the
  bundle with the launcher phases.

- Fuse the battery positive within 15 cm of the terminal (feeder 30 A,
  derived below; collector ~15 A).

## Fuses and branch wiring, feeder (2026-11-14)

From `cad/otr_cad/params.py` `Feeder.power_distribution` (the manifest's
"power" line). Currents are at the 24 V low-battery cut and come from assumed
part figures (each one is listed in the parameters: read your datasheets).
Each branch fuse is the smallest standard rating at or above 1.25 times its
running current, and at or above half its stall current, because a motor
starts at stall current for a few milliseconds. Its wire is the thinnest gauge
that carries the fuse's rating (from a conservative table, `AWG_AMPS`), and
never thinner than 20 AWG.

| Branch | Running | Fuse | Wire |
| --- | --- | --- | --- |
| Launcher ESC, top | 6.4 A | 15 A | 16 AWG |
| Launcher ESC, bottom | 6.4 A | 15 A | 16 AWG |
| Dual H-bridge: base (two gearmotors) and elevation | 6.0 A | 7.5 A | 20 AWG |
| Lift gearmotor MOSFET | 2.0 A | 3 A | 20 AWG |
| Agitator gearmotor MOSFET | 0.8 A | 1 A | 20 AWG |
| Azimuth stepper driver | 0.3 A | 1 A | 20 AWG |
| Servo buck, 6 V | 0.8 A | 2 A | 20 AWG |
| Pi buck, 5 V (before the contactor, inline holder) | 0.6 A | 2 A | 20 AWG |
| **Battery feed, main fuse and contactor** | **23.3 A** | **30 A** | **12 AWG** |

- **Every load at once draws 23.3 A**, the worst case of a drill starting: both
  wheels spinning up while the base moves and the head aims. That is under 80%
  of an assumed 30 A BMS continuous limit (24.0 A). If your BMS allows less,
  the build's check names the `WHEEL_SPINUP_W` that fits.
- **The ESCs draw what the firmware's ramp allows.** The ramp caps each wheel at
  100 W of shaft power while it spins up, which is 6.4 A at the battery. Without
  it, a wheel starting from rest could draw the motor's 1 kW peak: 49 A per
  ESC. Each ESC fuse is twice the ramped draw, because the speed loop's
  recovery after each ball is not modelled. Use slow-blow fuses there if
  normal ones open during a drill.
- **The contactor** must be rated 30 A DC or more at 24 V (its coil on 24 V,
  through the NC mushroom switch), so the main fuse protects it.
- **The battery feed:** 12 AWG, about 0.6 m each way, drops 0.15 V at 23.3 A.
- **Precharge (2026-11-14, `Feeder.contactor_inrush`, the manifest's
  "inrush" line).** Closing the contactor straight onto the ESCs' empty input
  capacitors is a short through the loop's few tens of milliohms. On assumed
  figures (40 mOhm pack, 1,000 uF per ESC, 0.68 uH loop) at the charger's
  29.2 V it peaks near 394 A after about 31 us, 13 times the contactor's
  30 A rating, and stays over an assumed 150 A BMS short-circuit trip for
  170 us. Across 27 combinations of pack resistance, ESC capacitance and loop
  inductance (`tests/inrush_sweep.py`) it peaks at 242 to 589 A and outlasts an
  assumed 200 us BMS delay in 9, which would cut the Pi too. The fuses do not
  care: the pulse's I^2 t is about 15 A^2 s in all, under 4 in each ESC fuse.
  With the precharge the relay makes about 6 A, the bus is within 1.4 V of
  the pack after 0.5 s (45 time constants; what is left is the idle loads'
  assumed 0.3 A across the resistor), and the contactor makes about 20 A
  (29 A at worst in the sweep). The resistor takes about 1 J per closing. If
  the bus is shorted it takes 181 W for the 0.5 s delay, 91 J, before the
  contactor closes onto the short and the fuses open: choose one rated for that
  pulse or one that fails open. Every figure but the charger's voltage is an
  assumption: put a current clamp and a scope on the first closing, and read
  your BMS's short-circuit settings.
- **Loads that start during the precharge (2026-11-14, `Feeder.precharge_bus`).**
  The 20 A above assumes the switched loads idle at 0.3 A while the bus
  charges. A buck or a stepper driver draws constant power once it starts
  (assumed at 8 V), and 4.7 ohm can pass at most 30 W into the bus at 24 V.
  The firmware used to pulse the shuttle servo from power-up, so a servo
  stopped mid-stroke by an e-stop sought home at stall (about 20 W) while the
  bus charged: at 24 V that held the bus near 8 V and the contactor would make
  about 223 A (136 to 328 A across the sweep). Since 2026-11-14 the servo gets
  no pulse until a FEED, and rests unpowered at the crank's dead centres. The
  azimuth stepper driver held from power-up while its ENABLE was tied to GND:
  about 8 W, so the contactor made about 45 A at 24 V (28 to 66 A across the
  sweep, over an assumed 60 A with a 20 mOhm pack).
- **Stepper ENABLE after the contactor (2026-11-14, `Feeder.contactor_bounce`,
  firmware `controller.PowerGate`).** The driver's EN goes to GPIO 5 with a
  4.7k pull-up to 3.3 V (off through reset; remove any pull-down the driver
  board puts on EN). A PC817 optocoupler's LED goes across the contactor's
  coil through a 10k resistor, its transistor from GPIO 15 to GND. The
  firmware pulls EN low only once the coil has been on for 150 ms
  (`CONTACTOR_SETTLE_MS`, longer than an assumed 50 ms pull-in and 10 ms
  bounce), and lets it go the moment the coil drops; a dropped coil also halts
  the board, clears the feed queue and makes the azimuth home again, and
  telemetry sets `FLAG_BUS_OFF` (1024). With nothing starting during the
  precharge the contactor makes about 20 A (12 to 29 A across the sweep).
  A 10 ms contact bounce re-closes onto under 1 V (about 12 A), because the
  precharge relay holds the bus while the contacts are open. The coil sense
  also catches a wireless e-stop the board would otherwise not see.
- **Regenerative braking (2026-11-14, `Feeder.regen_braking`, the manifest's
  "regen" line).** The firmware lowers a wheel's speed at the same 100 W it
  spins up with, and most ESCs follow a lower throttle by braking, which
  puts up to about 170 W back on the bus (6 A for both wheels). Into the
  pack that is fine. Into a bus the pack is not taking it is not: if the
  e-stop opens the contactor mid-brake, the ESCs keep braking for tens of
  milliseconds (until their next 50 Hz pulse), and about 6 J into the bus's
  2,300 uF passes the H-bridge's 30 V rating in under 1 ms. So fit a
  **Schottky diode (45 V 20 A class) across the contactor and the precharge
  relay**, anode on the switched bus, cathode between the main fuse and the
  contactor. It returns braking current to the pack with the contacts open
  (the bus stays near 28.4 V) and cannot power the bus from the pack, so the
  e-stop still cuts every motor. A full pack refuses charge too: braking at
  29.2 V would lift the highest cell past an assumed 3.65 V BMS cut, so the
  firmware coasts instead of braking when the battery reads above 27.6 V
  (`REGEN_BRAKE_MAX_MV`). If your BMS blocks charging when cold, set
  `WHEEL_BRAKE = False` so the wheels always coast. Set the ESCs' brake at
  zero throttle off.
- **Not modelled:** every load's real current, and how hard your ESC really
  brakes. Log the battery current on the first build with an inline meter,
  and scope the bus on a 20% slow-down.
- Common ground between the Pi, ESP32, ESCs and drivers; run the UART on a
  short twisted pair.
- ESCs: calibrate the throttle range once, with the wheels removed.
- Keep motor wiring away from the camera ribbon cables.
