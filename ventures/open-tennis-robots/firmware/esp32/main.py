"""MicroPython entry point for the ESP32 motor controller (feeder or collector).

Copy to the board with `mpremote cp protocol.py controller.py main.py config.py :`
(protocol.py lives in src/tennisbots/; see firmware/esp32/README.md).
Pin assignments match hardware/electronics.md. Status: the logic in
controller.py is unit-tested on CPython; this hardware layer has not yet
been run on a board, so bench-test it with the wheels off the ground.
"""

import time

from machine import ADC, PWM, UART, Pin

import config
import controller
import protocol

ROLE = getattr(config, "ROLE", controller.ROLE_FEEDER)


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

    def __init__(self, pin):
        self.core = controller.PeriodTach()
        self.last_us = time.ticks_us()
        self.rpm = 0
        Pin(pin, Pin.IN).irq(self._p, Pin.IRQ_RISING)

    def _p(self, _):
        now = time.ticks_us()
        self.core.edge(time.ticks_diff(now, self.last_us))
        self.last_us = now

    def update(self, dt):
        self.rpm = self.core.rpm(time.ticks_diff(time.ticks_us(), self.last_us))


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
        self.tach_top, self.tach_bottom = Tach(34), Tach(35)
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
        self.azim = controller.StepperAxis(200 * config.AZ_MICROSTEPS * config.AZ_RATIO / 360, config.AZ_VMAX_DEG_S,
                                           config.AZ_ACCEL_DEG_S2, config.AZ_HOME_DEG, -30.0, 30.0)
        self.base = Motor(32, 33)
        self.base_enc = Encoder(18, 19)
        self.estop_pin = Pin(4, Pin.IN, Pin.PULL_UP)
        self.adc = ADC(Pin(36))
        self.target_rpm = (0, 0)
        self.esc_cmd = [0.0, 0.0]
        rpm_full = getattr(config, "WHEEL_RPM_FULL", 9000)
        self.wheel_loops = (controller.WheelLoop(rpm_full), controller.WheelLoop(rpm_full))
        self.wheels_steady = controller.SteadyGate()
        self.base_target = 0
        self.base_vmax = 0
        self.feeding = 0
        self.fed = 0                  # balls released since power-up; telemetry tells the Pi when its ball has gone
        self.gate_open_until = 0      # forward stroke ends (the ball is at the wheels)
        self.gate_ready_at = 0        # back stroke ends and the next ball has dropped into the pocket
        self.gate_out = False
        self.arm()

    def arm(self):
        self.esc_top.frac(0)
        self.esc_bottom.frac(0)

    def stop_all(self):
        self.target_rpm = (0, 0)
        self.esc_cmd = [0.0, 0.0]
        for loop in self.wheel_loops:
            loop.i = 0.0
        self.wheels_steady.ok_ms = 0
        self.arm()
        self.base.set(0)
        self.base_vmax = 0
        self.feeding = 0
        self.gate.frac(0)
        if self.gate_out:                 # cut mid-stroke: the shuttle goes back with its ball, none counted
            self.gate_out = False
            self.gate_ready_at = time.ticks_ms() + self.gate_back_ms
        self.azim.stop()
        self.elev.stop()
        if self.elev.mode == controller.ELEV_RC:
            self.elev_out.pwm.duty_u16(0)     # no pulse: the actuator holds where it is
        else:
            self.elev_out.set(0)

    def set_launch_rpm(self, top, bottom):
        self.target_rpm = (top, bottom)

    def set_aim(self, elev_cdeg, az_cdeg):
        self.elev.target(elev_cdeg / 100)           # -15..45 deg, through the actuator's geometry
        self.azim.target(az_cdeg / 100)             # -30..30 deg; driven once homed

    def feed(self, n):
        self.feeding += n

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
        return f

    def balls_fed(self):
        return self.fed

    def aim_settled(self):
        return self.elev.settled and self.azim.settled

    def elev_feedback_mm(self):
        raw = self.elev_pot.read_u16()
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
        self.azim_pins.pulse(self.azim.update(dt, self.azim_pins.home_closed()))
        out = self.elev.update(dt, self.elev_feedback_mm() if self.elev_pot else None)
        if self.elev.mode == controller.ELEV_RC:
            self.elev_out.frac(out)
        else:
            self.elev_out.set(out)
        self.tach_top.update(dt)
        self.tach_bottom.update(dt)
        for i, (esc, tach) in enumerate(((self.esc_top, self.tach_top), (self.esc_bottom, self.tach_bottom))):
            self.esc_cmd[i] = self.wheel_loops[i].update(self.target_rpm[i], tach.rpm, dt)
            esc.frac(self.esc_cmd[i])
        steady = self.wheels_steady.update(self.target_rpm, (self.tach_top.rpm, self.tach_bottom.rpm), dt)
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
                self.gate.frac(0)
                self.gate_out = False
                self.fed += 1
                self.gate_ready_at = now + self.gate_back_ms
        elif self.feeding and ok and now >= self.gate_ready_at:
            self.gate.frac(1)
            self.gate_out = True
            self.gate_open_until = now + self.gate_out_ms
            self.feeding -= 1
        else:
            self.gate.frac(0)             # hold the shuttle retracted (also from power-up)


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
