"""The ESP32's pin map, read from firmware/esp32/main.py itself (2026-11-14).

main.py is run on CPython against a fake `machine` module that records every pin each role claims, then run() is
stopped at its first UART read. Until 2026-11-14 the feeder's lift and agitator MOSFETs were on GPIO 16 and 17, the
UART to the Pi; run() opens the UART after FeederHw, so the UART took the pins back and neither motor would have
turned. Nothing caught it because the controller tests never touch the hardware layer. This test does.
"""

import os
import sys
import types
import unittest

from tennisbots import protocol

HERE = os.path.dirname(__file__)
FW = os.path.join(HERE, "..", "firmware", "esp32")
sys.path.insert(0, FW)
sys.modules.setdefault("protocol", protocol)
import controller  # noqa: E402

FLASH = set(range(6, 12))             # wired to the module's SPI flash
INPUT_ONLY = {34, 35, 36, 37, 38, 39}  # no output driver
# Strapping pins and their level at reset. A motor or servo output on one that floats high at boot would run while the
# ESP32 boots; 0 and 5 are pulled up, 15 is pulled up and prints boot messages, 12 must stay low (flash voltage).
STRAP_LOW_AT_BOOT = {2, 12}
STRAPPING = {0, 2, 5, 12, 15}
# Since 2026-11-14 two more: GPIO 5 drives the stepper driver's active-low ENABLE, held high (driver off) by a pull-up
# through reset, which is also the level the strap wants, and it must start high when claimed; GPIO 15 reads the
# contactor's coil through an opto, low only once the coil is on, long after reset (low at reset only silences the log).
STRAP_HIGH_OUT = {5}
STRAP_IN = {15}
# Since 2026-11-15 GPIO 0 reads the lift's over-current comparator (open collector, 10k pull-up): low only while the lift
# draws over its trip current, and at reset its MOSFET is off (GPIO 12 held low), so the pin is high and the board boots
# normally rather than into the serial bootloader.
STRAP_IN |= {0}


class _Stop(Exception):
    pass


def _fake_machine(claims, initial=None):
    initial = {} if initial is None else initial
    m = types.ModuleType("machine")

    class Pin:
        IN, OUT, PULL_UP, IRQ_RISING, IRQ_FALLING = 1, 2, 3, 4, 8

        def __init__(self, n, mode=None, pull=None, value=None):
            self.n = n
            if mode is not None:      # a bare Pin(n) is only a handle (for PWM or ADC, or a second read of an input)
                claims.append((n, {Pin.IN: "in", Pin.OUT: "out"}[mode]))
                if mode == Pin.OUT:
                    initial[n] = value

        def irq(self, *a, **k):
            pass

        def value(self, v=None):
            return 1

    class PWM:
        def __init__(self, pin, **k):
            claims.append((pin.n, "out"))

        def duty_u16(self, v):
            pass

    class ADC:
        ATTN_11DB = 3

        def __init__(self, pin, **k):
            claims.append((pin.n, "in"))

        def read_uv(self):
            return 0

    class UART:
        def __init__(self, n, baudrate, tx, rx):
            claims.append((tx, "out"))
            claims.append((rx, "in"))

        def read(self):
            raise _Stop

        def write(self, b):
            pass

    m.Pin, m.PWM, m.ADC, m.UART = Pin, PWM, ADC, UART
    return m


def _fake_time():
    t = types.ModuleType("time")
    t.ticks_us = t.ticks_ms = lambda: 0
    t.ticks_diff = lambda a, b: a - b
    t.sleep_us = t.sleep_ms = lambda n: None
    return t


def role_claims(role: str, initial: dict | None = None) -> dict[int, list[str]]:
    """{gpio: [mode, ...]} for every claim `role`'s hardware layer and UART make, in order; `initial`, if given, gets
    each output Pin's starting value."""
    claims: list[tuple[int, str]] = []
    cfg = types.ModuleType("config")
    import config as real  # noqa: E402  (firmware/esp32/config.py)
    cfg.__dict__.update({k: v for k, v in vars(real).items() if not k.startswith("__")})
    cfg.ROLE = role
    saved = {k: sys.modules.get(k) for k in ("machine", "time", "config")}
    sys.modules.update(machine=_fake_machine(claims, initial), time=_fake_time(), config=cfg)
    try:
        src = open(os.path.join(FW, "main.py")).read()
        ns = {"__name__": "main_under_test"}
        try:
            exec(compile(src, "main.py", "exec"), ns)
        except _Stop:
            pass
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
    out: dict[int, list[str]] = {}
    for n, mode in claims:
        out.setdefault(n, []).append(mode)
    return out


class PinMapTest(unittest.TestCase):
    def _check(self, role):
        initial: dict = {}
        pins = role_claims(role, initial)
        self.assertGreater(len(pins), 10, f"{role}: the fake board saw too few pins; did main.py change shape?")
        for n, modes in pins.items():
            with self.subTest(role=role, gpio=n):
                self.assertEqual(len(modes), 1, f"{role}: GPIO {n} claimed {len(modes)} times ({modes})")
                self.assertNotIn(n, FLASH, f"{role}: GPIO {n} is a flash pin")
                if modes[0] == "out":
                    self.assertNotIn(n, INPUT_ONLY, f"{role}: GPIO {n} is input-only but drives an output")
                if n in STRAPPING:
                    if n in STRAP_IN:
                        self.assertEqual(modes[0], "in")
                    elif n in STRAP_HIGH_OUT:
                        self.assertEqual(modes[0], "out")
                        self.assertEqual(initial.get(n), 1, f"{role}: GPIO {n} must start high (driver off)")
                    else:
                        self.assertIn(n, STRAP_LOW_AT_BOOT, f"{role}: GPIO {n} is a strapping pin that is not low at boot")
                        self.assertEqual(modes[0], "out")
        return pins

    def test_feeder_pins_unique_and_safe(self):
        pins = self._check(controller.ROLE_FEEDER)
        self.assertIn(16, pins)
        self.assertIn(17, pins)               # the UART still has them

    def test_collector_pins_unique_and_safe(self):
        self._check(controller.ROLE_COLLECTOR)

    def test_electronics_doc_lists_every_feeder_pin(self):
        doc = open(os.path.join(HERE, "..", "hardware", "electronics.md")).read()
        table = doc.split("## ESP32 pins, feeder role", 1)[1].split("##", 1)[0]
        listed = set()
        for line in table.splitlines():
            if line.startswith("| ") and not line.startswith("| GPIO") and not line.startswith("| ---"):
                for tok in line.split("|")[1].replace("/", " ").split():
                    listed.add(int(tok))
        missing = set(role_claims(controller.ROLE_FEEDER)) - listed
        self.assertFalse(missing, f"hardware/electronics.md's feeder table misses GPIO {sorted(missing)}")


if __name__ == "__main__":
    unittest.main()
