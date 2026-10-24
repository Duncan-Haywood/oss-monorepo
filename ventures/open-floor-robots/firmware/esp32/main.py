"""MicroPython entry point for the ESP32-S3 controller (vacuum, mop or combo).

Copy to the board with `mpremote cp protocol.py controller.py config.py main.py :`
(protocol.py lives in src/floorbots/; see firmware/esp32/README.md).
Pin assignments match hardware/electronics.md. Status: the logic in
controller.py is unit-tested on CPython; this hardware layer has not yet
been run on a board, so bench-test it with the wheels off the ground and
the brushes removed.
"""

import time

from machine import ADC, I2C, PWM, UART, Pin

import config
import controller

ROLE = getattr(config, "ROLE", controller.ROLE_VACUUM)

# PCA9685 channels for the cleaning tools (hardware/electronics.md).
CH_FAN, CH_BRUSH, CH_SIDE, CH_PUMP, CH_VIBE = 0, 1, 2, 3, 4


class PCA9685:
    """16-channel PWM expander. Its OE pin is pulled high (all outputs off) until we drive it low."""

    def __init__(self, i2c, oe_pin, addr=0x40, freq=1000):
        self.i2c, self.addr = i2c, addr
        self.oe = Pin(oe_pin, Pin.OUT, value=1)
        prescale = int(25000000 / (4096 * freq) + 0.5) - 1
        self._w(0x00, 0x10)            # sleep
        self._w(0xFE, prescale)
        self._w(0x00, 0x20)            # wake, auto-increment
        time.sleep_ms(1)
        self.all_off()

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def duty(self, ch, frac):
        v = int(max(0.0, min(1.0, frac)) * 4095)
        self.i2c.writeto_mem(self.addr, 0x06 + 4 * ch, bytes([0, 0, v & 0xFF, v >> 8]))

    def all_off(self):
        self.i2c.writeto_mem(self.addr, 0xFA, bytes([0, 0, 0, 0x10]))  # ALL_LED full off

    def enable(self, on):
        self.oe.value(0 if on else 1)


class Encoder:
    """Quadrature counter on two GPIOs (x2 decoding on channel A edges)."""

    def __init__(self, a, b):
        self.count = 0
        self._b = Pin(b, Pin.IN, Pin.PULL_UP)
        self._a = Pin(a, Pin.IN, Pin.PULL_UP)
        self._a.irq(self._edge, Pin.IRQ_RISING | Pin.IRQ_FALLING)

    def _edge(self, _pin):
        self.count += 1 if self._a.value() != self._b.value() else -1


class Motor:
    """DC gearmotor on a DRV8871-class driver: PWM on IN1 forward, on IN2 reverse."""

    def __init__(self, in1, in2, freq=20000):
        self.a = PWM(Pin(in1), freq=freq, duty_u16=0)
        self.b = PWM(Pin(in2), freq=freq, duty_u16=0)

    def set(self, duty):  # -1.0 .. 1.0
        d = int(min(1.0, abs(duty)) * 65535)
        if duty >= 0:
            self.b.duty_u16(0)
            self.a.duty_u16(d)
        else:
            self.a.duty_u16(0)
            self.b.duty_u16(d)


class SpeedLoop:
    """PI wheel-speed loop from encoder counts."""

    def __init__(self, motor, enc, counts_per_m, kp=0.002, ki=0.006):
        self.motor, self.enc, self.cpm = motor, enc, counts_per_m
        self.kp, self.ki = kp, ki
        self.target = 0.0
        self.speed = 0.0
        self.i = 0.0
        self.last = 0

    def update(self, dt):
        c = self.enc.count
        self.speed = (c - self.last) / self.cpm / dt * 1e6  # mm/s (dt in ms)
        self.last = c
        if self.target == 0:
            self.i = 0.0
            self.motor.set(0)
            return
        err = self.target - self.speed
        self.i = max(-0.6, min(0.6, self.i + err * self.ki * dt / 1000))
        self.motor.set(self.target * 0.0016 + self.kp * err + self.i)


class Servo:
    def __init__(self, pin):
        self.pwm = PWM(Pin(pin), freq=50, duty_u16=0)

    def us(self, us):
        self.pwm.duty_u16(int(us / 20000 * 65535))


class FloorHw:
    def __init__(self):
        cpm = config.DRIVE_COUNTS_PER_M
        self.left = SpeedLoop(Motor(4, 5), Encoder(11, 12), cpm)
        self.right = SpeedLoop(Motor(6, 7), Encoder(13, 14), cpm)
        self.pwm = PCA9685(I2C(0, sda=Pin(8), scl=Pin(9), freq=400000), oe_pin=10)
        self.servo = Servo(37)
        self.adc_batt = ADC(Pin(1), atten=ADC.ATTN_11DB)
        self.adc_temp = ADC(Pin(2), atten=ADC.ATTN_11DB)
        self.estop_pin = Pin(15, Pin.IN, Pin.PULL_UP)
        self.bump_l = Pin(16, Pin.IN, Pin.PULL_UP)
        self.bump_r = Pin(21, Pin.IN, Pin.PULL_UP)
        self.drop = Pin(38, Pin.IN, Pin.PULL_UP)
        self.cliffs = [Pin(p, Pin.IN, Pin.PULL_UP) for p in (39, 40, 41, 42, 47, 48)]
        self.bin_pin = Pin(35, Pin.IN, Pin.PULL_UP)
        self.tank_pin = Pin(36, Pin.IN, Pin.PULL_UP)
        self.servo.us(config.SERVO_PAD_UP_US)

    def stop_all(self):
        self.pwm.enable(False)
        self.pwm.all_off()
        self.left.target = self.right.target = 0.0
        self.left.motor.set(0)
        self.right.motor.set(0)

    def drive(self, left, right):
        self.left.target, self.right.target = float(left), float(right)

    def clean(self, fan, brush, side):
        self.pwm.duty(CH_FAN, fan / 100)
        self.pwm.duty(CH_BRUSH, brush / 100)
        self.pwm.duty(CH_SIDE, side / 100)
        self.pwm.enable(True)

    def mop(self, pump, vibe, down):
        self.pwm.duty(CH_PUMP, pump / 100 * config.PUMP_MAX_DUTY)
        self.pwm.duty(CH_VIBE, vibe / 100)
        self.servo.us(config.SERVO_PAD_DOWN_US if down else config.SERVO_PAD_UP_US)
        self.pwm.enable(True)

    def estop_pressed(self):
        return self.estop_pin.value() == 1   # NC button to GND: open = pressed or wire cut

    def bumper(self):
        return self.bump_l.value() == 0 or self.bump_r.value() == 0

    def cliff(self):
        # Digital IR modules pull low over floor; high = no reflection = drop (or a cut wire).
        bits = 0
        for k, p in enumerate(self.cliffs):
            if p.value() == 1:
                bits |= 1 << k
        return bits

    def wheel_drop(self):
        return self.drop.value() == 1        # two NC switches in series: open = a wheel dropped

    def bin_present(self):
        return self.bin_pin.value() == 0     # reed switch closes on the bin's magnet

    def tank_empty(self):
        return self.tank_pin.value() == 0    # float switch closes when the level falls

    def speeds(self):
        return int(self.left.speed), int(self.right.speed)

    def battery_mv(self):
        return int(self.adc_batt.read_uv() / 1000 * config.BATTERY_DIVIDER)

    def temp_dC(self):
        import math
        uv = self.adc_temp.read_uv()
        v = uv / 1e6
        if v <= 0.01 or v >= 3.29:
            return 999                        # open or shorted thermistor reads as too hot
        r = 10000 * v / (3.3 - v)            # 10k NTC (on the pack) to GND, 10k pull-up to 3.3 V
        t = 1 / (1 / 298.15 + math.log(r / 10000) / config.THERMISTOR_BETA) - 273.15
        return int(t * 10)

    def update(self, dt, now):
        self.left.update(dt)
        self.right.update(dt)


def run():
    hw = FloorHw()
    uart = UART(1, baudrate=115200, tx=17, rx=18)
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
            if not ctl.halted():
                hw.update(dt, now)
            last = now
        time.sleep_ms(1)


run()
