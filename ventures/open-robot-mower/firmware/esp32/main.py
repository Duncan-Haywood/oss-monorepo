"""MicroPython entry point for the mower's ESP32: wheels, blade, safety inputs, UART to the Pi.

Copy to the board with `mpremote cp protocol.py controller.py main.py config.py :`
(protocol.py lives in src/mowerbot/; see README.md here). Pin assignments
match hardware/electronics.md. Status: the logic in controller.py is
unit-tested on CPython; this hardware layer has not been run on a board.
Bench-test it with the blade disc REMOVED and the wheels off the ground.
"""

import time

from machine import ADC, I2C, PWM, UART, Pin

import config
import controller


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
    """DC gearmotor on a PWM + DIR driver channel (e.g. a Cytron MDD10A class driver)."""

    def __init__(self, pwm_pin, dir_pin, freq=20000):
        self.pwm = PWM(Pin(pwm_pin), freq=freq, duty_u16=0)
        self.dir = Pin(dir_pin, Pin.OUT, value=0)

    def set(self, duty):  # -1.0 .. 1.0
        duty = max(-1.0, min(1.0, duty))
        self.dir.value(1 if duty < 0 else 0)
        self.pwm.duty_u16(int(abs(duty) * 65535))


class SpeedLoop:
    """PI wheel-speed loop from encoder counts (mm/s)."""

    def __init__(self, motor, enc, kp=0.0015, ki=0.004):
        self.motor, self.enc = motor, enc
        self.kp, self.ki = kp, ki
        self.target = 0.0
        self.i = 0.0
        self.last = 0

    def update(self, dt_ms):
        c = self.enc.count
        speed = (c - self.last) / config.COUNTS_PER_MM / dt_ms * 1000
        self.last = c
        if self.target == 0:
            self.i = 0.0
            self.motor.set(0)
            return
        err = self.target - speed
        self.i = max(-0.6, min(0.6, self.i + err * self.ki * dt_ms / 1000))
        self.motor.set(self.target * 0.0015 + self.kp * err + self.i)


class Tach:
    def __init__(self, pin):
        self.pulses = 0
        self._last = 0
        self.rpm = 0
        Pin(pin, Pin.IN).irq(self._p, Pin.IRQ_FALLING)

    def _p(self, _):
        self.pulses += 1

    def update(self, dt_ms):
        n = self.pulses - self._last
        self._last = self.pulses
        self.rpm = int(n * 60000 / dt_ms / config.BLADE_PULSES_PER_REV) if dt_ms else 0


class Bno085Tilt:
    """Pitch and roll from the IMU's game rotation vector. Replace with your IMU driver.

    Until a driver is installed this reports a large tilt, so the blade stays
    locked out: a missing IMU must never read as level.
    """

    def __init__(self, i2c):
        self.i2c = i2c
        try:
            import bno08x  # a MicroPython BNO08x driver you install on the board
            self.dev = bno08x.BNO08X_I2C(i2c)
        except Exception:
            self.dev = None

    def read(self):
        if self.dev is None:
            return 9000, 9000
        roll, pitch, _yaw = self.dev.euler  # degrees
        return int(pitch * 100) - config.PITCH_OFFSET_CDEG, int(roll * 100) - config.ROLL_OFFSET_CDEG


class MowerHw:
    def __init__(self):
        self.left = SpeedLoop(Motor(25, 26), Encoder(18, 19))
        self.right = SpeedLoop(Motor(32, 33), Encoder(5, 23))
        self.esc = PWM(Pin(27), freq=50, duty_u16=0)
        self.blade_relay = Pin(13, Pin.OUT, value=0)    # energised = ESC connected; off = phases shorted
        self.tach = Tach(34)
        self.stop_pin = Pin(14, Pin.IN, Pin.PULL_UP)    # NC button to GND: open (1) = pressed or wire cut
        self.lift_pin = Pin(35, Pin.IN)                 # hall sensors, wired-OR, external pull-up
        self.bump_pin = Pin(39, Pin.IN)
        self.rain_pin = Pin(15, Pin.IN, Pin.PULL_UP)
        self.charge_pin = Pin(4, Pin.IN, Pin.PULL_UP)   # optocoupler from the dock contacts
        self.adc = ADC(Pin(36))
        self.adc.atten(ADC.ATTN_11DB)
        self.tilt = Bno085Tilt(I2C(0, scl=Pin(22), sda=Pin(21), freq=400000))
        self._tilt = (9000, 9000)
        self._esc_us(config.ESC_MIN_US)

    def _esc_us(self, us):
        self.esc.duty_u16(int(us / 20000 * 65535))

    def drive(self, left, right):
        self.left.target, self.right.target = left, right

    def stop_drive(self):
        self.left.target = self.right.target = 0
        self.left.motor.set(0)
        self.right.motor.set(0)

    def blade_set(self, rpm):
        self.blade_relay.value(1)
        span = config.ESC_MAX_US - config.ESC_MIN_US
        self._esc_us(config.ESC_MIN_US + int(span * min(1.0, rpm / config.BLADE_RPM_AT_FULL)))

    def blade_brake(self):
        self._esc_us(config.ESC_MIN_US)
        self.blade_relay.value(0)

    def blade_rpm(self):
        return self.tach.rpm

    def stop_button(self):
        return self.stop_pin.value() == 1

    def lifted(self):
        return self.lift_pin.value() == 0   # sensors pull low when the magnet moves away

    def bumped(self):
        return self.bump_pin.value() == 0

    def tilt_cdeg(self):
        return self._tilt

    def rain(self):
        return self.rain_pin.value() == 0

    def charging(self):
        return self.charge_pin.value() == 0

    def battery_mv(self):
        return int(self.adc.read_uv() / 1000 * config.BATTERY_DIVIDER)

    def update(self, dt_ms):
        self.left.update(dt_ms)
        self.right.update(dt_ms)
        self.tach.update(dt_ms)
        try:
            self._tilt = self.tilt.read()
        except Exception:
            self._tilt = (9000, 9000)   # IMU error reads as tipped over


def run():
    hw = MowerHw()
    uart = UART(2, baudrate=115200, tx=17, rx=16, timeout=0)
    ctl = controller.Controller(hw, time.ticks_ms())
    last = time.ticks_ms()
    while True:
        now = time.ticks_ms()
        dt = time.ticks_diff(now, last)
        if dt >= 20:          # 50 Hz
            last = now
            hw.update(dt)
            out = ctl.tick(uart.read() or b"", now)
            if out:
                uart.write(out)


run()
