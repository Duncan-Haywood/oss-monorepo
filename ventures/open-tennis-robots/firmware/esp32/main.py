"""MicroPython entry point for the ESP32 motor controller (feeder or collector).

Copy to the board with `mpremote cp protocol.py controller.py main.py config.py capture.py :`
(protocol.py lives in src/tennisbots/; see firmware/esp32/README.md).
Pin assignments match hardware/electronics.md. Status: the logic in
controller.py is unit-tested on CPython; this hardware layer has not yet
been run on a board, so bench-test it with the wheels off the ground.
"""

import time

from machine import ADC, PWM, UART, Pin

import config
import controller

try:
    import micropython
    micropython.alloc_emergency_exception_buf(100)   # a fault inside the hard tach interrupt can still be reported
except ImportError:                                    # CPython (tests/feeder_sim.py)
    pass
import protocol

ROLE = getattr(config, "ROLE", controller.ROLE_FEEDER)
# Lift and agitator MOSFETs (feeder role). Until 2026-11-14 they were on GPIO 16 and 17, which are UART2 to the Pi:
# run() opens the UART after FeederHw, so it took the pins back and neither motor would ever have turned. 12 and 2 are
# the free outputs that the ESP32 holds low through reset (so the motors stay off while it boots); the MOSFET module
# must pull its input down (most do; else add 10k to GND) and nothing may pull GPIO 12 high at reset, or the ESP32
# selects 1.8 V flash and does not boot. tests/test_pins.py checks the map.
LIFT_PIN = 12
AGIT_PIN = 2
# Azimuth stepper ENABLE and the contactor's coil sense (2026-11-14, cad/README.md "Stepper ENABLE after the
# contactor"). The driver's EN is active low; a 4.7k pull-up to 3.3 V holds it off while the ESP32 boots (GPIO 5 is a
# strapping pin that must not be low at reset, which the pull-up also guarantees). A PC817 optocoupler's LED sits
# across the contactor's coil through 10k; its transistor pulls GPIO 15 low while the coil is energised (GPIO 15 low at
# reset only silences the boot log, and the coil is never on that early: the timer's 0.5 s runs from the e-stop's
# release, and a mid-run reset of the board leaves at worst a quiet boot).
AZ_EN_PIN = 5
COIL_SENSE_PIN = 15
# Lift over-current (2026-11-15, cad/README.md "Lift jam cutoff"): an LM393 comparator's open-collector output, low
# while the lift draws more than its trip current, with a 10k pull-up to 3.3 V (most dev boards already have one on
# GPIO 0, for their BOOT button). GPIO 0 low at reset selects the serial bootloader, but at reset the lift's MOSFET is
# off (GPIO 12 is held low), no current flows in the shunt (the belt backdriving the motor through the diode puts
# at most 0.16 A through it, under the 1.5 A trip) and the output is released: the board boots normally.
# Pressing the BOOT button while running reads as over-current; after the blanking that trips the lift, nothing else.
LIFT_SENSE_PIN = 0


class Encoder:
    """Quadrature counter on two GPIOs (x2 decoding on channel A edges)."""

    def __init__(self, a, b):
        self.count = 0
        self._b = Pin(b, Pin.IN, Pin.PULL_UP)
        Pin(a, Pin.IN, Pin.PULL_UP).irq(self._edge, Pin.IRQ_RISING | Pin.IRQ_FALLING)
        self._a = Pin(a)

    def _edge(self, _pin):
        self.count += 1 if self._a.value() != self._b.value() else -1


class Motor:
    """DC motor on a PWM + DIR driver channel (e.g. Cytron MDD10A)."""

    def __init__(self, pwm_pin, dir_pin, freq=20000):
        self.pwm = PWM(Pin(pwm_pin), freq=freq, duty_u16=0)
        self.dir = Pin(dir_pin, Pin.OUT, value=0)

    def set(self, duty):  # -1.0 .. 1.0
        duty = max(-1.0, min(1.0, duty))
        self.dir.value(1 if duty < 0 else 0)
        self.pwm.duty_u16(int(abs(duty) * 65535))


class SpeedLoop:
    """PI wheel-speed loop from encoder counts."""

    def __init__(self, motor, enc, counts_per_m, kp=0.0015, ki=0.004):
        self.motor, self.enc, self.cpm = motor, enc, counts_per_m
        self.kp, self.ki = kp, ki
        self.target = 0.0
        self.i = 0.0
        self.last = 0

    def update(self, dt):
        c = self.enc.count
        speed = (c - self.last) / self.cpm / dt * 1000  # mm/s
        self.last = c
        if self.target == 0:
            self.i = 0.0
            self.motor.set(0)
            return
        err = self.target - speed
        self.i = max(-0.6, min(0.6, self.i + err * self.ki * dt))
        self.motor.set(self.target * 0.0008 + self.kp * err + self.i)


class Servo:
    def __init__(self, pin, lo_us=1000, hi_us=2000):
        self.pwm = PWM(Pin(pin), freq=50, duty_u16=0)
        self.lo, self.hi = lo_us, hi_us

    def frac(self, f):
        us = self.lo + (self.hi - self.lo) * max(0.0, min(1.0, f))
        self.pwm.duty_u16(int(us / 20000 * 65535))


class Tach:
    """One pulse per revolution from a reflective IR sensor on the wheel hub, timed per revolution
    (controller.PeriodTach: counting pulses per 10 ms tick could only read multiples of 6000 rpm)."""

    def __init__(self, pin, cap_ch=None):
        self.last_us = time.ticks_us()
        # config.TACH_CAPTURE (2026-11-18, README "A tach timed in hardware"): the edge time comes from MCPWM0's capture
        # channel `cap_ch`, latched in hardware, so the handler's latency no longer reaches the periods. Off by default.
        # config.TACH_CAPTURE_SUB (README "Periods finer than a microsecond"): the capture's periods in 1 / SUB us.
        self.cap = None
        if cap_ch is not None and getattr(config, "TACH_CAPTURE", False):
            import capture
            sub = getattr(config, "TACH_CAPTURE_SUB", 1)
            self.core = controller.PeriodTach(sub=sub)
            self.cap = capture.Capture(pin, cap_ch)
            self.clock = controller.CaptureClock(self.core.stall_us, sub=sub)
        else:
            self.core = controller.PeriodTach()
        self.rpm = 0
        self.rpm_last = 0
        self.since = 0
        # A hard interrupt (2026-11-16, README "When the wheel is not a first-order lag"): a soft one only schedules
        # _p, so ticks_us() is read whenever the main loop next yields, up to a control tick's work later. The drop fit
        # reads each revolution's period from these times, and on the simulator 5 us of edge jitter took the
        # calibration drill's spin error from 1.6% to 5.3%, 10 us to 16%. _p and PeriodTach.edge allocate nothing
        # (small ints, list stores), as a hard handler must.
        Pin(pin, Pin.IN).irq(self._p, Pin.IRQ_RISING, hard=True)

    def _p(self, _):
        now = time.ticks_us()
        since = time.ticks_diff(now, self.last_us)
        if self.cap is None:
            self.core.edge(since)
        else:
            period = self.clock.period(self.cap.ticks(), since)
            if period >= 0:
                self.core.edge(period)
        self.last_us = now

    def update(self, dt):
        since = time.ticks_diff(time.ticks_us(), self.last_us)
        self.since = since                            # LaunchCheck's tick log aligns each command to the edges with it
        self.rpm = self.core.rpm(since)
        self.rpm_last = self.core.rpm_last(since)     # one revolution, unaveraged: the empty-hopper check reads it


class StepDir:
    """Step/dir pins of a stepper driver (TMC2209 or A4988 class) and a home switch to GND."""

    def __init__(self, step, direction, home):
        self.step = Pin(step, Pin.OUT, value=0)
        self.dir = Pin(direction, Pin.OUT, value=0)
        self.home = Pin(home, Pin.IN, Pin.PULL_UP)

    def home_closed(self):
        return self.home.value() == 0

    def pulse(self, n):
        self.dir.value(1 if n > 0 else 0)
        for _ in range(abs(n)):        # a few tens per tick at most (60 deg/s, see config); the driver needs >= 1 us high
            self.step.value(1)
            time.sleep_us(2)
            self.step.value(0)
            time.sleep_us(2)


class FeederHw:
    def __init__(self):
        self.esc_top, self.esc_bottom = Servo(25), Servo(26)
        self.tach_top, self.tach_bottom = Tach(34, 0), Tach(35, 1)     # MCPWM0 capture channels 0 and 1 (TACH_CAPTURE)
        # Feed shuttle: a servo crank (cad/README.md, "Shuttle drive"); a stroke takes most of a second each way.
        self.gate = Servo(13, getattr(config, "GATE_LO_US", 500), getattr(config, "GATE_HI_US", 2500))
        self.gate_out_ms = getattr(config, "GATE_OUT_MS", 900)
        self.gate_back_ms = getattr(config, "GATE_BACK_MS", 850)
        # Elevation: a linear actuator on the guard-side cheek (cad/README.md, "Elevation drive"); GPIO 27 carries
        # its servo pulse (rc) or the H-bridge PWM (pot, timed) with DIR on 23; the pot wiper is on 39 (ADC1).
        mode = getattr(config, "ELEV_MODE", controller.ELEV_RC)
        self.elev = controller.LinearAxis(mode, controller.ElevationGeometry(), config.ELEV_CLOSED_MM,
                                          config.ELEV_STROKE_MM, -15.0, 45.0, config.ELEV_SPEED_EXT_MM_S,
                                          config.ELEV_SPEED_RET_MM_S, self_locking=config.ELEV_SELF_LOCKING)
        if mode == controller.ELEV_RC:
            self.elev_out = Servo(27, 1000, 2000)
        else:
            self.elev_out = Motor(27, 23)
        self.elev_pot = ADC(Pin(39), atten=ADC.ATTN_11DB) if mode == controller.ELEV_POT else None
        # Azimuth: NEMA 17 through the 15:150 gear sector (cad/README.md, "Azimuth drive"), homed on a switch.
        self.azim_pins = StepDir(14, 21, 22)
        self.az_enable = Pin(AZ_EN_PIN, Pin.OUT, value=1)       # 1 = driver off
        self.coil_sense = Pin(COIL_SENSE_PIN, Pin.IN, Pin.PULL_UP)
        self.power = controller.PowerGate(getattr(config, "CONTACTOR_SETTLE_MS", 150))
        self.azim = controller.StepperAxis(200 * config.AZ_MICROSTEPS * config.AZ_RATIO / 360, config.AZ_VMAX_DEG_S,
                                           config.AZ_ACCEL_DEG_S2, config.AZ_HOME_DEG, -30.0, 30.0)
        self.base = Motor(32, 33)
        self.base_enc = Encoder(18, 19)
        self.estop_pin = Pin(4, Pin.IN, Pin.PULL_UP)
        self.adc = ADC(Pin(36))
        self.target_rpm = (0, 0)
        self.esc_cmd = [0.0, 0.0]
        rpm_full = getattr(config, "WHEEL_RPM_FULL", 9000)
        speed_esc = getattr(config, "ESC_SPEED_LOOP", False)    # README "An ESC with its own speed loop"
        self.wheel_loops = (controller.WheelLoop(rpm_full, speed_esc=speed_esc),
                            controller.WheelLoop(rpm_full, speed_esc=speed_esc))
        ramp = (getattr(config, "WHEEL_SPINUP_W", 100.0), getattr(config, "WHEEL_INERTIA_KGM2", 0.00155),
                getattr(config, "WHEEL_RAMP_MAX_RPM_S", 1500.0))
        self.wheel_ramps = (controller.SpinupRamp(*ramp), controller.SpinupRamp(*ramp))
        self.brake_guard = controller.BrakeGuard(getattr(config, "REGEN_BRAKE_MAX_MV", 27600),
                                                 getattr(config, "REGEN_BRAKE_HYST_MV", 700))
        self.wheels_steady = controller.SteadyGate()
        self.base_target = 0
        self.base_vmax = 0
        self.feeding = 0
        self.fed = 0                  # balls released since power-up; telemetry tells the Pi when its ball has gone
        self.gate_open_until = 0      # forward stroke ends (the ball is at the wheels)
        self.gate_ready_at = 0        # back stroke ends and the next ball has dropped into the pocket
        self.gate_out = False
        # The shuttle's servo gets a pulse only while it has work to do (2026-11-14, cad/README.md "Start-up loads
        # during the precharge"). Both ends of its stroke are the crank's dead centres, so it rests unpowered. Held at
        # GATE_LO_US from power-up, it sought its rest at stall current the moment its buck started, while the bus was
        # still charging through the precharge resistor, and held the bus volts short of the pack when the timer
        # closed the contactor (manifest "inrush" line). So the pulse starts with the first FEED: a back stroke (its
        # position after a power cut is unknown), then the forward stroke.
        self.gate_rest_at = None      # back stroke under way: pulse off at this time
        self.gate_homed = False       # a back stroke has run since power-up or the last stop
        # Ball lift (cad/README.md, "Ball lift"): a gearmotor on a MOSFET (GPIO 12, PWM) runs on after each ball fed.
        self.lift_pwm = PWM(Pin(LIFT_PIN), freq=20000, duty_u16=0)
        # Every jam cut slides the slip hub; the count lives in flash and flags a bench re-set (cad/README.md "Slip hub wear").
        self.lift_jams = controller.JamLog(getattr(config, "LIFT_JAM_LOG", "lift_jams.json"),
                                           getattr(config, "LIFT_SLIP_JAMS", 300))
        self.lift = controller.LiftRun(getattr(config, "LIFT_RUN_ON_MS", 16000), getattr(config, "LIFT_DUTY", 1.0),
                                       getattr(config, "LIFT_JAM_BLANK_MS", 400), getattr(config, "LIFT_JAM_TRIP_MS", 10),
                                       getattr(config, "LIFT_JAM_REST_MS", 2000), getattr(config, "LIFT_JAM_RETRIES", 1),
                                       getattr(config, "LIFT_RAMP_MS", 0), getattr(config, "LIFT_V_REF_MV", 0),
                                       getattr(config, "LIFT_DUTY_MIN", 0.0), getattr(config, "LIFT_BUS_TAU_MS", 500),
                                       on_trip=self.lift_jams.add)
        self.lift_sense = Pin(LIFT_SENSE_PIN, Pin.IN, Pin.PULL_UP)
        # Hopper agitator (cad/README.md, "Hopper agitator"): a gearmotor on a MOSFET (GPIO 2, PWM) stirs the tub's
        # outlet while balls are being fed, so a bridge of balls over it cannot leave the column empty.
        self.agit_pwm = PWM(Pin(AGIT_PIN), freq=20000, duty_u16=0)
        self.agit = controller.AgitatorRun(getattr(config, "AGIT_RUN_ON_MS", 3000), getattr(config, "AGIT_DUTY", 1.0))
        # Empty hopper (2026-11-16, README "Empty hopper"): every forward stroke is judged by the wheels' speed drop, since
        # a ball takes its momentum from them; a stroke that leaves them steady carried an empty pocket. No pin is free
        # for a sensor, and none is needed.
        self.launch = None
        if getattr(config, "LAUNCH_CHECK", True):
            self.launch = controller.LaunchCheck(
                getattr(config, "WHEEL_INERTIA_KGM2", 0.00155), getattr(config, "BALL_KG", 0.0577),
                getattr(config, "WHEEL_RADIUS_M", 0.075), getattr(config, "BALL_RADIUS_M", 0.0335),
                getattr(config, "LAUNCH_SPEED_EFF", 0.85), getattr(config, "LAUNCH_SPIN_EFF", 0.5),
                getattr(config, "LAUNCH_DIP_SHARE", 0.25), getattr(config, "LAUNCH_DIP_MIN", 0.015),
                getattr(config, "LAUNCH_CHECK_MS", 250), getattr(config, "ESC_TAU_US", 0),
                getattr(config, "ESC_SURVEY_GRID_US", controller.ESC_SURVEY_GRID_US),
                getattr(config, "TAKE_US", 0), getattr(config, "TAKE_SURVEY_GRID_US", controller.TAKE_SURVEY_GRID_US))
        self.hopper_empty = False     # the last judged stroke put no ball through the wheels; cleared by the next FEED
        self.dry_strokes = 0          # strokes judged empty since power-up
        self.launches = 0             # strokes judged to have launched a ball since power-up
        self.arm()

    def launch_record(self):
        """The last judged stroke's record for the LAUNCH frame (controller.LaunchCheck.record), or None."""
        return self.launch.record if self.launch is not None else None

    def esc_survey(self):
        """The ESC-lag survey so far for the ESC_SURVEY frame (controller.LaunchCheck.survey_report), or None."""
        return self.launch.survey_report() if self.launch is not None else None

    def take_survey(self, on):
        """SURVEY_TAKE: the contact-time survey on or off (README "The contact time surveyed on the board")."""
        if self.launch is not None:
            self.launch.take_on = on

    def take_survey_report(self):
        """(wheels, least, refined and the drop fit's own contact time in 0.1 ms, mean rms per candidate, wheels summed
        after the take-blind ones were left out, rms units per ppm, straddling wheels for and against TAKE_STRADDLE_US)
        for the TAKE_SURVEY frame, or None before the survey's first wheel."""
        if self.launch is None:
            return None
        r = self.launch.take_report()
        return None if r is None else (r[0], r[1], r[2], self.launch.take_ms10(), r[3], self.launch.take_kept(),
                                       r[4] if len(r) > 4 else 1) + tuple(self.launch.take_straddle())

    def esc_tau_ms(self):
        """The ESC lag the drop fit runs with (config ESC_TAU_US), ms, for the ESC_TAU frame, or None with no launch check."""
        return int(round(self.launch.esc_tau_us / 1000)) if self.launch is not None else None

    def arm(self):
        self.esc_top.frac(0)
        self.esc_bottom.frac(0)

    def gate_back(self, now):
        """Pulse the shuttle back for GATE_BACK_MS (the next ball drops into the pocket meanwhile), then rest."""
        self.gate.frac(0)
        self.gate_homed = True
        self.gate_ready_at = now + self.gate_back_ms
        self.gate_rest_at = self.gate_ready_at

    def stop_all(self):
        self.target_rpm = (0, 0)
        self.esc_cmd = [0.0, 0.0]
        for loop in self.wheel_loops:
            loop.i = 0.0
        for ramp in self.wheel_ramps:
            ramp.rpm = 0.0
        self.wheels_steady.ok_ms = 0
        self.arm()
        self.base.set(0)
        self.base_vmax = 0
        self.feeding = 0
        # No pulse after a stop: an e-stop cuts the servo's power, and when it returns the bus is precharging. A shuttle
        # cut mid-stroke goes back with its ball (none counted) on the next FEED, before any forward stroke.
        self.gate.pwm.duty_u16(0)
        self.gate_out = False
        self.gate_rest_at = None
        self.gate_homed = False
        self.azim.stop()
        self.elev.stop()
        self.lift.stop()
        self.lift_pwm.duty_u16(0)
        self.agit.stop()
        self.agit_pwm.duty_u16(0)
        if self.launch is not None:
            self.launch.cancel()          # wheels stopping mid-check would read as a launch; a cut stroke counts no ball
        if self.elev.mode == controller.ELEV_RC:
            self.elev_out.pwm.duty_u16(0)     # no pulse: the actuator holds where it is
        else:
            self.elev_out.set(0)

    def bus_tick(self, now):
        """Read the contactor's coil and drive the stepper's ENABLE (controller.PowerGate). Runs on every controller
        tick, e-stop or not, so the driver is off whenever the bus is precharging. True when the bus has just gone."""
        lost = self.power.update(self.coil_sense.value() == 0, now)
        self.az_enable.value(0 if self.power.enabled else 1)
        if lost:
            self.azim.unpowered()
            self.lift.clear()             # an e-stop is how a person reaches into a jammed lift: try it again after
        return lost

    def set_launch_rpm(self, top, bottom):
        self.target_rpm = (top, bottom)

    def set_aim(self, elev_cdeg, az_cdeg):
        self.elev.target(elev_cdeg / 100)           # -15..45 deg, through the actuator's geometry
        self.azim.target(az_cdeg / 100)             # -30..30 deg; driven once homed

    def feed(self, n):
        self.feeding += n
        if n > 0:
            self.hopper_empty = False     # a new FEED is the Pi (or a person) trying again, perhaps after a refill

    def set_base(self, y_mm, vmax):
        self.base_target, self.base_vmax = y_mm, vmax

    def drive(self, left, right):
        pass

    def pickup(self, on):
        pass

    def estop_pressed(self):
        return self.estop_pin.value() == 1   # normally-closed switch to GND

    def bumper(self):
        return False

    def flags(self):
        f = 0 if self.azim.homed else protocol.FLAG_AZ_UNHOMED
        if not self.aim_settled():
            f |= protocol.FLAG_AIM_SETTLING
        if self.elev.fault:
            f |= protocol.FLAG_ELEV_FAULT
        if not self.wheels_steady.steady:
            f |= protocol.FLAG_WHEELS_SETTLING
        if not self.power.enabled:
            f |= protocol.FLAG_BUS_OFF
        if self.lift.jammed:
            f |= protocol.FLAG_LIFT_JAM
        if self.lift_jams.due:
            f |= protocol.FLAG_LIFT_HUB_DUE
        if self.hopper_empty:
            f |= protocol.FLAG_HOPPER_EMPTY
        return f

    def lift_hub_reset(self):
        """RESET_LIFT_HUB: the slip hub has been re-set on the bench (cad/README.md "Slip hub wear")."""
        self.lift_jams.reset()

    def balls_fed(self):
        return self.fed

    def aim_settled(self):
        return self.elev.settled and self.azim.settled

    def elev_feedback_mm(self):
        # several readings, the extremes dropped (controller.trimmed_mean): a reading caught on one of the actuator's
        # PWM edges cannot move the position or fault the axis on its own (cad/README.md, "The pot's pickup")
        n = getattr(config, "ELEV_POT_READS", 8)
        raw = controller.trimmed_mean([self.elev_pot.read_u16() for _ in range(n)])
        lo, hi = config.ELEV_POT_RAW_RETRACTED, config.ELEV_POT_RAW_EXTENDED
        margin = abs(hi - lo) * 0.01
        if not min(lo, hi) - margin <= raw <= max(lo, hi) + margin:
            return None                      # wiper or supply wire off: the reading cannot be a position
        return (raw - lo) / (hi - lo) * config.ELEV_STROKE_MM

    def base_y_mm(self):
        return int(self.base_enc.count / config.BASE_COUNTS_PER_MM)

    def rpm(self):
        return self.tach_top.rpm, self.tach_bottom.rpm

    def battery_mv(self):
        return int(self.adc.read_uv() / 1000 * config.BATTERY_DIVIDER)

    def update(self, dt, now):
        if not self.power.enabled:
            # The motors have no power (or the contacts are still settling): drive nothing, so no step is lost and no
            # queued FEED starts the servo while the next precharge is under way.
            return
        self.azim_pins.pulse(self.azim.update(dt, self.azim_pins.home_closed()))
        out = self.elev.update(dt, self.elev_feedback_mm() if self.elev_pot else None)
        if self.elev.mode == controller.ELEV_RC:
            self.elev_out.frac(out)
        else:
            self.elev_out.set(out)
        self.tach_top.update(dt)
        self.tach_bottom.update(dt)
        # Lowering a wheel's speed brakes it only with room in the pack (cad: Feeder.regen_braking): above
        # REGEN_BRAKE_MAX_MV the ramp coasts, so the BMS never stops charging while an ESC is pushing energy back, and it
        # brakes again only under REGEN_BRAKE_MAX_MV - REGEN_BRAKE_HYST_MV: braking lifts the reading it is judged by.
        brake = self.brake_guard.update(self.battery_mv()) and getattr(config, "WHEEL_BRAKE", True)
        for i, (esc, tach) in enumerate(((self.esc_top, self.tach_top), (self.esc_bottom, self.tach_bottom))):
            ramp = self.wheel_ramps[i]
            ramped = ramp.update(self.target_rpm[i], tach.rpm, dt, brake)
            # coasting: zero throttle (ESCs set with no brake at zero throttle), the loop's integrator held
            self.esc_cmd[i] = 0.0 if ramp.coasting else self.wheel_loops[i].update(ramped, tach.rpm, dt,
                                                                                   ramped > self.target_rpm[i])
            esc.frac(self.esc_cmd[i])
        steady = self.wheels_steady.update(self.target_rpm, (self.tach_top.rpm, self.tach_bottom.rpm), dt)
        if self.launch is not None:
            went = self.launch.update(now, (self.tach_top.rpm_last, self.tach_bottom.rpm_last), self.target_rpm,
                                    (self.tach_top.core, self.tach_bottom.core), self.esc_cmd,
                                    (self.tach_top.since, self.tach_bottom.since))
            if went is True:
                self.launches += 1
                self.hopper_empty = False
            elif went is False:
                self.dry_strokes += 1
                self.hopper_empty = True
        # Base: proportional position control capped at vmax (trapezoid in practice
        # because the cap limits speed and the gain limits deceleration).
        err = self.base_target - self.base_y_mm()
        duty = max(-1.0, min(1.0, err * 0.004)) * min(1.0, self.base_vmax / 3000)
        self.base.set(duty if abs(err) > 5 else 0)
        # Feed one ball at a time, only with both wheels held within 3% of target for 150 ms
        # and the head at its aim (never launch while it is still moving).
        # The shuttle takes GATE_OUT_MS to carry the ball to the wheels, so a ball counts as fed (and the Pi may
        # re-aim) only when the forward stroke is over; until then the head must not move (2026-11-11: the count
        # used to rise as the gate opened, which let the Pi re-aim while the ball was still on its way).
        ok = steady and self.aim_settled()
        if self.gate_out:
            if now >= self.gate_open_until:
                self.gate_back(now)
                self.gate_out = False
                self.fed += 1
                self.lift.kick(now)
                if self.launch is not None:
                    self.launch.stroke_done(now)
        elif self.feeding and not self.gate_homed:
            self.gate_back(now)           # first FEED since power-up or a stop: bring the shuttle back first
        elif self.feeding and ok and now >= self.gate_ready_at:
            self.gate.frac(1)
            for loop in self.wheel_loops:
                loop.ball()               # README "A ball charged the integrator"
            if self.launch is not None:
                self.launch.start(self.target_rpm, now)
            self.gate_out = True
            self.gate_rest_at = None
            self.gate_open_until = now + self.gate_out_ms
            self.feeding -= 1
        elif self.gate_rest_at is not None and now >= self.gate_rest_at:
            self.gate.pwm.duty_u16(0)     # back at the dead centre: rest unpowered
            self.gate_rest_at = None
        self.lift_pwm.duty_u16(int(self.lift.update(now, self.lift_sense.value() == 0, self.battery_mv()) * 65535))
        self.agit_pwm.duty_u16(int(self.agit.update(now, self.feeding > 0 or self.gate_out) * 65535))


class CollectorHw:
    def __init__(self):
        cpm = config.DRIVE_COUNTS_PER_M
        self.left = SpeedLoop(Motor(32, 33), Encoder(18, 19), cpm)
        self.right = SpeedLoop(Motor(25, 26), Encoder(21, 22), cpm)
        self.roller = PWM(Pin(27), freq=20000, duty_u16=0)
        self.bump_l = Pin(13, Pin.IN, Pin.PULL_UP)
        self.bump_r = Pin(14, Pin.IN, Pin.PULL_UP)
        self.full = Pin(23, Pin.IN, Pin.PULL_UP)
        self.estop_pin = Pin(4, Pin.IN, Pin.PULL_UP)
        self.adc = ADC(Pin(36))

    def stop_all(self):
        self.left.target = self.right.target = 0
        self.left.motor.set(0)
        self.right.motor.set(0)
        self.roller.duty_u16(0)

    def set_launch_rpm(self, top, bottom):
        pass

    def set_aim(self, e, a):
        pass

    def feed(self, n):
        pass

    def set_base(self, y, v):
        pass

    def drive(self, left, right):
        self.left.target, self.right.target = left, right

    def pickup(self, on):
        self.roller.duty_u16(int(config.ROLLER_DUTY * 65535) if on else 0)

    def estop_pressed(self):
        return self.estop_pin.value() == 1

    def bumper(self):
        return self.bump_l.value() == 0 or self.bump_r.value() == 0

    def flags(self):
        f = 16 if self.full.value() == 0 else 0
        if self.battery_mv() < config.LOW_BATTERY_MV:
            f |= 32
        return f

    def base_y_mm(self):
        return 0

    def rpm(self):
        return 0, 0

    def battery_mv(self):
        return int(self.adc.read_uv() / 1000 * config.BATTERY_DIVIDER)

    def update(self, dt, now):
        self.left.update(dt)
        self.right.update(dt)


def run():
    hw = FeederHw() if ROLE == controller.ROLE_FEEDER else CollectorHw()
    uart = UART(2, baudrate=115200, tx=17, rx=16)
    now = time.ticks_ms()
    ctl = controller.Controller(hw, ROLE, now)
    last = now
    while True:
        now = time.ticks_ms()
        dt = time.ticks_diff(now, last)
        rx = uart.read() or b""
        tx = ctl.tick(rx, now)
        if tx:
            uart.write(tx)
        if dt >= 10:
            if not (ctl.estop or ctl.watchdog_tripped):
                hw.update(dt, now)
            last = now
        time.sleep_ms(1)


run()
