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
    """One pulse per revolution from a reflective IR sensor on the wheel hub."""

    def __init__(self, pin):
        self.pulses = 0
        Pin(pin, Pin.IN).irq(self._p, Pin.IRQ_RISING)
        self.rpm = 0
        self._last = 0

    def _p(self, _):
        self.pulses += 1

    def update(self, dt):
        n = self.pulses - self._last
        self._last = self.pulses
        self.rpm = int(n * 60000 / dt) if dt else 0


class FeederHw:
    def __init__(self):
        self.esc_top, self.esc_bottom = Servo(25), Servo(26)
        self.tach_top, self.tach_bottom = Tach(34), Tach(35)
        self.elev, self.azim, self.gate = Servo(27, 500, 2500), Servo(14, 500, 2500), Servo(13)
        self.base = Motor(32, 33)
        self.base_enc = Encoder(18, 19)
        self.estop_pin = Pin(4, Pin.IN, Pin.PULL_UP)
        self.adc = ADC(Pin(36))
        self.target_rpm = (0, 0)
        self.esc_cmd = [0.0, 0.0]
        self.base_target = 0
        self.base_vmax = 0
        self.feeding = 0
        self.gate_open_until = 0
        self.arm()

    def arm(self):
        self.esc_top.frac(0)
        self.esc_bottom.frac(0)

    def stop_all(self):
        self.target_rpm = (0, 0)
        self.esc_cmd = [0.0, 0.0]
        self.arm()
        self.base.set(0)
        self.base_vmax = 0
        self.feeding = 0
        self.gate.frac(0)

    def set_launch_rpm(self, top, bottom):
        self.target_rpm = (top, bottom)

    def set_aim(self, elev_cdeg, az_cdeg):
        self.elev.frac((elev_cdeg + 1500) / 6000)   # -15..45 deg over the servo range
        self.azim.frac((az_cdeg + 3000) / 6000)     # -30..30 deg

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
        return 0

    def base_y_mm(self):
        return int(self.base_enc.count / config.BASE_COUNTS_PER_MM)

    def rpm(self):
        return self.tach_top.rpm, self.tach_bottom.rpm

    def battery_mv(self):
        return int(self.adc.read_uv() / 1000 * config.BATTERY_DIVIDER)

    def update(self, dt, now):
        self.tach_top.update(dt)
        self.tach_bottom.update(dt)
        for i, (esc, tach) in enumerate(((self.esc_top, self.tach_top), (self.esc_bottom, self.tach_bottom))):
            want = self.target_rpm[i]
            if want == 0:
                self.esc_cmd[i] = 0.0
            else:
                self.esc_cmd[i] += (want - tach.rpm) * 2e-6 * dt
                self.esc_cmd[i] = max(0.0, min(1.0, self.esc_cmd[i]))
            esc.frac(self.esc_cmd[i])
        # Base: proportional position control capped at vmax (trapezoid in practice
        # because the cap limits speed and the gain limits deceleration).
        err = self.base_target - self.base_y_mm()
        duty = max(-1.0, min(1.0, err * 0.004)) * min(1.0, self.base_vmax / 3000)
        self.base.set(duty if abs(err) > 5 else 0)
        # Feed one ball at a time, only with both wheels within 5% of target.
        ok = all(t and abs(tach.rpm - t) < 0.05 * t for t, tach in zip(self.target_rpm, (self.tach_top, self.tach_bottom)))
        if self.feeding and ok and now >= self.gate_open_until + 400:
            self.gate.frac(1)
            self.gate_open_until = now + 150
            self.feeding -= 1
        elif now >= self.gate_open_until:
            self.gate.frac(0)


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
