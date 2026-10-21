import os
import random
import sys
import unittest

from floorbots import protocol as P

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "firmware", "esp32"))
sys.modules.setdefault("protocol", P)  # firmware imports it by bare name, as on the board
import controller  # noqa: E402


class ProtocolTest(unittest.TestCase):
    def test_roundtrip_with_noise_and_split_reads(self):
        frames = [P.encode(P.DRIVE, 250, -250), P.encode(P.CLEAN, 80, 60, 40), P.encode(P.MOP, 30, 100, 1),
                  P.encode(P.TELEMETRY, 0x0204, 248, -251, 15210, 312)]
        stream = b"\x00\xa5\xff" + b"".join(frames) + b"\x13"
        rng = random.Random(1)
        d = P.Decoder()
        out, i = [], 0
        while i < len(stream):
            n = rng.randint(1, 5)
            out += d.feed(stream[i:i + n])
            i += n
        self.assertEqual(out, [(P.DRIVE, (250, -250)), (P.CLEAN, (80, 60, 40)), (P.MOP, (30, 100, 1)),
                               (P.TELEMETRY, (0x0204, 248, -251, 15210, 312))])

    def test_corrupt_crc_dropped(self):
        f = bytearray(P.encode(P.DRIVE, 1, 2))
        f[-1] ^= 0xFF
        self.assertEqual(P.Decoder().feed(bytes(f)), [])

    def test_shared_with_firmware_by_path(self):
        here = os.path.dirname(__file__)
        self.assertFalse(os.path.exists(os.path.join(here, "..", "firmware", "esp32", "protocol.py")),
                         "one protocol file: src/floorbots/protocol.py is copied to the board")


class FakeHw:
    def __init__(self):
        self.log = []
        self.button = False
        self.bump = False
        self.cliffs = 0
        self.drop = False
        self.mv = 15200
        self.temp = 300
        self.bin = True
        self.empty = False
        self.measured = None

    def __getattr__(self, name):
        def rec(*a):
            self.log.append((name,) + a)
        return rec

    def estop_pressed(self):
        return self.button

    def bumper(self):
        return self.bump

    def cliff(self):
        return self.cliffs

    def wheel_drop(self):
        return self.drop

    def bin_present(self):
        return self.bin

    def tank_empty(self):
        return self.empty

    def speeds(self):
        if self.measured is not None:
            return self.measured
        d = [e for e in self.log if e[0] == "drive"]
        return (d[-1][1], d[-1][2]) if d else (0, 0)

    def battery_mv(self):
        return self.mv

    def temp_dC(self):
        return self.temp

    def last(self, name):
        hits = [e for e in self.log if e[0] == name]
        return hits[-1] if hits else None


def run(c, frames, t):
    c.tick(b"".join(frames), t)


class FirmwareTest(unittest.TestCase):
    def setUp(self):
        self.hw = FakeHw()

    def ctl(self, role=controller.ROLE_COMBO):
        return controller.Controller(self.hw, role, 0)

    def test_role_filter(self):
        c = self.ctl(controller.ROLE_VACUUM)
        run(c, [P.encode(P.MOP, 50, 50, 1), P.encode(P.CLEAN, 50, 50, 50)], 10)
        self.assertEqual(c.rejected, 1)
        self.assertEqual(self.hw.last("clean"), ("clean", 50, 50, 50))
        self.assertIsNone(self.hw.last("mop"))

    def test_drive_clamped(self):
        c = self.ctl()
        run(c, [P.encode(P.DRIVE, 3000, -3000)], 10)
        self.assertEqual(self.hw.last("drive"), ("drive", 350, -350))

    def test_watchdog_stops_and_recovers(self):
        c = self.ctl()
        run(c, [P.encode(P.DRIVE, 200, 200)], 10)
        c.tick(b"", 400)
        self.assertTrue(c.watchdog_tripped)
        self.assertEqual(self.hw.log[-1][0], "stop_all")
        run(c, [P.encode(P.DRIVE, 200, 200)], 410)
        self.assertTrue(c.rejected >= 1)
        run(c, [P.encode(P.HEARTBEAT), P.encode(P.DRIVE, 200, 200)], 420)
        self.assertFalse(c.watchdog_tripped)
        self.assertEqual(self.hw.last("drive"), ("drive", 200, 200))

    def test_physical_estop_latches(self):
        c = self.ctl()
        self.hw.button = True
        c.tick(b"", 10)
        self.assertTrue(c.estop)
        run(c, [P.encode(P.CLEAR_ESTOP)], 20)
        self.assertTrue(c.estop, "software clear must not beat the button")
        self.hw.button = False
        run(c, [P.encode(P.CLEAR_ESTOP)], 30)
        self.assertFalse(c.estop)

    def test_bumper_blocks_forward_only(self):
        c = self.ctl()
        self.hw.bump = True
        run(c, [P.encode(P.DRIVE, 200, -100)], 10)
        self.assertEqual(self.hw.last("drive"), ("drive", 0, -100))
        run(c, [P.encode(P.DRIVE, -150, -150)], 20)
        self.assertEqual(self.hw.last("drive"), ("drive", -150, -150))

    def test_front_cliff_backs_off_then_stops(self):
        c = self.ctl()
        run(c, [P.encode(P.DRIVE, 250, 250)], 10)
        self.hw.cliffs = 0b0010
        run(c, [P.encode(P.HEARTBEAT)], 20)
        self.assertEqual(self.hw.last("drive"), ("drive", -controller.BACKOFF_MM_S, -controller.BACKOFF_MM_S))
        self.assertTrue(c.backing_off())
        run(c, [P.encode(P.DRIVE, 250, 250)], 100)   # the Pi cannot override the back-off
        self.assertEqual(self.hw.last("drive"), ("drive", -controller.BACKOFF_MM_S, -controller.BACKOFF_MM_S))
        run(c, [P.encode(P.HEARTBEAT)], 20 + controller.BACKOFF_MS)
        self.assertEqual(self.hw.last("drive"), ("drive", 0, 0))
        self.assertFalse(c.backing_off())
        run(c, [P.encode(P.DRIVE, 250, 250)], 20 + controller.BACKOFF_MS + 10)
        self.assertEqual(self.hw.last("drive"), ("drive", 0, 0), "still over the edge: no forward")
        self.hw.cliffs = 0
        run(c, [P.encode(P.DRIVE, 100, -100)], 20 + controller.BACKOFF_MS + 20)
        self.assertEqual(self.hw.last("drive"), ("drive", 100, -100))

    def test_rear_cliff_ends_back_off_and_blocks_reverse(self):
        c = self.ctl()
        run(c, [P.encode(P.DRIVE, 250, 250)], 10)
        self.hw.cliffs = 0b0001
        run(c, [P.encode(P.HEARTBEAT)], 20)
        self.hw.cliffs = 0b0001 | 0b10000
        run(c, [P.encode(P.HEARTBEAT)], 60)
        self.assertEqual(self.hw.last("drive"), ("drive", 0, 0))
        run(c, [P.encode(P.DRIVE, -100, -100)], 70)
        self.assertEqual(self.hw.last("drive"), ("drive", 0, 0))

    def test_cliff_stop_distance_fits_in_front_of_the_wheel(self):
        """At full speed, latency plus braking must stop the wheel before the edge the sensor saw."""
        v = controller.MAX_DRIVE_MM_S / 1000
        latency = 0.010 + 0.010   # loop tick + motor driver
        decel = 2.0               # m/s^2, assumed; well under wheel grip at mu ~0.5
        stop = v * latency + v * v / (2 * decel)
        from floorbots import variants as V
        self.assertLess(stop, V.CLIFF_SENSOR_LEAD)

    def test_wheel_drop_stops_everything_until_cleared(self):
        c = self.ctl()
        run(c, [P.encode(P.DRIVE, 200, 200), P.encode(P.CLEAN, 80, 80, 80)], 10)
        self.hw.drop = True
        run(c, [P.encode(P.HEARTBEAT)], 20)
        self.assertEqual(self.hw.log[-1][0], "stop_all")
        self.assertTrue(c.fault & P.FLAG_WHEEL_DROP)
        run(c, [P.encode(P.CLEAR_FAULT)], 30)
        self.assertTrue(c.fault, "cause still present")
        self.hw.drop = False
        run(c, [P.encode(P.CLEAR_FAULT), P.encode(P.DRIVE, 100, 100)], 40)
        self.assertFalse(c.fault)
        self.assertEqual(self.hw.last("drive"), ("drive", 100, 100))

    def test_low_battery_ignores_sag_then_latches(self):
        c = self.ctl()
        self.hw.mv = 12000
        run(c, [P.encode(P.HEARTBEAT)], 100)
        self.assertFalse(c.fault)
        self.hw.mv = 15000
        run(c, [P.encode(P.HEARTBEAT)], 200)
        self.hw.mv = 12000
        run(c, [P.encode(P.HEARTBEAT)], 300)
        run(c, [P.encode(P.HEARTBEAT)], 300 + controller.LOW_BATTERY_HOLD_MS)
        self.assertTrue(c.fault & P.FLAG_LOW_BATTERY)

    def test_over_temperature(self):
        c = self.ctl()
        self.hw.temp = 650
        run(c, [P.encode(P.HEARTBEAT)], 10)
        self.assertTrue(c.fault & P.FLAG_OVER_TEMP)

    def test_fan_needs_the_bin(self):
        c = self.ctl()
        self.hw.bin = False
        run(c, [P.encode(P.CLEAN, 90, 70, 50)], 10)
        self.assertEqual(self.hw.last("clean"), ("clean", 0, 70, 50))

    def test_pump_only_while_moving(self):
        c = self.ctl(controller.ROLE_MOP)
        run(c, [P.encode(P.MOP, 40, 80, 1)], 10)
        self.assertEqual(self.hw.last("mop"), ("mop", 0, 80, 1), "standing still: no water")
        run(c, [P.encode(P.DRIVE, 250, 250)], 20)
        self.assertEqual(self.hw.last("mop"), ("mop", 40, 80, 1))
        run(c, [P.encode(P.DRIVE, 100, -100)], 30)   # turning on the spot
        self.assertEqual(self.hw.last("mop"), ("mop", 0, 80, 1))
        run(c, [P.encode(P.DRIVE, 250, 250)], 40)
        self.hw.measured = (0, 0)                   # wheels stalled against something
        run(c, [P.encode(P.HEARTBEAT)], 50)
        self.assertEqual(self.hw.last("mop"), ("mop", 0, 80, 1))
        self.hw.measured = None
        self.hw.empty = True
        run(c, [P.encode(P.HEARTBEAT)], 60)
        self.assertEqual(self.hw.last("mop"), ("mop", 0, 80, 1), "dry pump protection")

    def test_pump_stops_during_back_off(self):
        c = self.ctl(controller.ROLE_MOP)
        run(c, [P.encode(P.MOP, 40, 0, 1), P.encode(P.DRIVE, 250, 250)], 10)
        self.assertEqual(self.hw.last("mop")[1], 40)
        self.hw.cliffs = 0b0100
        run(c, [P.encode(P.HEARTBEAT)], 20)
        self.assertEqual(self.hw.last("mop")[1], 0)

    def test_telemetry(self):
        c = self.ctl()
        self.hw.bump = True
        self.hw.empty = True
        tx = c.tick(b"", 350)
        (cmd, vals), = P.Decoder().feed(tx)
        self.assertEqual(cmd, P.TELEMETRY)
        self.assertTrue(vals[0] & P.FLAG_BUMPER)
        self.assertTrue(vals[0] & P.FLAG_TANK_EMPTY)
        self.assertTrue(vals[0] & P.FLAG_WATCHDOG)
        self.assertEqual(vals[3], 15200)


if __name__ == "__main__":
    unittest.main()
